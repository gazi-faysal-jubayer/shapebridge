/// <reference lib="webworker" />
// OpenCascade runs here so the 20 MB WASM only loads when the designer is opened and never blocks the UI.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { setOC } from "replicad";
import { buildShape, measure } from "./build";
import type { KernelRequest, KernelResponse } from "./protocol";

const ready = (opencascade as unknown as (o: object) => Promise<unknown>)({ locateFile: () => wasmUrl }).then((oc) =>
  setOC(oc as Parameters<typeof setOC>[0]),
);

self.onmessage = async (e: MessageEvent<KernelRequest>) => {
  const { id, doc } = e.data;
  let res: KernelResponse;
  try {
    await ready;
    const shape = buildShape(doc);
    const measures = measure(shape);
    const [stl, step] = await Promise.all([
      shape.blobSTL({ binary: true, tolerance: 0.05, angularTolerance: 0.2 }).arrayBuffer(),
      shape.blobSTEP().arrayBuffer(),
    ]);
    shape.delete();
    res = { id, ok: true, stl, step, measures };
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(res, res.ok ? [res.stl, res.step] : []);
};
