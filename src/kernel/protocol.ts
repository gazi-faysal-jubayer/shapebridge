import type { Doc } from "../model/doc";
import type { Measures } from "./build";
import type { View } from "../convert/drawing";

/** Mesh tolerances (model units / radians) for coarse, normal and fine tessellation. */
export const QUALITY = {
  coarse: { tolerance: 0.5, angularTolerance: 0.5 },
  normal: { tolerance: 0.05, angularTolerance: 0.2 },
  fine: { tolerance: 0.005, angularTolerance: 0.05 },
} as const;
export type Quality = keyof typeof QUALITY;
export type ExactFormat = "step" | "brep" | "stl";

type Req =
  | { op: "build"; doc: Doc }
  | { op: "import"; format: "step" | "brep"; data: ArrayBuffer }
  | { op: "export"; format: ExactFormat; quality: Quality; scale: number }
  | { op: "views" };
export type KernelRequest = Req & { id: number };

type Ok =
  | { op: "build"; stl: ArrayBuffer; step: ArrayBuffer; measures: Measures }
  | { op: "import"; measures: Measures }
  | { op: "export"; data: ArrayBuffer }
  | { op: "views"; views: View[] };
export type KernelResponse = ({ id: number; ok: true } & Ok) | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: KernelResponse) => void>();

function call<T extends Ok["op"]>(req: Req & { op: T }, transfer: ArrayBuffer[] = []): Promise<Extract<Ok, { op: T }>> {
  if (!worker) {
    worker = new Worker(new URL("./occt.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<KernelResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  const id = ++seq;
  return new Promise((ok, fail) => {
    pending.set(id, (r) => (r.ok ? ok(r as unknown as Extract<Ok, { op: T }>) : fail(new Error(r.error))));
    worker!.postMessage({ ...req, id }, transfer);
  });
}

/** Builds a doc in the kernel worker (created on first use). Resolves with STL (for display) and STEP (exact). */
export const build = (doc: Doc) => call({ op: "build", doc });
/** Loads an exact STEP/BREP file into the kernel so it can be converted exactly and drawn. */
export const importExact = (format: "step" | "brep", data: ArrayBuffer) => call({ op: "import", format, data }, [data]);
export const exportExact = (format: ExactFormat, quality: Quality = "normal", scale = 1) => call({ op: "export", format, quality, scale });
export const projectViews = () => call({ op: "views" });
