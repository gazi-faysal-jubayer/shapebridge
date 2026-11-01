// Writes a large STEP assembly for performance testing: a grid of drilled plates, each held by four identical
// bolts (so repeated parts can be instanced). Not a committed sample.
// Usage: node scripts/make-big-assembly.mjs [plates=250] [out=public/_perf/assembly.step]  → plates × 5 parts
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import opencascade from "replicad-opencascadejs";
import { setOC, drawRoundedRectangle, makeCylinder, exportSTEP } from "replicad";

const plates = Number(process.argv[2] ?? 250);
const out = process.argv[3] ?? "public/_perf/assembly.step";
const wasm = createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm");
// print/printErr: OCCT logs every STEP transfer to stdout
setOC(await opencascade({ locateFile: () => wasm, print: () => {}, printErr: () => {} }));

const side = Math.ceil(Math.sqrt(plates));
const PITCH = 90;
const HOLES = [
  [-25, -25],
  [25, -25],
  [25, 25],
  [-25, 25],
];
// one bolt shape, translated per hole: identical geometry the viewer can instance
const bolt = makeCylinder(4, 30, [0, 0, -10]).fuse(makeCylinder(7, 5, [0, 0, 20]));

const parts = [];
for (let i = 0; i < plates; i++) {
  const [x, y] = [(i % side) * PITCH, Math.floor(i / side) * PITCH];
  const thickness = 6 + (i % 7); // every plate slightly different, so plates stay unique
  let plate = drawRoundedRectangle(70, 70, 6).sketchOnPlane("XY").extrude(thickness).translate([x, y, 0]);
  for (const [hx, hy] of HOLES) plate = plate.cut(makeCylinder(4.2, thickness + 2, [x + hx, y + hy, -1]));
  parts.push({ shape: plate, name: `plate-${i + 1}`, color: "#90a4ae" });
  HOLES.forEach(([hx, hy], k) =>
    parts.push({
      shape: bolt.clone().translate([x + hx, y + hy, 0]),
      name: `bolt-${i + 1}-${k + 1}`,
      color: "#ffb74d",
    }),
  );
}

mkdirSync(dirname(out), { recursive: true });
const blob = exportSTEP(parts);
writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
console.log(`${out}: ${parts.length} parts, ${(blob.size / 1e6).toFixed(1)} MB`);
