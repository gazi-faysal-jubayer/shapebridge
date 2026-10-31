import { createSignal, For, Index, Match, Show, Switch, type JSX } from "solid-js";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import Plus from "lucide-solid/icons/plus";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import Eye from "lucide-solid/icons/eye";
import EyeOff from "lucide-solid/icons/eye-off";
import X from "lucide-solid/icons/x";
import Undo2 from "lucide-solid/icons/undo-2";
import Redo2 from "lucide-solid/icons/redo-2";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { targets } from "../interop";
import { templates, type Doc, type Feature, type Kind, type Profile } from "../model/doc";
import { addParam, deleteFeature, deleteParam, moveFeature, newFeature, renameParam, splitPair, toggleSuppressed } from "../model/edit";
import { state } from "../state/store";
import { formatLength } from "../viewer/math";
import * as c from "../controller";

const kinds: { kind: Kind | "cut"; label: string }[] = [
  { kind: "extrude", label: "Extrude (add)" },
  { kind: "cut", label: "Extrude cut" },
  { kind: "revolve", label: "Revolve" },
  { kind: "hole", label: "Hole" },
  { kind: "fillet", label: "Fillet" },
  { kind: "chamfer", label: "Chamfer" },
  { kind: "shell", label: "Shell" },
  { kind: "pattern", label: "Pattern" },
  { kind: "mirror", label: "Mirror" },
];

