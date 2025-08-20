use actix_web::{web, App, HttpServer, HttpRequest, HttpResponse, middleware, Result, Error};
use actix_cors::Cors;
use actix_files::Files;
use std::sync::{Arc, Mutex};
use std::fs;
use lazy_static::lazy_static;

mod models;
mod handlers;
mod websocket;

use models::*;
use handlers::*;
use websocket::*;

lazy_static! {
    static ref APP_STATE: Arc<Mutex<AppState>> = Arc::new(Mutex::new(AppState::new()));
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Cloud-PE Chat starting on http://127.0.0.1:7675");
    
    // 确保数据目录存在
    fs::create_dir_all("data").unwrap_or_default();
    
    // 加载现有数据
    APP_STATE.lock().unwrap().load_data();

    HttpServer::new(|| {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .supports_credentials();

        App::new()
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .service(
                web::scope("/api")
                    .route("/public-settings", web::get().to(get_public_settings))
                    .route("/register", web::post().to(register))
                    .route("/login", web::post().to(login))
                    .route("/logout", web::post().to(logout))
                    .route("/verify-email", web::post().to(verify_email))
                    .route("/send-verification-code", web::post().to(send_verification_code))
                    .route("/pending-users", web::get().to(get_pending_users))
                    .route("/approve-user", web::post().to(approve_user))
                    .route("/reject-user", web::post().to(reject_user))
                    .route("/users", web::get().to(get_users))
                    .route("/add-user", web::post().to(add_user))
                    .route("/delete-user", web::post().to(delete_user))
                    .route("/settings", web::get().to(get_settings))
                    .route("/update-settings", web::post().to(update_settings))
                    .route("/messages", web::get().to(get_messages))
                    .route("/send-message", web::post().to(send_message))
                    .route("/recall-message", web::post().to(recall_message))
                    .route("/set-deputy-admin", web::post().to(set_deputy_admin))
                    .route("/mute-user", web::post().to(mute_user))
                    .route("/unmute-user", web::post().to(unmute_user))
                    .route("/ban-user", web::post().to(ban_user))
                    .route("/current-user", web::get().to(get_current_user))
                    .route("/mention-checks", web::get().to(get_mention_checks))
                    .route("/mark-mentions-checked", web::post().to(mark_mentions_checked))
                    .route("/delete-account", web::post().to(delete_account))
                    .route("/update-display-name", web::post().to(update_display_name))
                    .route("/update-user-display-name", web::post().to(update_user_display_name))
                    .route("/ws", web::get().to(websocket_handler))
            )
            // 静态文件服务
            .service(Files::new("/assets", "../frontend/dist/assets"))
            // 所有其他路由返回 index.html（支持前端路由）
            .default_service(web::get().to(serve_index))
    })
    .bind("127.0.0.1:7675")?
    .run()
    .await
}

async fn serve_index() -> Result<HttpResponse> {
    let html = fs::read_to_string("../frontend/dist/index.html")
        .unwrap_or_else(|_| "Frontend not built yet".to_string());
    Ok(HttpResponse::Ok()
        .content_type("text/html")
        .body(html))
}

async fn websocket_handler(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
    let cookie = req.cookie("session_token");
    if let Some(cookie) = cookie {
        let token = cookie.value();
        let state = APP_STATE.lock().unwrap();
        if let Some(user_id) = state.sessions.get(token) {
            let user_id = user_id.clone();
            drop(state);
            
            let (response, session, msg_stream) = actix_ws::handle(&req, stream)?;
            
            // 启动websocket处理
            actix_web::rt::spawn(async move {
                handle_websocket(user_id, session, msg_stream).await;
            });
            
            return Ok(response);
        }
    }
    
    Ok(HttpResponse::Unauthorized().finish())
}