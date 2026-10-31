import { Show } from "solid-js";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { state } from "../state/store";
import { convert } from "../viewer/math";
import { live } from "../live";
import * as c from "../controller";

const TOOL_HINT: Partial<Record<string, string>> = {
  measure: "Measure: pick two points",
  section: "Section: drag the slider",
  explode: "Explode: drag the slider",
  comment: "Comment: click the model",
  markup: "Markup: draw on the view",
};
/** "Viewing", "Editing part", "Editing hole1" or the active tool, like a CAD status bar. */
const context = () => {
  const e = c.editing();
  if (TOOL_HINT[state.tool]) return TOOL_HINT[state.tool];
  if (e) return e === "equations" ? "Editing equations" : `Editing ${e.id}`;
  return c.doc() ? `Editing part ${c.doc()!.name}` : state.files.length ? "Viewing" : "";
};

export function StatusBar() {
  const coord = (v: number) => convert(v, state.modelUnit, state.settings.units).toFixed(2);
  return (
    <footer class="statusbar">
      <span class="status-msg" classList={{ busy: state.loading || c.busy() }} aria-live="polite">
        {state.loading ? "Loading…" : state.status || "Ready"}
      </span>
      <span class="spacer" />
      <span class="context" title="Editing context">
        {context()}
      </span>
      <Show when={state.hover}>{(h) => <span class="mono">{h().map(coord).join(", ")}</span>}</Show>
      <Show when={state.files.length}>
        <span>
          {state.stats.parts} parts · {state.stats.triangles.toLocaleString()} tris
          {state.selection.length ? ` · ${state.selection.length} selected` : ""}
        </span>
      </Show>
      <span>{state.settings.units}</span>
      <Show when={live.role !== "none"}>
        <span class="live">
          ● Live · {live.peers.length} {live.role === "host" ? "viewer(s)" : "in review"}
        </span>
      </Show>
      <span class="local" title="Files are opened in this app only. Nothing is uploaded; live share is peer-to-peer.">
        <ShieldCheck size={13} /> Local only
      </span>
    </footer>
  );
}
