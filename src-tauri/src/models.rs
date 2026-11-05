use serde::{Deserialize, Serialize};

pub const MAX_TITLE: usize = 200;
pub const MAX_BODY: usize = 256 * 1024;
pub const MAX_NOTES: usize = 10_000;
pub const COLOR_COUNT: u8 = 8;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Active,
    Archived,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    #[serde(default)]
    pub title: String,
    /// Sanitised HTML (see `sanitize.rs`). Never trusted from disk/import: it
    /// is re-sanitised on load.
    #[serde(default)]
    pub body: String,
    /// Plain-text projection of `body`, used for previews and search.
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub color: u8,
    #[serde(default)]
    pub font: NoteFont,
    #[serde(default = "default_status")]
    pub status: Status,
    #[serde(default = "default_true")]
    pub on_deck: bool,
    #[serde(default)]
    pub order: i64,
    #[serde(default)]
    pub created: u64,
    #[serde(default)]
    pub updated: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bounds: Option<Bounds>,
}

/// Typeface a note is written in (the "Aa" menu).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum NoteFont {
    #[default]
    Hand,
    Normal,
    Rounded,
    Typewriter,
}

fn default_status() -> Status {
    Status::Active
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Auto,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SortMode {
    Manual,
    Updated,
    Created,
    Title,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: Theme,
    pub edge: Edge,
    pub hide_fullscreen: bool,
    pub sort: SortMode,
    pub show_deck: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::Auto,
            edge: Edge::Right,
            hide_fullscreen: true,
            sort: SortMode::Manual,
            show_deck: true,
        }
    }
}

/// Partial settings update coming from the UI.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub theme: Option<Theme>,
    pub edge: Option<Edge>,
    pub hide_fullscreen: Option<bool>,
    pub sort: Option<SortMode>,
    pub show_deck: Option<bool>,
    pub start_with_windows: Option<bool>,
    pub portable: Option<bool>,
}

/// What the settings screen shows: persisted settings plus OS-derived state.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    #[serde(flatten)]
    pub settings: Settings,
    pub start_with_windows: bool,
    pub portable: bool,
    pub data_dir: String,
}

/// Partial note update from an editor.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub title: Option<String>,
    pub body: Option<String>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
