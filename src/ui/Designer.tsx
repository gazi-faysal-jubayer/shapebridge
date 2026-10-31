import { createSignal, For, Index, Match, Show, Switch, type JSX } from "solid-js";
import { ContextMenu } from "@kobalte/core/context-menu";
import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import Check from "lucide-solid/icons/check";
import { templates, type Doc, type Feature, type Profile } from "../model/doc";
import { addParam, deleteFeature, deleteParam, moveFeature, renameFeature, renameParam, splitPair, toggleSuppressed } from "../model/edit";
import { Icon, type IconName } from "./icons";
import * as c from "../controller";

const ICON: Record<Feature["kind"], IconName> = {
  extrude: "extrude",
  revolve: "revolve",
  hole: "hole",
  fillet: "fillet",
  chamfer: "chamfer",
  shell: "shell",
  pattern: "linearPattern",
  mirror: "mirror",
};
const iconOf = (f: Feature): IconName =>
  f.kind === "extrude" && f.op === "cut" ? "cut" : f.kind === "pattern" && f.mode === "polar" ? "polarPattern" : ICON[f.kind];

export const label = (f: Feature) =>
  f.kind === "extrude"
    ? f.op === "cut"
      ? "Cut-Extrude"
      : "Boss-Extrude"
    : f.kind === "pattern"
      ? `${f.mode === "linear" ? "Linear" : "Circular"} pattern`
      : f.kind[0].toUpperCase() + f.kind.slice(1);

/** Left "Design" tab: the FeatureManager tree, or the PropertyManager while something is being edited. */
export function Designer() {
  return (
    <Show when={c.doc()} fallback={<Templates />}>
      <Show when={c.editing()} fallback={<FeatureManager />}>
        <PropertyManager />
      </Show>
    </Show>
  );
}

