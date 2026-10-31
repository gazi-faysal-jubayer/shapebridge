import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { state } from "../state/store";
import * as c from "../controller";
import * as l from "../live";
import { live } from "../live";

// Pins, peers' laser pointers and markups are HTML/SVG drawn over the canvas and re-projected
// whenever the camera moves: no WebGL objects, and they stay readable at any zoom.
export function ReviewOverlay() {
  const [tick, setTick] = createSignal(0);
  onMount(() => onCleanup(c.onCamera(() => setTick((t) => t + 1))));
  const at = (p: [number, number, number]) => (tick(), c.getEngine()?.project(p) ?? null);
  const active = () => live.comments.find((x) => x.id === live.active);
  let svg!: SVGSVGElement;
  let stroke: [number, number][] = [];
  const [drawing, setDrawing] = createSignal<string>("");

  const norm = (e: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1)];
  };
  const path = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * 1000).toFixed(1)} ${(y * 1000).toFixed(1)}`).join(" ");

  return (
    <div class="review-overlay">
      <For each={live.comments}>
        {(cm, i) => (
          <Show when={cm.point && at(cm.point)}>
            {(xy) => (
              <button
                class="pin"
                classList={{ resolved: cm.resolved, active: live.active === cm.id }}
                style={{ left: `${xy()[0]}px`, top: `${xy()[1]}px`, background: cm.color }}
                onClick={() => l.focusComment(cm.id)}
                title={`${cm.author}: ${cm.text}`}
              >
                {i() + 1}
              </button>
            )}
          </Show>
        )}
      </For>

      <For each={Object.entries(live.pointers)}>
        {([, ptr]) => (
          <Show when={at(ptr.p)}>
            {(xy) => (
              <div class="laser" style={{ left: `${xy()[0]}px`, top: `${xy()[1]}px`, "--c": ptr.color }}>
                <span>{ptr.name}</span>
              </div>
            )}
          </Show>
        )}
      </For>

      <svg
        ref={svg}
        class="markup"
        classList={{ drawing: state.tool === "markup" }}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        onPointerDown={(e) => {
          if (state.tool !== "markup") return;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          stroke = [norm(e)];
          setDrawing(path(stroke));
        }}
        onPointerMove={(e) => {
          if (!stroke.length) return;
          stroke.push(norm(e));
          setDrawing(path(stroke));
        }}
        onPointerUp={() => {
          l.addStroke(stroke);
          stroke = [];
          setDrawing("");
        }}
      >
        <For each={live.draft?.strokes ?? []}>{(s) => <path d={path(s)} />}</For>
        <Show when={drawing()}>
          <path d={drawing()} />
        </Show>
        <Show when={active()}>{(a) => <For each={a().strokes}>{(s) => <path d={path(s)} style={{ stroke: a().color }} />}</For>}</Show>
      </svg>

      <Show when={live.draft}>
        <Draft />
      </Show>
      <Show when={live.laser}>
        <div class="hint-pill">Laser pointer on: everyone in the review sees it</div>
      </Show>
    </div>
  );
}

function Draft() {
  let input!: HTMLTextAreaElement;
  onMount(() => input.focus());
  return (
    <form
      class="draft"
      onSubmit={(e) => {
        e.preventDefault();
        l.submitDraft(input.value);
      }}
    >
      <b>{live.draft?.strokes.length ? `Markup · ${live.draft.strokes.length} stroke(s)` : "New comment"}</b>
      <textarea
        ref={input}
        rows={3}
        maxLength={2000}
        placeholder="What should change?"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) l.submitDraft(input.value);
          if (e.key === "Escape") l.cancelDraft();
        }}
      />
      <div class="row">
        <button type="button" onClick={l.cancelDraft}>
          Cancel
        </button>
        <button class="primary" type="submit">
          Post (Ctrl+Enter)
        </button>
      </div>
    </form>
  );
}
