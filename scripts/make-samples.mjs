// Regenerates the exact-geometry samples in samples/ with the same OpenCascade build the app uses.
// Usage: node scripts/make-samples.mjs
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import opencascade from "replicad-opencascadejs";
import { setOC, makeBox, makeCylinder } from "replicad";

const wasm = createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm");
setOC(await opencascade({ locateFile: () => wasm }));

const part = makeBox([0, 0, 0], [40, 30, 10]).cut(makeCylinder(6, 10, [20, 15, 0], [0, 0, 1]));
await writeFile("samples/plate.step", Buffer.from(await part.blobSTEP().arrayBuffer()));
await writeFile("samples/plate.stl", Buffer.from(await part.blobSTL({ binary: true }).arrayBuffer()));
console.log("wrote samples/plate.step, samples/plate.stl");
