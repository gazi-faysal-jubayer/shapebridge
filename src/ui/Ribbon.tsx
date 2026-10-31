import { createSignal, For, Show } from "solid-js";
import ChevronUp from "lucide-solid/icons/chevron-up";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { setState, state } from "../state/store";
import { byId } from "./actions";
import { Icon } from "./icons";
import * as c from "../controller";

// Command bar in the style of a CAD CommandManager: tabs of grouped commands. Every button is an
// action from the registry, so the ribbon, menus, palette and shortcuts never disagree.
const TABS: { id: string; label: string; groups: { label: string; ids: string[] }[] }[] = [
  {
    id: "features",
    label: "Features",
    groups: [
      { label: "Boss / cut", ids: ["feat-extrude", "feat-cut", "feat-revolve", "feat-hole"] },
      { label: "Modify", ids: ["feat-fillet", "feat-chamfer", "feat-shell"] },
      { label: "Pattern", ids: ["feat-linear", "feat-polar", "feat-mirror"] },
      { label: "Part", ids: ["equations", "undo", "redo"] },
    ],
  },
  {
    id: "sketch",
    label: "Sketch",
    groups: [
      { label: "Profile + extrude", ids: ["sketch-rect", "sketch-circle", "sketch-polygon", "sketch-polyline"] },
      { label: "Spin", ids: ["feat-revolve"] },
    ],
  },
  {
    id: "evaluate",
    label: "Evaluate",
    groups: [
      { label: "Inspect", ids: ["tool-measure", "tool-section", "tool-explode"] },
      { label: "Visibility", ids: ["hide", "isolate", "show-all"] },
    ],
  },
  {
    id: "review",
    label: "Review",
    groups: [
      { label: "Live", ids: ["share", "comment", "markup"] },
      { label: "Hand off", ids: ["export-review", "offline-viewer"] },
    ],
  },
  {
    id: "view",
    label: "View",
    groups: [
      { label: "Orientation", ids: ["fit", "view-front", "view-top", "view-right", "view-iso"] },
      { label: "Display", ids: ["display-shaded", "display-edges", "display-wireframe", "display-xray"] },
      { label: "Capture", ids: ["screenshot"] },
    ],
  },
  {
    id: "convert",
    label: "Convert",
    groups: [
      { label: "File", ids: ["open", "new-part", "save-design", "convert"] },
      {
        label: "Parametric export",
        ids: ["export-freecad", "export-openscad", "export-cadquery", "export-fusion360", "export-csv", "export-step"],
      },
    ],
  },
];

export function Ribbon() {
  const [tab, setTab] = createSignal("features");
  const label = (id: string) => byId(id).short ?? byId(id).label;
  return (
    <div class="ribbon" classList={{ compact: state.settings.ribbonCompact }}>
      <div class="ribbon-tabs" role="tablist" aria-label="Command bar">
        <For each={TABS}>
          {(t) => (
            <button role="tab" aria-selected={tab() === t.id} classList={{ on: tab() === t.id }} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          )}
        </For>
        <Show when={c.doc()}>
          <span class="ribbon-context">Part: {c.doc()!.name}</span>
        </Show>
        <span class="spacer" />
        <button
          class="ghost"
          onClick={() => setState("settings", "ribbonCompact", (v) => !v)}
          aria-label={state.settings.ribbonCompact ? "Show labels" : "Hide labels"}
          title={state.settings.ribbonCompact ? "Show labels" : "Hide labels"}
        >
          <Show when={state.settings.ribbonCompact} fallback={<ChevronUp size={14} />}>
            <ChevronDown size={14} />
          </Show>
        </button>
      </div>
      <div class="ribbon-body" role="tabpanel">
        <For each={TABS.find((t) => t.id === tab())!.groups}>
          {(g) => (
            <div class="ribbon-group" role="group" aria-label={g.label}>
              <div class="ribbon-buttons">
                <For each={g.ids}>
                  {(id) => {
                    const a = byId(id);
                    return (
                      <button
                        class="ribbon-btn"
                        disabled={a.enabled ? !a.enabled() : false}
                        onClick={() => a.run()}
                        title={a.keys ? `${a.label} (${a.keys})` : a.label}
                        aria-label={a.label}
                      >
                        <Icon name={a.icon ?? "part"} size={state.settings.ribbonCompact ? 18 : 24} />
                        <span>{label(id)}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
              <div class="ribbon-group-label">{g.label}</div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
