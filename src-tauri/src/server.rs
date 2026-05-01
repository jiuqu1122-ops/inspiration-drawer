use axum::{
    extract::{Multipart, Query},
    routing::{get, post},
    Json, Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use serde::Deserialize;

#[derive(Deserialize)]
struct StreamQuery { path: String }

pub async fn start_bridge_server(app_handle: tauri::AppHandle) {
    let app = Router::new()
        .route("/api/ping", get(|| async { Json(serde_json::json!({"success": true})) }))
        .route("/api/send", post(handle_mobile_send))
        // 静态文件和视频流
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], 3333));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn handle_mobile_send(mut multipart: Multipart) {
    // 这里处理文件上传逻辑，对应你原有的 multer 部分
    // 处理完后通过 app_handle.emit("mobile-data-received", payload) 通知前端
}