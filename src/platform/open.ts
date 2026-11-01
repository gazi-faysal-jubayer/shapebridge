// Opening files: the native dialog and OS "open with" paths on desktop, the file input on the web,
// folder drops everywhere, and the desktop recent-files list.
import { setState, state } from "../state/store";
import * as c from "../controller";

export const isTauri = () => "__TAURI_INTERNALS__" in window;
const RECENT_MAX = 10;
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

/** Newest first, no duplicates, at most 10. */
export const pushRecent = (list: string[], path: string) => [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);

export async function pickAndOpen() {
  if (!isTauri()) return document.getElementById("file-input")?.click();
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: true });
  if (picked) await openPaths(Array.isArray(picked) ? picked : [picked]);
}

/** Read files from disk by path (desktop only) and open them; remembers them as recent. */
export async function openPaths(paths: string[]) {
  if (!paths.length) return;
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const files: File[] = [];
  for (const p of paths) {
    try {
      files.push(new File([await readFile(p)], baseName(p)));
      setState("settings", "recent", (r) => pushRecent(r, p));
    } catch (e) {
      setState("settings", "recent", (r) => r.filter((x) => x !== p));
      setState("status", `Could not open ${baseName(p)}: ${(e as Error).message ?? e}`);
    }
  }
  await c.openFiles(files);
}

/** Desktop: files passed on the command line, by "Open with", or to a second launch of the app. */
export async function listenForOpenRequests() {
  if (!isTauri()) return;
  const { listen } = await import("@tauri-apps/api/event");
  const { invoke } = await import("@tauri-apps/api/core");
  await listen<string[]>("open-paths", (e) => openPaths(e.payload));
  await openPaths(await invoke<string[]>("pending_paths"));
}

/** Files from a drop, walking into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) return void out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
    const reader = (e as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most ~100 entries per call, so read until it comes back empty
    for (let batch; (batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))).length;)
      for (const child of batch) await walk(child);
  };
  for (const e of entries) await walk(e);
  return out;
}

export const recent = () => (isTauri() ? state.settings.recent : []);
