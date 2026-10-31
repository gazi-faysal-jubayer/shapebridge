import { For, Show } from "solid-js";
import { setState, state, type Units } from "../state/store";
import { formatLength } from "../viewer/math";

export function Properties() {
  const fmt = (v: number, power: 1 | 2 | 3 = 1) => formatLength(v, state.modelUnit, state.settings.units, power);
  return (
    <div class="props">
      <header class="props-head">
        <h2>Properties</h2>
        <label class="units">
          Units
          <select value={state.settings.units} onChange={(e) => setState("settings", "units", e.currentTarget.value as Units)}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="in">in</option>
          </select>
        </label>
      </header>
      <Show when={state.props} fallback={<p class="muted">Open a model to see its properties.</p>}>
        {(p) => (
          <>
            <dl>
              <dt>Selection</dt>
              <dd>{p().name}</dd>
              <dt>Size X × Y × Z</dt>
              <dd>
                {p()
                  .size.map((v) => fmt(v))
                  .join(" × ")}
              </dd>
              <dt>Surface area</dt>
              <dd>{p().area !== null ? fmt(p().area!, 2) : "—"}</dd>
              <dt>Volume</dt>
              <dd title={p().volume === null ? "Only shown for closed (watertight) meshes" : undefined}>
                {p().volume !== null ? fmt(p().volume!, 3) : "not closed"}
              </dd>
              <dt>Triangles</dt>
              <dd>{p().triangles.toLocaleString()}</dd>
              <dt>Vertices</dt>
              <dd>{p().vertices.toLocaleString()}</dd>
              <dt>File unit</dt>
              <dd>{state.modelUnit === "Unknown" ? "not stated (assumed mm)" : state.modelUnit}</dd>
            </dl>
            <Show when={p().properties.length}>
              <h3>File properties</h3>
              <dl>
                <For each={p().properties}>
                  {(row) => (
                    <>
                      <dt title={row.group}>{row.name}</dt>
                      <dd>{row.value}</dd>
                    </>
                  )}
                </For>
              </dl>
            </Show>
          </>
        )}
      </Show>
      <Show when={state.measurement}>
        {(m) => (
          <>
            <h3>Measurement</h3>
            <dl>
              <dt>Distance</dt>
              <dd>{fmt(m().distance)}</dd>
              <Show when={m().parallelDistance !== null}>
                <dt>Parallel faces</dt>
                <dd>{fmt(m().parallelDistance!)}</dd>
              </Show>
              <dt>Angle between faces</dt>
              <dd>{m().angleDeg.toFixed(1)}°</dd>
            </dl>
          </>
        )}
      </Show>
    </div>
  );
}
