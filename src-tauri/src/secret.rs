const SERVICE: &str = "wfs-desktop";
const ACCOUNT: &str = "vision-api-key";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("访问凭据管理器失败：{e}"))
}

pub fn get_key() -> Result<String, String> {
    entry()?
        .get_password()
        .map_err(|_| "还没有配置 API Key，请先在设置里填写。".to_string())
}

#[tauri::command]
pub fn secret_status() -> bool {
    entry()
        .and_then(|e| e.get_password().map_err(|err| err.to_string()))
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
pub fn secret_set(key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API Key 不能为空".into());
    }
    entry()?
        .set_password(trimmed)
        .map_err(|e| format!("保存 API Key 失败：{e}"))
}

#[tauri::command]
pub fn secret_clear() -> Result<(), String> {
    let entry = entry()?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("清除 API Key 失败：{error}")),
    }
}
