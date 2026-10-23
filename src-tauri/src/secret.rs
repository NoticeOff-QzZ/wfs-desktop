use serde::Serialize;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    pub configured: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn secret_status() -> SecretStatus {
    match entry() {
        Ok(entry) => match entry.get_password() {
            Ok(key) => SecretStatus {
                configured: !key.trim().is_empty(),
                error: None,
            },
            Err(keyring::Error::NoEntry) => SecretStatus {
                configured: false,
                error: None,
            },
            Err(error) => SecretStatus {
                configured: false,
                error: Some(format!("读取凭据失败：{error}")),
            },
        },
        Err(error) => SecretStatus {
            configured: false,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn secret_set(key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API Key 不能为空".into());
    }
    entry()?
        .set_password(trimmed)
        .map_err(|e| format!("保存 API Key 失败：{e}"))?;
    tracing::info!("credential configured");
    Ok(())
}

#[tauri::command]
pub fn secret_clear() -> Result<(), String> {
    let entry = entry()?;
    match entry.delete_credential() {
        Ok(()) => {
            tracing::info!("credential cleared");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("清除 API Key 失败：{error}")),
    }
}
