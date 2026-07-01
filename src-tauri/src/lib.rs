use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const DEFAULT_LIBRARY: &str = include_str!("../../data/library.yaml");

#[derive(Serialize)]
struct LibraryPayload {
    yaml: String,
    path: String,
}

fn library_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("library.yaml"))
}

#[tauri::command]
fn load_library_yaml(app: tauri::AppHandle) -> Result<LibraryPayload, String> {
    let path = library_path(&app)?;
    if !path.exists() {
        fs::write(&path, DEFAULT_LIBRARY).map_err(|error| error.to_string())?;
    }

    let yaml = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(LibraryPayload {
        yaml,
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn save_library_yaml(app: tauri::AppHandle, yaml: String) -> Result<LibraryPayload, String> {
    let path = library_path(&app)?;
    fs::write(&path, yaml).map_err(|error| error.to_string())?;
    Ok(LibraryPayload {
        yaml: fs::read_to_string(&path).map_err(|error| error.to_string())?,
        path: path.display().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_library_yaml,
            save_library_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running Akira Library");
}
