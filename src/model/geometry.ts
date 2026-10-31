// Geometry shared by the kernel and every exporter, so all of them agree on planes and profiles.
import type { PlaneName, Profile, SketchPlane, XY } from "./doc";
import { sumExpr } from "./params";

export type V3 = [number, number, number];

/** Sketch frames: u, v in-plane axes and normal n = u × v. */
export const FRAMES: Record<PlaneName, { u: V3; v: V3; n: V3 }> = {
  XY: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  XZ: { u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] },
  YZ: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
};

/** World point (as expressions) of sketch coordinates (u, v) on a plane. */
export function toWorld(plane: SketchPlane, [u, v]: XY): [string, string, string] {
  const { u: U, v: V, n: N } = FRAMES[plane.base];
  return [0, 1, 2].map((i) => {
    const terms = [U[i] && `${U[i]} * (${u})`, V[i] && `${V[i]} * (${v})`, N[i] && `${N[i]} * (${plane.offset})`].filter(
      Boolean,
    ) as string[];
    return terms.length ? sumExpr(...terms) : "0";
  }) as [string, string, string];
}

/**
 * A profile as a closed polygon of expression points, or a circle. Rectangles and regular
 * polygons become polygons here, so every target draws the same vertices in the same order.
 */
export function outline(p: Profile): { kind: "poly"; points: XY[] } | { kind: "circle"; c: XY; r: string } {
  switch (p.type) {
    case "circle":
      return { kind: "circle", c: [p.cx, p.cy], r: p.r };
    case "rect": {
      const x2 = sumExpr(p.x, p.w);
      const y2 = sumExpr(p.y, p.h);
      return {
        kind: "poly",
        points: [
          [p.x, p.y],
          [x2, p.y],
          [x2, y2],
          [p.x, y2],
        ],
      };
    }
    case "polygon":
      return {
        kind: "poly",
        points: Array.from({ length: p.sides }, (_, i): XY => [
          sumExpr(p.cx, `(${p.r}) * cos(${(360 * i) / p.sides})`),
          sumExpr(p.cy, `(${p.r}) * sin(${(360 * i) / p.sides})`),
        ]),
      };
    case "polyline":
      return { kind: "poly", points: p.points };
  }
}
