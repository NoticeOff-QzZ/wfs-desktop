use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub provider_preset: String,
    pub base_url: String,
    pub model: String,
    pub timeout_seconds: u64,
    pub mod_rank: u32,
    pub arcane_rank: Option<u32>,
    pub user_agent: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            provider_preset: "deepseek".into(),
            base_url: "https://api.deepseek.com".into(),
            model: "deepseek-flash".into(),
            timeout_seconds: 120,
            mod_rank: 0,
            arcane_rank: None,
            user_agent: "wfs-desktop/0.1.0 (+contact: app owner)".into(),
        }
    }
}

/// 便携优先：exe 同级的 data 目录可写就用它，否则退回 %APPDATA%。
pub fn resolve_data_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let portable = dir.join("data");
            if fs::create_dir_all(&portable).is_ok() {
                let probe = portable.join(".write-test");
                if fs::write(&probe, b"ok").is_ok() {
                    let _ = fs::remove_file(&probe);
                    return portable;
                }
            }
        }
    }

    let fallback = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("wfs-desktop");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

pub fn read_settings() -> Settings {
    let file = resolve_data_dir().join(SETTINGS_FILE);
    fs::read_to_string(file)
        .ok()
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
        .unwrap_or_default()
}

fn safe_name(name: &str) -> Result<String, String> {
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        || name.contains("..")
    {
        return Err(format!("非法文件名：{name}"));
    }
    Ok(name.to_string())
}

#[tauri::command]
pub fn settings_load() -> Result<Settings, String> {
    Ok(read_settings())
}

#[tauri::command]
pub fn settings_save(settings: Settings) -> Result<(), String> {
    let dir = resolve_data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(dir.join(SETTINGS_FILE), raw).map_err(|e| format!("写入设置失败：{e}"))
}

#[tauri::command]
pub fn data_read(name: String) -> Result<Option<String>, String> {
    let file = resolve_data_dir().join(safe_name(&name)?);
    match fs::read_to_string(file) {
        Ok(raw) => Ok(Some(raw)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取缓存失败：{error}")),
    }
}

#[tauri::command]
pub fn data_write(name: String, content: String) -> Result<(), String> {
    let dir = resolve_data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    fs::write(dir.join(safe_name(&name)?), content).map_err(|e| format!("写入缓存失败：{e}"))
}

#[tauri::command]
pub fn data_clear(name: String) -> Result<(), String> {
    let file = resolve_data_dir().join(safe_name(&name)?);
    match fs::remove_file(file) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除缓存失败：{error}")),
    }
}

#[tauri::command]
pub fn data_dir() -> Result<String, String> {
    Ok(resolve_data_dir().to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let parsed: Settings = serde_json::from_str(r#"{"model":"custom-model"}"#).unwrap();
        let defaults = Settings::default();

        assert_eq!(parsed.model, "custom-model");
        assert_eq!(parsed.base_url, defaults.base_url);
        assert_eq!(parsed.timeout_seconds, defaults.timeout_seconds);
        assert_eq!(parsed.user_agent, defaults.user_agent);
    }
}
