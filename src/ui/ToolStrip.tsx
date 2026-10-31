import { For, Show, type JSX } from "solid-js";
import MousePointer2 from "lucide-solid/icons/mouse-pointer-2";
import Ruler from "lucide-solid/icons/ruler";
import Scissors from "lucide-solid/icons/scissors";
import Expand from "lucide-solid/icons/expand";
import Camera from "lucide-solid/icons/camera";
import Focus from "lucide-solid/icons/focus";
import Box from "lucide-solid/icons/box";
import { setState, state, type Axis, type DisplayMode, type Tool } from "../state/store";
import * as c from "../controller";
import { formatLength } from "../viewer/math";

const tools: { id: Tool; label: string; keys: string; icon: () => JSX.Element }[] = [
  { id: "select", label: "Select", keys: "Esc", icon: () => <MousePointer2 size={18} /> },
  { id: "measure", label: "Measure", keys: "M", icon: () => <Ruler size={18} /> },
  { id: "section", label: "Section", keys: "S", icon: () => <Scissors size={18} /> },
  { id: "explode", label: "Explode", keys: "E", icon: () => <Expand size={18} /> },
];

const displays: { id: DisplayMode; label: string }[] = [
  { id: "shaded", label: "Shaded" },
  { id: "edges", label: "Edges" },
  { id: "wireframe", label: "Wire" },
  { id: "xray", label: "X-ray" },
];

export function ToolStrip() {
  const fmt = (v: number) => formatLength(v, state.modelUnit, state.settings.units);
  return (
    <div class="toolstrip-wrap">
      <Show when={state.tool !== "select"}>
        <div class="tool-panel" role="region" aria-label={`${state.tool} options`}>
          <Show when={state.tool === "measure"}>
            <Show
              when={state.measurement}
              fallback={
                <span>{state.measurePoints === 0 ? "Click the first point on the model" : "Click a second point"} · Esc to exit</span>
              }
            >
              {(m) => (
                <span>
                  <b>{fmt(m().distance)}</b>
                  <Show when={m().parallelDistance !== null}> · parallel faces {fmt(m().parallelDistance!)}</Show> · angle{" "}
                  {m().angleDeg.toFixed(1)}° · click again to restart
                </span>
              )}
            </Show>
          </Show>
          <Show when={state.tool === "section"}>
            <div class="seg" role="group" aria-label="Section axis">
              <For each={["x", "y", "z"] as Axis[]}>
                {(a) => (
                  <button classList={{ on: state.section.axis === a }} onClick={() => setState("section", "axis", a)}>
                    {a.toUpperCase()}
                  </button>
                )}
              </For>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.005"
              value={state.section.offset}
              onInput={(e) => setState("section", "offset", +e.currentTarget.value)}
              aria-label="Section position"
            />
            <label>
              <input type="checkbox" checked={state.section.flip} onChange={(e) => setState("section", "flip", e.currentTarget.checked)} />{" "}
              Flip
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.section.enabled}
                onChange={(e) => setState("section", "enabled", e.currentTarget.checked)}
              />{" "}
              On
            </label>
          </Show>
          <Show when={state.tool === "explode"}>
            <span>Explode</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={state.explode}
              onInput={(e) => setState("explode", +e.currentTarget.value)}
              aria-label="Explode amount"
            />
            <button class="ghost" onClick={() => setState("explode", 0)}>
              Reset
            </button>
          </Show>
        </div>
      </Show>
      <div class="toolstrip" role="toolbar" aria-label="Tools">
        <For each={tools}>
          {(t) => (
            <button
              classList={{ on: state.tool === t.id }}
              onClick={() => (t.id === "select" ? setState("tool", "select") : c.setTool(t.id))}
              title={`${t.label} (${t.keys})`}
              aria-pressed={state.tool === t.id}
            >
              {t.icon()}
              <span>{t.label}</span>
            </button>
          )}
        </For>
        <span class="divider" />
        <button onClick={c.fit} title="Fit (F)">
          <Focus size={18} />
          <span>Fit</span>
        </button>
        <button
          onClick={() => {
            const i = displays.findIndex((d) => d.id === state.settings.display);
            setState("settings", "display", displays[(i + 1) % displays.length].id);
          }}
          title="Display mode"
        >
          <Box size={18} />
          <span>{displays.find((d) => d.id === state.settings.display)?.label}</span>
        </button>
        <button onClick={() => c.screenshot(2)} title="Screenshot (P)">
          <Camera size={18} />
          <span>Shot</span>
        </button>
      </div>
    </div>
  );
}
