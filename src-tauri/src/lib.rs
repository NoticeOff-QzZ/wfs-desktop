mod market;
mod secret;
mod settings;
mod vision;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
