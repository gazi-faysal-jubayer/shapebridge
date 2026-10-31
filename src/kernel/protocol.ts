import type { Doc } from "../model/doc";
import type { Measures } from "./build";

export type KernelRequest = { id: number; doc: Doc };
export type KernelResponse =
  | { id: number; ok: true; stl: ArrayBuffer; step: ArrayBuffer; measures: Measures }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: KernelResponse) => void>();

/** Builds a doc in the kernel worker (created on first use). Resolves with STL (for display) and STEP (exact). */
export function build(doc: Doc): Promise<{ stl: ArrayBuffer; step: ArrayBuffer; measures: Measures }> {
  if (!worker) {
    worker = new Worker(new URL("./occt.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<KernelResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  const id = ++seq;
  return new Promise((ok, fail) => {
    pending.set(id, (r) => (r.ok ? ok(r) : fail(new Error(r.error))));
    worker!.postMessage({ id, doc } satisfies KernelRequest);
  });
}
