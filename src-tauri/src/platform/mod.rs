//! OS-specific window behaviour. Windows gets the real implementation; other
//! platforms get no-op fallbacks so the crate still builds.

#[cfg(windows)]
mod win;
#[cfg(windows)]
pub use win::*;

#[cfg(not(windows))]
mod fallback {
    use tauri::{AppHandle, PhysicalPosition, PhysicalSize, WebviewWindow};

    pub fn make_tool_window(_w: &WebviewWindow, _no_activate: bool) {}
    pub fn set_bounds(w: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) {
        let _ = w.set_position(PhysicalPosition::new(x, y));
        let _ = w.set_size(PhysicalSize::new(width, height));
    }
    pub fn show_inactive(w: &WebviewWindow) {
        let _ = w.show();
    }
    pub fn start_fullscreen_watcher(_app: AppHandle) {}
    pub fn fullscreen_active() -> bool {
        false
    }
}
#[cfg(not(windows))]
pub use fallback::*;
