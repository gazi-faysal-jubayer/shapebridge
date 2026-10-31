// Viewport chrome in the style of a CAD heads-up toolbar, an XYZ reference triad, and a right-click menu.
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { setState, state, type DisplayMode, type StdView } from "../state/store";
import { byId, type Action } from "./actions";
import { Icon, type IconName } from "./icons";
import * as c from "../controller";

const VIEWS: [StdView, string, IconName][] = [
  ["front", "Front", "viewFront"],
  ["top", "Top", "viewTop"],
  ["right", "Right", "viewRight"],
  ["back", "Back", "viewFront"],
  ["bottom", "Bottom", "viewTop"],
  ["left", "Left", "viewRight"],
  ["iso", "Isometric", "viewIso"],
];
const DISPLAYS: [DisplayMode, string, IconName][] = [
  ["shaded", "Shaded", "displayShaded"],
  ["edges", "Shaded with edges", "displayEdges"],
  ["wireframe", "Wireframe", "wireframe"],
  ["xray", "X-ray", "xray"],
];

function HudButton(props: { icon: IconName; label: string; onClick: () => void; on?: boolean }) {
  return (
    <button
      class="hud-btn"
      classList={{ on: props.on }}
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.on}
    >
      <Icon name={props.icon} size={18} />
    </button>
  );
}

export function HeadsUp() {
  return (
    <div class="heads-up" role="toolbar" aria-label="View toolbar">
      <HudButton icon="zoomFit" label="Zoom to fit (F)" onClick={c.fitAll} />
      <HudButton icon="zoomSelection" label="Zoom to selection" onClick={c.fit} />
      <HudButton icon="previousView" label="Previous view" onClick={c.previousView} />
      <HudButton
        icon="section"
        label="Section view (S)"
        on={state.section.enabled}
        onClick={() => setState("section", "enabled", (v) => !v)}
      />
      <span class="hud-sep" />
      <DropdownMenu>
        <DropdownMenu.Trigger class="hud-btn" title="View orientation" aria-label="View orientation">
          <Icon name="viewIso" size={18} />
          <span class="hud-caret">▾</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="menu">
            <For each={VIEWS}>
              {([v, label, icon]) => (
                <DropdownMenu.Item class="menu-item" onSelect={() => c.setView(v)}>
                  <span class="menu-icon">
                    <Icon name={icon} size={16} /> {label}
                  </span>
                </DropdownMenu.Item>
              )}
            </For>
            <Show when={state.views.length}>
              <DropdownMenu.Separator class="menu-sep" />
              <For each={state.views}>
                {(v, i) => (
                  <DropdownMenu.Item class="menu-item" onSelect={() => c.restoreView(i())}>
                    {v.name}
                  </DropdownMenu.Item>
                )}
              </For>
            </Show>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenu.Trigger class="hud-btn" title="Display style" aria-label="Display style">
          <Icon name={DISPLAYS.find((d) => d[0] === state.settings.display)![2]} size={18} />
          <span class="hud-caret">▾</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="menu">
            <For each={DISPLAYS}>
              {([d, label, icon]) => (
                <DropdownMenu.Item class="menu-item" onSelect={() => setState("settings", "display", d)}>
                  <span class="menu-icon">
                    <Icon name={icon} size={16} /> {label}
                  </span>
                </DropdownMenu.Item>
              )}
            </For>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
      <HudButton icon="showAll" label="Show all (Shift+H)" onClick={c.showAll} />
      <HudButton
        icon="viewFront"
        label={state.settings.projection === "perspective" ? "Switch to orthographic (O)" : "Switch to perspective (O)"}
        on={state.settings.projection === "orthographic"}
        onClick={() => byId("projection").run()}
      />
    </div>
  );
}

/** XYZ reference triad in the corner; follows the camera, click an axis to look along it. */
export function Triad() {
  const [rot, setRot] = createSignal<number[] | undefined>();
  onMount(() => onCleanup(c.onCamera(() => setRot(c.cameraRotation()))));
  const axes = [
    { name: "X", v: [1, 0, 0], color: "#ef4444" },
    { name: "Y", v: [0, 1, 0], color: "#22c55e" },
    { name: "Z", v: [0, 0, 1], color: "#3b82f6" },
  ];
  // the scene's up axis looks straight down from "top"; X from "right"; the third from "front"
  const viewFor = (name: string): StdView => (name === "X" ? "right" : name === (state.upAxis === "z" ? "Z" : "Y") ? "top" : "front");
  const end = (v: number[]) => {
    const e = rot();
    if (!e) return [0, 0];
    const x = e[0] * v[0] + e[4] * v[1] + e[8] * v[2];
    const y = e[1] * v[0] + e[5] * v[1] + e[9] * v[2];
    return [30 + x * 22, 30 - y * 22];
  };
  return (
    <svg class="triad" viewBox="0 0 60 60" width="60" height="60" role="group" aria-label="Axis triad">
      <For each={axes}>
        {(a) => {
          const p = () => end(a.v);
          return (
            <g class="triad-axis" onClick={() => c.setView(viewFor(a.name))}>
              <title>{`Look along ${a.name}`}</title>
              <line x1="30" y1="30" x2={p()[0]} y2={p()[1]} stroke={a.color} stroke-width="2.5" stroke-linecap="round" />
              <text x={p()[0] + (p()[0] - 30) * 0.18} y={p()[1] + (p()[1] - 30) * 0.18 + 3} fill={a.color} text-anchor="middle">
                {a.name}
              </text>
            </g>
          );
        }}
      </For>
    </svg>
  );
}

/** Right-click menu: actions for the selection, or for the view when nothing is selected. */
export function ViewportMenu() {
  const items = (): (Action | "-")[] =>
    state.selection.length
      ? ["hide", "isolate", "show-all", "-", "fit", "tool-measure", "comment"].map((id) => (id === "-" ? "-" : byId(id)))
      : [
          "fit",
          "view-front",
          "view-top",
          "view-right",
          "view-iso",
          "-",
          "display-shaded",
          "display-edges",
          "display-wireframe",
          "-",
          "tool-section",
          "show-all",
        ].map((id) => (id === "-" ? "-" : byId(id)));
  const close = () => setState("contextMenu", null);
  onMount(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });
  return (
    <Show when={state.contextMenu}>
      {(pos) => (
        <div class="ctx-backdrop" onPointerDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
          <div
            class="menu ctx-menu"
            role="menu"
            style={{ left: `${Math.min(pos().x, innerWidth - 230)}px`, top: `${Math.min(pos().y, innerHeight - 320)}px` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <For each={items()}>
              {(a) =>
                a === "-" ? (
                  <div class="menu-sep" role="separator" />
                ) : (
                  <button
                    class="menu-item"
                    role="menuitem"
                    disabled={a.enabled ? !a.enabled() : false}
                    onClick={() => {
                      close();
                      a.run();
                    }}
                  >
                    <span class="menu-icon">
                      <Show when={a.icon}>
                        <Icon name={a.icon!} size={16} />
                      </Show>
                      {a.label}
                    </span>
                    <Show when={a.keys}>
                      <kbd>{a.keys}</kbd>
                    </Show>
                  </button>
                )
              }
            </For>
          </div>
        </div>
      )}
    </Show>
  );
}
