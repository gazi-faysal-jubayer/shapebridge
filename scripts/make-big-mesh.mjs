// Writes a large binary STL (a finely tessellated torus) for performance testing; not a committed sample.
// Usage: node scripts/make-big-mesh.mjs [triangles=5000000] [out=big.stl]
import { writeFileSync } from "node:fs";

const target = Number(process.argv[2] ?? 5_000_000);
const out = process.argv[3] ?? "big.stl";
const nu = Math.round(Math.sqrt(target / 2) * 1.6);
const nv = Math.max(3, Math.round(target / 2 / nu));
const tris = nu * nv * 2;
const R = 50;
const r = 15;
const P = (i, j) => {
  const u = (i / nu) * 2 * Math.PI;
  const v = (j / nv) * 2 * Math.PI;
  return [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)];
};
const buf = Buffer.alloc(84 + tris * 50);
buf.write("ShapeBridge performance test mesh", 0);
buf.writeUInt32LE(tris, 80);
let o = 84;
const tri = (a, b, c) => {
  o += 12; // a zero normal: readers recompute it
  for (const p of [a, b, c]) for (const x of p) (buf.writeFloatLE(x, o), (o += 4));
  o += 2;
};
for (let i = 0; i < nu; i++)
  for (let j = 0; j < nv; j++) {
    const a = P(i, j),
      b = P(i + 1, j),
      c = P(i + 1, j + 1),
      d = P(i, j + 1);
    tri(a, b, c);
    tri(a, c, d);
  }
writeFileSync(out, buf);
console.log(`${out}: ${tris.toLocaleString()} triangles, ${(buf.length / 1e6).toFixed(0)} MB`);
