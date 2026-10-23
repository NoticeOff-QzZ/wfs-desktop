use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::settings::{read_settings, resolve_data_dir};

const MAX_LOG_FILES: usize = 7;
const MAX_DETAIL_CHARS: usize = 2000;

pub fn init(data_dir: &Path) -> WorkerGuard {
    let log_dir = data_dir.join("logs");
    let _ = fs::create_dir_all(&log_dir);

    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("wfs-desktop")
        .filename_suffix("log")
        .max_log_files(MAX_LOG_FILES)
        .build(&log_dir)
        .unwrap_or_else(|_| RollingFileAppender::new(Rotation::DAILY, &log_dir, "wfs-desktop.log"));

    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
    // 只认应用自己的 WFS_LOG，避免外部 RUST_LOG（例如 warn）静默关闭诊断日志。
    let filter = EnvFilter::try_from_env("WFS_LOG").unwrap_or_else(|_| {
        EnvFilter::new(if cfg!(debug_assertions) {
            "wfs_desktop_lib=debug,info"
        } else {
            "info"
        })
    });

    let file_layer = fmt::layer()
        .with_writer(file_writer)
        .with_ansi(false)
        .with_target(true);
    let stdout_layer = fmt::layer().with_writer(std::io::stdout);

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stdout_layer)
        .try_init();

    guard
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn tail_lines(text: &str, limit: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(limit);
    lines[start..].join("\n")
}

fn latest_log_file(log_dir: &Path) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(log_dir)
        .ok()?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("wfs-desktop") && name.ends_with(".log"))
        })
        .collect();
    files.sort();
    files.pop()
}

fn read_log_tail(log_dir: &Path, limit: usize) -> String {
    let Some(file) = latest_log_file(log_dir) else {
        return "（暂无日志）".to_string();
    };
    match fs::read_to_string(file) {
        Ok(text) => tail_lines(&text, limit),
        Err(error) => format!("（读取日志失败：{error}）"),
    }
}

#[tauri::command]
pub fn diagnostics_log(level: String, event: String, detail: String) {
    let event = truncate(&event, 120);
    let detail = truncate(&detail, MAX_DETAIL_CHARS);
    match level.as_str() {
        "error" => tracing::error!(event = %event, detail = %detail, "frontend"),
        "warn" => tracing::warn!(event = %event, detail = %detail, "frontend"),
        _ => tracing::info!(event = %event, detail = %detail, "frontend"),
    }
}

#[tauri::command]
pub fn diagnostics_export() -> Result<String, String> {
    let data_dir = resolve_data_dir();
    let timestamp = now_unix();
    let settings = serde_json::to_string_pretty(&read_settings()).unwrap_or_else(|_| "{}".into());
    let log_tail = read_log_tail(&data_dir.join("logs"), 200);
    let content = format!(
        "wfs-desktop diagnostics\nversion: {}\nos: {} {}\ntime_unix: {}\ndata_dir: {}\n\n[settings]\n{}\n\n[logs]\n{}\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        timestamp,
        data_dir.display(),
        settings,
        log_tail,
    );

    let path = data_dir.join(format!("diagnostics-{timestamp}.txt"));
    fs::write(&path, content).map_err(|error| format!("写入诊断文件失败：{error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_by_characters() {
        assert_eq!(truncate("abcde", 3), "abc");
        assert_eq!(truncate("中文测试", 2), "中文");
    }

    #[test]
    fn keeps_only_the_last_lines() {
        assert_eq!(tail_lines("a\nb\nc", 2), "b\nc");
        assert_eq!(tail_lines("a\nb", 10), "a\nb");
        assert_eq!(tail_lines("", 2), "");
    }
}
