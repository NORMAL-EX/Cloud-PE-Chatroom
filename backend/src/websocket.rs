use actix_ws::{Message as WsMessage, Session};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;
use crate::models::{Message, MessageWithUser, UserRole};
use serde::{Deserialize, Serialize};
use futures_util::StreamExt;

lazy_static! {
    static ref CONNECTIONS: Arc<Mutex<HashMap<String, Session>>> = 
        Arc::new(Mutex::new(HashMap::new()));
}

pub async fn handle_websocket(
    user_id: String,
    session: Session,
    mut msg_stream: actix_ws::MessageStream,
) {
    // 添加连接
    CONNECTIONS.lock().unwrap().insert(user_id.clone(), session.clone());
    
    // 处理消息
    while let Some(Ok(msg)) = msg_stream.next().await {
        match msg {
            WsMessage::Text(text) => {
                println!("Received from {}: {}", user_id, text);
            }
            WsMessage::Close(_) => {
                break;
            }
            _ => {}
        }
    }
    
    // 移除连接
    CONNECTIONS.lock().unwrap().remove(&user_id);
}

#[derive(Serialize, Deserialize)]
struct WsEvent {
    event: String,
    data: serde_json::Value,
}

pub fn broadcast_recall(message_id: &str) {
    let event = WsEvent {
        event: "message_recalled".to_string(),
        data: serde_json::json!({ "message_id": message_id }),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (_user_id, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
        });
    }
}

pub fn broadcast_user_banned(banned_user_id: &str) {
    let event = WsEvent {
        event: "user_banned".to_string(),
        data: serde_json::json!({ "user_id": banned_user_id }),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (user_id, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        let is_banned = user_id == banned_user_id;
        
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
            if is_banned {
                let _ = session.close(None).await;
            }
        });
    }
}

pub fn broadcast_role_changed(user_id: &str, old_role: &UserRole, new_role: &UserRole) {
    let event = WsEvent {
        event: "role_changed".to_string(),
        data: serde_json::json!({ 
            "user_id": user_id,
            "old_role": old_role,
            "new_role": new_role
        }),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (_uid, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
        });
    }
}

pub fn broadcast_message_with_user(message: &MessageWithUser) {
    let event = WsEvent {
        event: "new_message".to_string(),
        data: serde_json::to_value(message).unwrap(),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (_user_id, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
        });
    }
}

pub fn broadcast_message(message: &Message) {
    // 获取用户信息
    let state = crate::APP_STATE.lock().unwrap();
    let user = state.users.get(&message.user_id).cloned();
    drop(state); // 释放锁
    
    let message_with_user = MessageWithUser {
        id: message.id.clone(),
        user_id: message.user_id.clone(),
        content: message.content.clone(),
        timestamp: message.timestamp,
        recalled: message.recalled,
        user,
        original_content: message.original_content.clone(),
    };
    
    broadcast_message_with_user(&message_with_user);
}

pub fn broadcast_recall_with_message(message: &MessageWithUser) {
    let event = WsEvent {
        event: "message_recalled_with_data".to_string(),
        data: serde_json::to_value(message).unwrap(),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (_user_id, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
        });
    }
}

// 新增：广播用户删除事件
pub fn broadcast_user_deleted(deleted_user_id: &str) {
    let event = WsEvent {
        event: "user_deleted".to_string(),
        data: serde_json::json!({ "user_id": deleted_user_id }),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (user_id, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        let is_deleted = user_id == deleted_user_id;
        
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
            if is_deleted {
                let _ = session.close(None).await;
            }
        });
    }
}

// 新增：广播昵称变更事件
pub fn broadcast_display_name_changed(user_id: &str, old_name: &Option<String>, new_name: &Option<String>) {
    let event = WsEvent {
        event: "display_name_changed".to_string(),
        data: serde_json::json!({ 
            "user_id": user_id,
            "old_display_name": old_name,
            "new_display_name": new_name
        }),
    };
    
    let msg = serde_json::to_string(&event).unwrap();
    let connections = CONNECTIONS.lock().unwrap();
    
    for (_uid, session) in connections.iter() {
        let mut session = session.clone();
        let msg = msg.clone();
        actix_web::rt::spawn(async move {
            let _ = session.text(msg).await;
        });
    }
}