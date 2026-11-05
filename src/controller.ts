// App actions: everything the UI can do goes through here, so menus, shortcuts and the command
// palette share one implementation. Owns the lazily-loaded 3D engine.
import { createEffect, createSignal, on } from "solid-js";
import { loadViews, setState, state, storeViews, type StdView, type Tool } from "./state/store";
import type { Engine, MeshExt } from "./viewer/engine";
import { saveFile } from "./platform/save";
import { nativeView } from "./platform/native";
import { vendorFileMessage } from "./platform/vendor";
import { migrate, resolve, type Doc, type Feature } from "./model/doc";
import { newFeature } from "./model/edit";
import type { Measures } from "./kernel/build";
import { targets } from "./interop";
import { build } from "./kernel/protocol";

let engine: Engine | undefined;

// ---------- engine lifecycle ----------

export async function mountViewer(el: HTMLElement) {
  const { Engine } = await import("./viewer/engine");
  engine = new Engine(el, {
    onPick: (key, additive) => {
      if (!key) return additive || setState("selection", []);
      const sel = state.selection;
      setState("selection", additive ? (sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]) : [key]);
    },
    onHover: (p, scene) => setState({ hover: p, hoverScene: scene }),
    onPlace: (p) => placeHandler(p),
    onContext: (x, y, key) => {
      // like CAD tools: right-clicking an unselected part selects it first
      if (key && !state.selection.includes(key)) setState("selection", [key]);
      setState("contextMenu", { x, y });
    },
    onMeasure: (m, n) => setState({ measurement: m, measurePoints: n }),
    onCamera: () => cameraListeners.forEach((f) => f()),
  });
  const ro = new ResizeObserver(() => engine?.resize());
  ro.observe(el);

  createEffect(() => engine!.update([...state.hidden], [...state.selection]));
  createEffect(() => engine!.setDisplay(state.settings.display));
  createEffect(() => engine!.setProjection(state.settings.projection));
  createEffect(() => engine!.setTool(state.tool));
  createEffect(() => engine!.setSection({ ...state.section }));
  createEffect(() => engine!.setExplode(state.explode));
  createEffect(
    on([() => [...state.selection], () => state.files], () => {
      if (state.files.length) setState("props", engine!.properties([...state.selection]));
    }),
  );
  setState("engineReady", true);
}

const filesListeners = new Set<(files: File[]) => void>();
/** Called whenever a new model is shown (live review re-sends it to viewers). */
export const onFiles = (f: (files: File[]) => void) => (filesListeners.add(f), () => filesListeners.delete(f));

let placeHandler: (p: [number, number, number]) => void = () => {};
/** Live review registers what a comment-tool click does (keeps this module free of share code). */
export const onPlace = (f: typeof placeHandler) => (placeHandler = f);
export const getEngine = () => engine;

const cameraListeners = new Set<() => void>();
export const onCamera = (f: () => void) => (cameraListeners.add(f), () => cameraListeners.delete(f));
export const cameraRotation = () => engine?.cameraRotation();

// ---------- files ----------

export async function openFiles(files: File[]) {
  // closed CAD formats (SolidWorks…) get an explanation; anything else dropped with them still opens
  const vendor = files.map((f) => vendorFileMessage(f.name)).find(Boolean);
  const list = files.filter((f) => !vendorFileMessage(f.name));
  if (vendor && !list.length) return setState("status", vendor);
  if (list.length === 0) return;
  const json = list.find((f) => f.name.endsWith(".sbridge.json"));
  if (json) {
    try {
      return loadDoc(JSON.parse(await json.text()));
    } catch (e) {
      return setState("status", `Not a valid ShapeBridge document: ${(e as Error).message}`);
    }
  }
  setDoc(null);
  setStep(null);
  return show(list);
}

export async function show(list: File[], preserveCamera = false) {
  if (!engine) return;
  const camera = preserveCamera && state.files.length ? engine.getCamera() : null;
  setState({ loading: true, status: `Opening ${list.map((f) => f.name).join(", ")}…` });
  try {
    // state keeps the original files (exact conversion and live share need them); only the view may differ
    const native = await nativeView(list);
    const r = await engine.load(native ? [native] : list);
    if (camera) engine.setCamera(camera);
    setState({
      files: list,
      modelName: list[0].name,
      tree: r.tree,
      stats: { parts: r.parts, triangles: r.triangles },
      modelUnit: r.unit,
      reader: native ? "OpenCascade (native)" : "built-in",
      upAxis: r.upAxis,
      selection: [],
      hidden: [],
      explode: 0,
      measurement: null,
      measurePoints: 0,
      section: { ...state.section, enabled: false },
      views: loadViews(list[0].name),
      status: `Opened ${list[0].name}`,
    });
    filesListeners.forEach((f) => f(list));
  } catch (e) {
    setState("status", `Could not open the file: ${(e as Error).message}. See docs/FORMATS.md for supported formats.`);
  } finally {
    setState("loading", false);
  }
}

