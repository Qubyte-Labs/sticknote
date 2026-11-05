// Backend → webview events. Names mirror src-tauri/src/state.rs::events.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChangedPayload, DeletedPayload, ManagerView, Settings } from "./types";

interface EventMap {
  "notes:changed": ChangedPayload;
  "notes:deleted": DeletedPayload;
  "notes:restored": number;
  "settings:changed": Settings;
  "deck:note-windows": string[];
  "manager:navigate": ManagerView;
}

export function on<K extends keyof EventMap>(name: K, cb: (payload: EventMap[K]) => void): Promise<UnlistenFn> {
  return listen<EventMap[K]>(name, (e) => cb(e.payload));
}
