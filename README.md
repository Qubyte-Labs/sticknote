# Peekin

Sticky notes for Windows that live on the edge of your screen. Built with
Tauri 2 (Rust) and a dependency-free TypeScript frontend.

## Run

```bash
npm install
npm run app:dev      # dev mode with hot reload
npm run app:build    # release build + NSIS/MSI installers in src-tauri/target/release/bundle
```

## Features

- **The deck** – notes as leaning tabs on the left or right screen edge. Hover to
  peek, click to open, drag a tab by its title to reorder, "+" for a new note.
  While note windows are open the deck shrinks to coloured pills.
- **One window per note** – borderless title, save state, hide (—), close (×),
  formatting toolbar (B / I / U / S, task list, bullets, numbered, link, **Aa**
  font, **…** more), 8 colours, Delete / Mark complete / Close.
- **Fonts per note** – Handwritten, Normal, Rounded, Typewriter.
- **Auto-lists** – type `- `, `1. ` or `[ ] ` at the start of a line; Backspace
  right after undoes it. "Move completed to the bottom" in the … menu.
- **All notes window** – All / On the deck / Archive, search, sort (deck order,
  last edited, created, title), multi-select with bulk archive/export/delete,
  drag handle reordering, in-place editing, settings, about.
- **Delete with undo** – no confirmation; a 10-second Undo toast (Ctrl+Z).
- **Archive** – "Mark complete" archives; restore any time.
- **Tray menu**, **global hotkeys**, **start with Windows**, **hide over
  fullscreen apps**, **import/export** (JSON, Markdown, text), **portable mode**.
- Light / dark / auto theme.

## Shortcuts

| Global | | In a note | |
|---|---|---|---|
| Ctrl+Alt+N | New note | Esc | Close |
| Ctrl+Alt+A | All notes | Ctrl+. | Cycle colour |
| Ctrl+Alt+L | Archive | Ctrl+Backspace | Delete (10 s undo) |
| | | Ctrl+B / I / U | Bold / italic / underline |
| | | Ctrl+Shift+X | Strikethrough |
| | | Ctrl+Shift+L / 8 / 7 | Task list / bullets / numbered |
| | | Ctrl+K | Link (Ctrl+click opens) |

All notes window: Ctrl+N new, Ctrl+F search, Ctrl+E open in window, ↑/↓ move,
Delete removes, Ctrl+, settings.

## Data

`Documents\Peekin\notes.json` and `settings.json` (or `PeekinData\` next to the
exe in portable mode). Writes are atomic; the previous good file is kept as
`notes.json.bak`; an unreadable file is moved aside, never overwritten.

## Architecture

```
src-tauri/src
  models.rs     data types            store.rs     atomic JSON persistence
  sanitize.rs   HTML allow-list       state.rs     state, coalesced saves, events
  commands/     notes, settings, window, io (the whole IPC surface)
  windows/      deck, note, manager window factories
  platform/     Win32: tool windows, atomic move/resize, fullscreen watcher
  tray.rs, shortcuts.rs
src
  styles/tokens.css   single source of truth: fonts, type scale, colours, spacing, motion
  lib/                api (typed IPC), events, theme, dom, icons, keys, time
  editor/             contenteditable editor, toolbar, link popover
  components/         menu, toast, swatches, toggle/segmented
  windows/            deck, note, manager (one Vite entry each)
```

## Security

- Every app command is permission-gated (`build.rs` app manifest) and each window
  type gets only what it needs (`capabilities/*.json`) — e.g. the deck cannot
  import, export or change settings.
- Note HTML is sanitised in Rust (ammonia allow-list) on every save, load and
  import; only http/https/mailto links survive, and links open only through a
  Rust command that re-validates the scheme.
- Strict CSP (`script-src 'self'`, no remote content), frozen prototypes,
  plain-text paste, file dialogs owned by Rust (the webview never sees paths),
  import size caps, input length limits, UUID-validated ids.
- No network access, no telemetry.

## Performance

Event-driven throughout: no polling and no background timers (WinEvent hooks
for fullscreen detection, one-shot timers for saves and undo expiry). Note
and manager windows are destroyed when closed; saves are coalesced.
