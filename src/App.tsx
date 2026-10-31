import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { CadViewer, importExts, meshExports } from "./viewer/viewer";
import { saveFile } from "./platform/save";
import { sampleDoc, resolve, type Doc } from "./model/doc";
import { targets } from "./interop";
import { build } from "./kernel/protocol";
import { parseShareHash } from "./share/link";
import type { HostSession } from "./share/share";

const p2p = () => import("./share/share");

const baseName = (n: string) => n.replace(/\.[^.]+$/, "");

export default function App() {
  let viewport!: HTMLDivElement;
  let fileInput!: HTMLInputElement;
  let viewer!: CadViewer;

  const [status, setStatus] = createSignal("Open or drop a CAD file — STEP, IGES, STL, OBJ, glTF, 3MF, FBX, IFC, 3DM and more.");
  const [loaded, setLoaded] = createSignal(false);
  const [files, setFiles] = createSignal<File[]>([]);
  const [doc, setDoc] = createSignal<Doc | null>(null);
  const [step, setStep] = createSignal<ArrayBuffer | null>(null);
  const [docError, setDocError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [session, setSession] = createSignal<HostSession | null>(null);
  const [peers, setPeers] = createSignal(0);
  const [follow, setFollow] = createSignal(true);
  const [dragging, setDragging] = createSignal(false);
  const guest = parseShareHash(location.hash);

  let keepCamera: object | null = null;

  onMount(() => {
    viewer = new CadViewer(
      viewport,
      () => {
        if (keepCamera) viewer.setCamera(keepCamera as never);
        keepCamera = null;
        setLoaded(true);
        setStatus(`Showing ${files().map((f) => f.name).join(", ")}`);
      },
      () => setStatus("Could not read this file. Is the format supported? See docs/FORMATS.md."),
    );
    const ro = new ResizeObserver(() => viewer.resize());
    ro.observe(viewport);
    onCleanup(() => ro.disconnect());

    if (guest) startGuest();
  });

  function show(list: File[], preserveCamera = false) {
    if (preserveCamera && viewer.hasModel()) keepCamera = viewer.getCamera();
    setFiles(list);
    viewer.load(list);
    const s = session();
    if (s) Promise.all(list.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))).then(s.setFiles);
  }

  async function openFiles(list: File[]) {
    if (list.length === 0) return;
    const json = list.find((f) => f.name.endsWith(".sbridge.json"));
    if (json) {
      try {
        loadDoc(JSON.parse(await json.text()));
      } catch (e) {
        setStatus(`Not a valid ShapeBridge document: ${(e as Error).message}`);
      }
      return;
    }
    setDoc(null);
    setStep(null);
    show(list);
  }

  // ---- parametric designer ----
  let rebuildTimer: number | undefined;
  function loadDoc(d: Doc) {
    setDoc(structuredClone(d));
    rebuild(false);
  }
  function editParam(i: number, expr: string) {
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
      setDocError((e as Error).message);
      return;
    }
    setBusy(true);
    setStatus("Building with OpenCascade… (first run downloads the kernel)");
    try {
      const out = await build(d);
      setStep(out.step);
      show([new File([out.stl], `${d.name}.stl`)], preserveCamera);
    } catch (e) {
      setDocError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const values = () => {
    try {
      return resolve(doc()!).env;
    } catch {
      return {} as Record<string, number>;
    }
  };

  // ---- export ----
  async function exportMesh(ext: string) {
    if (!ext) return;
    try {
      const out = await viewer.export(ext as (typeof meshExports)[number]["ext"]);
      const stem = baseName(files()[0]?.name ?? "model");
      for (const f of out) await saveFile(out.length === 1 ? `${stem}.${ext}` : f.name, f.data);
      setStatus(`Exported ${ext.toUpperCase()}`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  async function exportInterop(id: string) {
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

  // ---- sharing ----
  let camTimer: number | undefined;
  async function startShare() {
    const list = await Promise.all(files().map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    const s = (await p2p()).host(list);
    s.onPeers(setPeers);
    setSession(s);
    let last = "";
    camTimer = window.setInterval(() => {
      if (!follow() || !viewer.hasModel()) return;
      const cam = viewer.getCamera();
      const key = JSON.stringify(cam);
      if (key !== last) (s.sendCamera(cam), (last = key));
    }, 200);
  }
  async function stopShare() {
    clearInterval(camTimer);
    await session()?.stop();
    setSession(null);
    setPeers(0);
  }
  async function startGuest() {
    setStatus("Connecting to the presenter… (peer-to-peer, nothing is uploaded to a server)");
    (await p2p()).join(guest!, {
      files: (list) => {
        keepCamera = null;
        show(list.map((f) => new File([f.data], f.name)));
      },
      camera: (c) => viewer.hasModel() && viewer.setCamera(c),
      progress: (p) => setStatus(`Receiving model… ${Math.round(p * 100)}%`),
      host: (ok) => !ok && setStatus("Presenter disconnected. The last model stays on screen."),
    });
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!guest) openFiles([...(e.dataTransfer?.files ?? [])]);
  };

  return (
    <div class="app" onDragOver={(e) => (e.preventDefault(), setDragging(!guest))} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <header class="bar">
        <a class="brand" href="https://github.com/gazi-faysal-jubayer/shapebridge" target="_blank" rel="noreferrer">
          <img src="logo.svg" alt="" width="28" height="28" />
          <span>ShapeBridge</span>
        </a>
        <Show when={!guest} fallback={<span class="pill">Live view from presenter</span>}>
          <button onClick={() => fileInput.click()}>Open…</button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept={[...importExts.map((e) => "." + e), ".json"].join(",")}
            onChange={(e) => openFiles([...(e.currentTarget.files ?? [])])}
          />
          <button onClick={() => loadDoc(sampleDoc)}>New parametric part</button>
          <select disabled={!loaded()} onChange={(e) => (exportMesh(e.currentTarget.value), (e.currentTarget.value = ""))} aria-label="Export mesh">
            <option value="">Export as…</option>
            <For each={meshExports}>{(m) => <option value={m.ext}>{m.label}</option>}</For>
          </select>
          <button class="primary" disabled={!loaded() || !!session()} onClick={startShare}>
            Share live
          </button>
        </Show>
      </header>

      <main>
        <Show when={doc()}>
          <aside class="panel">
            <h2>Parameters</h2>
            <table>
              <tbody>
                <For each={doc()!.params}>
                  {(p, i) => (
                    <tr>
                      <th title={p.note}>{p.name}</th>
                      <td>
                        <input value={p.expr} onInput={(e) => editParam(i(), e.currentTarget.value)} aria-label={`${p.name} expression`} />
                      </td>
                      <td class="num">{values()[p.name]?.toFixed(2) ?? "—"}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={docError()}>
              <p class="error" role="alert">{docError()}</p>
            </Show>
            <h2>Features</h2>
            <ol class="features">
              <For each={doc()!.features}>{(f) => <li>{f.op === "cut" ? "−" : "+"} {f.kind} <code>{f.id}</code></li>}</For>
            </ol>
            <h2>Export (stays editable)</h2>
            <div class="grid">
              <For each={targets}>{(t) => <button onClick={() => exportInterop(t.id)}>{t.label}</button>}</For>
              <button disabled={!step() || busy()} onClick={() => exportInterop("step")}>STEP (exact solid)</button>
              <button onClick={() => exportInterop("json")}>ShapeBridge .json</button>
            </div>
          </aside>
        </Show>
        <div class="viewport" ref={viewport} />
        <Show when={dragging()}>
          <div class="drop">Drop to open</div>
        </Show>
      </main>

      <Show when={session()}>
        <div class="share" role="dialog" aria-label="Live share">
          <strong>Live share is on</strong>
          <p>Send this link. It works in any browser; the file goes straight from this computer, peer-to-peer.</p>
          <div class="row">
            <input readonly value={session()!.link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            <button onClick={() => navigator.clipboard.writeText(session()!.link)}>Copy</button>
          </div>
          <label>
            <input type="checkbox" checked={follow()} onChange={(e) => setFollow(e.currentTarget.checked)} /> Viewers follow my camera
          </label>
          <p class="muted">{peers()} viewer(s) connected</p>
          <button onClick={stopShare}>Stop sharing</button>
        </div>
      </Show>

      <footer class="status" aria-live="polite">{status()}</footer>
    </div>
  );
}
