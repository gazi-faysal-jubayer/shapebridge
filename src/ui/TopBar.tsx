import { openPaths, pickAndOpen, recent } from "../platform/open";
import { For, Show } from "solid-js";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import FolderOpen from "lucide-solid/icons/folder-open";
import Share2 from "lucide-solid/icons/share-2";
import Search from "lucide-solid/icons/search";
import Download from "lucide-solid/icons/download";
import { actions, type Action } from "./actions";
import { setState, state } from "../state/store";
import * as c from "../controller";
import { live, startShare } from "../live";

const groups: Action["group"][] = ["File", "View", "Inspect", "Design", "Share", "Help"];

export function TopBar(props: { guest: boolean }) {
  return (
    <header class="topbar">
      <a class="brand" href="https://github.com/gazi-faysal-jubayer/shapebridge" target="_blank" rel="noreferrer">
        <img src="logo.svg" alt="" width="24" height="24" />
        <span>ShapeBridge</span>
      </a>
      <Show
        when={!props.guest}
        fallback={
          <>
            <span class="pill">Live review</span>
            <Show when={live.allowDownload}>
              <DropdownMenu>
                <DropdownMenu.Trigger class="icon-btn" disabled={!state.files.length} title="Export (allowed by the presenter)">
                  <Download size={17} /> <span class="hide-sm">Export</span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="menu">
                    <ExportItems />
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </Show>
          </>
        }
      >
        <nav class="menus" aria-label="Main menu">
          <For each={groups}>
            {(g) => (
              <DropdownMenu>
                <DropdownMenu.Trigger class="menu-trigger">{g}</DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="menu">
                    <For each={actions.filter((a) => a.group === g)}>
                      {(a) => (
                        <DropdownMenu.Item class="menu-item" disabled={a.enabled ? !a.enabled() : false} onSelect={() => a.run()}>
                          <span>{a.label}</span>
                          <Show when={a.keys}>
                            <kbd>{a.keys}</kbd>
                          </Show>
                        </DropdownMenu.Item>
                      )}
                    </For>
                    <Show when={g === "File" && recent().length}>
                      <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger class="menu-item">
                          <span>Open recent</span>
                        </DropdownMenu.SubTrigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.SubContent class="menu">
                            <For each={recent()}>
                              {(p) => (
                                <DropdownMenu.Item class="menu-item" onSelect={() => void openPaths([p])} title={p}>
                                  {p.split(/[\/]/).pop()}
                                </DropdownMenu.Item>
                              )}
                            </For>
                          </DropdownMenu.SubContent>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Sub>
                    </Show>
                    <Show when={g === "File"}>
                      <DropdownMenu.Separator class="menu-sep" />
                      <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger class="menu-item" disabled={!state.files.length}>
                          <span>Export as…</span>
                        </DropdownMenu.SubTrigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.SubContent class="menu">
                            <ExportItems />
                          </DropdownMenu.SubContent>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Sub>
                    </Show>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            )}
          </For>
        </nav>
      </Show>
      <div class="spacer" />
      <button class="search" onClick={() => setState("paletteOpen", true)} aria-label="Command palette">
        <Search size={15} /> <span>Search commands</span> <kbd>Ctrl K</kbd>
      </button>
      <Show when={!props.guest}>
        <button class="icon-btn" onClick={() => void pickAndOpen()} title="Open file (Ctrl+O)">
          <FolderOpen size={17} /> <span class="hide-sm">Open</span>
        </button>
        <DropdownMenu>
          <DropdownMenu.Trigger class="icon-btn" disabled={!state.files.length} title="Export">
            <Download size={17} /> <span class="hide-sm">Export</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="menu">
              <ExportItems />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
        <button class="primary icon-btn" disabled={!state.files.length || live.role !== "none"} onClick={startShare}>
          <Share2 size={17} /> <span>Share live</span>
        </button>
      </Show>
    </header>
  );
}

// mesh formats are listed statically so the menu doesn't pull in the 3D engine chunk
const meshFormats = [
  ["stl", "STL (binary)"],
  ["obj", "OBJ"],
  ["glb", "glTF binary (GLB)"],
  ["gltf", "glTF (text)"],
  ["ply", "PLY"],
  ["off", "OFF"],
  ["3dm", "Rhino 3DM"],
  ["bim", "dotbim"],
] as const;

function ExportItems() {
  return (
    <For each={meshFormats}>
      {([ext, label]) => (
        <DropdownMenu.Item class="menu-item" onSelect={() => c.exportMesh(ext)}>
          {label}
        </DropdownMenu.Item>
      )}
    </For>
  );
}
