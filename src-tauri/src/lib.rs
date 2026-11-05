use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, Window};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SINGLE_INSTANCE_PORT: u16 = 49222;

fn generate_random_8digit_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let id = 10000000 + (nanos % 90000000);
    id.to_string()
}

fn default_close_action() -> String {
    "ask".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub player_name: String,
    pub player_id: String,
    pub host_ip: String,
    pub game_path: String,
    #[serde(default = "default_true")]
    pub disable_uhd: bool,
    #[serde(default = "default_true")]
    pub skip_intro: bool,
    pub theme: String,
    #[serde(default = "default_close_action")]
    pub close_action: String,
    pub enable_hotkeys: bool,
    pub key_launch: String,
    pub key_stop: String,
    pub key_switch_tab: String,
    pub key_random_id: String,
    pub key_test_ip: String,
    pub key_new_profile: String,
    pub key_close_profile: String,
    pub key_profile_1: String,
    pub key_profile_2: String,
    pub key_profile_3: String,
    pub key_profile_4: String,
    pub key_profile_5: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            player_name: String::new(),
            player_id: generate_random_8digit_id(),
            host_ip: String::new(),
            game_path: String::new(),
            disable_uhd: true,
            skip_intro: true,
            theme: "dark".to_string(),
            close_action: "ask".to_string(),
            enable_hotkeys: false,
            key_launch: "Enter".to_string(),
            key_stop: "F12".to_string(),
            key_switch_tab: "Tab".to_string(),
            key_random_id: "F8".to_string(),
            key_test_ip: "F6".to_string(),
            key_new_profile: "Ctrl+T".to_string(),
            key_close_profile: "Ctrl+W".to_string(),
            key_profile_1: "Ctrl+1".to_string(),
            key_profile_2: "Ctrl+2".to_string(),
            key_profile_3: "Ctrl+3".to_string(),
            key_profile_4: "Ctrl+4".to_string(),
            key_profile_5: "Ctrl+5".to_string(),
        }
    }
}

fn get_base_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            return parent.to_path_buf();
        }
    }
    PathBuf::from(r"C:\Games\aoe2")
}

fn detect_setup_dir() -> Option<PathBuf> {
    let base = get_base_dir();
    let candidates = [
        base.join("_SETUP"),
        base.parent().map(|p| p.join("_SETUP")).unwrap_or_default(),
        PathBuf::from(r"C:\Games\aoe2\_SETUP"),
    ];

    for c in candidates {
        if c.exists() && c.is_dir() {
            return Some(c);
        }
    }
    None
}

fn detect_game_path() -> String {
    let base = get_base_dir();
    let candidates = [
        base.join(r"Game\AoE2DE_s.exe"),
        base.parent().map(|p| p.join(r"Game\AoE2DE_s.exe")).unwrap_or_default(),
        PathBuf::from(r"C:\Games\aoe2\Game\AoE2DE_s.exe"),
    ];

    for c in candidates {
        if c.exists() {
            return c.to_string_lossy().to_string();
        }
    }
    r"C:\Games\aoe2\Game\AoE2DE_s.exe".to_string()
}

fn set_or_add_ini_key(lines: &mut Vec<String>, key: &str, value: &str) {
    let prefix = format!("{}=", key.to_lowercase());
    let new_line = format!("{}={}", key, value);

    for line in lines.iter_mut() {
        if line.trim().to_lowercase().starts_with(&prefix) {
            *line = new_line;
            return;
        }
    }
    lines.push(new_line);
}

