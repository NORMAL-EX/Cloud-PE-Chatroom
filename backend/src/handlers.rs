use actix_web::{web, HttpRequest, HttpResponse, Result};
use crate::{APP_STATE, models::*};
use sha2::{Sha256, Digest};
use uuid::Uuid;
use chrono::{Utc, Duration};
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message as EmailMessage, SmtpTransport, Transport};
use rand::{thread_rng, Rng};
use regex::Regex;

// SMTP 配置常量
const SMTP_SERVER: &str = "{{自己去填写 示例：smtp.feishu.cn}}"; // 请替换为实际的 SMTP 服务器地址
const SMTP_USERNAME: &str = "{{自己去填写 示例：service@cloud-pe.cn}}"; // 请替换为实际的 SMTP 用户名
const SMTP_PASSWORD: &str = "{{自己去填写}}"; // 请替换为实际的 SMTP 密码
const SENDER_NAME: &str = "{{自己去填写 示例：Cloud-PE}}"; // 请替换为实际的发件人名称
const SENDER_EMAIL: &str = "{{自己去填写 示例：service@cloud-pe.cn}}"; // 请替换为实际的发件人邮箱

pub async fn get_public_settings() -> Result<HttpResponse> {
    let state = APP_STATE.lock().unwrap();
    let public_settings = PublicSettings {
        registration_open: state.settings.registration_open,
        require_approval: state.settings.require_approval,
    };
    
    Ok(HttpResponse::Ok().json(ApiResponse::success(public_settings)))
}

pub async fn register(
    req: HttpRequest,
    body: web::Json<RegisterRequest>,
) -> Result<HttpResponse> {
    let client_ip = req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut state = APP_STATE.lock().unwrap();
    state.clean_expired_data();

    // 检查IP黑名单
    for blacklist_item in &state.ip_blacklist {
        if blacklist_item.ip == client_ip && blacklist_item.until > Utc::now() {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "您的IP已被临时封禁".to_string()
            )));
        }
    }

    // 检查注册频率
    let recent_attempts = {
        let attempts = state.registration_attempts
            .entry(client_ip.clone())
            .or_insert_with(Vec::new);
        
        attempts.iter()
            .filter(|time| Utc::now().signed_duration_since(**time).num_hours() < 1)
            .count()
    };

    if recent_attempts >= 3 {
        // 加入黑名单
        state.ip_blacklist.push(IpBlacklist {
            ip: client_ip.clone(),
            reason: "注册频率过高".to_string(),
            until: Utc::now() + Duration::days(1),
        });
        state.save_blacklist();
        
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "注册频率过高，请24小时后再试".to_string()
        )));
    }

    // 检查是否开放注册
    if !state.settings.registration_open && !state.users.is_empty() {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "注册功能已关闭".to_string()
        )));
    }

    // 检查邮箱黑名单
    if state.email_blacklist.contains(&body.email) {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "该邮箱已被禁止注册".to_string()
        )));
    }

    // 检查邮箱是否已存在
    for user in state.users.values() {
        if user.email == body.email {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "该邮箱已被注册".to_string()
            )));
        }
    }

    // 检查用户名是否已存在
    for user in state.users.values() {
        if user.username == body.username {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "该用户名已被使用".to_string()
            )));
        }
    }

    // 验证邮箱验证码
    if let Some(verification) = state.verification_codes.get(&body.email) {
        if verification.code != body.verification_code {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "验证码错误".to_string()
            )));
        }
    } else {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "请先发送验证码".to_string()
        )));
    }

    // 记录注册尝试
    state.registration_attempts
        .entry(client_ip.clone())
        .or_insert_with(Vec::new)
        .push(Utc::now());

    // 创建用户
    let mut hasher = Sha256::new();
    hasher.update(body.password.as_bytes());
    let password_hash = hex::encode(hasher.finalize());

    let is_first_user = state.users.is_empty();
    let user = User {
        id: Uuid::new_v4().to_string(),
        username: body.username.clone(),
        email: body.email.clone(),
        password_hash,
        avatar: body.avatar.clone(),
        display_name: None, // 新增：初始没有群聊昵称
        role: if is_first_user { UserRole::Admin } else { UserRole::Member },
        status: if is_first_user { 
            UserStatus::Active 
        } else if state.settings.require_approval && state.settings.registration_open { 
            UserStatus::Pending // 如果开启了审核，新用户状态为待审核
        } else { 
            UserStatus::Active 
        },
        created_at: Utc::now(),
        last_ips: vec![client_ip.clone()],
        muted_until: None,
    };

    let user_id = user.id.clone();
    state.users.insert(user_id.clone(), user);
    state.verification_codes.remove(&body.email);
    state.save_users();
    
    // 如果是第一个用户或者不需要审核，直接创建会话
    if is_first_user || (!state.settings.require_approval || !state.settings.registration_open) {
        let session_token = Uuid::new_v4().to_string();
        let session = Session {
            token: session_token.clone(),
            user_id: user_id.clone(),
            created_at: Utc::now(),
        };
        
        state.sessions.insert(session_token.clone(), user_id.clone());
        state.user_sessions
            .entry(user_id)
            .or_insert_with(Vec::new)
            .push(session);
        state.save_sessions();
        
        drop(state);
        
        return Ok(HttpResponse::Ok()
            .cookie(
                actix_web::cookie::Cookie::build("session_token", session_token)
                    .path("/")
                    .http_only(true)
                    .finish()
            )
            .json(ApiResponse {
                success: true,
                message: "注册成功".to_string(),
                data: Some("Success"),
            }));
    }

    drop(state);
    Ok(HttpResponse::Ok().json(ApiResponse {
        success: true,
        message: "注册成功，请等待管理员审核".to_string(),
        data: Some("Success"),
    }))
}

