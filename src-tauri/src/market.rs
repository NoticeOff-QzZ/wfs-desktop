use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::settings::read_settings;

const BASE: &str = "https://api.warframe.market";
const MIN_INTERVAL: Duration = Duration::from_millis(350);

static MARKET_GATE: Mutex<Option<Instant>> = Mutex::new(None);

/// warframe.market 的公开限流是 3 次/秒。所有请求（含重试）都先经过这个
/// 全局时间闸门，避免前端多路并发时触发 429。
async fn wait_for_market_slot() {
    loop {
        let wait = {
            let mut last = MARKET_GATE.lock().unwrap_or_else(|error| error.into_inner());
            let now = Instant::now();
            match *last {
                Some(previous) => {
                    let elapsed = now.saturating_duration_since(previous);
                    if elapsed >= MIN_INTERVAL {
                        *last = Some(now);
                        None
                    } else {
                        Some(MIN_INTERVAL - elapsed)
                    }
                }
                None => {
                    *last = Some(now);
                    None
                }
            }
        };

        match wait {
            Some(delay) => tokio::time::sleep(delay).await,
            None => return,
        }
    }
}

#[tauri::command]
pub async fn market_get(path: String) -> Result<Value, String> {
    if !(path.starts_with("/v1/") || path.starts_with("/v2/")) || path.contains("..") {
        return Err(format!("非法接口路径：{path}"));
    }

    let settings = read_settings();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))?;
    let url = format!("{BASE}{path}");

    let mut delay = 1000u64;
    for attempt in 0..4 {
        wait_for_market_slot().await;
        let response = client
            .get(&url)
            .header("Accept", "application/json")
            .header("Language", "zh-hans")
            .header("User-Agent", &settings.user_agent)
            .send()
            .await
            .map_err(|e| format!("请求 warframe.market 失败：{e}"))?;

        let status = response.status();
        if status.is_success() {
            return response
                .json::<Value>()
                .await
                .map_err(|e| format!("解析 warframe.market 响应失败：{e}"));
        }

        let retryable = status.as_u16() == 429 || status.as_u16() == 509 || status.is_server_error();
        if retryable && attempt < 3 {
            tokio::time::sleep(Duration::from_millis(delay)).await;
            delay *= 2;
            continue;
        }

        let text = response.text().await.unwrap_or_default();
        let snippet: String = text.chars().take(200).collect();
        return Err(format!("HTTP {}：{}", status.as_u16(), snippet));
    }

    Err("请求 warframe.market 失败：重试次数已用尽".to_string())
}

#[cfg(test)]
mod tests {
    // 真实网络检查：确认代理命令能拿到 warframe.market 的版本信息。
    // 断网时会失败，属于预期。
    #[tokio::test]
    async fn fetches_versions() {
        let value = super::market_get("/v2/versions".to_string())
            .await
            .expect("market_get 应当成功");
        assert!(value["data"]["collections"].is_object());
    }

    #[tokio::test]
    async fn rejects_bad_paths() {
        assert!(super::market_get("/etc/passwd".to_string()).await.is_err());
        assert!(super::market_get("/v2/../secret".to_string()).await.is_err());
    }
}
