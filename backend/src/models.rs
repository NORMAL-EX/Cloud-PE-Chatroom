use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub avatar: Option<String>,
    pub display_name: Option<String>, // 新增：群聊昵称
    pub role: UserRole,
    pub status: UserStatus,
    pub created_at: DateTime<Utc>,
    pub last_ips: Vec<String>,
    pub muted_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct UnmuteUserRequest {
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserRole {
    Admin,
    DeputyAdmin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserStatus {
    Pending,
    Active,
    Banned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub registration_open: bool,
    pub require_approval: bool, // 新增：注册是否需要审核
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicSettings {
    pub registration_open: bool,
    pub require_approval: bool, // 新增：公开设置中也包含此字段
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationCode {
    pub email: String,
    pub code: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpBlacklist {
    pub ip: String,
    pub reason: String,
    pub until: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationCodeAttempt {
    pub ip: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MentionCheck {
    pub user_id: String,
    pub checked_message_ids: Vec<String>,
    pub last_updated: DateTime<Utc>,
}

pub struct AppState {
    pub users: HashMap<String, User>,
    pub messages: Vec<Message>,
    pub settings: Settings,
    pub sessions: HashMap<String, String>, // token -> user_id
    pub user_sessions: HashMap<String, Vec<Session>>, // user_id -> sessions
    pub verification_codes: HashMap<String, VerificationCode>,
    pub ip_blacklist: Vec<IpBlacklist>,
    pub email_blacklist: Vec<String>,
    pub registration_attempts: HashMap<String, Vec<DateTime<Utc>>>, // ip -> attempts
    pub verification_attempts: HashMap<String, Vec<VerificationCodeAttempt>>, // ip -> attempts
    pub mention_checks: HashMap<String, MentionCheck>, // user_id -> mention check data
}

impl AppState {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
            messages: Vec::new(),
            settings: Settings {
                registration_open: true,
                require_approval: false, // 默认关闭审核
            },
            sessions: HashMap::new(),
            user_sessions: HashMap::new(),
            verification_codes: HashMap::new(),
            ip_blacklist: Vec::new(),
            email_blacklist: Vec::new(),
            registration_attempts: HashMap::new(),
            verification_attempts: HashMap::new(),
            mention_checks: HashMap::new(),
        }
    }

    pub fn load_data(&mut self) {
        // 加载用户
        if let Ok(data) = fs::read_to_string("data/users.json") {
            if let Ok(users) = serde_json::from_str::<Vec<User>>(&data) {
                for mut user in users {
                    // 兼容旧数据：如果没有display_name字段，设置为None
                    if user.display_name.is_none() {
                        user.display_name = None;
                    }
                    self.users.insert(user.id.clone(), user);
                }
            }
        }

        // 加载消息
        if let Ok(data) = fs::read_to_string("data/messages.json") {
            if let Ok(messages) = serde_json::from_str::<Vec<Message>>(&data) {
                // 处理旧数据兼容性
                self.messages = messages.into_iter().map(|mut msg| {
                    if msg.original_content.is_none() && msg.recalled {
                        msg.original_content = None;
                    }
                    msg
                }).collect();
            }
        }

        // 加载设置
        if let Ok(data) = fs::read_to_string("data/settings.json") {
            if let Ok(mut settings) = serde_json::from_str::<Settings>(&data) {
                // 兼容旧数据：如果没有require_approval字段，设置为false
                if serde_json::from_str::<serde_json::Value>(&data)
                    .map(|v| v.get("require_approval").is_none())
                    .unwrap_or(true) {
                    settings.require_approval = false;
                }
                self.settings = settings;
            }
        }

        // 加载会话
        if let Ok(data) = fs::read_to_string("data/sessions.json") {
            if let Ok(sessions) = serde_json::from_str::<Vec<Session>>(&data) {
                for session in sessions {
                    self.sessions.insert(session.token.clone(), session.user_id.clone());
                    self.user_sessions
                        .entry(session.user_id.clone())
                        .or_insert_with(Vec::new)
                        .push(session);
                }
            }
        }

        // 加载黑名单
        if let Ok(data) = fs::read_to_string("data/blacklist.json") {
            if let Ok(blacklist) = serde_json::from_str::<(Vec<IpBlacklist>, Vec<String>)>(&data) {
                self.ip_blacklist = blacklist.0;
                self.email_blacklist = blacklist.1;
            }
        }

        // 加载验证码发送记录
        if let Ok(data) = fs::read_to_string("data/verification_attempts.json") {
            if let Ok(attempts) = serde_json::from_str::<HashMap<String, Vec<VerificationCodeAttempt>>>(&data) {
                self.verification_attempts = attempts;
            }
        }

        // 加载@消息查看记录
        if let Ok(data) = fs::read_to_string("data/mention_checks.json") {
            if let Ok(mention_checks) = serde_json::from_str::<Vec<MentionCheck>>(&data) {
                for check in mention_checks {
                    self.mention_checks.insert(check.user_id.clone(), check);
                }
            }
        }
    }

    pub fn save_users(&self) {
        let users: Vec<&User> = self.users.values().collect();
        if let Ok(data) = serde_json::to_string_pretty(&users) {
            fs::write("data/users.json", data).ok();
        }
    }

    pub fn save_messages(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.messages) {
            fs::write("data/messages.json", data).ok();
        }
    }

    pub fn save_settings(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.settings) {
            fs::write("data/settings.json", data).ok();
        }
    }

    pub fn save_sessions(&self) {
        let sessions: Vec<&Session> = self.user_sessions
            .values()
            .flatten()
            .collect();
        if let Ok(data) = serde_json::to_string_pretty(&sessions) {
            fs::write("data/sessions.json", data).ok();
        }
    }

    pub fn save_blacklist(&self) {
        let blacklist = (&self.ip_blacklist, &self.email_blacklist);
        if let Ok(data) = serde_json::to_string_pretty(&blacklist) {
            fs::write("data/blacklist.json", data).ok();
        }
    }

    pub fn save_verification_attempts(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.verification_attempts) {
            fs::write("data/verification_attempts.json", data).ok();
        }
    }

    pub fn save_mention_checks(&self) {
        let mention_checks: Vec<&MentionCheck> = self.mention_checks.values().collect();
        if let Ok(data) = serde_json::to_string_pretty(&mention_checks) {
            fs::write("data/mention_checks.json", data).ok();
        }
    }

    pub fn clean_expired_data(&mut self) {
        let now = Utc::now();
        
        // 清理过期的IP黑名单
        self.ip_blacklist.retain(|item| item.until > now);
        
        // 清理过期的验证码
        self.verification_codes.retain(|_, code| {
            now.signed_duration_since(code.created_at).num_minutes() < 10
        });
        
        // 清理过期的注册尝试记录
        for attempts in self.registration_attempts.values_mut() {
            attempts.retain(|time| {
                now.signed_duration_since(*time).num_hours() < 1
            });
        }
        
        // 清理过期的验证码发送记录（保留24小时内的记录）
        for attempts in self.verification_attempts.values_mut() {
            attempts.retain(|attempt| {
                now.signed_duration_since(attempt.timestamp).num_hours() < 24
            });
        }
    }
}

// 请求和响应结构体
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub avatar: Option<String>,
    pub verification_code: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct SendVerificationCodeRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ApproveRejectRequest {
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AddUserRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteUserRequest {
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub registration_open: bool,
    pub require_approval: bool, // 新增
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct RecallMessageRequest {
    pub message_id: String,
}

#[derive(Debug, Deserialize)]
pub struct SetDeputyAdminRequest {
    pub user_id: String,
    pub is_deputy: bool,
}

#[derive(Debug, Deserialize)]
pub struct MuteUserRequest {
    pub user_id: String,
    pub duration_minutes: i64,
}

#[derive(Debug, Deserialize)]
pub struct BanUserRequest {
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
pub struct MarkMentionsCheckedRequest {
    pub message_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDisplayNameRequest {
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: String,
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            message: "Success".to_string(),
            data: Some(data),
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            message,
            data: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub user_id: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub recalled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageWithUser {
    pub id: String,
    pub user_id: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub recalled: bool,
    pub user: Option<User>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserDisplayNameRequest {
    pub user_id: String,
    pub display_name: Option<String>,
}