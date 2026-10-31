import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { flatten, layout, sheetDxf, sheetSvg, type View } from "./drawing";

// the real replicad projection of a 40 × 30 × 10 plate with a Ø12 hole (from drawProjection)
const views: View[] = [
  {
    name: "front",
    visible: ["M 0 0 L 0 -10 L 40 -10", "M 0 0 L 40 0 L 40 -10"],
    hidden: ["M 14 0 L 14 -10", "M 26 0 L 26 -10"],
    viewBox: "-1 -11 42 12",
  },
  {
    name: "top",
    visible: ["M 0 0 L 0 30 L 40 30", "M 0 0 L 40 0 L 40 30", "M 26 15 A 6 6 0 0 1 14 15 A 6 6 0 0 1 26 15 Z"],
    hidden: [],
    viewBox: "-1 -1 42 32",
  },
  { name: "right", visible: ["M 0 0 L 0 -10 L -30 -10", "M -30 0 L -30 -10", "M 0 0 L -30 0"], hidden: [], viewBox: "-31 -11 32 12" },
];

const length = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

describe("2D drawings", () => {
  it("flattens lines, arcs and curves", () => {
    expect(flatten("M 0 0 L 3 4 H 6 V 0 Z")).toEqual([
      [
        [0, 0],
        [3, 4],
        [6, 4],
        [6, 0],
        [0, 0],
      ],
    ]);
    // two half arcs make a full circle of radius 6
    const circle = flatten("M 26 15 A 6 6 0 0 1 14 15 A 6 6 0 0 1 26 15 Z", 96)[0];
    expect(length(circle)).toBeCloseTo(2 * Math.PI * 6, 1);
    for (const [x, y] of circle) expect(Math.hypot(x - 20, y - 15)).toBeCloseTo(6, 6);
    expect(flatten("M 0 0 C 0 10 10 10 10 0").at(0)?.at(-1)).toEqual([10, 0]);
    expect(() => flatten("M 0 0 X 1 2")).toThrow(/Unsupported/);
  });

  it("lays out a third-angle sheet without overlaps", () => {
    const s = layout(views);
    const [top, front, right] = s.placed;
    // top view sits above the front view and aligned with it on x
    expect(top.dx).toBe(front.dx);
    expect(top.dy + -1 + 32).toBeLessThan(front.dy + -11);
    // right view is to the right of the front view and level with it
    expect(right.dx - 31).toBeGreaterThan(front.dx + 41);
    expect(s.width).toBeGreaterThan(42 + 32);
    const svg = sheetSvg(s, 'plate<"&>', "mm", new Date("2026-10-31"));
    expect(svg).toContain('width="');
    expect(svg).toContain("plate&lt;&quot;&amp;&gt;");
    expect(svg).toContain("2026-10-31");
  });

  it("writes DXF that a third-party parser reads back at true size", () => {
    const s = layout(views);
    const dxf = new DxfParser().parseSync(sheetDxf(s))!;
    const lines = dxf.entities.filter((e) => e.type === "LINE") as unknown as { layer: string; vertices: { x: number; y: number }[] }[];
    expect(lines.some((l) => l.layer === "HIDDEN")).toBe(true);
    // the front view's 40 mm bottom edge survives with its length
    const len = (l: (typeof lines)[number]) => Math.hypot(l.vertices[1].x - l.vertices[0].x, l.vertices[1].y - l.vertices[0].y);
    expect(lines.filter((l) => l.layer === "VISIBLE").some((l) => Math.abs(len(l) - 40) < 1e-6)).toBe(true);
    // the hole outline adds up to its circumference
    const total = lines.filter((l) => l.layer === "VISIBLE").reduce((sum, l) => sum + len(l), 0);
    const straight = 2 * (40 + 10) + 2 * (40 + 30) + 2 * (30 + 10);
    expect(total - straight).toBeCloseTo(2 * Math.PI * 6, 0);
  });
});
