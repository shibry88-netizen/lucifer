// 晨星 · LUCIFER —— Windows 桌面端入口（Tauri 2）
// 使用系统 WebView2：体积小、启动快，且不受浏览器 CORS 限制。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动晨星失败");
}