pub async fn login(
    req: HttpRequest,
    body: web::Json<LoginRequest>,
) -> Result<HttpResponse> {
    let client_ip = req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut state = APP_STATE.lock().unwrap();
    
    // 查找用户
    let mut user_found = None;
    for (id, user) in &state.users {
        if user.email == body.email {
            user_found = Some((id.clone(), user.clone()));
            break;
        }
    }
    
    if let Some((user_id, mut user)) = user_found {
        // 验证密码
        let mut hasher = Sha256::new();
        hasher.update(body.password.as_bytes());
        let password_hash = hex::encode(hasher.finalize());
        
        if password_hash != user.password_hash {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "邮箱或密码错误".to_string()
            )));
        }
        
        // 检查用户状态
        if user.status == UserStatus::Pending {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "账号审核中，请等待管理员审核".to_string()
            )));
        }
        
        if user.status == UserStatus::Banned {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "账号已被封禁".to_string()
            )));
        }
        
        // 更新最后访问IP
        if user.last_ips.len() >= 30 {
            user.last_ips.remove(0);
        }
        user.last_ips.push(client_ip);
        state.users.insert(user_id.clone(), user);
        
        // 创建会话
        let session_token = Uuid::new_v4().to_string();
        let session = Session {
            token: session_token.clone(),
            user_id: user_id.clone(),
            created_at: Utc::now(),
        };
        
        // 管理用户会话 - 修复借用问题
        let token_to_remove = {
            let user_sessions = state.user_sessions
                .entry(user_id.clone())
                .or_insert_with(Vec::new);
                
            if user_sessions.len() >= 5 {
                // 获取要删除的 token
                let token = user_sessions[0].token.clone();
                user_sessions.remove(0);
                Some(token)
            } else {
                None
            }
        };
        
        // 在借用结束后删除旧会话
        if let Some(token) = token_to_remove {
            state.sessions.remove(&token);
        }
        
        // 添加新会话
        state.sessions.insert(session_token.clone(), user_id.clone());
        state.user_sessions
            .get_mut(&user_id)
            .unwrap()
            .push(session);
        
        state.save_users();
        state.save_sessions();
        
        drop(state);
        
        Ok(HttpResponse::Ok()
            .cookie(
                actix_web::cookie::Cookie::build("session_token", session_token)
                    .path("/")
                    .http_only(true)
                    .finish()
            )
            .json(ApiResponse::success("登录成功")))
    } else {
        Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "邮箱或密码错误".to_string()
        )))
    }
}

pub async fn logout(req: HttpRequest) -> Result<HttpResponse> {
    if let Some(cookie) = req.cookie("session_token") {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.remove(token) {
            // 从用户会话列表中移除
            if let Some(user_sessions) = state.user_sessions.get_mut(&user_id) {
                user_sessions.retain(|s| s.token != token);
            }
            state.save_sessions();
        }
    }
    
    Ok(HttpResponse::Ok()
        .cookie(
            actix_web::cookie::Cookie::build("session_token", "")
                .path("/")
                .max_age(actix_web::cookie::time::Duration::seconds(0))
                .finish()
        )
        .json(ApiResponse::success("登出成功")))
}

