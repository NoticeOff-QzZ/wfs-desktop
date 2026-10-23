use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

use crate::secret;
use crate::settings::read_settings;

const SYSTEM_PROMPT: &str = r#"你是 Warframe 截图识别器。用户会给你一张游戏截图，你只输出 JSON，不要任何解释、不要 markdown 代码块。

输出结构：
{"family":"normal","items":[{"name":"物品名","count":1,"confidence":"high"}],
 "rivens":[{"weapon":"武器名","rivenName":"裂罅名","positiveTexts":["词条中文名"],"confidence":"high"}],
 "notes":""}

规则：
1. items 填普通物品 / MOD / 赋能 / 资源 / 蓝图 / 部件等，name 优先用中文名，只有英文时用英文；count 是角标数量，看不清就填 1。
2. 截图可能是 MOD 网格或背包卡面：必须把每张卡都列进 items，不能因为"只看到图标"就返回空数组。
3. 安魂 MOD 是红色的菱形浮雕卡，名字只可能是 Fass / Lohk / Ris / Jahu / Netra / Vome / Khra / Xata。
   看到这类卡时，按从左到右、从上到下的顺序逐张判断并放进 items。即使拿不准也要选最接近的一个，confidence 填 low。
4. 效价 / 1999 帕拉松 MOD 的卡面通常只有电脑主题图案、没有可读文字：不要猜名字，items 留空，
   family 填 "parazon"，notes 写"可能是帕拉松卡"。
5. 其它只有图案、没有文字的卡面同样不要猜，也不要用 Forma 或别的物品顶替。
6. rivens 只填裂罅（Riven）MOD，名字形如 Lexi-ampitox。weapon 填同一行显示的武器名；positiveTexts 填卡面上看到的正面词条中文名。
7. confidence 只能是 high / medium / low。
8. family 只能是："requiem"（安魂卡）、"parazon"（效价或其它帕拉松）、"riven"（裂罅）、"normal"（普通物品）、""（无法判断）。
9. 没有对应内容就留空数组；不要编造，不要补充截图里没有的信息。
10. notes 写一句识别上的不确定之处，没有就留空。"#;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisionItem {
    pub name: String,
    pub count: u32,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisionRiven {
    pub weapon: String,
    pub riven_name: String,
    pub positive_texts: Vec<String>,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisionResult {
    /// 截图的大类：requiem / parazon / riven / normal，无法判断时为空。
    #[serde(default)]
    pub family: String,
    pub items: Vec<VisionItem>,
    pub rivens: Vec<VisionRiven>,
    pub notes: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub ok: bool,
    pub latency_ms: u128,
    pub sample: String,
}

fn chat_url(base: &str) -> String {
    format!("{}/chat/completions", base.trim_end_matches('/'))
}

fn client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds.clamp(10, 600)))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))
}

fn error_for_status(status: reqwest::StatusCode, body: &str) -> String {
    let snippet: String = body.chars().take(240).collect();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return format!("API Key 无效或无权限（HTTP {}）", status.as_u16());
    }
    if status.as_u16() == 429 {
        return "服务商限流（HTTP 429），请稍后再试".to_string();
    }
    format!("HTTP {}：{}", status.as_u16(), snippet)
}

