import { Show } from "solid-js";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { state } from "../state/store";
import { convert } from "../viewer/math";
import * as c from "../controller";

export function StatusBar() {
  const coord = (v: number) => convert(v, state.modelUnit, state.settings.units).toFixed(2);
  return (
    <footer class="statusbar">
      <span class="status-msg" aria-live="polite">
        {state.loading ? "Loading…" : state.status || "Ready"}
      </span>
      <span class="spacer" />
      <Show when={state.hover}>{(h) => <span class="mono">{h().map(coord).join(", ")}</span>}</Show>
      <Show when={state.files.length}>
        <span>
          {state.stats.parts} parts · {state.stats.triangles.toLocaleString()} tris
          {state.selection.length ? ` · ${state.selection.length} selected` : ""}
        </span>
      </Show>
      <span>{state.settings.units}</span>
      <Show when={c.shareLink()}>
        <span class="live">● Live · {c.peers()} viewer(s)</span>
      </Show>
      <span class="local" title="Files are opened in this app only. Nothing is uploaded; live share is peer-to-peer.">
        <ShieldCheck size={13} /> Local only
      </span>
    </footer>
  );
}
