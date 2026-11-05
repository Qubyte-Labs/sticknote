// The deck: note tabs on the screen edge.
//  * hover a tab → that tab itself grows out of the edge into a preview of
//    the note; the tabs above and below slide apart to make room, so nothing
//    is ever covered. Moving to another tab closes one and opens the other in
//    a single smooth motion.
//  * click a tab → the note opens in its own window
//  * drag a tab by its title → reorder (dashed slot shows the drop target)
//  * while note windows are open the deck shrinks to coloured pills
//
// The window is sized to its content by the backend (deck_resize), so it
// never blocks clicks on the rest of the screen edge. It widens once when the
// pointer enters the deck, so previews never wait on a resize.
import { api } from "../../lib/api";
import { on } from "../../lib/events";
import { setTheme } from "../../lib/theme";
import { displayTitle, h, setRich } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { agoLong } from "../../lib/time";
import type { Edge, Note } from "../../lib/types";

const HOVER_DELAY = 110; // dwell before the first preview (avoids fly-by flashes)
const SWITCH_DELAY = 70; // dwell when moving between tabs while previewing
const LEAVE_DELAY = 240; // grace period when the pointer briefly leaves
const ANIM_MS = 380; // must match --deck-anim in deck.css
const TOAST_MS = 10_000;
const SHADOW_ROOM = 22;

const root = document.getElementById("deck")!;
const stack = h("div", { class: "stack" });
const plus = h("button", { class: "plus", title: "New note (Ctrl+Alt+N)", "aria-label": "New note" }, icon("plus", 14));
const more = h("button", { class: "more", title: "Show all notes" });
const column = h("div", { class: "column" }, stack, plus);
root.append(column);

let notes: Note[] = [];
let edge: Edge = "right";
let openWindows = new Set<string>();
let engaged = false; // pointer is over the deck: window is widened
let openTab: HTMLElement | null = null; // the tab currently showing its preview
let tabHs: number[] = []; // heights of the tabs currently shown
let hasMore = false;
let pointer = { x: -1, y: -1 }; // last pointer position, in screen coordinates
let engagedAt = 0; // when the pills last turned into tabs
let hoverTimer: number | undefined;
let leaveTimer: number | undefined;
let shrinkTimer: number | undefined;
let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;
let dragging = false;
let lastSize = "";

