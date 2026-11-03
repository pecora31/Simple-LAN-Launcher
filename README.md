# Simple LAN Launcher

A lightweight, modern, and high-performance LAN Launcher for **Age of Empires II: Definitive Edition**, built with **Rust** and **Tauri v2**.

---

## ✨ Features

- **Multi-Profile Management**:
  - Dynamically resizable Chrome-style tabs (up to 5 profiles).
  - Individual profile settings: Player Name, 8-digit Player ID, Host IP, UHD texture toggle, Launch mode.
  - Right-click or double-click to rename or delete profiles.
  - Seamless animated active tab indicator.

- **Full Keyboard Shortcuts & Macro Remapping**:
  - `Ctrl + T`: Open a new profile.
  - `Ctrl + W`: Close/delete the active profile.
  - `Ctrl + 1`, `Ctrl + 2`, `Ctrl + 3`, `Ctrl + 4`, `Ctrl + 5`: Switch directly to Profile 1 to 5.
  - All shortcuts can be customized in **Settings ➔ Keyboard Shortcuts** for direct hardware macro binding.

- **Silent & Clean Execution**:
  - Automatically hides background console windows (`server.exe`, `BattleServer.exe`) during launch for a clean gaming experience.
  - Single-instance enforcement with instant focus restoration.

- **Tools & Utilities**:
  - Instant IP ping & latency tester with auto-hiding status badges.
  - One-click Windows Firewall unblocker.
  - Direct crash log inspector.
  - Dark / Light theme toggle.

---

## 🛠️ Building from Source

### Prerequisites

- [Rust](https://rustup.rs/) (edition 2024 / 1.85+)
- [Node.js](https://nodejs.org/) (optional, only for package management)
- Windows 10/11 with WebView2 runtime (pre-installed on modern Windows)

### Build Release Binary

```bash
cd src-tauri
cargo build --release
```

The optimized executable will be located at:
`src-tauri/target/release/simple-lan-launcher.exe`

---

## 📄 License

MIT License. Designed with care for the Age of Empires II community.
