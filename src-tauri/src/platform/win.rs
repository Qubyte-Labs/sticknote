//! Win32 integration:
//!  * tool-window styling (no taskbar button, no Alt+Tab entry, optional
//!    no-activate so hovering/clicking the deck never steals focus)
//!  * atomic move+resize for the deck (no flicker when it grows from the edge)
//!  * an event-driven fullscreen watcher (WinEvent hooks, zero polling)

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, WebviewWindow};
use windows_sys::Win32::Foundation::{HWND, RECT};
use windows_sys::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows_sys::Win32::System::Threading::GetCurrentProcessId;
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

fn hwnd_of(w: &WebviewWindow) -> Option<HWND> {
    w.hwnd().ok().map(|h| h.0 as HWND)
}

/// Hide a window from the taskbar and Alt+Tab. With `no_activate`, clicks
/// don't activate it (used for the deck).
pub fn make_tool_window(w: &WebviewWindow, no_activate: bool) {
    let Some(hwnd) = hwnd_of(w) else { return };
    unsafe {
        let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        ex |= WS_EX_TOOLWINDOW;
        ex &= !WS_EX_APPWINDOW;
        if no_activate {
            ex |= WS_EX_NOACTIVATE;
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

/// Move and resize in one call so an edge-anchored window never visibly jumps.
pub fn set_bounds(w: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) {
    let Some(hwnd) = hwnd_of(w) else { return };
    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            y,
            width as i32,
            height as i32,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
    }
}

/// Show without activating (the deck must never steal focus).
pub fn show_inactive(w: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(w) else { return };
    unsafe {
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static FULLSCREEN: AtomicBool = AtomicBool::new(false);

pub fn fullscreen_active() -> bool {
    FULLSCREEN.load(Ordering::Relaxed)
}

/// Is `hwnd` a foreign window covering its whole (primary) monitor, or is the
/// shell reporting presentation / D3D fullscreen mode?
unsafe fn is_fullscreen(hwnd: HWND) -> bool {
    // Shell-reported states: games, presentations, "busy" fullscreen apps.
    let mut quns = 0;
    if SHQueryUserNotificationState(&mut quns) >= 0 && matches!(quns, 2 | 3 | 4) {
        return true;
    }
    if hwnd.is_null() || hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
        return false;
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == GetCurrentProcessId() {
        return false;
    }
    let mut class = [0u16; 32];
    let n = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
    let class = String::from_utf16_lossy(&class[..n.max(0) as usize]);
    if matches!(class.as_str(), "WorkerW" | "Progman" | "Shell_TrayWnd") {
        return false;
    }
    if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
        return false;
    }
    let mut r: RECT = std::mem::zeroed();
    if GetWindowRect(hwnd, &mut r) == 0 {
        return false;
    }
    let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut mi: MONITORINFO = std::mem::zeroed();
    mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(mon, &mut mi) == 0 {
        return false;
    }
    // Only the primary monitor hosts the deck.
    if mi.dwFlags & 1 == 0 {
        return false;
    }
    let m = mi.rcMonitor;
    r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
}

unsafe extern "system" fn on_win_event(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if event == EVENT_OBJECT_LOCATIONCHANGE
        && (id_object != OBJID_WINDOW || id_child != 0 || hwnd != GetForegroundWindow())
    {
        return;
    }
    let fg = GetForegroundWindow();
    let now = is_fullscreen(fg);
    if FULLSCREEN.swap(now, Ordering::Relaxed) != now {
        if let Some(app) = APP.get() {
            crate::windows::deck::refresh_visibility(app);
        }
    }
}

/// Install out-of-context WinEvent hooks on a dedicated message-loop thread.
/// The thread sleeps in `GetMessageW` and only wakes on real events.
pub fn start_fullscreen_watcher(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    std::thread::Builder::new()
        .name("fullscreen-watch".into())
        .spawn(|| unsafe {
            let flags = WINEVENT_OUTOFCONTEXT;
            SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                std::ptr::null_mut(),
                Some(on_win_event),
                0,
                0,
                flags,
            );
            SetWinEventHook(
                EVENT_OBJECT_LOCATIONCHANGE,
                EVENT_OBJECT_LOCATIONCHANGE,
                std::ptr::null_mut(),
                Some(on_win_event),
                0,
                0,
                flags,
            );
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        })
        .ok();
}