const cssNum = (name: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const noteOf = (tab: HTMLElement) => notes.find((n) => n.id === tab.dataset.id);

// ---- sizing ----------------------------------------------------------------
// Window sizes are computed from the geometry tokens rather than measured,
// so they're always the *final* size even while tabs/pills are animating.
function fullHeight() {
  const g = cssNum("--deck-gutter") * 2;
  return g + tabHs.reduce((a, b) => a + b - 6, 0) + 40 /* "+" */ + (hasMore ? 26 : 0);
}
function pillHeight() {
  return cssNum("--deck-gutter") * 2 + tabHs.length * (cssNum("--deck-pill-h") + cssNum("--deck-pill-gap"));
}

function measure() {
  let w: number;
  let hgt: number;
  if (engaged) {
    // Room for tabs plus any one tab fully open, decided once on entry, so
    // hovering from tab to tab never needs another resize.
    w = cssNum("--deck-peek-w") + SHADOW_ROOM;
    hgt = fullHeight() + cssNum("--deck-peek-max-h") - 40 + 16;
  } else if (root.classList.contains("compact")) {
    w = cssNum("--deck-pill-w") + cssNum("--deck-pill-inset") * 2 + 6;
    hgt = pillHeight();
  } else {
    w = cssNum("--deck-tab-w") + 5 + SHADOW_ROOM;
    hgt = fullHeight();
  }
  if (toastEl) {
    w = Math.max(w, cssNum("--deck-tab-w") + 16 + 240 + 14);
    hgt = Math.max(hgt, 64);
  }
  return { w: Math.ceil(w), h: Math.ceil(Math.min(hgt, window.screen.availHeight)) };
}

let resized: (() => void) | null = null;
window.addEventListener("resize", () => {
  resized?.();
  resized = null;
});

/** Ask the backend to fit the window to the content; resolves once applied. */
async function fit(): Promise<void> {
  const { w, h: hh } = measure();
  const key = `${w}x${hh}`;
  if (key === lastSize) return;
  lastSize = key;
  const done = new Promise<void>((res) => {
    resized = res;
    setTimeout(res, 80); // in case the size didn't actually change
  });
  await api.deckResize(w, hh);
  await done;
}

// ---- tabs --------------------------------------------------------------------
function tabHeights(list: Note[]): number[] {
  const base = list.map((n) => Math.min(118, Math.max(64, 40 + displayTitle(n.title, n.text).length * 6.5)));
  const avail = window.screen.availHeight - 140 - cssNum("--deck-peek-max-h");
  const total = base.reduce((a, b) => a + b - 6, 0);
  if (total <= avail) return base;
  const k = avail / total;
  return base.map((v) => Math.max(40, Math.floor(v * k)));
}

function render() {
  if (dragging) return;
  root.dataset.edge = edge;
  const list = notes.filter((n) => n.status === "active" && n.onDeck).sort((a, b) => a.order - b.order);
  const heights = tabHeights(list);

  // Show as many as fit (leaving room for one open preview); the rest are
  // one click away in All notes.
  const avail = window.screen.availHeight - 120 - cssNum("--deck-peek-max-h");
  let used = 0;
  let shown = 0;
  for (const hh of heights) {
    if (used + hh - 6 > avail) break;
    used += hh - 6;
    shown++;
  }

  tabHs = heights.slice(0, shown);
  hasMore = list.length > shown;
  const reopen = openTab?.dataset.id;
  openTab = null;
  stack.classList.remove("has-open");
  stack.replaceChildren(
    ...list.slice(0, shown).map((n, i) => {
      const label = displayTitle(n.title, n.text);
      const tab = h(
        "div",
        {
          class: `tab${openWindows.has(n.id) ? " active" : ""}`,
          "data-id": n.id,
          "data-color": n.color,
          "data-font": n.font,
          role: "button",
          tabindex: 0,
          "aria-label": label,
        },
        h("div", { class: "tab-strip" }, h("span", { class: "tab-label" }, label)),
      );
      tab.style.setProperty("--tab-h", `${heights[i]}px`);
      bindTab(tab);
      return tab;
    }),
  );

  if (list.length > shown) {
    more.textContent = `+${list.length - shown}`;
    if (!more.isConnected) column.insertBefore(more, plus);
  } else more.remove();

  setCompact(!engaged, false);
  if (reopen) {
    const tab = stack.querySelector<HTMLElement>(`.tab[data-id="${reopen}"]`);
    if (tab) expand(tab, false);
  }
  void fit();
}

/** Resting state is pills; the deck becomes tabs while the pointer is on it. */
function setCompact(on: boolean, animate = true) {
  if (root.classList.contains("compact") === on) return;
  if (!animate) root.classList.add("instant");
  root.classList.toggle("compact", on);
  if (!animate) {
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove("instant"));
  }
}

// ---- preview: a tab grows into its note ------------------------------------------
function previewContent(n: Note): HTMLElement {
  const body = h("div", { class: "peek-body rich" });
  setRich(body, n.body);
  return h(
    "div",
    { class: "tab-content" },
    h("div", { class: "peek-title truncate" }, displayTitle(n.title, n.text)),
    body,
    h("div", { class: "peek-foot" }, `Edited ${agoLong(n.updated)} · Click to open`),
  );
}

