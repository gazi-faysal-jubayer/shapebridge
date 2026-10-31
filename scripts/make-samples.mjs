// Regenerates the exact-geometry samples in public/samples/ with the same OpenCascade build the app uses.
// Usage: node scripts/make-samples.mjs
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import opencascade from "replicad-opencascadejs";
import { setOC, makeBox, makeCylinder, exportSTEP } from "replicad";

const wasm = createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm");
setOC(await opencascade({ locateFile: () => wasm }));

const out = (name, blob) => blob.arrayBuffer().then((b) => writeFile(`public/samples/${name}`, Buffer.from(b)));

const part = makeBox([0, 0, 0], [40, 30, 10]).cut(makeCylinder(6, 10, [20, 15, 0], [0, 0, 1]));
await out("plate.step", part.blobSTEP());
await out("plate.stl", part.blobSTL({ binary: true }));

// a small named, coloured assembly: base plate, four bolts, a bracket and its pin
const holes = [
  [10, 10],
  [70, 10],
  [10, 50],
  [70, 50],
];
let base = makeBox([0, 0, 0], [80, 60, 8]);
for (const [x, y] of holes) base = base.cut(makeCylinder(3.2, 8, [x, y, 0], [0, 0, 1]));
const bolts = holes.map(([x, y], i) => ({
  shape: makeCylinder(3, 14, [x, y, -2], [0, 0, 1]).fuse(makeCylinder(5, 4, [x, y, 8], [0, 0, 1])),
  name: `Bolt M6 #${i + 1}`,
  color: "#9ca3af",
}));
const bracket = makeBox([25, 20, 8], [55, 40, 38])
  .cut(makeBox([25, 26, 14], [55, 34, 38]))
  .cut(makeCylinder(4, 30, [25, 30, 30], [1, 0, 0]));
const pin = makeCylinder(3.8, 40, [20, 30, 30], [1, 0, 0]);
await out(
  "assembly.step",
  exportSTEP([
    { shape: base, name: "Base plate", color: "#64748b" },
    ...bolts,
    { shape: bracket, name: "Bracket", color: "#0d9488" },
    { shape: pin, name: "Pin", color: "#f59e0b" },
  ]),
);
console.log("wrote public/samples/{plate.step, plate.stl, assembly.step}");
