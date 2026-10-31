/// <reference lib="webworker" />
// OpenCascade runs here so the 20 MB WASM only loads when it's needed and never blocks the UI.
// The worker keeps the current exact solid (from a parametric build or an imported STEP/BREP) so
// exports and drawings can be produced from it on demand.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { setOC, importSTEP, deserializeShape, drawProjection, type Shape3D } from "replicad";
import { buildShape, measure } from "./build";
import { QUALITY, type KernelRequest, type KernelResponse } from "./protocol";
import type { View } from "../convert/drawing";

const ready = (opencascade as unknown as (o: object) => Promise<unknown>)({ locateFile: () => wasmUrl }).then((oc) =>
  setOC(oc as Parameters<typeof setOC>[0]),
);

let current: Shape3D | null = null;
const replace = (s: Shape3D) => {
  current?.delete();
  current = s;
  return s;
};
const preview = (s: Shape3D) => s.blobSTL({ binary: true, ...QUALITY.normal }).arrayBuffer();

async function handle(req: KernelRequest): Promise<{ res: KernelResponse; transfer: ArrayBuffer[] }> {
  await ready;
  switch (req.op) {
    case "build": {
      const shape = replace(buildShape(req.doc));
      const [stl, step] = await Promise.all([preview(shape), shape.blobSTEP().arrayBuffer()]);
      return { res: { id: req.id, ok: true, op: "build", stl, step, measures: measure(shape) }, transfer: [stl, step] };
    }
    case "import": {
      const shape = replace(
        req.format === "brep"
          ? (deserializeShape(new TextDecoder().decode(req.data)) as Shape3D)
          : ((await importSTEP(new Blob([req.data]))) as Shape3D),
      );
      return { res: { id: req.id, ok: true, op: "import", measures: measure(shape) }, transfer: [] };
    }
    case "export": {
      if (!current) throw new Error("Nothing to export: open a STEP/BREP file or build a part first");
      const shape = req.scale === 1 ? current : current.clone().scale(req.scale, [0, 0, 0]);
      const data =
        req.format === "step"
          ? await shape.blobSTEP().arrayBuffer()
          : req.format === "brep"
            ? (new TextEncoder().encode(shape.serialize()).buffer as ArrayBuffer)
            : await shape.blobSTL({ binary: true, ...QUALITY[req.quality] }).arrayBuffer();
      if (shape !== current) shape.delete();
      return { res: { id: req.id, ok: true, op: "export", data }, transfer: [data] };
    }
    case "views": {
      if (!current) throw new Error("Nothing to draw: open a STEP/BREP file or build a part first");
      const views: View[] = (["front", "top", "right"] as const).map((name) => {
        const { visible, hidden } = drawProjection(current!, name);
        return { name, visible: visible.toSVGPaths().flat(), hidden: hidden.toSVGPaths().flat(), viewBox: visible.toSVGViewBox() };
      });
      return { res: { id: req.id, ok: true, op: "views", views }, transfer: [] };
    }
  }
}

self.onmessage = async (e: MessageEvent<KernelRequest>) => {
  let out: { res: KernelResponse; transfer: ArrayBuffer[] };
  try {
    out = await handle(e.data);
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "OpenCascade couldn't process this shape";
    out = { res: { id: e.data.id, ok: false, error: message }, transfer: [] };
  }
  (self as unknown as Worker).postMessage(out.res, out.transfer);
};
