use crate::commands::notes::merge_imported;
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::AppState;
use crate::store;
use serde::Deserialize;
use std::io::Read;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
    Markdown,
}

/// Export through a native save dialog. The webview never sees or chooses a
/// raw path, so it can't be tricked into writing arbitrary files.
#[tauri::command]
pub async fn export_notes(
    format: ExportFormat,
    ids: Option<Vec<String>>,
    app: AppHandle,
) -> AppResult<bool> {
    let notes: Vec<Note> = {
        let state = app.state::<AppState>();
        let g = state.inner.lock();
        match &ids {
            Some(ids) if !ids.is_empty() => g.notes.iter().filter(|n| ids.contains(&n.id)).cloned().collect(),
            _ => g.notes.clone(),
        }
    };
    let (ext, name, bytes) = match format {
        ExportFormat::Json => ("json", "peekin-notes.json", store::serialize_notes(&notes)?),
        ExportFormat::Markdown => ("md", "peekin-notes.md", store::to_markdown(&notes).into_bytes()),
    };
    let path = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter(if ext == "json" { "Peekin notes" } else { "Markdown" }, &[ext])
        .blocking_save_file();
    let Some(path) = path.and_then(|p| p.into_path().ok()) else {
        return Ok(false);
    };
    store::atomic_write(&path, &bytes)?;
    Ok(true)
}

/// Import a Peekin JSON export (or a bare array of notes) chosen through a
/// native open dialog. Size-capped and fully sanitised.
#[tauri::command]
pub async fn import_notes(app: AppHandle) -> AppResult<usize> {
    let path = app
        .dialog()
        .file()
        .add_filter("Notes", &["json", "txt", "md"])
        .blocking_pick_file();
    let Some(path) = path.and_then(|p| p.into_path().ok()) else {
        return Ok(0);
    };
    let meta = std::fs::metadata(&path)?;
    if meta.len() > store::MAX_IMPORT_BYTES {
        return Err(AppError::Invalid("That file is too large to import".into()));
    }
    let mut raw = Vec::with_capacity(meta.len() as usize);
    std::fs::File::open(&path)?.take(store::MAX_IMPORT_BYTES).read_to_end(&mut raw)?;

    let is_json = path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("json"));
    let notes = if is_json {
        store::parse_notes(&raw)?
    } else {
        // plain text: one note, first line becomes the title
        let text = String::from_utf8_lossy(&raw);
        let mut lines = text.lines();
        let title = lines.next().unwrap_or("").trim_start_matches('#').trim().to_string();
        let rest: Vec<&str> = lines.collect();
        let now = now_ms();
        vec![Note {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            body: crate::sanitize::text_to_html(rest.join("\n").trim()),
            text: String::new(),
            color: 0,
            font: Default::default(),
            status: Status::Active,
            on_deck: true,
            order: 0,
            created: now,
            updated: now,
            bounds: None,
        }]
    };
    if notes.is_empty() {
        return Err(AppError::Invalid("No notes found in that file".into()));
    }
    Ok(merge_imported(&app, notes))
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle, state: State<AppState>) -> AppResult<()> {
    let dir = state.inner.lock().paths.dir.clone();
    std::fs::create_dir_all(&dir)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Open a link from a note in the default browser. Only web and mail links
/// are allowed; everything else (file:, javascript:, custom protocols) is
/// refused.
#[tauri::command]
pub fn open_link(url: String, app: AppHandle) -> AppResult<()> {
    let parsed = url::Url::parse(&url).map_err(|_| AppError::Invalid("Not a valid link".into()))?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err(AppError::Invalid("Only web and email links can be opened".into()));
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}