pub async fn send_verification_code(
    req: HttpRequest,
    body: web::Json<SendVerificationCodeRequest>,
) -> Result<HttpResponse> {
    let client_ip = req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut state = APP_STATE.lock().unwrap();
    state.clean_expired_data();
    
    // 检查是否开放注册
    if !state.settings.registration_open && !state.users.is_empty() {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "注册功能已关闭".to_string()
        )));
    }
    
    // 检查邮箱格式
    let email_regex = Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").unwrap();
    if !email_regex.is_match(&body.email) {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "邮箱格式不正确".to_string()
        )));
    }
    
    // 检查邮箱黑名单
    if state.email_blacklist.contains(&body.email) {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "该邮箱已被禁止注册".to_string()
        )));
    }
    
    // 检查邮箱是否已存在（新增）
    for user in state.users.values() {
        if user.email == body.email {
            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "该邮箱已被注册".to_string()
            )));
        }
    }
    
    // 获取或创建该IP的发送记录
    let attempts = state.verification_attempts
        .entry(client_ip.clone())
        .or_insert_with(Vec::new);
    
    let now = Utc::now();
    
    // 统计不同时间段内的发送次数
    let last_minute_count = attempts.iter()
        .filter(|a| now.signed_duration_since(a.timestamp).num_seconds() < 60)
        .count();
    
    let last_hour_count = attempts.iter()
        .filter(|a| now.signed_duration_since(a.timestamp).num_minutes() < 60)
        .count();
    
    let last_day_count = attempts.iter()
        .filter(|a| now.signed_duration_since(a.timestamp).num_hours() < 24)
        .count();
    
    // 检查限制
    if last_minute_count >= 1 {
        let last_attempt = attempts.iter()
            .filter(|a| now.signed_duration_since(a.timestamp).num_seconds() < 60)
            .max_by_key(|a| a.timestamp)
            .unwrap();
        let remaining_seconds = 60 - now.signed_duration_since(last_attempt.timestamp).num_seconds();
        
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            format!("请求过于频繁，请{}秒后再试", remaining_seconds)
        )));
    }
    
    if last_hour_count >= 6 {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "1小时内发送次数已达上限".to_string()
        )));
    }
    
    if last_day_count >= 12 {
        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
            "24小时内发送次数已达上限".to_string()
        )));
    }
    
    // 生成6位验证码
    let code: String = thread_rng()
        .sample_iter(&rand::distributions::Uniform::new(0, 10))
        .take(6)
        .map(|n| n.to_string())
        .collect();
    
    // 发送邮件
    let email = EmailMessage::builder()
        .from(format!("{} <{}>", SENDER_NAME, SENDER_EMAIL).parse().unwrap())
        .to(body.email.parse().unwrap())
        .subject("Cloud-PE 邮箱验证码")
        .header(ContentType::TEXT_HTML)
        .body(format!(
            r#"
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                                <!-- Header -->
                                <tr>
                                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px 40px; text-align: center;">
                                        <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" style="width: 80px; height: 80px; margin-bottom: 20px;">
                                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Cloud-PE 项目交流群</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px;">
                                        <h2 style="color: #333333; font-size: 24px; margin: 0 0 20px 0; text-align: center;">邮箱验证码</h2>
                                        
                                        <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                                            您正在注册 Cloud-PE 项目交流群，请使用以下验证码完成注册：
                                        </p>
                                        
                                        <!-- Verification Code Box -->
                                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 30px; text-align: center; margin: 0 0 30px 0;">
                                            <div style="font-size: 48px; font-weight: bold; color: #ffffff; letter-spacing: 10px; font-family: 'Courier New', monospace;">
                                                {}
                                            </div>
                                        </div>
                                        
                                        <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 0 0 30px 0;">
                                            <p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0;">
                                                <strong>提示：</strong><br>
                                                • 验证码有效期为 10 分钟<br>
                                                • 请勿将验证码泄露给他人<br>
                                                • 如非本人操作，请忽略此邮件
                                            </p>
                                        </div>
                                        
                                        <div style="text-align: center;">
                                            <a href="http://127.0.0.1:7675" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-size: 16px; font-weight: 500;">
                                                前往注册
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e9ecef;">
                                        <p style="color: #999999; font-size: 14px; margin: 0 0 10px 0;">
                                            此邮件由系统自动发送，请勿直接回复
                                        </p>
                                        <p style="color: #999999; font-size: 14px; margin: 0 0 10px 0;">
                                            © 2025 Cloud-PE Team. All rights reserved.
                                        </p>
                                        <p style="color: #999999; font-size: 12px; margin: 0;">
                                            <a href="https://beian.miit.gov.cn/#/Integrated/index" style="color: #999999; text-decoration: none;">陇ICP备2023028944号</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            "#,
            code
        ))
        .unwrap();
    
    let creds = Credentials::new(
        SMTP_USERNAME.to_string(),
        SMTP_PASSWORD.to_string(),
    );
    
    let mailer = SmtpTransport::relay(SMTP_SERVER)
        .unwrap()
        .credentials(creds)
        .build();
    
    match mailer.send(&email) {
        Ok(_) => {
            // 记录发送成功
            attempts.push(VerificationCodeAttempt {
                ip: client_ip.clone(),
                timestamp: now,
            });
            
            state.verification_codes.insert(
                body.email.clone(),
                VerificationCode {
                    email: body.email.clone(),
                    code,
                    created_at: now,
                },
            );
            
            // 保存验证码发送记录
            state.save_verification_attempts();
            
            Ok(HttpResponse::Ok().json(ApiResponse::success("验证码已发送")))
        }
        Err(e) => {
            eprintln!("发送邮件失败: {:?}", e);
            Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                "发送验证码失败，请稍后再试".to_string()
            )))
        }
    }
}