function FeatureManager() {
  const d = () => c.doc()!;
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const [dragAt, setDragAt] = createSignal<number | null>(null);
  const rollback = () => dragAt() ?? d().rollback ?? d().features.length;
  const setRollback = (i: number) =>
    c.updateDoc((x) => ({
      ...x,
      rollback: i >= x.features.length ? undefined : Math.max(0, i),
    }));
  let list!: HTMLOListElement;

  // dragging the rollback bar: find the row under the pointer, preview there, commit on release
  const dragBar = (e: PointerEvent) => {
    e.preventDefault();
    const rows = () => [...list.querySelectorAll<HTMLElement>("li.feature")];
    const move = (ev: PointerEvent) => {
      const i = rows().findIndex((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      setDragAt(i === -1 ? rows().length : i);
    };
    // window listeners: the bar re-renders under the pointer while dragging, so it can't own the gesture
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (dragAt() !== null) setRollback(dragAt()!);
      setDragAt(null);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  return (
    <div class="feature-manager">
      <div class="fm-head">
        <Icon name="part" size={18} />
        <b>{d().name}</b>
        <span class="spacer" />
        <button class="ghost" disabled={!c.canUndo()} onClick={c.undo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" size={16} />
        </button>
        <button class="ghost" disabled={!c.canRedo()} onClick={c.redo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Icon name="redo" size={16} />
        </button>
      </div>
      <ul class="fm-tree" role="tree" aria-label="Part structure">
        <li role="treeitem">
          <button class="fm-row" onClick={() => c.beginEdit("equations")}>
            <Icon name="equations" size={18} /> Equations ({d().params.length})
          </button>
        </li>
        <li role="treeitem" aria-expanded="true">
          <div class="fm-row static">
            <Icon name="origin" size={18} /> Origin
          </div>
          <ul role="group">
            <For each={PLANES}>
              {([name, view]) => (
                <li role="treeitem">
                  <button class="fm-row child" onClick={() => c.setView(view)} title="Look at this plane">
                    <Icon name="plane" size={16} /> {name}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </li>
      </ul>
      <ol class="fm-tree features" ref={list} aria-label="Features">
        <For each={d().features}>
          {(f, i) => {
            const off = () => d().suppressed?.includes(f.id);
            const rolled = () => i() >= rollback();
            const failed = () => c.docError().startsWith(`${f.id}:`);
            return (
              <>
                <Show when={rollback() === i()}>
                  <RollbackBar onPointerDown={dragBar} onKey={(by) => setRollback(rollback() + by)} />
                </Show>
                <ContextMenu>
                  <ContextMenu.Trigger as="li" class="feature" classList={{ off: off() || rolled(), failed: failed() }}>
                    <Show
                      when={renaming() === f.id}
                      fallback={
                        <button
                          class="fm-row"
                          onClick={() => c.beginEdit({ id: f.id })}
                          onDblClick={() => setRenaming(f.id)}
                          title={failed() ? c.docError() : `${label(f)}: click to edit, double-click to rename, right-click for more`}
                        >
                          <Icon name={iconOf(f)} size={18} />
                          <span>{f.id}</span>
                          <Show when={failed()}>
                            <span class="fm-error" aria-label="Failed">
                              !
                            </span>
                          </Show>
                        </button>
                      }
                    >
                      <input
                        class="fm-rename"
                        value={f.id}
                        ref={(el) => setTimeout(() => el.select())}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setRenaming(null);
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        onBlur={(e) => {
                          const name = e.currentTarget.value.trim();
                          setRenaming(null);
                          if (name && name !== f.id) c.updateDoc((x) => renameFeature(x, f.id, name));
                        }}
                        aria-label={`Rename ${f.id}`}
                      />
                    </Show>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content class="menu">
                      <ContextMenu.Item class="menu-item" onSelect={() => c.beginEdit({ id: f.id })}>
                        Edit feature
                      </ContextMenu.Item>
                      <ContextMenu.Item class="menu-item" onSelect={() => setRenaming(f.id)}>
                        Rename
                      </ContextMenu.Item>
                      <ContextMenu.Item class="menu-item" onSelect={() => c.updateDoc((x) => toggleSuppressed(x, f.id))}>
                        {off() ? "Unsuppress" : "Suppress"}
                      </ContextMenu.Item>
                      <ContextMenu.Item class="menu-item" onSelect={() => setRollback(i())}>
                        Roll back to here
                      </ContextMenu.Item>
                      <ContextMenu.Separator class="menu-sep" />
                      <ContextMenu.Item class="menu-item" onSelect={() => c.updateDoc((x) => moveFeature(x, i(), -1))}>
                        Move up
                      </ContextMenu.Item>
                      <ContextMenu.Item class="menu-item" onSelect={() => c.updateDoc((x) => moveFeature(x, i(), 1))}>
                        Move down
                      </ContextMenu.Item>
                      <ContextMenu.Separator class="menu-sep" />
                      <ContextMenu.Item class="menu-item" onSelect={() => c.updateDoc((x) => deleteFeature(x, f.id))}>
                        Delete
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu>
              </>
            );
          }}
        </For>
        <Show when={rollback() >= d().features.length}>
          <RollbackBar onPointerDown={dragBar} onKey={(by) => setRollback(rollback() + by)} />
        </Show>
      </ol>
      <Show when={!d().features.length}>
        <p class="muted small pad">Start with a sketch or a feature from the Features tab of the command bar.</p>
      </Show>
      <Show when={c.docError()}>
        <p class="error small pad" role="alert">
          {c.docError()}
        </p>
      </Show>
    </div>
  );
}

const PLANES = [
  ["Front plane (XZ)", "front"],
  ["Top plane (XY)", "top"],
  ["Right plane (YZ)", "right"],
] as const;

function RollbackBar(props: { onPointerDown: (e: PointerEvent) => void; onKey: (by: -1 | 1) => void }) {
  return (
    <li
      class="rollback-bar"
      role="separator"
      tabIndex={0}
      aria-label="Rollback bar: features below it are skipped. Drag, or use the arrow keys."
      title="Rollback bar: drag to roll the part back"
      onPointerDown={props.onPointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") (e.preventDefault(), props.onKey(-1));
        if (e.key === "ArrowDown") (e.preventDefault(), props.onKey(1));
      }}
    />
  );
}

function PropertyManager() {
  const target = () => c.editing();
  const feature = () => {
    const t = target();
    return t && t !== "equations" ? c.doc()!.features.find((f) => f.id === t.id) : undefined;
  };
  const index = () => c.doc()!.features.findIndex((f) => f === feature());
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") (e.preventDefault(), c.cancelEdit());
    // Enter commits a field (change event) first, then closes like OK
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") ((e.target as HTMLElement).blur?.(), c.okEdit());
  };
  return (
    <div class="property-manager" onKeyDown={onKey}>
      <div class="pm-head">
        <Icon name={target() === "equations" ? "equations" : feature() ? iconOf(feature()!) : "part"} size={22} />
        <div>
          <b>{target() === "equations" ? "Equations" : feature() ? label(feature()!) : "Feature"}</b>
          <Show when={feature()}>
            <div class="muted small">{feature()!.id}</div>
          </Show>
        </div>
        <span class="spacer" />
        <button class="pm-ok" onClick={c.okEdit} title="OK (Enter)" aria-label="OK">
          <Check size={18} />
        </button>
        <button class="pm-cancel" onClick={c.cancelEdit} title="Cancel (Esc): undo the changes made here" aria-label="Cancel">
          <X size={18} />
        </button>
      </div>
      <Show when={target() === "equations"}>
        <section class="pm-section">
          <h3>Parameters</h3>
          <Equations />
        </section>
      </Show>
      <Show when={feature()}>
        {(f) => (
          <section class="pm-section">
            <h3>
              {f().kind === "fillet" || f().kind === "chamfer" ? "Items to modify" : f().kind === "pattern" ? "Direction" : "Definition"}
            </h3>
            <FeatureForm index={index()} feature={f()} doc={c.doc()!} />
          </section>
        )}
      </Show>
      <Show when={c.docError()}>
        <p class="error small pad" role="alert">
          {c.docError()}
        </p>
      </Show>
    </div>
  );
}

function Equations() {
  const d = () => c.doc()!;
  return (
    <>
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
                  <input value={p().expr} onInput={(e) => c.editParam(i, e.currentTarget.value)} aria-label={`${p().name} expression`} />
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
    </>
  );
}
// ---------- feature form ----------

function FeatureForm(props: { index: number; feature: Feature; doc: Doc }) {
  // writes one field of this feature; `path` walks into nested objects such as plane or profile
  const set = (path: (string | number)[], value: unknown) =>
    c.updateDoc((d) => {
      if (path.length === 0) return ((d.features[props.index] = value as Feature), d);
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
        <For each={options}>
          {([v, l]) => (
            <option value={v} selected={v === value}>
              {l}
            </option>
          )}
        </For>
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