/** Open `tab` into a preview. `animate=false` restores state after a re-render. */
function expand(tab: HTMLElement, animate = true) {
  const n = noteOf(tab);
  if (!n || tab === openTab) return;
  collapse(openTab); // the previous one closes while this one opens
  clearTimeout(shrinkTimer);

  let content = tab.querySelector<HTMLElement>(".tab-content");
  if (!content) {
    content = previewContent(n);
    tab.append(content);
  }
  // Content has a fixed width, so its height is known before the animation.
  const tabH = parseFloat(tab.style.getPropertyValue("--tab-h")) || tab.offsetHeight;
  const openH = Math.max(tabH, cssNum("--deck-peek-min-h"), Math.min(content.offsetHeight, cssNum("--deck-peek-max-h")));
  tab.style.setProperty("--open-h", `${openH}px`);
  if (!animate) tab.classList.add("no-anim");
  tab.classList.add("open");
  tab.setAttribute("aria-expanded", "true");
  openTab = tab;
  stack.classList.add("has-open");
  if (!animate) requestAnimationFrame(() => tab.classList.remove("no-anim"));
}

function collapse(tab: HTMLElement | null) {
  if (!tab) return;
  tab.classList.remove("open");
  tab.setAttribute("aria-expanded", "false");
  if (openTab === tab) {
    openTab = null;
    stack.classList.remove("has-open");
  }
  // Drop the preview DOM once it has slid away (keeps the deck light).
  window.setTimeout(() => {
    if (!tab.classList.contains("open")) tab.querySelector(".tab-content")?.remove();
  }, ANIM_MS + 40);
}

// ---- engage / disengage (pointer enters / leaves the deck) -------------------
async function engage() {
  if (engaged) return;
  engaged = true;
  engagedAt = performance.now();
  clearTimeout(shrinkTimer);
  await fit(); // grow the (transparent) window first…
  if (!engaged) return;
  setCompact(false); // …then let the pills animate into tabs
  // The tabs grew under a pointer that may not move again: once they settle,
  // preview whichever tab is under it.
  window.setTimeout(() => {
    if (!engaged || openTab || dragging) return;
    const tab = document
      .elementFromPoint(pointer.x - window.screenX, pointer.y - window.screenY)
      ?.closest<HTMLElement>(".tab");
    if (tab && stack.contains(tab)) expand(tab);
  }, ANIM_MS + 20);
}

function disengage() {
  clearTimeout(hoverTimer);
  if (!engaged) return;
  engaged = false;
  collapse(openTab);
  setCompact(true); // tabs animate back into pills
  // Shrink the window only once everything has settled.
  clearTimeout(shrinkTimer);
  shrinkTimer = window.setTimeout(() => {
    if (!engaged) void fit();
  }, ANIM_MS);
}

// ---- hover tracking (event driven, no polling) --------------------------------
const INTERACTIVE = ".tab, .plus, .more, .deck-toast, .column";

document.addEventListener("pointermove", (e) => {
  pointer = { x: e.screenX, y: e.screenY }; // screen coords survive window resizes
  if (dragging) return;
  if ((e.target as HTMLElement).closest(INTERACTIVE)) {
    clearTimeout(leaveTimer);
    leaveTimer = undefined;
    void engage();
  } else scheduleLeave();
});
document.documentElement.addEventListener("pointerleave", () => scheduleLeave());

function scheduleLeave() {
  if (leaveTimer !== undefined || !engaged) return;
  leaveTimer = window.setTimeout(() => {
    leaveTimer = undefined;
    disengage();
  }, LEAVE_DELAY);
}

// ---- tab interactions: hover, click, drag ------------------------------------
/** Right after the pills turn into tabs, wait for that to finish before a
 *  preview opens, so the two animations never fight. */
