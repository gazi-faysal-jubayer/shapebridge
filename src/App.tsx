import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Tabs } from "@kobalte/core/tabs";
import { persistSettings, setState, state } from "./state/store";
import { parseShareHash } from "./share/link";
import * as c from "./controller";
import { handleShortcut } from "./ui/actions";
import { TopBar } from "./ui/TopBar";
import { ModelTree } from "./ui/ModelTree";
import { Designer } from "./ui/Designer";
import { Properties } from "./ui/Properties";
import { ToolStrip } from "./ui/ToolStrip";
import { ViewCube } from "./ui/ViewCube";
import { StatusBar } from "./ui/StatusBar";
import { Welcome } from "./ui/Welcome";
import { CommandPalette } from "./ui/CommandPalette";
import { ShareDialog } from "./ui/ShareDialog";
import { ReviewOverlay } from "./ui/ReviewOverlay";
import { ReviewPanel } from "./ui/ReviewPanel";
import { joinShare, live } from "./live";

// the importers the 3D engine understands; keep docs/FORMATS.md in sync
const accept = [
  "step",
  "stp",
  "iges",
  "igs",
  "brep",
  "brp",
  "fcstd",
  "3dm",
  "ifc",
  "bim",
  "stl",
  "obj",
  "mtl",
  "gltf",
  "glb",
  "bin",
  "3mf",
  "amf",
  "ply",
  "off",
  "fbx",
  "dae",
  "3ds",
  "wrl",
  "svg",
  "json",
  "png",
  "jpg",
]
  .map((e) => "." + e)
  .join(",");

export default function App() {
  let viewport!: HTMLDivElement;
  const guest = parseShareHash(location.hash);
  const [dragging, setDragging] = createSignal(false);
  const [tab, setTab] = createSignal("model");
  const [rightTab, setRightTab] = createSignal("props");
  // a review session or a new comment brings the Review tab forward
  createEffect(() => (live.role !== "none" || live.draft) && setRightTab("review"));
  const [leftW, setLeftW] = createSignal(280);
  const [rightW, setRightW] = createSignal(300);

  persistSettings();
  createEffect(() => (document.documentElement.dataset.theme = state.settings.theme));
  // switch to the Design tab whenever a parametric document is opened
  createEffect(() => c.doc() && setTab("design"));

  onMount(async () => {
    const onKey = (e: KeyboardEvent) => handleShortcut(e);
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
    await c.mountViewer(viewport);
    if (guest) joinShare(guest);
    // a different share link pasted into an open tab must join that room, not keep the old one
    const onHash = () => parseShareHash(location.hash) && location.reload();
    window.addEventListener("hashchange", onHash);
    onCleanup(() => window.removeEventListener("hashchange", onHash));
  });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!guest) c.openFiles([...(e.dataTransfer?.files ?? [])]);
  };

  return (
    <div
      class="app"
      onDragOver={(e) => (e.preventDefault(), setDragging(!guest))}
      onDragLeave={(e) => e.relatedTarget === null && setDragging(false)}
      onDrop={onDrop}
    >
      <TopBar guest={!!guest} />
      <input
        id="file-input"
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={(e) => (c.openFiles([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ""))}
      />

      <main class="workspace">
        <Show when={state.settings.showLeft && !guest}>
          <aside class="side left" style={{ width: `${leftW()}px` }}>
            <Tabs value={tab()} onChange={setTab} class="tabs">
              <Tabs.List class="tab-list">
                <Tabs.Trigger class="tab" value="model">
                  Model
                </Tabs.Trigger>
                <Tabs.Trigger class="tab" value="design">
                  Design
                </Tabs.Trigger>
                <Tabs.Indicator class="tab-indicator" />
              </Tabs.List>
              <Tabs.Content class="tab-body" value="model">
                <ModelTree />
              </Tabs.Content>
              <Tabs.Content class="tab-body" value="design">
                <Designer />
              </Tabs.Content>
            </Tabs>
          </aside>
          <Splitter onDrag={(dx) => setLeftW((w) => Math.min(Math.max(w + dx, 200), 520))} />
        </Show>

        <section class="stage">
          <div class="viewport" ref={viewport} />
          <Show when={state.engineReady && !state.files.length && !state.loading && !guest}>
            <Welcome />
          </Show>
          <Show when={state.files.length}>
            <ReviewOverlay />
            <ViewCube />
            <ToolStrip />
          </Show>
          <Show when={dragging()}>
            <div class="drop">Drop to open</div>
          </Show>
          <Show when={!state.engineReady || state.loading}>
            <div class="loading" role="status">
              <span class="spinner" /> {state.engineReady ? "Opening…" : "Starting the 3D engine…"}
            </div>
          </Show>
        </section>

        <Show when={state.settings.showRight && state.files.length}>
          <Splitter onDrag={(dx) => setRightW((w) => Math.min(Math.max(w - dx, 220), 520))} />
          <aside class="side right" style={{ width: `${rightW()}px` }}>
            <Tabs value={rightTab()} onChange={setRightTab} class="tabs">
              <Tabs.List class="tab-list">
                <Tabs.Trigger class="tab" value="props">
                  Properties
                </Tabs.Trigger>
                <Tabs.Trigger class="tab" value="review">
                  Review{live.comments.length ? ` (${live.comments.length})` : ""}
                </Tabs.Trigger>
                <Tabs.Indicator class="tab-indicator" />
              </Tabs.List>
              <Tabs.Content class="tab-body" value="props">
                <Properties />
              </Tabs.Content>
              <Tabs.Content class="tab-body" value="review">
                <ReviewPanel />
              </Tabs.Content>
            </Tabs>
          </aside>
        </Show>
      </main>

      <StatusBar />
      <CommandPalette />
      <ShareDialog />
    </div>
  );
}

function Splitter(props: { onDrag: (dx: number) => void }) {
  const down = (e: PointerEvent) => {
    let x = e.clientX;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      props.onDrag(ev.clientX - x);
      x = ev.clientX;
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return <div class="splitter" role="separator" aria-orientation="vertical" onPointerDown={down} />;
}

// let `setState` be reachable from the browser console while debugging
if (import.meta.env.DEV) Object.assign(window, { sbState: state, sbSetState: setState });
