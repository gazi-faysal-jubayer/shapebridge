// App actions: everything the UI can do goes through here, so menus, shortcuts and the command
// palette share one implementation. Owns the lazily-loaded 3D engine.
import { createEffect, createSignal, on } from "solid-js";
import { loadViews, setState, state, storeViews, type StdView, type Tool } from "./state/store";
import type { Engine, MeshExt } from "./viewer/engine";
import { saveFile } from "./platform/save";
import { sampleDoc, resolve, type Doc } from "./model/doc";
import { targets } from "./interop";
import { build } from "./kernel/protocol";
import type { HostSession } from "./share/share";

let engine: Engine | undefined;
const p2p = () => import("./share/share");

// ---------- engine lifecycle ----------

export async function mountViewer(el: HTMLElement) {
  const { Engine } = await import("./viewer/engine");
  engine = new Engine(el, {
    onPick: (key, additive) => {
      if (!key) return additive || setState("selection", []);
      const sel = state.selection;
      setState("selection", additive ? (sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key]) : [key]);
    },
    onHover: (p) => setState("hover", p),
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

const cameraListeners = new Set<() => void>();
export const onCamera = (f: () => void) => (cameraListeners.add(f), () => cameraListeners.delete(f));
export const cameraRotation = () => engine?.cameraRotation();

// ---------- files ----------

export async function openFiles(list: File[]) {
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

async function show(list: File[], preserveCamera = false) {
  if (!engine) return;
  const camera = preserveCamera && state.files.length ? engine.getCamera() : null;
  setState({ loading: true, status: `Opening ${list.map((f) => f.name).join(", ")}…` });
  try {
    const r = await engine.load(list);
    if (camera) engine.setCamera(camera);
    setState({
      files: list,
      modelName: list[0].name,
      tree: r.tree,
      stats: { parts: r.parts, triangles: r.triangles },
      modelUnit: r.unit,
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
    if (session) Promise.all(list.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))).then(session.setFiles);
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
export const fit = () => engine?.fit(keysOrAll());
export const setView = (v: StdView) => engine?.setView(v);
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
let rebuildTimer: number | undefined;

export function loadDoc(d: Doc = sampleDoc) {
  setDoc(structuredClone(d));
  return rebuild(false);
}

export function editParam(i: number, expr: string) {
  const d = structuredClone(doc()!);
  d.params[i].expr = expr;
  setDoc(d);
  clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => rebuild(true), 300);
}

async function rebuild(preserveCamera: boolean) {
  const d = doc()!;
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
    setStep(out.step);
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

// ---------- live share ----------

let session: HostSession | null = null;
export const [shareLink, setShareLink] = createSignal("");
export const [peers, setPeers] = createSignal(0);
export const [follow, setFollow] = createSignal(true);
let stopCamera: (() => void) | undefined;

export async function startShare() {
  if (!state.files.length) return;
  const list = await Promise.all(state.files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
  session = (await p2p()).host(list);
  session.onPeers(setPeers);
  setShareLink(session.link);
  let last = "";
  stopCamera = onCamera(() => {
    if (!follow() || !engine) return;
    const cam = engine.getCamera();
    const key = JSON.stringify(cam);
    if (key !== last) {
      last = key;
      session?.sendCamera(cam);
    }
  });
}

export async function stopShare() {
  stopCamera?.();
  await session?.stop();
  session = null;
  setShareLink("");
  setPeers(0);
}

export async function joinShare(link: { room: string; key: string }) {
  setState("status", "Connecting to the presenter… (peer-to-peer, nothing is uploaded to a server)");
  (await p2p()).join(link, {
    files: (list) => show(list.map((f) => new File([f.data], f.name))),
    camera: (c) => engine?.setCamera(c),
    progress: (p) => setState("status", `Receiving model… ${Math.round(p * 100)}%`),
    host: (ok) => !ok && setState("status", "Presenter disconnected. The last model stays on screen."),
  });
}

