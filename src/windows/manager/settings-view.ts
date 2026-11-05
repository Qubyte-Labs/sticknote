// Settings page.
import { api, errorText } from "../../lib/api";
import { h } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { segmented, toggle } from "../../components/controls";
import { toast } from "../../components/toast";
import { setTheme } from "../../lib/theme";
import type { Settings, SettingsPatch } from "../../lib/types";
import { state, subscribe, update } from "./state";
import { actions } from "./actions";

const GLOBAL_KEYS: [string, string][] = [
  ["Ctrl + Alt + N", "New note"],
  ["Ctrl + Alt + A", "All notes"],
  ["Ctrl + Alt + L", "Archive"],
];
const NOTE_KEYS: [string, string][] = [
  ["Esc", "Close a note window"],
  ["Ctrl + .", "Cycle a note's colour"],
  ["Ctrl + Backspace", "Delete a note, with ten seconds to undo"],
  ["Ctrl + Z", "Undo a delete (while the toast is showing)"],
  ["Ctrl + B / I / U", "Bold, italic, underline"],
  ["Ctrl + Shift + L", "Task list"],
  ["Ctrl + Shift + 8", "Bullets"],
  ["Ctrl + Shift + 7", "Numbered list"],
  ["Ctrl + K", "Add or edit a link (Ctrl+click opens it)"],
  ["- , 1. , [ ]  + Space", "Start a list as you type (Backspace undoes)"],
];

async function patch(p: SettingsPatch) {
  try {
    const s = await api.updateSettings(p);
    update({ settings: s });
  } catch (e) {
    toast(errorText(e), { error: true });
    update({ settings: await api.getSettings() });
  }
}

function row(title: string, desc: string | null, control: Node | null) {
  return h(
    "div",
    { class: "set-row" },
    h("div", { class: "set-text" }, h("div", { class: "set-title" }, title), desc ? h("div", { class: "set-desc" }, desc) : null),
    control,
  );
}

function keys(list: [string, string][]) {
  return h("div", { class: "keys" }, ...list.map(([k, d]) => h("div", { class: "key-row" }, h("kbd", null, k), h("span", null, d))));
}

function build(s: Settings): HTMLElement[] {
  return [
    h("h1", { class: "page-title" }, "Settings"),

    h("div", { class: "set-card" },
      row("Theme", "Follows Windows unless you choose otherwise.",
        segmented("Theme", [
          { value: "auto", label: "Auto" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ], s.theme, (theme) => {
          setTheme(theme);
          void patch({ theme });
        })),
    ),

    h("div", { class: "set-card" },
      row("Screen edge", "Which side of the display your notes live on.",
        segmented("Screen edge", [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ], s.edge, (edge) => void patch({ edge }))),
      row("Show the deck", "Tabs for your notes along the screen edge.",
        toggle("Show the deck", s.showDeck, (v) => void patch({ showDeck: v }))),
      row("Hide over fullscreen apps", "Keeps the deck out of games, videos and presentations.",
        toggle("Hide over fullscreen apps", s.hideFullscreen, (v) => void patch({ hideFullscreen: v }))),
    ),

    h("div", { class: "set-card" },
      row("Start with Windows", "Adds a per-user entry you can remove in Task Manager.",
        toggle("Start with Windows", s.startWithWindows, (v) => void patch({ startWithWindows: v }))),
    ),

    h("div", { class: "set-card" },
      row("Global shortcuts",
        "Registered system-wide, so they work with nothing focused. If another app already owns one, it is skipped silently and the tray menu reaches the same commands.",
        null),
      keys(GLOBAL_KEYS),
    ),

    h("div", { class: "set-card" }, row("In a note", null, null), keys(NOTE_KEYS)),

    h("div", { class: "set-card" },
      row("Your notes", "Stored only on this PC, in plain JSON you can back up or move.", null),
      h("div", { class: "path-row" },
        h("code", { class: "path truncate", title: s.dataDir }, s.dataDir),
        h("button", { class: "btn btn-sm", onclick: () => void api.openDataFolder() }, icon("folder", 14), "Open folder"),
      ),
      h("div", { class: "btn-row" },
        h("button", { class: "btn btn-sm", onclick: () => void actions.importNotes() }, icon("upload", 14), "Import…"),
        h("button", { class: "btn btn-sm", onclick: () => void actions.exportNotes("json") }, icon("download", 14), "Export JSON…"),
        h("button", { class: "btn btn-sm", onclick: () => void actions.exportNotes("markdown") }, icon("download", 14), "Export Markdown…"),
      ),
      row("Portable mode",
        "Keep notes in a folder next to the app, to carry them between PCs on a USB drive. Your notes are copied and Peekin restarts.",
        toggle("Portable mode", s.portable, (v) => void patch({ portable: v }))),
    ),

    h("div", { class: "set-foot" },
      h("button", { class: "btn btn-danger btn-sm", onclick: () => void api.quit() }, "Quit Peekin"),
    ),
  ];
}

export function settingsView(): HTMLElement {
  const el = h("section", { class: "page settings-page" });
  const inner = h("div", { class: "page-inner" });
  el.append(inner);
  const paint = () => inner.replaceChildren(...build(state.settings));
  subscribe((c) => {
    // Rebuild only when shown and something external changed (tray, etc.).
    if (c.has("view") && state.view === "settings") paint();
    else if (c.has("settings") && state.view === "settings" && !el.contains(document.activeElement)) paint();
  });
  paint();
  return el;
}
