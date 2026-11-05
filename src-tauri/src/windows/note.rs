//! One floating window per note. Label = `note-<uuid>`, so the webview knows
//! which note it shows without any URL parameters.

use super::primary_work_area;
use crate::models::Bounds;
use crate::platform;
use crate::state::{events, AppState};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const PREFIX: &str = "note-";
const DEFAULT_W: f64 = 506.0; // 490px paper + 8px transparent margin each side
const DEFAULT_H: f64 = 456.0;
const CASCADE: f64 = 28.0; // offset for each additional open note

pub fn label(id: &str) -> String {
    format!("{PREFIX}{id}")
}

pub fn open_ids(app: &AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter_map(|l| l.strip_prefix(PREFIX).map(str::to_string))
        .collect()
}

fn broadcast(app: &AppHandle) {
    let _ = app.emit(events::NOTE_WINDOWS, open_ids(app));
}

/// Where a note window opens: centred on the primary screen's work area,
/// keeping the size the user last gave this note. Each additional open note
/// is offset a little (cascade) so they never stack exactly on top of each
/// other. Physical pixels.
fn centered_rect(app: &AppHandle, saved: Option<Bounds>) -> (i32, i32, u32, u32) {
    let wa = primary_work_area(app);
    let s = wa.scale;
    let (pw, ph) = match saved {
        Some(b) => (b.w, b.h),
        None => ((DEFAULT_W * s) as u32, (DEFAULT_H * s) as u32),
    };
    let pw = pw.min(wa.w);
    let ph = ph.min(wa.h);
    let step = (CASCADE * s) as i32 * (open_ids(app).len() as i32 % 6);
    let x = wa.x + (wa.w as i32 - pw as i32) / 2 + step;
    let y = wa.y + (wa.h as i32 - ph as i32) / 2 + step;
    let x = x.clamp(wa.x, wa.x + wa.w as i32 - pw as i32);
    let y = y.clamp(wa.y, wa.y + wa.h as i32 - ph as i32);
    (x, y, pw, ph)
}

/// Open (or focus) the window for `id`, centred on screen.
pub fn open(app: &AppHandle, id: &str, _anchor_y: Option<f64>) -> tauri::Result<()> {
    let label = label(id);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        platform::make_tool_window(&w, false);
        let _ = w.show();
        platform::make_tool_window(&w, false);
        let _ = w.set_focus();
        return Ok(());
    }

    let saved = {
        let state = app.state::<AppState>();
        let g = state.inner.lock();
        g.notes.iter().find(|n| n.id == id).and_then(|n| n.bounds)
    };
    let rect = centered_rect(app, saved);

    let w = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("note.html".into()))
        .title("Peekin note")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        // No edge resizing: notes resize only from the corner grip (note/main.ts).
        .resizable(false)
        .maximizable(false)
        .min_inner_size(340.0, 260.0)
        .visible(false)
        .build()?;
    let _ = w.set_position(PhysicalPosition::new(rect.0, rect.1));
    let _ = w.set_size(PhysicalSize::new(rect.2, rect.3));
    platform::make_tool_window(&w, false);
    broadcast(app);

    // The page calls `note_ready` after its first paint, so the window never
    // appears empty. Safety net: show it anyway if that hasn't happened soon.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        if let Some(w) = handle.get_webview_window(&label) {
            if !w.is_visible().unwrap_or(true) {
                reveal(&w);
            }
        }
    });
    Ok(())
}

/// Show a note window, keep it out of the taskbar/Alt+Tab, and focus it.
pub fn reveal(w: &tauri::WebviewWindow) {
    platform::make_tool_window(w, false);
    let _ = w.show();
    // tao re-applies its own styles on show, so make it a tool window after too.
    platform::make_tool_window(w, false);
    let _ = w.set_focus();
}

/// Remember geometry, then destroy the window (freeing its webview).
pub fn close(app: &AppHandle, id: &str) {
    let Some(w) = app.get_webview_window(&label(id)) else { return };
    if let (Ok(p), Ok(sz)) = (w.outer_position(), w.outer_size()) {
        let state = app.state::<AppState>();
        let mut g = state.inner.lock();
        if let Some(n) = g.notes.iter_mut().find(|n| n.id == id) {
            n.bounds = Some(Bounds { x: p.x, y: p.y, w: sz.width, h: sz.height });
        }
        drop(g);
        state.schedule_save(app);
    }
    let _ = w.destroy();
    broadcast(app);
}

/// Called from the global window-destroyed hook so the deck always knows.
pub fn on_destroyed(app: &AppHandle) {
    broadcast(app);
}
