# Simple LAN Launcher

LAN launcher for Age of Empires II: Definitive Edition, built with Rust and Tauri v2.

## Features

- Multi-profile support: Up to 5 profiles with individual player name, ID, host IP, and launch settings.
- Keyboard shortcuts: Shortcut support for profile creation, deletion, and direct switching (1 to 5). Customizable in settings.
- Background execution: Automatically hides helper console windows (server.exe, BattleServer.exe) during launch.
- Network and system utilities: In-app host ping test, firewall configuration, crash log access, and theme toggle.

## Building from Source

### Prerequisites

- Rust (edition 2024 / 1.85+)
- WebView2 runtime (Windows 10/11)

### Build

```bash
cd src-tauri
cargo build --release
```

Output binary: `src-tauri/target/release/simple-lan-launcher.exe`

## License

MIT