function firstHoverDelay() {
  if (!engaged) return ANIM_MS;
  return Math.max(HOVER_DELAY, ANIM_MS - (performance.now() - engagedAt));
}
function bindTab(tab: HTMLElement) {
  tab.addEventListener("pointerenter", () => {
    if (dragging || tab === openTab) return;
    clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      void engage().then(() => {
        if (engaged) expand(tab);
      });
    }, openTab ? SWITCH_DELAY : firstHoverDelay());
  });
  tab.addEventListener("pointerleave", () => clearTimeout(hoverTimer));
  tab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void api.openNoteWindow(tab.dataset.id!, tab.getBoundingClientRect().top);
    }
  });

  tab.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    if ((down.target as HTMLElement).closest("a")) down.preventDefault();
    const startY = down.clientY;
    const rect = tab.getBoundingClientRect();
    let slot: HTMLElement | null = null;
    tab.setPointerCapture(down.pointerId);

    const move = (e: PointerEvent) => {
      const dy = e.clientY - startY;
      if (!dragging && Math.abs(dy) < 5) return;
      if (!dragging) {
        dragging = true;
        clearTimeout(hoverTimer);
        collapse(openTab);
        tab.classList.add("no-anim");
        const r = tab.getBoundingClientRect();
        slot = h("div", { class: "slot" });
        slot.style.height = `${r.height}px`;
        tab.replaceWith(slot);
        root.append(tab);
        tab.classList.add("floating");
      }
      tab.style.top = `${rect.top + dy}px`;
      const siblings = Array.from(stack.children).filter((c) => c !== slot) as HTMLElement[];
      const before = siblings.find((s) => {
        const r = s.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (before) stack.insertBefore(slot!, before);
      else stack.append(slot!);
    };

    const up = () => {
      tab.removeEventListener("pointermove", move);
      tab.removeEventListener("pointerup", up);
      tab.removeEventListener("pointercancel", up);
      if (!dragging) {
        const top = tab.getBoundingClientRect().top;
        disengage();
        void api.openNoteWindow(tab.dataset.id!, top);
        return;
      }
      tab.classList.remove("floating", "no-anim");
      tab.style.top = "";
      slot!.replaceWith(tab);
      dragging = false;
      const ids = Array.from(stack.children).map((c) => (c as HTMLElement).dataset.id!).filter(Boolean);
      // Optimistic local order so the next render matches what the user sees.
      ids.forEach((id, i) => {
        const note = notes.find((x) => x.id === id);
        if (note) note.order = i - 1e6;
      });
      void api.reorderNotes(ids);
    };

    tab.addEventListener("pointermove", move);
    tab.addEventListener("pointerup", up);
    tab.addEventListener("pointercancel", up);
  });
}

plus.addEventListener("pointerenter", () => {
  clearTimeout(hoverTimer);
  collapse(openTab);
});
plus.addEventListener("click", async () => {
  disengage();
  const n = await api.createNote();
  await api.openNoteWindow(n.id, plus.getBoundingClientRect().top - 120);
});
more.addEventListener("click", () => void api.openManager("deck"));

// ---- undo toast --------------------------------------------------------------
function showToast(title: string, count: number, token: number) {
  hideToast(false);
  const label = count > 1 ? `Deleted ${count} notes` : `Deleted “${title}”`;
  toastEl = h(
    "div",
    { class: "deck-toast", role: "status" },
    h("span", null, label),
    h("button", {
      onclick: async () => {
        hideToast();
        await api.undoDelete(token).catch(() => {});
      },
    }, "Undo"),
  );
  root.append(toastEl);
  void fit();
  toastTimer = window.setTimeout(() => hideToast(), TOAST_MS);
}

function hideToast(refit = true) {
  clearTimeout(toastTimer);
  if (!toastEl) return;
  toastEl.remove();
  toastEl = null;
  if (refit) void fit();
}

// ---- data ----------------------------------------------------------------------
async function reload() {
  notes = await api.listNotes();
  render();
}

void on("notes:changed", () => void reload());
void on("notes:deleted", (p) => showToast(p.title, p.count, p.token));
void on("notes:restored", () => hideToast());
void on("deck:note-windows", (ids) => {
  openWindows = new Set(ids);
  stack.querySelectorAll<HTMLElement>(".tab").forEach((t) => t.classList.toggle("active", openWindows.has(t.dataset.id!)));
  void fit();
});
void on("settings:changed", (s) => {
  setTheme(s.theme);
  if (s.edge !== edge) {
    edge = s.edge;
    lastSize = "";
    render();
  }
});

(async () => {
  const s = await api.getSettings();
  setTheme(s.theme);
  edge = s.edge;
  await reload();
})();
