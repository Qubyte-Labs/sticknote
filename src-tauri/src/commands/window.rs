use crate::commands::notes::validate_id;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::windows::{deck, manager, note};
use tauri::{AppHandle, Manager, WebviewWindow};

// Window creation must happen in async commands on Windows (a sync command
// runs on the main thread and would deadlock the webview builder).

#[tauri::command]
pub async fn open_note_window(id: String, anchor_y: Option<f64>, app: AppHandle) -> AppResult<()> {
    validate_id(&id)?;
    let exists = app.state::<AppState>().inner.lock().notes.iter().any(|n| n.id == id);
    if !exists {
        return Err(AppError::NotFound);
    }
    note::open(&app, &id, anchor_y.filter(|a| a.is_finite()))?;
    Ok(())
}

#[tauri::command]
pub async fn open_manager(view: Option<String>, app: AppHandle) -> AppResult<()> {
    manager::open(&app, view.as_deref())?;
    Ok(())
}

#[tauri::command]
pub fn take_initial_view(window: WebviewWindow) -> Option<String> {
    (window.label() == manager::LABEL).then(manager::take_initial_view).flatten()
}

#[tauri::command]
pub fn deck_resize(width: f64, height: f64, app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    if window.label() != deck::LABEL || !width.is_finite() || !height.is_finite() {
        return Err(AppError::Invalid("Not allowed".into()));
    }
    deck::resize(&app, width, height);
    Ok(())
}

/// Close the calling window. Every window is destroyed, not hidden.
#[tauri::command]
pub fn close_self(window: WebviewWindow) {
    let _ = window.destroy();
}

/// Which note the calling note window shows (None for a waiting spare).
#[tauri::command]
pub fn note_id(window: WebviewWindow) -> Option<String> {
    note::id_for(window.label())
}

/// A note window finished painting its note: reveal it.
#[tauri::command]
pub fn note_ready(window: WebviewWindow) {
    if note::id_for(window.label()).is_some() && !window.is_visible().unwrap_or(false) {
        note::reveal(&window);
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::quit(&app);
}
