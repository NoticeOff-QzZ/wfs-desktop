mod logging;
mod market;
mod secret;
mod settings;
mod vision;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = settings::resolve_data_dir();
    let _log_guard = logging::init(&data_dir);
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        data_dir = %data_dir.display(),
        "wfs-desktop starting"
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            settings::settings_load,
            settings::settings_save,
            settings::data_read,
            settings::data_write,
            settings::data_clear,
            settings::data_dir,
            secret::secret_status,
            secret::secret_set,
            secret::secret_clear,
            vision::vision_read,
            vision::provider_test,
            market::market_get,
            logging::diagnostics_log,
            logging::diagnostics_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