export function Designer() {
  const [selected, setSelected] = createSignal<string | null>(null);
  return (
    <Show when={c.doc()} fallback={<Templates />}>
      {(d) => (
        <div class="designer">
          <div class="designer-bar">
            <b>{d().name}</b>
            <span class="spacer" />
            <button class="ghost" disabled={!c.canUndo()} onClick={c.undo} title="Undo (Ctrl+Z)" aria-label="Undo">
              <Undo2 size={15} />
            </button>
            <button class="ghost" disabled={!c.canRedo()} onClick={c.redo} title="Redo (Ctrl+Y)" aria-label="Redo">
              <Redo2 size={15} />
            </button>
          </div>

          <h3>Parameters</h3>
          <table class="params">
            <tbody>
              <Index each={d().params}>
                {(p, i) => (
                  <tr>
                    <td>
                      <input
                        class="name"
                        value={p().name}
                        onChange={(e) => c.updateDoc((x) => renameParam(x, p().name, e.currentTarget.value.trim()))}
                        aria-label={`Name of parameter ${p().name}`}
                        title={p().note}
                      />
                    </td>
                    <td>
                      <input
                        value={p().expr}
                        onInput={(e) => c.editParam(i, e.currentTarget.value)}
                        aria-label={`${p().name} expression`}
                      />
                    </td>
                    <td class="num">{c.paramValues()[p().name]?.toFixed(2) ?? "—"}</td>
                    <td>
                      <button class="ghost" onClick={() => c.updateDoc((x) => deleteParam(x, p().name))} aria-label={`Delete ${p().name}`}>
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
          <button class="ghost add" onClick={() => c.updateDoc(addParam)}>
            <Plus size={14} /> Add parameter
          </button>

          <div class="row-head">
            <h3>Features</h3>
            <DropdownMenu>
              <DropdownMenu.Trigger class="ghost add">
                <Plus size={14} /> Add
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="menu">
                  <For each={kinds}>
                    {(k) => (
                      <DropdownMenu.Item
                        class="menu-item"
                        onSelect={() => {
                          const f = newFeature(d(), k.kind);
                          c.updateDoc((x) => ({ ...x, features: [...x.features, f], rollback: undefined }));
                          setSelected(f.id);
                        }}
                      >
                        {k.label}
                      </DropdownMenu.Item>
                    )}
                  </For>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </div>
          <ol class="features">
            <For each={d().features}>
              {(f, i) => {
                const off = () => d().suppressed?.includes(f.id);
                const rolled = () => d().rollback !== undefined && i() >= d().rollback!;
                const failed = () => c.docError().startsWith(`${f.id}:`);
                return (
                  <li classList={{ selected: selected() === f.id, off: off() || rolled(), failed: failed() }}>
                    <button class="label" onClick={() => setSelected(selected() === f.id ? null : f.id)}>
                      <span class="kind">{label(f)}</span> <code>{f.id}</code>
                    </button>
                    <span class="actions">
                      <button class="ghost" onClick={() => c.updateDoc((x) => moveFeature(x, i(), -1))} aria-label={`Move ${f.id} up`}>
                        <ArrowUp size={13} />
                      </button>
                      <button class="ghost" onClick={() => c.updateDoc((x) => moveFeature(x, i(), 1))} aria-label={`Move ${f.id} down`}>
                        <ArrowDown size={13} />
                      </button>
                      <button
                        class="ghost"
                        onClick={() => c.updateDoc((x) => ({ ...x, rollback: x.rollback === i() + 1 ? undefined : i() + 1 }))}
                        title="Roll back to after this feature"
                        aria-label={`Roll back to ${f.id}`}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        class="ghost"
                        onClick={() => c.updateDoc((x) => toggleSuppressed(x, f.id))}
                        aria-label={off() ? `Unsuppress ${f.id}` : `Suppress ${f.id}`}
                      >
                        <Show when={off()} fallback={<Eye size={13} />}>
                          <EyeOff size={13} />
                        </Show>
                      </button>
                      <button class="ghost" onClick={() => c.updateDoc((x) => deleteFeature(x, f.id))} aria-label={`Delete ${f.id}`}>
                        <X size={13} />
                      </button>
                    </span>
                    <Show when={selected() === f.id}>
                      <FeatureForm index={i()} feature={f} doc={d()} />
                    </Show>
                  </li>
                );
              }}
            </For>
          </ol>
          <Show when={d().rollback !== undefined}>
            <p class="muted small">
              Rolled back: later features are skipped.{" "}
              <button class="link" onClick={() => c.updateDoc((x) => ({ ...x, rollback: undefined }))}>
                Roll forward
              </button>
            </p>
          </Show>
          <Show when={c.docError()}>
            <p class="error" role="alert">
              {c.docError()}
            </p>
          </Show>

          <Show when={c.measures()}>
            {(m) => {
              const fmt = (v: number, p: 1 | 2 | 3 = 1) => formatLength(v, "Millimeter", state.settings.units, p);
              return (
                <>
                  <h3>Exact properties</h3>
                  <dl class="measures">
                    <dt>Volume</dt>
                    <dd>{fmt(m().volume, 3)}</dd>
                    <dt>Surface area</dt>
                    <dd>{fmt(m().area, 2)}</dd>
                    <dt>Size</dt>
                    <dd>{[0, 1, 2].map((k) => fmt(m().bbox[1][k] - m().bbox[0][k])).join(" × ")}</dd>
                    <dt>Centre of mass</dt>
                    <dd>
                      {m()
                        .centerOfMass.map((v) => fmt(v))
                        .join(", ")}
                    </dd>
                  </dl>
                </>
              );
            }}
          </Show>

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

const label = (f: Feature) =>
  f.kind === "extrude"
    ? f.op === "cut"
      ? "Cut"
      : "Extrude"
    : f.kind === "pattern"
      ? `${f.mode === "linear" ? "Linear" : "Polar"} pattern`
      : f.kind[0].toUpperCase() + f.kind.slice(1);

// ---------- feature form ----------

function FeatureForm(props: { index: number; feature: Feature; doc: Doc }) {
  // writes one field of this feature; `path` walks into nested objects such as plane or profile
  const set = (path: (string | number)[], value: unknown) =>
    c.updateDoc((d) => {
      if (path.length === 0) return (d.features[props.index] = value as Feature), d;
      let node = d.features[props.index] as unknown as Record<string | number, unknown>;
      for (const k of path.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
      node[path.at(-1)!] = value;
      return d;
    });
  const f = () => props.feature;
  const expr = (labelText: string, path: (string | number)[], value: string) => (
    <label class="field">
      <span>{labelText}</span>
      <input value={value} onChange={(e) => set(path, e.currentTarget.value)} />
    </label>
  );
  const choice = (labelText: string, path: (string | number)[], value: string, options: [string, string][]) => (
    <label class="field">
      <span>{labelText}</span>
      <select value={value} onChange={(e) => set(path, e.currentTarget.value)}>
        <For each={options}>{([v, l]) => <option value={v} selected={v === value}>{l}</option>}</For>
      </select>
    </label>
  );
  const planeFields = (base: string, offset: string) => (
    <>
      {choice("Sketch plane", ["plane", "base"], base, [
        ["XY", "XY (top)"],
        ["XZ", "XZ (front)"],
        ["YZ", "YZ (right)"],
      ])}
      {expr("Plane offset", ["plane", "offset"], offset)}
    </>
  );
  const profileFields = (p: Profile): JSX.Element => (
    <>
      <label class="field">
        <span>Profile</span>
        <select value={p.type} onChange={(e) => set(["profile"], defaultProfile(e.currentTarget.value as Profile["type"]))}>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="polygon">Regular polygon</option>
          <option value="polyline">Polyline</option>
        </select>
      </label>
      <Switch>
        <Match when={p.type === "rect" && p}>
          {(r) => (
            <>
              {expr("Corner u", ["profile", "x"], r().x)}
              {expr("Corner v", ["profile", "y"], r().y)}
              {expr("Width", ["profile", "w"], r().w)}
              {expr("Height", ["profile", "h"], r().h)}
            </>
          )}
        </Match>
        <Match when={(p.type === "circle" || p.type === "polygon") && p}>
          {(r) => (
            <>
              {expr("Centre u", ["profile", "cx"], r().cx)}
              {expr("Centre v", ["profile", "cy"], r().cy)}
              {expr("Radius", ["profile", "r"], r().r)}
              <Show when={r().type === "polygon"}>
                <label class="field">
                  <span>Sides</span>
                  <input
                    type="number"
                    min="3"
                    max="64"
                    value={(r() as { sides: number }).sides}
                    onChange={(e) => set(["profile", "sides"], Math.round(+e.currentTarget.value))}
                  />
                </label>
              </Show>
            </>
          )}
        </Match>
        <Match when={p.type === "polyline" && p}>
          {(r) => <PointList label="Points (u, v per line)" value={r().points} onChange={(pts) => set(["profile", "points"], pts)} />}
        </Match>
      </Switch>
    </>
  );

  return (
    <div class="feature-form">
      <Switch>
        <Match when={f().kind === "extrude" && (f() as Extract<Feature, { kind: "extrude" }>)}>
          {(x) => (
            <>
              {choice("Operation", ["op"], x().op, [
                ["add", "Add material"],
                ["cut", "Cut material"],
              ])}
              {planeFields(x().plane.base, x().plane.offset)}
              {profileFields(x().profile)}
              {expr("Distance", ["distance"], x().distance)}
              <label class="field check">
                <input type="checkbox" checked={!!x().symmetric} onChange={(e) => set(["symmetric"], e.currentTarget.checked)} /> Symmetric
                about the plane
              </label>
            </>
          )}
        </Match>
        <Match when={f().kind === "revolve" && (f() as Extract<Feature, { kind: "revolve" }>)}>
          {(x) => (
            <>
              {choice("Operation", ["op"], x().op, [
                ["add", "Add material"],
                ["cut", "Cut material"],
              ])}
              {planeFields(x().plane.base, x().plane.offset)}
              {profileFields(x().profile)}
              {expr("Angle (°)", ["angle"], x().angle)}
              <p class="muted small">Spins about the sketch's vertical axis (u = 0). Keep the profile at u ≥ 0.</p>
            </>
          )}
        </Match>
        <Match when={f().kind === "hole" && (f() as Extract<Feature, { kind: "hole" }>)}>
          {(x) => (
            <>
              {planeFields(x().plane.base, x().plane.offset)}
              <PointList label="Positions (u, v per line)" value={x().points} onChange={(pts) => set(["points"], pts)} />
              {choice("Style", ["style"], x().style, [
                ["simple", "Simple"],
                ["counterbore", "Counterbore"],
                ["countersink", "Countersink (90°)"],
              ])}
              {expr("Diameter", ["diameter"], x().diameter)}
              {expr("Depth", ["depth"], x().depth)}
              <Show when={x().style !== "simple"}>{expr("Head diameter", ["headDiameter"], x().headDiameter ?? "10")}</Show>
              <Show when={x().style === "counterbore"}>{expr("Head depth", ["headDepth"], x().headDepth ?? "3")}</Show>
            </>
          )}
        </Match>
        <Match when={(f().kind === "fillet" || f().kind === "chamfer") && (f() as Extract<Feature, { kind: "fillet" | "chamfer" }>)}>
          {(x) => (
            <>
              {x().kind === "fillet"
                ? expr("Radius", ["radius"], (x() as { radius: string }).radius)
                : expr("Distance", ["distance"], (x() as { distance: string }).distance)}
              {choice("Edges", ["edges"], x().edges, [
                ["vertical", "Vertical edges"],
                ["top", "Top face edges"],
                ["bottom", "Bottom face edges"],
                ["all", "All edges"],
              ])}
            </>
          )}
        </Match>
        <Match when={f().kind === "shell" && (f() as Extract<Feature, { kind: "shell" }>)}>
          {(x) => (
            <>
              {expr("Wall thickness", ["thickness"], x().thickness)}
              {choice("Open face", ["open"], x().open, [
                ["top", "Top"],
                ["bottom", "Bottom"],
              ])}
            </>
          )}
        </Match>
        <Match when={f().kind === "pattern" && (f() as Extract<Feature, { kind: "pattern" }>)}>
          {(x) => (
            <>
              {choice(
                "Copies of",
                ["target"],
                x().target,
                props.doc.features
                  .slice(0, props.index)
                  .filter((t) => ["extrude", "revolve", "hole"].includes(t.kind))
                  .map((t) => [t.id, t.id]),
              )}
              <label class="field">
                <span>Type</span>
                <select
                  value={x().mode}
                  onChange={(e) =>
                    set(
                      [],
                      e.currentTarget.value === "linear"
                        ? { id: x().id, kind: "pattern", target: x().target, mode: "linear", dx: "15", dy: "0", dz: "0", count: x().count }
                        : { id: x().id, kind: "pattern", target: x().target, mode: "polar", cx: "0", cy: "0", count: x().count },
                    )
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="polar">Polar (around Z)</option>
                </select>
              </label>
              {expr("Count", ["count"], x().count)}
              <Show when={x().mode === "linear" && (x() as Extract<Feature, { mode: "linear" }>)}>
                {(l) => (
                  <>
                    {expr("Step X", ["dx"], l().dx)}
                    {expr("Step Y", ["dy"], l().dy)}
                    {expr("Step Z", ["dz"], l().dz)}
                  </>
                )}
              </Show>
              <Show when={x().mode === "polar" && (x() as Extract<Feature, { mode: "polar" }>)}>
                {(p) => (
                  <>
                    {expr("Centre X", ["cx"], p().cx)}
                    {expr("Centre Y", ["cy"], p().cy)}
                  </>
                )}
              </Show>
            </>
          )}
        </Match>
        <Match when={f().kind === "mirror" && (f() as Extract<Feature, { kind: "mirror" }>)}>
          {(x) =>
            choice("Mirror plane", ["plane"], x().plane, [
              ["YZ", "YZ (left ↔ right)"],
              ["XZ", "XZ (front ↔ back)"],
              ["XY", "XY (top ↔ bottom)"],
            ])
          }
        </Match>
      </Switch>
    </div>
  );
}

function defaultProfile(type: Profile["type"]): Profile {
  if (type === "rect") return { type, x: "0", y: "0", w: "20", h: "20" };
  if (type === "circle") return { type, cx: "0", cy: "0", r: "10" };
  if (type === "polygon") return { type, cx: "0", cy: "0", r: "10", sides: 6 };
  return {
    type: "polyline",
    points: [
      ["0", "0"],
      ["20", "0"],
      ["0", "20"],
    ],
  };
}

function PointList(props: { label: string; value: [string, string][]; onChange: (pts: [string, string][]) => void }) {
  const text = () => props.value.map((p) => p.join(", ")).join("\n");
  return (
    <label class="field">
      <span>{props.label}</span>
      <textarea
        rows={Math.min(Math.max(props.value.length, 2), 8)}
        value={text()}
        onChange={(e) => {
          // split on the first top-level comma so expressions like max(a, b) survive
          const pts = e.currentTarget.value
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => splitPair(l));
          if (pts.every((p) => p !== null)) props.onChange(pts as [string, string][]);
        }}
      />
    </label>
  );
}

function Templates() {
  return (
    <div class="pad">
      <p class="muted">
        Start from a template. Every dimension is a named parameter you can export to FreeCAD, OpenSCAD, CadQuery or Fusion 360 and keep
        editing there.
      </p>
      <div class="templates">
        <For each={templates}>
          {(t) => (
            <button onClick={() => c.loadDoc(t)}>
              <b>{t.name}</b>
              <span>
                {t.features
                  .map((f) => f.kind)
                  .filter((k, i, a) => a.indexOf(k) === i)
                  .join(" · ")}
              </span>
            </button>
          )}
        </For>
      </div>
      <Show when={c.hasAutosave()}>
        <button class="link" onClick={c.restoreAutosave}>
          Restore the last design you worked on
        </button>
      </Show>
    </div>
  );
}
