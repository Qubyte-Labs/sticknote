// Left navigation: New note, views with counts, Settings, About.
import { h } from "../../lib/dom";
import { icon, type IconName } from "../../lib/icons";
import type { ManagerView } from "../../lib/types";
import { counts, state, subscribe, update } from "./state";
import { actions } from "./actions";

export function sidebar(): HTMLElement {
  const items = new Map<ManagerView, { el: HTMLButtonElement; count?: HTMLElement }>();

  const nav = (view: ManagerView, label: string, ic: IconName, withCount: boolean) => {
    const count = withCount ? h("span", { class: "nav-count" }) : undefined;
    const el = h(
      "button",
      { class: "nav-item", "data-view": view, onclick: () => update({ view, query: "", checked: new Set() }) },
      icon(ic),
      h("span", { class: "nav-label" }, label),
      count,
    );
    items.set(view, { el, count });
    return el;
  };

  const el = h(
    "aside",
    { class: "sidebar" },
    h("button", { class: "btn btn-primary new-note", title: "New note (Ctrl+N)", onclick: () => void actions.create() },
      icon("plus"), "New note"),
    h("div", { class: "nav-heading t-caps" }, "Notes"),
    h("nav", { class: "nav" },
      nav("all", "All notes", "grid", true),
      nav("deck", "On the deck", "flag", true),
      nav("archive", "Archive", "archive", true),
    ),
    h("div", { class: "sidebar-spacer" }),
    h("nav", { class: "nav" }, nav("settings", "Settings", "settings", false), nav("about", "About", "info", false)),
  );

  const paint = () => {
    const c = counts();
    for (const [view, { el, count }] of items) {
      el.setAttribute("aria-current", String(state.view === view));
      if (count) count.textContent = String(c[view as "all" | "deck" | "archive"]);
    }
  };
  subscribe((changed) => {
    if (changed.has("notes") || changed.has("view")) paint();
  });
  paint();
  return el;
}
