// Custom title bar: app identity + window controls.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../../lib/api";
import { h } from "../../lib/dom";
import { icon } from "../../lib/icons";
import appIcon from "../../app-icon.png";

export function titlebar(): HTMLElement {
  const win = getCurrentWindow();
  const maxBtn = h("button", { class: "win-btn", title: "Maximize", "aria-label": "Maximize" }, icon("maximize", 14));

  const syncMax = async () => {
    const m = await win.isMaximized();
    maxBtn.replaceChildren(icon(m ? "restoreWin" : "maximize", 14));
    maxBtn.title = m ? "Restore" : "Maximize";
  };
  window.addEventListener("resize", () => void syncMax());

  maxBtn.addEventListener("click", () => void win.toggleMaximize());

  return h(
    "header",
    { class: "titlebar", "data-tauri-drag-region": true },
    h("img", { class: "app-mark", src: appIcon, alt: "", width: 18, height: 18, draggable: "false" }),
    h("span", { class: "app-name", "data-tauri-drag-region": true }, "Peekin"),
    h("div", { class: "win-controls" },
      h("button", { class: "win-btn", title: "Minimize", "aria-label": "Minimize", onclick: () => void win.minimize() }, icon("minus", 14)),
      maxBtn,
      h("button", { class: "win-btn close", title: "Close", "aria-label": "Close", onclick: () => void api.closeSelf() }, icon("close", 14)),
    ),
  );
}
