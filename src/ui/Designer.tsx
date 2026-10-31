import { For, Show } from "solid-js";
import { targets } from "../interop";
import * as c from "../controller";

export function Designer() {
  return (
    <Show when={c.doc()} fallback={<NoDoc />}>
      {(d) => (
        <div class="designer">
          <h3>Parameters</h3>
          <table>
            <tbody>
              <For each={d().params}>
                {(p, i) => (
                  <tr>
                    <th title={p.note}>{p.name}</th>
                    <td>
                      <input value={p.expr} onInput={(e) => c.editParam(i(), e.currentTarget.value)} aria-label={`${p.name} expression`} />
                    </td>
                    <td class="num">{c.paramValues()[p.name]?.toFixed(2) ?? "—"}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={c.docError()}>
            <p class="error" role="alert">
              {c.docError()}
            </p>
          </Show>
          <h3>Features</h3>
          <ol class="features">
            <For each={d().features}>
              {(f) => (
                <li>
                  {f.op === "cut" ? "−" : "+"} {f.kind} <code>{f.id}</code>
                </li>
              )}
            </For>
          </ol>
          <h3>Export, parameters stay editable</h3>
          <div class="grid">
            <For each={targets}>{(t) => <button onClick={() => c.exportInterop(t.id)}>{t.label}</button>}</For>
            <button disabled={!c.step() || c.busy()} onClick={() => c.exportInterop("step")}>
              STEP (exact solid)
            </button>
            <button onClick={() => c.exportInterop("json")}>ShapeBridge .json</button>
          </div>
        </div>
      )}
    </Show>
  );
}

function NoDoc() {
  return (
    <div class="pad">
      <p class="muted">
        Design a part with named parameters, then export it to FreeCAD, OpenSCAD, CadQuery or Fusion 360 with the parameters still editable.
      </p>
      <button class="primary" onClick={() => c.loadDoc()}>
        New parametric part
      </button>
    </div>
  );
}
