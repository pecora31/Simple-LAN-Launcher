// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        // Accelerate WebView2 cold-start: disable background telemetry & component update checks
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGS",
            "--disable-background-networking --disable-component-update --disable-features=msSmartScreenProtection",
        );
    }

    app_lib::run();
}