pub async fn verify_email(req: HttpRequest) -> Result<HttpResponse> {
    // 检查是否登录
    let cookie = req.cookie("session_token");
    if cookie.is_none() {
        return Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
            "未登录".to_string()
        )));
    }
    
    Ok(HttpResponse::Ok().json(ApiResponse::success("已登录")))
}

pub async fn get_pending_users(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            if let Some(user) = state.users.get(user_id) {
                if user.role == UserRole::Admin {
                    let pending_users: Vec<&User> = state.users.values()
                        .filter(|u| u.status == UserStatus::Pending)
                        .collect();
                    
                    return Ok(HttpResponse::Ok().json(ApiResponse::success(pending_users)));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权访问".to_string()
    )))
}

pub async fn approve_user(
    req: HttpRequest,
    body: web::Json<ApproveRejectRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(admin_id) = state.sessions.get(token) {
            if let Some(admin) = state.users.get(admin_id) {
                if admin.role == UserRole::Admin {
                    // 获取用户邮箱和用户名（避免借用问题）
                    let (user_email, user_name) = {
                        if let Some(user) = state.users.get_mut(&body.user_id) {
                            if user.status == UserStatus::Pending {
                                user.status = UserStatus::Active;
                                (user.email.clone(), user.username.clone())
                            } else {
                                return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                                    "用户状态不正确".to_string()
                                )));
                            }
                        } else {
                            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                                "用户不存在".to_string()
                            )));
                        }
                    };
                    
                    state.save_users();
                    
                    // 发送通知邮件
                    let email = EmailMessage::builder()
                        .from(format!("{} <{}>", SENDER_NAME, SENDER_EMAIL).parse().unwrap())
                        .to(user_email.parse().unwrap())
                        .subject("Cloud-PE 注册审核通过")
                        .header(ContentType::TEXT_HTML)
                        .body(format!(
                            r#"
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            </head>
                            <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
                                    <tr>
                                        <td align="center">
                                            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                                                <!-- Header -->
                                                <tr>
                                                    <td style="background: linear-gradient(135deg, #42e695 0%, #3bb2b8 100%); padding: 40px 40px 30px 40px; text-align: center;">
                                                        <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" style="width: 80px; height: 80px; margin-bottom: 20px;">
                                                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">欢迎加入 Cloud-PE</h1>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Content -->
                                                <tr>
                                                    <td style="padding: 40px;">
                                                        <h2 style="color: #333333; font-size: 24px; margin: 0 0 20px 0;">恭喜您，{}！</h2>
                                                        
                                                        <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
                                                            您的 Cloud-PE 项目交流群注册申请已经通过审核。现在您可以登录并开始使用了。
                                                        </p>
                                                        
                                                        <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 20px; margin: 0 0 30px 0;">
                                                            <p style="color: #166534; font-size: 16px; margin: 0;">
                                                                <strong>✅ 审核已通过</strong><br>
                                                                您现在可以使用注册时的邮箱和密码登录系统。
                                                            </p>
                                                        </div>
                                                        
                                                        <div style="text-align: center;">
                                                            <a href="http://127.0.0.1:7675" style="display: inline-block; background-color: #42e695; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: 500;">
                                                                立即登录
                                                            </a>
                                                        </div>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Footer -->
                                                <tr>
                                                    <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e9ecef;">
                                                        <p style="color: #999999; font-size: 14px; margin: 0 0 10px 0;">
                                                            © 2025 Cloud-PE Team. All rights reserved.
                                                        </p>
                                                        <p style="color: #999999; font-size: 12px; margin: 0;">
                                                            <a href="https://beian.miit.gov.cn/#/Integrated/index" style="color: #999999; text-decoration: none;">陇ICP备2023028944号</a>
                                                        </p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </body>
                            </html>
                            "#,
                            user_name
                        ))
                        .unwrap();
                    
                    let creds = Credentials::new(
                        SMTP_USERNAME.to_string(),
                        SMTP_PASSWORD.to_string(),
                    );
                    
                    let mailer = SmtpTransport::relay(SMTP_SERVER)
                        .unwrap()
                        .credentials(creds)
                        .build();
                    
                    let _ = mailer.send(&email);
                    
                    return Ok(HttpResponse::Ok().json(ApiResponse::success("审核通过")));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn reject_user(
    req: HttpRequest,
    body: web::Json<ApproveRejectRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(admin_id) = state.sessions.get(token) {
            if let Some(admin) = state.users.get(admin_id) {
                if admin.role == UserRole::Admin {
                    if let Some(user) = state.users.remove(&body.user_id) {
                        if user.status == UserStatus::Pending {
                            // 加入邮箱黑名单
                            state.email_blacklist.push(user.email.clone());
                            state.save_users();
                            state.save_blacklist();
                            
                            // 发送拒绝邮件
                            let email_body = format!(r#"
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset="UTF-8">
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                </head>
                                <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
                                        <tr>
                                            <td align="center">
                                                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                                                    <!-- Header -->
                                                    <tr>
                                                        <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 40px 30px 40px; text-align: center;">
                                                            <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" style="width: 80px; height: 80px; margin-bottom: 20px;">
                                                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">注册审核结果</h1>
                                                        </td>
                                                    </tr>
                                                    
                                                    <!-- Content -->
                                                    <tr>
                                                        <td style="padding: 40px;">
                                                            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 20px; margin: 0 0 30px 0;">
                                                                <p style="color: #991b1b; font-size: 16px; margin: 0;">
                                                                    <strong>❌ 审核未通过</strong><br>
                                                                    很抱歉，您的注册申请未能通过管理员审核。
                                                                </p>
                                                            </div>
                                                            
                                                            <p style="color: #666666; font-size: 16px; line-height: 24px; margin: 0;">
                                                                感谢您对 Cloud-PE 项目交流群的关注。
                                                            </p>
                                                        </td>
                                                    </tr>
                                                    
                                                    <!-- Footer -->
                                                    <tr>
                                                        <td style="background-color: #f8f9fa; padding: 30px 40px; text-align: center; border-top: 1px solid #e9ecef;">
                                                            <p style="color: #999999; font-size: 14px; margin: 0 0 10px 0;">
                                                                © 2025 Cloud-PE Team. All rights reserved.
                                                            </p>
                                                            <p style="color: #999999; font-size: 12px; margin: 0;">
                                                                <a href="https://beian.miit.gov.cn/#/Integrated/index" style="color: #999999; text-decoration: none;">陇ICP备2023028944号</a>
                                                            </p>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </body>
                                </html>
                                "#);
                            
                            let email = EmailMessage::builder()
                                .from(format!("{} <{}>", SENDER_NAME, SENDER_EMAIL).parse().unwrap())
                                .to(user.email.parse().unwrap())
                                .subject("Cloud-PE 注册审核结果")
                                .header(ContentType::TEXT_HTML)
                                .body(email_body)
                                .unwrap();
                            
                            let creds = Credentials::new(
                                SMTP_USERNAME.to_string(),
                                SMTP_PASSWORD.to_string(),
                            );
                            
                            let mailer = SmtpTransport::relay(SMTP_SERVER)
                                .unwrap()
                                .credentials(creds)
                                .build();
                            
                            let _ = mailer.send(&email);
                            
                            return Ok(HttpResponse::Ok().json(ApiResponse::success("已拒绝")));
                        }
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn get_users(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            if let Some(user) = state.users.get(user_id) {
                if user.role == UserRole::Admin {
                    let users: Vec<&User> = state.users.values()
                        .filter(|u| u.status == UserStatus::Active)
                        .collect();
                    
                    return Ok(HttpResponse::Ok().json(ApiResponse::success(users)));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权访问".to_string()
    )))
}

pub async fn add_user(
    req: HttpRequest,
    body: web::Json<AddUserRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(admin_id) = state.sessions.get(token) {
            if let Some(admin) = state.users.get(admin_id) {
                if admin.role == UserRole::Admin {
                    // 检查邮箱是否已存在
                    for user in state.users.values() {
                        if user.email == body.email {
                            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                                "该邮箱已被注册".to_string()
                            )));
                        }
                    }
                    
                    // 检查用户名是否已存在
                    for user in state.users.values() {
                        if user.username == body.username {
                            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                                "该用户名已被使用".to_string()
                            )));
                        }
                    }
                    
                    // 创建用户
                    let mut hasher = Sha256::new();
                    hasher.update(body.password.as_bytes());
                    let password_hash = hex::encode(hasher.finalize());
                    
                    let user = User {
                        id: Uuid::new_v4().to_string(),
                        username: body.username.clone(),
                        email: body.email.clone(),
                        password_hash,
                        avatar: body.avatar.clone(),
                        display_name: None,
                        role: UserRole::Member,
                        status: UserStatus::Active,
                        created_at: Utc::now(),
                        last_ips: Vec::new(),
                        muted_until: None,
                    };
                    
                    state.users.insert(user.id.clone(), user);
                    state.save_users();
                    
                    return Ok(HttpResponse::Ok().json(ApiResponse::success("用户添加成功")));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn delete_user(
    req: HttpRequest,
    body: web::Json<DeleteUserRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(admin_id) = state.sessions.get(token) {
            // 防止管理员删除自己
            if admin_id == &body.user_id {
                return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                    "不能删除自己的账号".to_string()
                )));
            }
            
            if let Some(admin) = state.users.get(admin_id) {
                if admin.role == UserRole::Admin {
                    if let Some(_user) = state.users.remove(&body.user_id) {
                        // 移除用户的所有会话
                        if let Some(sessions) = state.user_sessions.remove(&body.user_id) {
                            for session in sessions {
                                state.sessions.remove(&session.token);
                            }
                        }
                        
                        state.save_users();
                        state.save_sessions();
                        
                        return Ok(HttpResponse::Ok().json(ApiResponse::success("用户已删除")));
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn get_settings(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            if let Some(user) = state.users.get(user_id) {
                if user.role == UserRole::Admin {
                    return Ok(HttpResponse::Ok().json(ApiResponse::success(&state.settings)));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权访问".to_string()
    )))
}

pub async fn update_settings(
    req: HttpRequest,
    body: web::Json<UpdateSettingsRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            if let Some(user) = state.users.get(user_id) {
                if user.role == UserRole::Admin {
                    state.settings.registration_open = body.registration_open;
                    state.settings.require_approval = body.require_approval;
                    state.save_settings();
                    
                    return Ok(HttpResponse::Ok().json(ApiResponse::success("设置已更新")));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn get_messages(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        
        if let Some(_user_id) = state.sessions.get(token) {
            // 返回最近100条消息，并包含用户信息
            let messages: Vec<MessageWithUser> = state.messages.iter()
                .rev()
                .take(100)
                .rev()
                .map(|msg| {
                    let user = state.users.get(&msg.user_id).cloned();
                    MessageWithUser {
                        id: msg.id.clone(),
                        user_id: msg.user_id.clone(),
                        content: msg.content.clone(),
                        timestamp: msg.timestamp,
                        recalled: msg.recalled,
                        user,
                        original_content: msg.original_content.clone(),
                    }
                })
                .collect();
            
            return Ok(HttpResponse::Ok().json(ApiResponse::success(messages)));
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

pub async fn send_message(
    req: HttpRequest,
    body: web::Json<SendMessageRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            let user_id = user_id.clone(); // 克隆 user_id
            
            if let Some(user) = state.users.get(&user_id) {
                // 检查是否被禁言
                if let Some(muted_until) = user.muted_until {
                    if muted_until > Utc::now() {
                        let remaining = muted_until.signed_duration_since(Utc::now());
                        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                            format!("您已被禁言，剩余时间：{}分钟", remaining.num_minutes())
                        )));
                    }
                }
                
                // 克隆用户信息
                let user_info = user.clone();
                
                let message = Message {
                    id: Uuid::new_v4().to_string(),
                    user_id: user_id.clone(),
                    content: body.content.clone(),
                    timestamp: Utc::now(),
                    recalled: false,
                    original_content: None,
                };
                
                state.messages.push(message.clone());
                state.save_messages();
                
                // 释放锁后再进行广播
                drop(state);
                
                // 创建包含用户信息的消息
                let message_with_user = MessageWithUser {
                    id: message.id.clone(),
                    user_id: message.user_id.clone(),
                    content: message.content.clone(),
                    timestamp: message.timestamp,
                    recalled: message.recalled,
                    user: Some(user_info),
                    original_content: None,
                };
                
                // 广播消息给所有在线用户
                crate::websocket::broadcast_message_with_user(&message_with_user);
                
                return Ok(HttpResponse::Ok().json(ApiResponse::success(message_with_user)));
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

pub async fn recall_message(
    req: HttpRequest,
    body: web::Json<RecallMessageRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            let user_id = user_id.clone();
            
            if let Some(user) = state.users.get(&user_id) {
                let user_role = user.role.clone();
                
                // 先收集需要的信息，避免借用冲突
                let mut message_info = None;
                for message in &state.messages {
                    if message.id == body.message_id && !message.recalled {
                        message_info = Some((message.user_id.clone(), message.id.clone(), message.content.clone()));
                        break;
                    }
                }
                
                if let Some((msg_user_id, msg_id, original_content)) = message_info {
                    // 获取消息发送者的角色
                    let msg_user_role = state.users.get(&msg_user_id)
                        .map(|u| u.role.clone());
                    
                    // 检查权限
                    let can_recall = match user_role {
                        UserRole::Admin => true,
                        UserRole::DeputyAdmin => {
                            match msg_user_role {
                                Some(UserRole::Admin) => false,
                                _ => true,
                            }
                        }
                        UserRole::Member => msg_user_id == user_id,
                    };
                    
                    if can_recall {
                        // 保存原始内容
                        let mut recalled_message = None;
                        for message in &mut state.messages {
                            if message.id == msg_id {
                                message.recalled = true;
                                message.original_content = Some(original_content.clone());
                                recalled_message = Some(message.clone());
                                break;
                            }
                        }
                        
                        state.save_messages();
                                            
                        // 广播完整的消息数据而不是只广播ID
                        if let Some(msg) = recalled_message {
                            // 获取用户信息
                            let user = state.users.get(&msg.user_id).cloned();
                            drop(state);
                            
                            let message_with_user = MessageWithUser {
                                id: msg.id,
                                user_id: msg.user_id,
                                content: msg.content,
                                timestamp: msg.timestamp,
                                recalled: msg.recalled,
                                user: user,
                                original_content: msg.original_content,
                            };
                            
                            crate::websocket::broadcast_recall_with_message(&message_with_user);
                        } else {
                            drop(state);
                            crate::websocket::broadcast_recall(&body.message_id);
                        }
    
                        return Ok(HttpResponse::Ok().json(ApiResponse::success("消息已撤回")));
                    } else {
                        return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                            "无权撤回此消息".to_string()
                        )));
                    }
                } else {
                    return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                        "消息不存在或已被撤回".to_string()
                    )));
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

pub async fn set_deputy_admin(
    req: HttpRequest,
    body: web::Json<SetDeputyAdminRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(admin_id) = state.sessions.get(token) {
            if let Some(admin) = state.users.get(admin_id) {
                if admin.role == UserRole::Admin {
                    if let Some(user) = state.users.get_mut(&body.user_id) {
                        if user.role != UserRole::Admin {
                            let old_role = user.role.clone();
                            user.role = if body.is_deputy {
                                UserRole::DeputyAdmin
                            } else {
                                UserRole::Member
                            };
                            let new_role = user.role.clone();
                            let user_id = user.id.clone();
                            state.save_users();
                            
                            // 广播权限变更
                            drop(state);
                            crate::websocket::broadcast_role_changed(&user_id, &old_role, &new_role);
                            
                            return Ok(HttpResponse::Ok().json(ApiResponse::success("权限已更新")));
                        }
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn mute_user(
    req: HttpRequest,
    body: web::Json<MuteUserRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(operator_id) = state.sessions.get(token) {
            if let Some(operator) = state.users.get(operator_id) {
                let can_mute = match operator.role {
                    UserRole::Admin => true,
                    UserRole::DeputyAdmin => {
                        // 次管理员只能禁言普通成员
                        if let Some(target_user) = state.users.get(&body.user_id) {
                            target_user.role == UserRole::Member
                        } else {
                            false
                        }
                    }
                    UserRole::Member => false,
                };
                
                if can_mute {
                    if let Some(user) = state.users.get_mut(&body.user_id) {
                        user.muted_until = Some(Utc::now() + Duration::minutes(body.duration_minutes));
                        state.save_users();
                        
                        return Ok(HttpResponse::Ok().json(ApiResponse::success("已禁言")));
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn ban_user(
    req: HttpRequest,
    body: web::Json<BanUserRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(operator_id) = state.sessions.get(token) {
            // 防止封禁自己
            if operator_id == &body.user_id {
                return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                    "不能封禁自己".to_string()
                )));
            }
            
            if let Some(operator) = state.users.get(operator_id) {
                let can_ban = match operator.role {
                    UserRole::Admin => true,
                    UserRole::DeputyAdmin => {
                        // 次管理员只能封禁普通成员
                        if let Some(target_user) = state.users.get(&body.user_id) {
                            target_user.role == UserRole::Member
                        } else {
                            false
                        }
                    }
                    UserRole::Member => false,
                };
                
                if can_ban {
                    if let Some(user) = state.users.remove(&body.user_id) {
                        // 加入邮箱黑名单
                        state.email_blacklist.push(user.email.clone());
                        
                        // 移除用户的所有会话
                        if let Some(sessions) = state.user_sessions.remove(&body.user_id) {
                            for session in sessions {
                                state.sessions.remove(&session.token);
                            }
                        }
                        
                        state.save_users();
                        state.save_sessions();
                        state.save_blacklist();
                        
                        // 广播用户被封禁
                        crate::websocket::broadcast_user_banned(&body.user_id);
                        
                        return Ok(HttpResponse::Ok().json(ApiResponse::success("用户已封禁")));
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn get_current_user(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            if let Some(user) = state.users.get(user_id) {
                return Ok(HttpResponse::Ok().json(ApiResponse::success(user)));
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

pub async fn unmute_user(
    req: HttpRequest,
    body: web::Json<UnmuteUserRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(operator_id) = state.sessions.get(token) {
            if let Some(operator) = state.users.get(operator_id) {
                let can_unmute = match operator.role {
                    UserRole::Admin => true,
                    UserRole::DeputyAdmin => {
                        // 次管理员只能解除禁言普通成员
                        if let Some(target_user) = state.users.get(&body.user_id) {
                            target_user.role == UserRole::Member
                        } else {
                            false
                        }
                    }
                    UserRole::Member => false,
                };
                
                if can_unmute {
                    if let Some(user) = state.users.get_mut(&body.user_id) {
                        user.muted_until = None;
                        state.save_users();
                        
                        return Ok(HttpResponse::Ok().json(ApiResponse::success("已解除禁言")));
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "无权操作".to_string()
    )))
}

pub async fn get_mention_checks(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            if let Some(mention_check) = state.mention_checks.get(user_id) {
                return Ok(HttpResponse::Ok().json(ApiResponse::success(&mention_check.checked_message_ids)));
            } else {
                return Ok(HttpResponse::Ok().json(ApiResponse::success(Vec::<String>::new())));
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

pub async fn mark_mentions_checked(
    req: HttpRequest,
    body: web::Json<MarkMentionsCheckedRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            let user_id = user_id.clone();
            
            if let Some(mention_check) = state.mention_checks.get_mut(&user_id) {
                // 添加新的已查看消息ID
                for message_id in &body.message_ids {
                    if !mention_check.checked_message_ids.contains(message_id) {
                        mention_check.checked_message_ids.push(message_id.clone());
                    }
                }
                mention_check.last_updated = Utc::now();
            } else {
                // 创建新的记录
                let mention_check = MentionCheck {
                    user_id: user_id.clone(),
                    checked_message_ids: body.message_ids.clone(),
                    last_updated: Utc::now(),
                };
                state.mention_checks.insert(user_id, mention_check);
            }
            
            state.save_mention_checks();
            
            return Ok(HttpResponse::Ok().json(ApiResponse::success("已标记为已查看")));
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

// 新增：注销账号接口
pub async fn delete_account(req: HttpRequest) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            let user_id = user_id.clone();
            
            if let Some(user) = state.users.get(&user_id) {
                // 管理员不能注销账号
                if user.role == UserRole::Admin {
                    return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                        "管理员账号不能注销".to_string()
                    )));
                }
                
                // 删除用户
                state.users.remove(&user_id);
                
                // 移除用户的所有会话
                if let Some(sessions) = state.user_sessions.remove(&user_id) {
                    for session in sessions {
                        state.sessions.remove(&session.token);
                    }
                }
                
                state.save_users();
                state.save_sessions();
                
                drop(state);
                
                // 广播用户被删除
                crate::websocket::broadcast_user_deleted(&user_id);
                
                return Ok(HttpResponse::Ok()
                    .cookie(
                        actix_web::cookie::Cookie::build("session_token", "")
                            .path("/")
                            .max_age(actix_web::cookie::time::Duration::seconds(0))
                            .finish()
                    )
                    .json(ApiResponse::success("账号已注销")));
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

// 新增：更新群聊昵称接口
pub async fn update_display_name(
    req: HttpRequest,
    body: web::Json<UpdateDisplayNameRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(user_id) = state.sessions.get(token) {
            let user_id = user_id.clone();
            
            if let Some(user) = state.users.get_mut(&user_id) {
                let old_display_name = user.display_name.clone();
                user.display_name = body.display_name.clone();
                let new_display_name = user.display_name.clone();
                state.save_users();
                
                drop(state);
                
                // 广播昵称变更
                crate::websocket::broadcast_display_name_changed(&user_id, &old_display_name, &new_display_name);
                
                return Ok(HttpResponse::Ok().json(ApiResponse::success("昵称已更新")));
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}

pub async fn update_user_display_name(
    req: HttpRequest,
    body: web::Json<UpdateUserDisplayNameRequest>,
) -> Result<HttpResponse> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let mut state = APP_STATE.lock().unwrap();
        
        if let Some(operator_id) = state.sessions.get(token) {
            let operator_id = operator_id.clone();
            
            if let Some(operator) = state.users.get(&operator_id) {
                // 如果是修改自己的昵称
                if operator_id == body.user_id {
                    if let Some(user) = state.users.get_mut(&body.user_id) {
                        let old_display_name = user.display_name.clone();
                        user.display_name = body.display_name.clone();
                        let new_display_name = user.display_name.clone();
                        state.save_users();
                        
                        drop(state);
                        
                        // 广播昵称变更
                        crate::websocket::broadcast_display_name_changed(&body.user_id, &old_display_name, &new_display_name);
                        
                        return Ok(HttpResponse::Ok().json(ApiResponse::success("昵称已更新")));
                    }
                } else {
                    // 修改其他人的昵称，检查权限
                    if let Some(target_user) = state.users.get(&body.user_id) {
                        let can_edit = match operator.role {
                            UserRole::Admin => {
                                // 管理员可以修改次管理员和普通成员
                                target_user.role == UserRole::DeputyAdmin || target_user.role == UserRole::Member
                            },
                            UserRole::DeputyAdmin => {
                                // 次管理员只能修改普通成员
                                target_user.role == UserRole::Member
                            },
                            UserRole::Member => false,
                        };
                        
                        if can_edit {
                            if let Some(user) = state.users.get_mut(&body.user_id) {
                                let old_display_name = user.display_name.clone();
                                user.display_name = body.display_name.clone();
                                let new_display_name = user.display_name.clone();
                                state.save_users();
                                
                                drop(state);
                                
                                // 广播昵称变更
                                crate::websocket::broadcast_display_name_changed(&body.user_id, &old_display_name, &new_display_name);
                                
                                return Ok(HttpResponse::Ok().json(ApiResponse::success("昵称已更新")));
                            }
                        } else {
                            return Ok(HttpResponse::Ok().json(ApiResponse::<()>::error(
                                "无权修改该用户的昵称".to_string()
                            )));
                        }
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
        "未登录".to_string()
    )))
}