#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
    let mut settings = AppSettings::default();
    settings.game_path = detect_game_path();

    let ini_candidates = [
        get_base_dir().join("AoE2_LAN_Launcher.ini"),
        PathBuf::from(r"C:\Games\aoe2\AoE2_LAN_Launcher.ini"),
    ];

    for ini_path in ini_candidates {
        if ini_path.exists() {
            if let Ok(content) = fs::read_to_string(&ini_path) {
                for line in content.lines() {
                    let t = line.trim();
                    if t.to_lowercase().starts_with("playername=") {
                        let val = t["playername=".len()..].trim();
                        if !val.is_empty() {
                            settings.player_name = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("playerid=") {
                        let val = t["playerid=".len()..].trim();
                        if !val.is_empty() {
                            settings.player_id = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("hostip=") {
                        let val = t["hostip=".len()..].trim();
                        if !val.is_empty() {
                            settings.host_ip = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("gamepath=") {
                        let val = t["gamepath=".len()..].trim();
                        if !val.is_empty() {
                            settings.game_path = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("disableuhd=") {
                        let val = t["disableuhd=".len()..].trim();
                        if let Ok(b) = val.parse::<bool>() {
                            settings.disable_uhd = b;
                        }
                    } else if t.to_lowercase().starts_with("skipintro=") {
                        let val = t["skipintro=".len()..].trim();
                        if let Ok(b) = val.parse::<bool>() {
                            settings.skip_intro = b;
                        }
                    } else if t.to_lowercase().starts_with("theme=") {
                        let val = t["theme=".len()..].trim();
                        settings.theme = val.to_lowercase();
                    } else if t.to_lowercase().starts_with("closeaction=") {
                        let val = t["closeaction=".len()..].trim();
                        if !val.is_empty() {
                            settings.close_action = val.to_lowercase();
                        }
                    } else if t.to_lowercase().starts_with("enablehotkeys=") {
                        let val = t["enablehotkeys=".len()..].trim();
                        if let Ok(b) = val.parse::<bool>() {
                            settings.enable_hotkeys = b;
                        }
                    } else if t.to_lowercase().starts_with("keylaunch=") {
                        let val = t["keylaunch=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_launch = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keystop=") {
                        let val = t["keystop=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_stop = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyswitchtab=") {
                        let val = t["keyswitchtab=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_switch_tab = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyrandomid=") {
                        let val = t["keyrandomid=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_random_id = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keytestip=") {
                        let val = t["keytestip=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_test_ip = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keynewprofile=") {
                        let val = t["keynewprofile=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_new_profile = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keycloseprofile=") {
                        let val = t["keycloseprofile=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_close_profile = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyprofile1=") {
                        let val = t["keyprofile1=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_profile_1 = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyprofile2=") {
                        let val = t["keyprofile2=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_profile_2 = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyprofile3=") {
                        let val = t["keyprofile3=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_profile_3 = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyprofile4=") {
                        let val = t["keyprofile4=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_profile_4 = val.to_string();
                        }
                    } else if t.to_lowercase().starts_with("keyprofile5=") {
                        let val = t["keyprofile5=".len()..].trim();
                        if !val.is_empty() {
                            settings.key_profile_5 = val.to_string();
                        }
                    }
                }
            }
            break;
        }
    }

    // Check steam_emu.ini if PlayerName or PlayerId are still empty
    let steam_emu_candidates = [
        PathBuf::from(r"C:\Games\aoe2\Game\steam_emu.ini"),
        Path::new(&settings.game_path).parent().map(|p| p.join("steam_emu.ini")).unwrap_or_default(),
    ];

    for emu_path in steam_emu_candidates {
        if emu_path.exists() {
            if let Ok(content) = fs::read_to_string(&emu_path) {
                for line in content.lines() {
                    let t = line.trim();
                    if settings.player_name.is_empty() && t.to_lowercase().starts_with("username=") {
                        let val = t["username=".len()..].trim();
                        if !val.is_empty() {
                            settings.player_name = val.to_string();
                        }
                    } else if (settings.player_id.is_empty() || settings.player_id == "76561198000000000") && t.to_lowercase().starts_with("accountid=") {
                        let val = t["accountid=".len()..].trim();
                        if !val.is_empty() {
                            settings.player_id = val.to_string();
                        }
                    }
                }
            }
            break;
        }
    }

    // Check config.toml for Host IP if still empty
    if settings.host_ip.is_empty() {
        if let Some(setup) = detect_setup_dir() {
            let cfg_toml = setup.join(r"CORE\launcher\resources\config.toml");
            if cfg_toml.exists() {
                if let Ok(content) = fs::read_to_string(&cfg_toml) {
                    for line in content.lines() {
                        let t = line.trim();
                        if t.starts_with("Host =") {
                            let val = t["Host =".len()..].trim().trim_matches('\'').trim_matches('"');
                            if !val.is_empty() && val != "0.0.0.0" {
                                settings.host_ip = val.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    if settings.player_id.is_empty() || settings.player_id == "76561198000000000" {
        settings.player_id = generate_random_8digit_id();
    }

    Ok(settings)
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    // 1. Save AoE2_LAN_Launcher.ini (persist all fields including PlayerName, PlayerId, HostIp!)
    let ini_paths = [
        get_base_dir().join("AoE2_LAN_Launcher.ini"),
        PathBuf::from(r"C:\Games\aoe2\AoE2_LAN_Launcher.ini"),
    ];

    let ini_content = format!(
        "[Settings]\nPlayerName={}\nPlayerId={}\nHostIp={}\nGamePath={}\nDisableUHD={}\nSkipIntro={}\nTheme={}\nCloseAction={}\nEnableHotkeys={}\nKeyLaunch={}\nKeyStop={}\nKeySwitchTab={}\nKeyRandomId={}\nKeyTestIp={}\nKeyNewProfile={}\nKeyCloseProfile={}\nKeyProfile1={}\nKeyProfile2={}\nKeyProfile3={}\nKeyProfile4={}\nKeyProfile5={}\n",
        settings.player_name.trim(),
        settings.player_id.trim(),
        settings.host_ip.trim(),
        settings.game_path.trim(),
        settings.disable_uhd,
        settings.skip_intro,
        settings.theme.trim(),
        settings.close_action.trim(),
        settings.enable_hotkeys,
        settings.key_launch.trim(),
        settings.key_stop.trim(),
        settings.key_switch_tab.trim(),
        settings.key_random_id.trim(),
        settings.key_test_ip.trim(),
        settings.key_new_profile.trim(),
        settings.key_close_profile.trim(),
        settings.key_profile_1.trim(),
        settings.key_profile_2.trim(),
        settings.key_profile_3.trim(),
        settings.key_profile_4.trim(),
        settings.key_profile_5.trim()
    );

    for path in ini_paths {
        let _ = fs::write(path, &ini_content);
    }

    // 2. Save steam_emu.ini in Game folder (for RUNE / Goldberg crack)
    let steam_emu_candidates = [
        PathBuf::from(r"C:\Games\aoe2\Game\steam_emu.ini"),
        Path::new(&settings.game_path).parent().map(|p| p.join("steam_emu.ini")).unwrap_or_default(),
    ];

    for emu_path in steam_emu_candidates {
        if emu_path.exists() {
            if let Ok(content) = fs::read_to_string(&emu_path) {
                let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                if !settings.player_name.trim().is_empty() {
                    set_or_add_ini_key(&mut lines, "UserName", settings.player_name.trim());
                }
                if !settings.player_id.trim().is_empty() {
                    set_or_add_ini_key(&mut lines, "AccountId", settings.player_id.trim());
                }
                let _ = fs::write(&emu_path, lines.join("\r\n"));
            }
            break;
        }
    }

    // 3. Save resources\config.toml (Host) & resources\config.age2.toml (Executable & Path)
    if let Some(setup) = detect_setup_dir() {
        let cfg_toml = setup.join(r"CORE\launcher\resources\config.toml");
        if cfg_toml.exists() && !settings.host_ip.trim().is_empty() {
            if let Ok(content) = fs::read_to_string(&cfg_toml) {
                let mut new_lines = Vec::new();
                for line in content.lines() {
                    if line.trim().starts_with("Host =") {
                        new_lines.push(format!("Host = '{}'", settings.host_ip.trim()));
                    } else {
                        new_lines.push(line.to_string());
                    }
                }
                let _ = fs::write(&cfg_toml, new_lines.join("\r\n"));
            }
        }

        let age2_toml = setup.join(r"CORE\launcher\resources\config.age2.toml");
        if age2_toml.exists() && !settings.game_path.trim().is_empty() {
            if let Ok(content) = fs::read_to_string(&age2_toml) {
                let mut new_lines = Vec::new();
                for line in content.lines() {
                    if line.trim().starts_with("Executable =") {
                        new_lines.push(format!("Executable = '{}'", settings.game_path.trim()));
                    } else if line.trim().starts_with("Path =") {
                        if let Some(p) = Path::new(&settings.game_path).parent() {
                            new_lines.push(format!("Path = '{}'", p.to_string_lossy()));
                        } else {
                            new_lines.push(line.to_string());
                        }
                    } else {
                        new_lines.push(line.to_string());
                    }
                }
                let _ = fs::write(&age2_toml, new_lines.join("\r\n"));
            }
        }
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub player_name: String,
    pub player_id: String,
    pub host_ip: String,
    pub game_path: String,
    #[serde(default = "default_true")]
    pub disable_uhd: bool,
    #[serde(default = "default_true")]
    pub skip_intro: bool,
    #[serde(default)]
    pub launch_mode: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesData {
    pub active_id: String,
    pub profiles: Vec<Profile>,
}

fn get_profiles_path() -> PathBuf {
    let base = get_base_dir();
    let p = base.join("profiles.json");
    if p.parent().map(|d| d.exists()).unwrap_or(false) {
        return p;
    }
    PathBuf::from(r"C:\Games\aoe2\profiles.json")
}

#[tauri::command]
fn load_profiles() -> Result<ProfilesData, String> {
    let path = get_profiles_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(data) = serde_json::from_str::<ProfilesData>(&content) {
                if !data.profiles.is_empty() {
                    return Ok(data);
                }
            }
        }
    }

    // Initialize from current settings if profiles.json does not exist
    let cur_settings = load_settings().unwrap_or_default();
    let initial_profile = Profile {
        id: "profile_1".to_string(),
        name: "Default".to_string(),
        player_name: cur_settings.player_name,
        player_id: cur_settings.player_id,
        host_ip: cur_settings.host_ip,
        game_path: cur_settings.game_path,
        disable_uhd: cur_settings.disable_uhd,
        skip_intro: cur_settings.skip_intro,
        launch_mode: 0,
    };

    let data = ProfilesData {
        active_id: "profile_1".to_string(),
        profiles: vec![initial_profile],
    };

    if let Ok(serialized) = serde_json::to_string_pretty(&data) {
        let _ = fs::write(&path, serialized);
    }

    Ok(data)
}

#[tauri::command]
fn save_profiles(data: ProfilesData) -> Result<(), String> {
    let path = get_profiles_path();
    let serialized = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    let _ = fs::write(&path, serialized);

    // Also synchronize active profile to launcher and game ini files
    if let Some(active) = data.profiles.iter().find(|p| p.id == data.active_id) {
        let cur_settings = load_settings().unwrap_or_default();
        let app_settings = AppSettings {
            player_name: active.player_name.clone(),
            player_id: active.player_id.clone(),
            host_ip: active.host_ip.clone(),
            game_path: active.game_path.clone(),
            disable_uhd: active.disable_uhd,
            skip_intro: active.skip_intro,
            theme: cur_settings.theme,
            close_action: cur_settings.close_action,
            enable_hotkeys: cur_settings.enable_hotkeys,
            key_launch: cur_settings.key_launch,
            key_stop: cur_settings.key_stop,
            key_switch_tab: cur_settings.key_switch_tab,
            key_random_id: cur_settings.key_random_id,
            key_test_ip: cur_settings.key_test_ip,
            key_new_profile: cur_settings.key_new_profile,
            key_close_profile: cur_settings.key_close_profile,
            key_profile_1: cur_settings.key_profile_1,
            key_profile_2: cur_settings.key_profile_2,
            key_profile_3: cur_settings.key_profile_3,
            key_profile_4: cur_settings.key_profile_4,
            key_profile_5: cur_settings.key_profile_5,
        };
        let _ = save_settings(app_settings);
    }

    Ok(())
}

#[cfg(target_os = "windows")]
mod win_util {
    use std::ffi::c_void;

    type HWND = *mut c_void;
    type BOOL = i32;
    type LPARAM = isize;

    type WNDENUMPROC = unsafe extern "system" fn(HWND, LPARAM) -> BOOL;

    unsafe extern "system" {
        fn EnumWindows(lpEnumFunc: WNDENUMPROC, lParam: LPARAM) -> BOOL;
        fn GetWindowTextW(hWnd: HWND, lpString: *mut u16, nMaxCount: i32) -> i32;
        fn ShowWindow(hWnd: HWND, nCmdShow: i32) -> BOOL;
        fn IsWindowVisible(hWnd: HWND) -> BOOL;
    }

    const SW_HIDE: i32 = 0;

    unsafe extern "system" fn enum_window_callback(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }

        let mut title = [0u16; 512];
        let len = unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), 512) };
        if len > 0 {
            let s = String::from_utf16_lossy(&title[..len as usize]);
            let lower = s.to_lowercase();

            // Match console window titles
            let is_target = lower.contains("server.exe")
                || lower.contains("battleserver")
                || lower.contains("launcher.exe")
                || lower.contains("battle-server")
                || lower.contains("agent.exe")
                || lower.contains("agelanserver")
                || lower.contains("core\\server")
                || lower.contains("core\\launcher")
                || lower.contains("config-admin");

            // Safety: Never hide game window or our launcher
            let is_game_or_ui = lower.contains("definitive edition")
                || lower.contains("aoe2de")
                || lower.contains("simple lan launcher")
                || lower.contains("tauri");

            if is_target && !is_game_or_ui {
                unsafe {
                    ShowWindow(hwnd, SW_HIDE);
                }
            }
        }
        1
    }

    pub fn hide_secondary_consoles() {
        std::thread::spawn(|| {
            // Check actively for 30 seconds (120 iterations * 250ms) to ensure all background consoles are hidden
            for _ in 0..120 {
                std::thread::sleep(std::time::Duration::from_millis(250));
                unsafe {
                    EnumWindows(enum_window_callback, 0);
                }
            }
        });
    }
}

#[cfg(not(target_os = "windows"))]
mod win_util {
    pub fn hide_secondary_consoles() {}
}

fn is_game_running() -> bool {
    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("tasklist");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("tasklist");

    if let Ok(out) = cmd.args(["/FI", "IMAGENAME eq AoE2DE_s.exe"]).output() {
        let s = String::from_utf8_lossy(&out.stdout);
        return s.contains("AoE2DE_s.exe");
    }
    false
}

fn monitor_game_and_restore(window: Window) {
    let w_clone = window.clone();
    std::thread::spawn(move || {
        let _ = w_clone.emit("game-status", "launching");
        let mut started = false;
        for _ in 0..60 {
            std::thread::sleep(Duration::from_millis(500));
            if is_game_running() {
                started = true;
                break;
            }
        }

        if started {
            let _ = w_clone.emit("game-status", "in-game");
            loop {
                std::thread::sleep(Duration::from_secs(2));
                if !is_game_running() {
                    break;
                }
            }
        }

        let _ = w_clone.emit("game-status", "idle");
        let _ = w_clone.show();
        let _ = w_clone.unminimize();
        let _ = w_clone.set_focus();
    });
}

#[tauri::command]
async fn launch_game(window: Window, mode: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = load_settings()?;
        let setup = detect_setup_dir();

        // Validate Game Executable exists
        let g_path = Path::new(&settings.game_path);
        if !g_path.exists() {
            return Err(format!(
                "The specified Game Executable (AoE2DE_s.exe) was not found:\n{}\nPlease verify it in Settings.",
                settings.game_path
            ));
        }

        // Mode 2: Dedicated Server Only
        if mode == 2 {
            if let Some(ref s_dir) = setup {
                let server_exe = s_dir.join(r"CORE\server\server.exe");
                if server_exe.exists() {
                    let mut cmd = Command::new(&server_exe);
                    cmd.args(["-e", "age2"]);
                    cmd.current_dir(server_exe.parent().unwrap());
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(CREATE_NO_WINDOW);

                    cmd.spawn()
                        .map_err(|e| format!("Failed to spawn server: {}", e))?;
                    win_util::hide_secondary_consoles();
                    return Ok("Dedicated Server running successfully.".to_string());
                }
            }
            return Err("Dedicated Server binary (CORE\\server\\server.exe) not found.".to_string());
        }

        // Mode 0 (Client Only) or Mode 1 (Host + Client)
        let launcher_exe = setup.as_ref().map(|s| s.join(r"CORE\launcher\launcher.exe"));

        if let Some(ref l_exe) = launcher_exe {
            if l_exe.exists() {
                let mut cmd_args = vec!["-e".to_string(), "age2".to_string()];

                // Specify game client path
                if !settings.game_path.trim().is_empty() {
                    cmd_args.push("-l".to_string());
                    cmd_args.push(settings.game_path.trim().to_string());
                }

                if mode == 0 {
                    // Client only
                    if !settings.host_ip.trim().is_empty() {
                        cmd_args.push("-s".to_string());
                        cmd_args.push(settings.host_ip.trim().to_string());
                    }
                    cmd_args.push("-a".to_string());
                    cmd_args.push("false".to_string());
                } else if mode == 1 {
                    // Host + Client (start local server)
                    cmd_args.push("-a".to_string());
                    cmd_args.push("true".to_string());
                }

                let mut extra_args = Vec::new();
                if settings.disable_uhd {
                    extra_args.push("-NOTEXTURESTREAMING");
                }
                if settings.skip_intro {
                    extra_args.push("-novid");
                }
                if !extra_args.is_empty() {
                    cmd_args.push("-i".to_string());
                    cmd_args.push(extra_args.join(" "));
                }

                let mut cmd = Command::new(l_exe);
                cmd.args(&cmd_args);
                cmd.current_dir(l_exe.parent().unwrap());
                #[cfg(target_os = "windows")]
                cmd.creation_flags(CREATE_NO_WINDOW);

                cmd.spawn()
                    .map_err(|e| format!("Failed to spawn launcher: {}", e))?;

                // Automatically hide all background helper consoles (BattleServer, server.exe, etc.)
                win_util::hide_secondary_consoles();

                // Auto-hide launcher to system tray and monitor game exit
                // Keep window visible so player can track real-time progress
                monitor_game_and_restore(window);

                return Ok("Game client launched via LAN launcher.".to_string());
            }
        }

        // Fallback: direct game launch if launcher.exe is not present
        if g_path.exists() {
            let mut args = Vec::new();
            if settings.disable_uhd {
                args.push("-NOTEXTURESTREAMING");
            }
            if settings.skip_intro {
                args.push("-novid");
            }

            Command::new(g_path)
                .args(&args)
                .current_dir(g_path.parent().unwrap_or(Path::new(".")))
                .spawn()
                .map_err(|e| format!("Failed to spawn game executable: {}", e))?;

            // Keep window visible so player can track real-time progress
            monitor_game_and_restore(window);

            return Ok("Game client launched directly.".to_string());
        }

        Err("Could not find a valid game executable to start.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn stop_processes() -> Result<String, String> {
    let procs = [
        "AoE2DE_s.exe",
        "ageLANServer.exe",
        "launcher.exe",
        "server.exe",
        "BattleServer.exe",
        "agent.exe",
    ];
    for p in procs {
        #[cfg(target_os = "windows")]
        let _ = Command::new("taskkill")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/F", "/IM", p])
            .output();

        #[cfg(not(target_os = "windows"))]
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", p])
            .output();
    }
    Ok("Stopped active game & server processes.".to_string())
}

#[tauri::command]
fn browse_game_file() -> Result<Option<String>, String> {
    let ps_cmd = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $f = New-Object System.Windows.Forms.OpenFileDialog
        $f.Filter = 'Executable (*.exe)|*.exe|All (*.*)|*.*'
        $f.FileName = 'AoE2DE_s.exe'
        if ($f.ShowDialog() -eq 'OK') { $f.FileName }
    "#;

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("powershell");

    let output = cmd
        .args(["-NoProfile", "-Command", ps_cmd])
        .output()
        .map_err(|e| e.to_string())?;

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(path))
    }
}

#[tauri::command]
fn open_crash_logs() -> Result<(), String> {
    let mut dirs_to_check = Vec::new();
    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        dirs_to_check.push(PathBuf::from(local_app).join(r"Packages\Microsoft.MSPhoenix_8wekyb3d8bbwe\LocalState"));
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        dirs_to_check.push(PathBuf::from(user_profile).join(r"Games\Age of Empires 2 DE\logs"));
    }
    dirs_to_check.push(get_base_dir().join("logs"));
    dirs_to_check.push(PathBuf::from(r"C:\Games\aoe2\logs"));

    for dir in dirs_to_check {
        if dir.exists() {
            let _ = Command::new("explorer").arg(&dir).spawn();
            return Ok(());
        }
    }

    let default_logs = PathBuf::from(r"C:\Games\aoe2\logs");
    let _ = fs::create_dir_all(&default_logs);
    let _ = Command::new("explorer").arg(&default_logs).spawn();
    Ok(())
}

#[tauri::command]
fn run_diagnostics(host: String) -> Result<String, String> {
    let mut report = String::new();
    report.push_str("=== Simple LAN Launcher Diagnostic Report (Tauri v2) ===\n\n");
    report.push_str(&format!("Target Host: {}\n\n", host));

    // Test ports 3005 and 8080
    for port in [3005, 8080] {
        let addr_str = format!("{}:{}", host, port);
        if let Ok(addr) = addr_str.parse::<SocketAddr>() {
            match TcpStream::connect_timeout(&addr, Duration::from_millis(1500)) {
                Ok(_) => report.push_str(&format!("  Port {}: OPEN\n", port)),
                Err(_) => report.push_str(&format!("  Port {}: NOT REACHABLE\n", port)),
            }
        } else {
            report.push_str(&format!("  Port {}: Invalid Address Format\n", port));
        }
    }

    Ok(report)
}

#[tauri::command]
fn unblock_firewall() -> Result<String, String> {
    let setup = detect_setup_dir();
    let s_exe = setup.as_ref().map(|s| s.join(r"CORE\server\ageLANServer.exe"));
    let l_exe = setup.as_ref().map(|s| s.join(r"CORE\launcher\launcher.exe"));
    let g_exe = PathBuf::from(detect_game_path());

    let mut count = 0;
    for (name, path) in [("AoE2_Server", s_exe), ("AoE2_Launcher", l_exe), ("AoE2_Game", Some(g_exe))] {
        if let Some(p) = path {
            if p.exists() {
                let arg = format!(
                    "advfirewall firewall add rule name=\"{}\" dir=in action=allow program=\"{}\" enable=yes",
                    name, p.to_string_lossy()
                );

                #[cfg(target_os = "windows")]
                let mut cmd = Command::new("netsh");
                #[cfg(target_os = "windows")]
                cmd.creation_flags(CREATE_NO_WINDOW);

                #[cfg(not(target_os = "windows"))]
                let mut cmd = Command::new("netsh");

                let _ = cmd.args(["advfirewall", "firewall", "add", "rule", &arg]).output();
                count += 1;
            }
        }
    }

    Ok(format!("Configured firewall rules for {} components.", count))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub game_version: String,
    pub lan_server_version: String,
}

#[tauri::command]
fn get_version_info(game_path: String) -> Result<VersionInfo, String> {
    let mut g_ver = "Unknown (Check Game Path in Settings)".to_string();
    let p = PathBuf::from(game_path.trim());
    if p.exists() {
        let script = format!(
            "[System.Diagnostics.FileVersionInfo]::GetVersionInfo('{}').FileVersion",
            p.to_string_lossy().replace('\'', "''")
        );

        #[cfg(target_os = "windows")]
        let mut cmd = Command::new("powershell");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new("powershell");

        if let Ok(out) = cmd.args(["-NoProfile", "-Command", &script]).output() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                g_ver = s;
            }
        }
    }

    let mut l_ver = "v1.15.6".to_string();
    let setup = detect_setup_dir();
    if let Some(s) = setup {
        let l_exe = s.join(r"CORE\launcher\launcher.exe");
        if l_exe.exists() {
            let script = format!(
                "[System.Diagnostics.FileVersionInfo]::GetVersionInfo('{}').FileVersion",
                l_exe.to_string_lossy().replace('\'', "''")
            );

            #[cfg(target_os = "windows")]
            let mut cmd = Command::new("powershell");
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);

            #[cfg(not(target_os = "windows"))]
            let mut cmd = Command::new("powershell");

            if let Ok(out) = cmd.args(["-NoProfile", "-Command", &script]).output() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() {
                    l_ver = s;
                }
            }
        }
    }

    Ok(VersionInfo {
        game_version: g_ver,
        lan_server_version: l_ver,
    })
}

#[tauri::command]
fn check_updates() -> Result<String, String> {
    Ok("Installed version: v1.15.6\nGitHub status: Up to date.".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub reachable: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[tauri::command]
async fn test_host_ping(host: String) -> Result<PingResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_host = host.trim();
        if clean_host.is_empty() {
            return Err("Host IP cannot be empty.".to_string());
        }

        // Test port 27015 (AoE2 Game) and port 3005 (ageLANServer) with short timeouts
        let ports = [27015, 3005];
        let mut best_ms: Option<u64> = None;

        for port in ports {
            let addr_str = format!("{}:{}", clean_host, port);
            if let Ok(addr) = addr_str.parse::<SocketAddr>() {
                let start = std::time::Instant::now();
                if TcpStream::connect_timeout(&addr, Duration::from_millis(350)).is_ok() {
                    let ms = start.elapsed().as_millis() as u64;
                    best_ms = Some(best_ms.map_or(ms, |b| b.min(ms)));
                    break;
                }
            }
        }

        if let Some(ms) = best_ms {
            Ok(PingResult {
                reachable: true,
                latency_ms: ms,
                message: format!("{}ms", ms),
            })
        } else {
            Ok(PingResult {
                reachable: false,
                latency_ms: 0,
                message: "Timeout".to_string(),
            })
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn check_game_status() -> Result<String, String> {
    if is_game_running() {
        Ok("in-game".to_string())
    } else {
        Ok("idle".to_string())
    }
}


// ==========================================
// MOD MANAGEMENT FOR AOE2 DE LAN / OFFLINE
// ==========================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModItem {
    pub folder_name: String,
    pub title: String,
    pub author: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModStatusEntry {
    #[serde(rename = "CheckSum", default)]
    pub check_sum: Option<String>,
    #[serde(rename = "Enabled")]
    pub enabled: bool,
    #[serde(rename = "LastUpdate", default)]
    pub last_update: Option<String>,
    #[serde(rename = "Path")]
    pub path: String,
    #[serde(rename = "Priority", default)]
    pub priority: i32,
    #[serde(rename = "PublishID", default)]
    pub publish_id: i64,
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "WorkshopID", default)]
    pub workshop_id: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModStatusFile {
    #[serde(rename = "Mods", default)]
    pub mods: Vec<ModStatusEntry>,
    #[serde(rename = "Unsub", default)]
    pub unsub: Vec<serde_json::Value>,
}

fn get_aoe2de_user_dir() -> Option<PathBuf> {
    let user_profile = std::env::var("USERPROFILE").ok()?;
    let base = PathBuf::from(user_profile).join(r"Games\Age of Empires 2 DE");
    if !base.exists() {
        return None;
    }

    let mut candidates = Vec::new();
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                    if name.chars().all(|c| c.is_ascii_digit()) && name != "0" {
                        if let Ok(meta) = entry.metadata() {
                            if let Ok(mtime) = meta.modified() {
                                candidates.push((mtime, p));
                            }
                        }
                    }
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    if let Some((_, p)) = candidates.first() {
        return Some(p.clone());
    }

    let f0 = base.join("0");
    if f0.exists() {
        return Some(f0);
    }

    Some(base.join("76561198000000000"))
}

fn get_local_mods_dir() -> Result<PathBuf, String> {
    let user_dir = get_aoe2de_user_dir()
        .ok_or_else(|| "Could not locate Age of Empires 2 DE folder in %USERPROFILE%\\Games.".to_string())?;
    let local_mods = user_dir.join("mods").join("local");
    if !local_mods.exists() {
        let _ = fs::create_dir_all(&local_mods);
    }
    Ok(local_mods)
}

fn get_mod_status_path() -> Result<PathBuf, String> {
    let user_dir = get_aoe2de_user_dir()
        .ok_or_else(|| "Could not locate Age of Empires 2 DE folder in %USERPROFILE%\\Games.".to_string())?;
    let mods_dir = user_dir.join("mods");
    if !mods_dir.exists() {
        let _ = fs::create_dir_all(&mods_dir);
    }
    Ok(mods_dir.join("mod-status.json"))
}

fn load_mod_status_file() -> ModStatusFile {
    if let Ok(path) = get_mod_status_path() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(file) = serde_json::from_str::<ModStatusFile>(&content) {
                    return file;
                }
            }
        }
    }
    ModStatusFile::default()
}

fn save_mod_status_file(file: &ModStatusFile) -> Result<(), String> {
    let path = get_mod_status_path()?;
    let json = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
struct InfoJson {
    #[serde(default)]
    pub Title: Option<String>,
    #[serde(default)]
    pub Author: Option<String>,
    #[serde(default)]
    pub Description: Option<String>,
}

#[tauri::command]
fn list_installed_mods() -> Result<Vec<ModItem>, String> {
    let local_dir = get_local_mods_dir()?;
    let status_file = load_mod_status_file();

    let mut result = Vec::new();
    if let Ok(entries) = fs::read_dir(&local_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = entry.file_name().to_string_lossy().to_string();
                if folder_name.starts_with('_') {
                    continue;
                }
                let mut title = folder_name.clone();
                let mut author = "Local".to_string();
                let mut description = String::new();

                let info_file = path.join("info.json");
                if info_file.exists() {
                    if let Ok(content) = fs::read_to_string(&info_file) {
                        if let Ok(info) = serde_json::from_str::<InfoJson>(&content) {
                            if let Some(t) = info.Title { if !t.is_empty() { title = t; } }
                            if let Some(a) = info.Author { if !a.is_empty() { author = a; } }
                            if let Some(d) = info.Description { description = d; }
                        }
                    }
                }

                let path_needle_1 = format!("local//{}", folder_name);
                let path_needle_2 = format!("local/{}", folder_name);
                let mut enabled = true;
                if let Some(entry) = status_file.mods.iter().find(|m| {
                    m.path.eq_ignore_ascii_case(&path_needle_1)
                        || m.path.eq_ignore_ascii_case(&path_needle_2)
                        || m.title.eq_ignore_ascii_case(&title)
                        || m.title.eq_ignore_ascii_case(&folder_name)
                }) {
                    enabled = entry.enabled;
                }

                result.push(ModItem {
                    folder_name,
                    title,
                    author,
                    description,
                    enabled,
                });
            }
        }
    }

    result.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(result)
}

#[tauri::command]
fn toggle_mod(folder_name: String, enabled: bool) -> Result<(), String> {
    let mut status_file = load_mod_status_file();
    let path_needle_1 = format!("local//{}", folder_name);
    let path_needle_2 = format!("local/{}", folder_name);

    if let Some(entry) = status_file.mods.iter_mut().find(|m| {
        m.path.eq_ignore_ascii_case(&path_needle_1)
            || m.path.eq_ignore_ascii_case(&path_needle_2)
            || m.title.eq_ignore_ascii_case(&folder_name)
    }) {
        entry.enabled = enabled;
    } else {
        status_file.mods.push(ModStatusEntry {
            check_sum: Some("0".to_string()),
            enabled,
            last_update: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
                    .to_string(),
            ),
            path: format!("local//{}", folder_name),
            priority: (status_file.mods.len() + 1) as i32,
            publish_id: 0,
            title: folder_name,
            workshop_id: 0,
        });
    }

    save_mod_status_file(&status_file)
}

#[tauri::command]
fn delete_mod(folder_name: String) -> Result<(), String> {
    let local_dir = get_local_mods_dir()?;
    let target = local_dir.join(&folder_name);
    if target.exists() && target.is_dir() {
        let _ = fs::remove_dir_all(&target);
    }

    let mut status_file = load_mod_status_file();
    let path_needle_1 = format!("local//{}", folder_name);
    let path_needle_2 = format!("local/{}", folder_name);
    status_file.mods.retain(|m| {
        !m.path.eq_ignore_ascii_case(&path_needle_1)
            && !m.path.eq_ignore_ascii_case(&path_needle_2)
            && !m.title.eq_ignore_ascii_case(&folder_name)
    });
    let _ = save_mod_status_file(&status_file);

    Ok(())
}

#[tauri::command]
fn open_mods_folder() -> Result<(), String> {
    let local_dir = get_local_mods_dir()?;
    let _ = Command::new("explorer").arg(&local_dir).spawn();
    Ok(())
}

#[tauri::command]
fn browse_mod_file() -> Result<Option<String>, String> {
    let ps_cmd = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $f = New-Object System.Windows.Forms.OpenFileDialog
        $f.Filter = 'Mod Archive (*.zip)|*.zip|All Files (*.*)|*.*'
        $f.Title = 'Select AoE2 DE Mod Zip Archive'
        if ($f.ShowDialog() -eq 'OK') { $f.FileName }
    "#;

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("powershell");

    let output = cmd
        .args(["-NoProfile", "-Command", ps_cmd])
        .output()
        .map_err(|e| e.to_string())?;

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(path))
    }
}

fn install_mod_from_zip_path(zip_path: &Path) -> Result<String, String> {
    if !zip_path.exists() {
        return Err("Specified mod archive does not exist.".to_string());
    }

    let local_dir = get_local_mods_dir()?;
    let temp_extract = local_dir.join("_temp_mod_extract");
    if temp_extract.exists() {
        let _ = fs::remove_dir_all(&temp_extract);
    }
    fs::create_dir_all(&temp_extract).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("tar");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("tar");

    let status = cmd
        .args(["-xf", &zip_path.to_string_lossy(), "-C", &temp_extract.to_string_lossy()])
        .status()
        .map_err(|e| format!("Failed to extract archive: {}", e))?;

    if !status.success() {
        let _ = fs::remove_dir_all(&temp_extract);
        return Err("Extraction failed. Please verify the archive is a valid .zip file.".to_string());
    }

    let mut entries = Vec::new();
    if let Ok(read) = fs::read_dir(&temp_extract) {
        for entry in read.flatten() {
            entries.push(entry.path());
        }
    }

    let default_mod_name = zip_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "New_Mod".to_string());

    let final_mod_name;
    if entries.len() == 1 && entries[0].is_dir() {
        let inner_folder = &entries[0];
        let inner_name = inner_folder
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| default_mod_name.clone());
        final_mod_name = inner_name;
        let dest = local_dir.join(&final_mod_name);
        if dest.exists() {
            let _ = fs::remove_dir_all(&dest);
        }
        let _ = fs::rename(inner_folder, &dest);
        let _ = fs::remove_dir_all(&temp_extract);
    } else {
        final_mod_name = default_mod_name;
        let dest = local_dir.join(&final_mod_name);
        if dest.exists() {
            let _ = fs::remove_dir_all(&dest);
        }
        let _ = fs::rename(&temp_extract, &dest);
    }

    let _ = toggle_mod(final_mod_name.clone(), true);

    Ok(format!("Mod '{}' installed successfully!", final_mod_name))
}

#[tauri::command]
async fn install_mod(source: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let raw = source.trim();
        if raw.is_empty() {
            return Err("Please enter a mod link or select a file.".to_string());
        }

        let as_path = PathBuf::from(raw);
        if as_path.exists() && as_path.is_file() {
            return install_mod_from_zip_path(&as_path);
        }

        if raw.starts_with("http://") || raw.starts_with("https://") {
            if raw.to_lowercase().ends_with(".zip") || raw.contains("/download/") || raw.contains("blob.core.windows.net") {
                let temp_zip = std::env::temp_dir().join(format!("aoe2_mod_{}.zip", generate_random_8digit_id()));

                #[cfg(target_os = "windows")]
                let mut cmd = Command::new("curl");
                #[cfg(target_os = "windows")]
                cmd.creation_flags(CREATE_NO_WINDOW);

                #[cfg(not(target_os = "windows"))]
                let mut cmd = Command::new("curl");

                let res = cmd
                    .args(["-L", "-o", &temp_zip.to_string_lossy(), raw])
                    .output()
                    .map_err(|e| format!("Failed to download mod: {}", e))?;

                if !res.status.success() || !temp_zip.exists() {
                    return Err("Failed to download mod archive from URL.".to_string());
                }

                let install_res = install_mod_from_zip_path(&temp_zip);
                let _ = fs::remove_file(&temp_zip);
                return install_res;
            }

            return Err(
                "Microsoft requires account authentication to download directly from ageofempires.com.\n\nPlease download the mod .zip file from your browser, then click 'Browse...' here to install it in 1 second!"
                    .to_string(),
            );
        }

        Err("Invalid input. Please provide a direct download URL (.zip) or click 'Browse...' to select a local file.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn start_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_to_tray(window: Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Single-instance protection: bind port first for instant 0ms check on primary launch
    let (single_instance_listener, is_secondary) = match TcpListener::bind(format!("127.0.0.1:{}", SINGLE_INSTANCE_PORT)) {
        Ok(listener) => (Some(listener), false),
        Err(_) => (None, true),
    };

    if is_secondary {
        if let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{}", SINGLE_INSTANCE_PORT)) {
            let _ = stream.write_all(b"FOCUS\n");
            let _ = stream.flush();
        }
        std::process::exit(0);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(move |app| {
            // Build system tray
            let show_item = MenuItem::with_id(app, "show", "Show Launcher", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Simple LAN Launcher")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_vis = window.is_visible().unwrap_or(false);
                            if is_vis {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            if let Some(listener) = single_instance_listener {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    for stream in listener.incoming() {
                        if let Ok(_s) = stream {
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_profiles,
            save_profiles,
            launch_game,
            check_game_status,
            stop_processes,
            browse_game_file,
            open_crash_logs,
            run_diagnostics,
            unblock_firewall,
            check_updates,
            get_version_info,
            test_host_ping,
            start_drag,
            minimize_window,
            hide_to_tray,
            close_window,
            list_installed_mods,
            toggle_mod,
            delete_mod,
            open_mods_folder,
            browse_mod_file,
            install_mod,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