export async function openSample(path: string) {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/${path}`);
  if (!res.ok) return setState("status", `Sample ${path} not found`);
  await openFiles([new File([await res.blob()], path)]);
}

// ---------- selection & visibility ----------

const keysOrAll = () => (state.selection.length ? [...state.selection] : []);

export const select = (keys: string[]) => setState("selection", keys);
export const clearSelection = () => setState("selection", []);
export function hideSelected() {
  setState({ hidden: [...new Set([...state.hidden, ...state.selection])], selection: [] });
}
export function isolateSelected() {
  if (!state.tree || !state.selection.length) return;
  const keep = new Set(state.selection);
  setState(
    "hidden",
    state.tree.keys.filter((k) => !keep.has(k)),
  );
}
export const showAll = () => setState("hidden", []);
export function toggleHidden(keys: string[]) {
  const hidden = new Set(state.hidden);
  const allHidden = keys.every((k) => hidden.has(k));
  keys.forEach((k) => (allHidden ? hidden.delete(k) : hidden.add(k)));
  setState("hidden", [...hidden]);
}
// camera history for "previous view"
const cameras: object[] = [];
const remember = () => engine && (cameras.push(engine.getCamera()), cameras.length > 30 && cameras.shift());
export function previousView() {
  const cam = cameras.pop();
  if (cam) engine?.setCamera(cam as never);
}

export const fit = () => (remember(), engine?.fit(keysOrAll()));
export const fitAll = () => (remember(), engine?.fit([]));
export const setView = (v: StdView) => (remember(), engine?.setView(v));
export function setUpAxis(up: "y" | "z") {
  setState("upAxis", up);
  engine?.setUpAxis(up);
}

export function setTool(tool: Tool) {
  const next = state.tool === tool ? "select" : tool;
  setState("tool", next);
  if (next === "section" && !state.section.enabled) setState("section", "enabled", true);
}

// ---------- views & capture ----------

export function saveView() {
  if (!engine || !state.modelName) return;
  const views = [
    ...state.views,
    {
      name: `View ${state.views.length + 1}`,
      camera: engine.getCamera(),
      hidden: [...state.hidden],
      section: { ...state.section },
      explode: state.explode,
    },
  ];
  setState("views", views);
  storeViews(state.modelName, views);
}
export function restoreView(i: number) {
  const v = state.views[i];
  if (!v || !engine) return;
  setState({ hidden: [...v.hidden], section: { ...v.section }, explode: v.explode });
  engine.setCamera(v.camera as never);
}
export function deleteView(i: number) {
  const views = state.views.filter((_, j) => j !== i);
  setState("views", views);
  storeViews(state.modelName, views);
}

export async function screenshot(scale = 2, transparent = false) {
  if (!engine) return;
  const url = engine.screenshot(scale, transparent);
  const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
  await saveFile(`${baseName(state.modelName || "model")}.png`, bytes);
}

export async function exportMesh(ext: MeshExt) {
  if (!engine) return;
  try {
    const out = await engine.export(ext);
    const stem = baseName(state.modelName || "model");
    for (const f of out) await saveFile(out.length === 1 ? `${stem}.${ext}` : f.name, f.data);
    setState("status", `Exported ${ext.toUpperCase()}`);
  } catch (e) {
    setState("status", (e as Error).message);
  }
}

const baseName = (n: string) => n.replace(/\.sbridge\.json$/, "").replace(/\.[^.]+$/, "");

// ---------- parametric designer ----------

export const [doc, setDoc] = createSignal<Doc | null>(null);
export const [step, setStep] = createSignal<ArrayBuffer | null>(null);
export const [docError, setDocError] = createSignal("");
export const [busy, setBusy] = createSignal(false);
export const [measures, setMeasures] = createSignal<Measures | null>(null);
// undo/redo: whole-document snapshots (documents are small)
const past: Doc[] = [];
const future: Doc[] = [];
export const [historyTick, setHistoryTick] = createSignal(0);
let rebuildTimer: number | undefined;
const AUTOSAVE = "shapebridge.autosave.v2";

/** File → New Part: an empty part showing only its origin planes, ready for the first sketch or feature. */
export function newPart() {
  past.length = future.length = 0;
  setHistoryTick((t) => t + 1);
  setEditing(null);
  setStep(null);
  setMeasures(null);
  setDocError("");
  setDoc(blankDoc());
  showEmptyPart();
}

function showEmptyPart() {
  engine?.showOrigin();
  setState({
    files: [],
    tree: null,
    stats: { parts: 0, triangles: 0 },
    selection: [],
    hidden: [],
    modelName: `${doc()!.name}.sbridge.json`,
    status: "New part: pick a plane, then a sketch or feature from the ribbon",
  });
}

export function loadDoc(d: unknown) {
  try {
    const next = migrate(structuredClone(d));
    resolve(next); // reject bad documents before they replace the current one
    past.length = future.length = 0;
    setHistoryTick((t) => t + 1);
    setEditing(null);
    setDoc(next);
    return rebuild(false);
  } catch (e) {
    setState("status", `Not a valid ShapeBridge document: ${(e as Error).message}`);
  }
}

/** Applies an edit: records history, autosaves, and rebuilds after a short pause. */
export function updateDoc(fn: (d: Doc) => Doc) {
  const cur = doc();
  if (!cur) return;
  let next: Doc;
  try {
    next = fn(structuredClone(cur));
  } catch (e) {
    return setDocError((e as Error).message);
  }
  past.push(cur);
  if (past.length > 200) past.shift();
  future.length = 0;
  commit(next);
}

function commit(next: Doc) {
  setDoc(next);
  setHistoryTick((t) => t + 1);
  try {
    localStorage.setItem(AUTOSAVE, JSON.stringify(next));
  } catch {
    // autosave is best effort
  }
  clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => rebuild(true), 300);
}

export const canUndo = () => (historyTick(), past.length > 0);
export const canRedo = () => (historyTick(), future.length > 0);
export function undo() {
  const prev = past.pop();
  if (!prev) return;
  future.push(doc()!);
  commit(prev);
}
export function redo() {
  const next = future.pop();
  if (!next) return;
  past.push(doc()!);
  commit(next);
}

// ---------- PropertyManager-style editing: OK keeps the edits, Cancel rolls back to where editing began ----------

export type Editing = { id: string } | "equations" | null;
export const [editing, setEditing] = createSignal<Editing>(null);
let editMark = 0;

export function beginEdit(target: Exclude<Editing, null>) {
  if (editing()) okEdit();
  editMark = past.length;
  setEditing(target);
}
export const okEdit = () => setEditing(null);
export function cancelEdit() {
  while (past.length > editMark) undo();
  future.length = 0;
  setHistoryTick((t) => t + 1);
  setEditing(null);
}

const blankDoc = (): Doc => ({ format: "shapebridge/2", name: "part1", units: "mm", params: [], features: [] });

/** Adds a feature (starting a new part if none is open) and opens it for editing. */
export function addFeature(kind: Parameters<typeof newFeature>[1], patch: (f: Feature) => Feature = (f) => f) {
  if (!doc()) {
    past.length = future.length = 0;
    setDoc(blankDoc());
  }
  const f = patch(newFeature(doc()!, kind));
  beginEdit({ id: f.id });
  updateDoc((d) => ({ ...d, features: [...d.features, f], rollback: undefined }));
}

export function hasAutosave() {
  try {
    return !!localStorage.getItem(AUTOSAVE);
  } catch {
    return false;
  }
}
export function restoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    if (raw) loadDoc(JSON.parse(raw));
  } catch (e) {
    setState("status", `Could not restore the autosaved design: ${(e as Error).message}`);
  }
}

export function editParam(i: number, expr: string) {
  updateDoc((d) => ((d.params[i].expr = expr), d));
}

async function rebuild(preserveCamera: boolean) {
  const d = doc()!;
  if (!d.features.length) return showEmptyPart();
  try {
    resolve(d);
    setDocError("");
  } catch (e) {
    return setDocError((e as Error).message);
  }
  setBusy(true);
  setState("status", "Building with OpenCascade… (the first build downloads the kernel)");
  try {
    const out = await build(d);
    if (doc() !== d) return; // a newer edit is already on its way
    setStep(out.step);
    setMeasures(out.measures);
    await show([new File([out.stl], `${d.name}.stl`)], preserveCamera);
    setState("modelName", `${d.name}.sbridge.json`);
  } catch (e) {
    setDocError((e as Error).message);
  } finally {
    setBusy(false);
  }
}

export function paramValues(): Record<string, number> {
  try {
    return resolve(doc()!).env;
  } catch {
    return {};
  }
}

export async function exportInterop(id: string) {
  const d = doc()!;
  if (id === "step") return void saveFile(`${d.name}.step`, new Uint8Array(step()!));
  if (id === "json") return void saveFile(`${d.name}.sbridge.json`, JSON.stringify(d, null, 2));
  const t = targets.find((t) => t.id === id)!;
  try {
    await saveFile(`${d.name}${id === "fusion360" ? "_fusion" : ""}.${t.ext}`, t.generate(d));
  } catch (e) {
    setDocError((e as Error).message);
  }
}