fn content_string(value: &Value) -> String {
    let content = &value["choices"][0]["message"]["content"];
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    if let Some(parts) = content.as_array() {
        return parts
            .iter()
            .filter_map(|part| part["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
    }
    String::new()
}

/// 发送请求；如果服务商不认 thinking / response_format，就去掉它们再试一次。
async fn post_chat(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    mut body: Value,
) -> Result<String, String> {
    let mut retry_used = false;
    let mut fallback_used = false;

    loop {
        let response = match client.post(url).bearer_auth(key).json(&body).send().await {
            Ok(response) => response,
            Err(error) => {
                if !retry_used && (error.is_timeout() || error.is_connect()) {
                    retry_used = true;
                    tokio::time::sleep(Duration::from_millis(800)).await;
                    continue;
                }
                return Err(if error.is_timeout() {
                    "模型请求超时，检查网络或在设置里调大超时时间。".to_string()
                } else {
                    format!("请求模型失败：{error}")
                });
            }
        };

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if status.is_success() {
            let parsed: Value =
                serde_json::from_str(&text).map_err(|e| format!("模型响应不是 JSON：{e}"))?;
            let content = content_string(&parsed);
            if content.trim().is_empty() {
                return Err("模型没有返回内容（可能是 token 预算被推理占满）".to_string());
            }
            return Ok(content);
        }

        if status.is_server_error() && !retry_used {
            retry_used = true;
            tokio::time::sleep(Duration::from_millis(800)).await;
            continue;
        }

        // 有些 OpenAI 兼容服务不支持 thinking / response_format，400 时降级重试。
        if status == reqwest::StatusCode::BAD_REQUEST && !fallback_used {
            fallback_used = true;
            if let Some(object) = body.as_object_mut() {
                object.remove("thinking");
                object.remove("response_format");
            }
            continue;
        }

        return Err(error_for_status(status, &text));
    }
}

/// 把被截断的 JSON 括号补完。
fn closers(prefix: &str) -> String {
    let mut stack: Vec<char> = Vec::new();
    let mut in_string = false;
    let mut escaped = false;

    for character in prefix.chars() {
        if in_string {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        match character {
            '"' => in_string = true,
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                stack.pop();
            }
            _ => {}
        }
    }

    stack.into_iter().rev().collect()
}

fn extract_json(text: &str) -> Option<Value> {
    let cleaned = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(value) = serde_json::from_str::<Value>(cleaned) {
        return Some(value);
    }

    let start = cleaned.find('{')?;
    let body = &cleaned[start..];
    let cuts: Vec<usize> = body
        .match_indices('}')
        .map(|(index, _)| index + 1)
        .collect();

    for cut in cuts.into_iter().rev() {
        let prefix = &body[..cut];
        let repaired = format!("{prefix}{}", closers(prefix));
        if let Ok(value) = serde_json::from_str::<Value>(&repaired) {
            return Some(value);
        }
    }

    let repaired = format!("{body}{}", closers(body));
    serde_json::from_str::<Value>(&repaired).ok()
}

fn confidence(value: &Value) -> String {
    match value.as_str() {
        Some("high") => "high".into(),
        Some("medium") => "medium".into(),
        _ => "low".into(),
    }
}

fn sanitize(value: &Value, raw: &str) -> VisionResult {
    let mut result = VisionResult {
        family: match value["family"].as_str() {
            Some("requiem") => "requiem".to_string(),
            Some("parazon") => "parazon".to_string(),
            Some("riven") => "riven".to_string(),
            Some("normal") => "normal".to_string(),
            _ => String::new(),
        },
        raw: raw.to_string(),
        ..Default::default()
    };

    if let Some(items) = value["items"].as_array() {
        for item in items {
            let name = item["name"].as_str().unwrap_or("").trim();
            if name.is_empty() {
                continue;
            }
            let count = item["count"].as_u64().unwrap_or(1).max(1) as u32;
            result.items.push(VisionItem {
                name: name.to_string(),
                count,
                confidence: confidence(&item["confidence"]),
            });
        }
    }

    if let Some(rivens) = value["rivens"].as_array() {
        for riven in rivens {
            let weapon = riven["weapon"].as_str().unwrap_or("").trim().to_string();
            let riven_name = riven["rivenName"].as_str().unwrap_or("").trim().to_string();
            if weapon.is_empty() && riven_name.is_empty() {
                continue;
            }
            let positive_texts = riven["positiveTexts"]
                .as_array()
                .map(|list| {
                    list.iter()
                        .filter_map(|entry| entry.as_str())
                        .map(|entry| entry.trim().to_string())
                        .filter(|entry| !entry.is_empty())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            result.rivens.push(VisionRiven {
                weapon,
                riven_name,
                positive_texts,
                confidence: confidence(&riven["confidence"]),
            });
        }
    }

    result.notes = value["notes"].as_str().unwrap_or("").trim().to_string();
    result
}

#[tauri::command]
pub async fn vision_read(
    image_base64: String,
    mime: String,
    hint: String,
) -> Result<VisionResult, String> {
    let settings = read_settings();
    let key = secret::get_key()?;
    if image_base64.trim().is_empty() {
        return Err("没有收到图片数据".into());
    }

    let mime = if mime.trim().is_empty() {
        "image/png".to_string()
    } else {
        mime
    };
    let data_url = format!("data:{mime};base64,{image_base64}");
    let prompt = if hint.trim().is_empty() {
        "请按要求识别这张截图，只输出 JSON。".to_string()
    } else {
        format!(
            "用户附言：{}。请按要求识别这张截图，只输出 JSON。",
            hint.trim()
        )
    };

    let body = json!({
        "model": settings.model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]}
        ],
        "max_tokens": 4000,
        "stream": false,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"}
    });

    let http = client(settings.timeout_seconds)?;
    let content = post_chat(&http, &chat_url(&settings.base_url), &key, body).await?;
    let parsed = extract_json(&content).ok_or_else(|| {
        format!(
            "模型返回的内容不是有效 JSON：{}",
            content.chars().take(200).collect::<String>()
        )
    })?;

    let result = sanitize(&parsed, &content);
    tracing::info!(
        items = result.items.len(),
        rivens = result.rivens.len(),
        "vision_read completed"
    );
    Ok(result)
}

#[tauri::command]
pub async fn provider_test() -> Result<ProviderTestResult, String> {
    let settings = read_settings();
    let key = secret::get_key()?;
    let http = client(settings.timeout_seconds.min(60))?;
    let body = json!({
        "model": settings.model,
        "messages": [{"role": "user", "content": "只回复两个字：可用"}],
        "max_tokens": 64,
        "stream": false,
        "thinking": {"type": "disabled"}
    });

    let started = Instant::now();
    let content = post_chat(&http, &chat_url(&settings.base_url), &key, body).await?;
    Ok(ProviderTestResult {
        ok: true,
        latency_ms: started.elapsed().as_millis(),
        sample: content.chars().take(80).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repairs_truncated_json() {
        let value = extract_json(r#"{"items":[{"name":"灼热光束","count":1},{"name":"弹"#).unwrap();
        assert_eq!(value["items"][0]["name"], "灼热光束");
    }

    #[test]
    fn strips_code_fence() {
        let value = extract_json("```json\n{\"items\":[],\"rivens\":[]}\n```").unwrap();
        assert_eq!(value["items"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn sanitizes_items() {
        let value: Value = serde_json::from_str(
            r#"{"items":[{"name":"分裂膛室","count":2}],"rivens":[],"notes":"ok"}"#,
        )
        .unwrap();
        let result = sanitize(&value, "raw");
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].count, 2);
        assert_eq!(result.notes, "ok");
    }

    // 真实调用：设置 WFS_LIVE_KEY 环境变量后才会执行，否则直接跳过。
    // 会把 key 写进 Windows 凭据管理器，跑完清除。
    #[tokio::test]
    #[ignore = "需要 WFS_LIVE_KEY，且会真实调用模型 API"]
    async fn live_vision_reads_test_image() {
        use base64::Engine;

        let Ok(key) = std::env::var("WFS_LIVE_KEY") else {
            return;
        };
        if key.trim().is_empty() {
            return;
        }

        crate::secret::secret_set(key).expect("应当能写入凭据");
        let image = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../testdata/test1.png"
        ))
        .expect("测试图片应当存在");
        let encoded = base64::engine::general_purpose::STANDARD.encode(image);

        let result = super::vision_read(encoded, "image/png".to_string(), String::new())
            .await
            .expect("视觉调用应当成功");

        crate::secret::secret_clear().ok();
        assert!(!result.items.is_empty(), "应当识别出物品：{}", result.raw);
    }

    // 真机回归：安魂 3x3 网格必须逐张列出，不能返回空。
    #[tokio::test]
    #[ignore = "需要 WFS_LIVE_KEY，且会真实调用模型 API"]
    async fn live_recognises_requiem_grid() {
        use base64::Engine;

        let Ok(key) = std::env::var("WFS_LIVE_KEY") else {
            return;
        };
        if key.trim().is_empty() {
            return;
        }

        crate::secret::secret_set(key).expect("应当能写入凭据");
        let image = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../testdata/requiem.png"
        ))
        .expect("安魂测试图应当存在");
        let encoded = base64::engine::general_purpose::STANDARD.encode(image);

        let result = super::vision_read(encoded, "image/png".to_string(), String::new())
            .await
            .expect("视觉调用应当成功");

        crate::secret::secret_clear().ok();
        assert!(
            result.items.len() >= 8,
            "应当至少认出 8 张安魂卡，实际 {}：{}",
            result.items.len(),
            result.raw
        );
    }
}
