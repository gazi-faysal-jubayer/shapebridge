import { describe, expect, it } from "vitest";
import { parseStl, writeStl } from "./stl";

// a 2 × 3 × 4 box, outward winding, 12 triangles
const box = (() => {
  const v = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 3, 0],
    [0, 3, 0],
    [0, 0, 4],
    [2, 0, 4],
    [2, 3, 4],
    [0, 3, 4],
  ];
  const f = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  return Float32Array.from(f.flatMap((t) => t.flatMap((i) => v[i])));
})();

describe("lean STL", () => {
  it("round-trips binary STL with exact box stats", () => {
    const m = parseStl(writeStl(box).buffer as ArrayBuffer);
    expect(m.stats.triangles).toBe(12);
    expect(m.stats.min).toEqual([0, 0, 0]);
    expect(m.stats.max).toEqual([2, 3, 4]);
    expect(m.stats.area).toBeCloseTo(2 * (6 + 8 + 12), 5);
    expect(m.stats.volume).toBeCloseTo(24, 5);
    expect([...m.normals.slice(0, 3)]).toEqual([0, 0, -1]);
  });

  it("reads ASCII STL", () => {
    const tri = (a: number[]) =>
      `facet normal 0 0 0\nouter loop\n${[0, 3, 6].map((i) => `vertex ${a[i]} ${a[i + 1]} ${a[i + 2]}`).join("\n")}\nendloop\nendfacet`;
    const text = `solid box\n${Array.from({ length: 12 }, (_, t) => tri([...box.slice(t * 9, t * 9 + 9)])).join("\n")}\nendsolid box\n`;
    const m = parseStl(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(m.stats.triangles).toBe(12);
    expect(m.stats.volume).toBeCloseTo(24, 5);
  });

  it("scales on export", () => {
    const m = parseStl(writeStl(box, 10).buffer as ArrayBuffer);
    expect(m.stats.max).toEqual([20, 30, 40]);
  });
});
