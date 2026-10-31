import {
  draw,
  drawCircle,
  makeCylinder,
  measureArea,
  measureShapeVolumeProperties,
  Plane,
  type Point,
  type Shape3D,
  type Drawing,
} from "replicad";
import { resolve, type Doc, type EdgeSel, type Feature, type Op, type Profile, type SketchPlane } from "../model/doc";
import { FRAMES, outline, type V3 } from "../model/geometry";

export interface Measures {
  volume: number;
  area: number;
  bbox: [V3, V3];
  centerOfMass: V3;
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const EPS = 1e-4;
// edge/face selection boxes: OCCT pads bounding boxes by the shape tolerance, so 1e-4 can miss
const SEL = 1e-2;

/**
 * Builds the doc's exact B-rep with OpenCascade (replicad must already have setOC called).
 * Errors name the failing feature so the UI can point at it.
 */
export function buildShape(doc: Doc): Shape3D {
  const { num, features } = resolve(doc);
  if (features.length === 0) throw new Error("Add a feature to start");
  let body: Shape3D | null = null;
  // fresh copies of each patternable feature's tool solid, with the op that applies it
  const tools = new Map<string, { make: () => Shape3D; op: Op }>();

  const apply = (tool: Shape3D, op: Op) => {
    body = body === null ? tool : op === "add" ? body.fuse(tool) : body.cut(tool);
  };

  for (const f of features) {
    try {
      const tool = toolOf(f, num);
      if (tool) {
        tools.set(f.id, tool);
        apply(tool.make(), tool.op);
        continue;
      }
      if (!body) throw new Error("needs a solid before it");
      body = modify(body, f, num, tools, apply) ?? body;
    } catch (e) {
      // OCCT failures arrive as bare WebAssembly exceptions with no message
      const why = e instanceof Error && e.message ? e.message : "OpenCascade couldn't apply this feature. Try a smaller size or different edges/faces.";
      throw new Error(`${f.id}: ${why}`);
    }
  }
  if (!body) throw new Error("Nothing to build");
  return body;
}

export function measure(shape: Shape3D): Measures {
  const props = measureShapeVolumeProperties(shape);
  const m = {
    volume: props.volume,
    area: measureArea(shape),
    bbox: shape.boundingBox.bounds as [V3, V3],
    centerOfMass: props.centerOfMass,
  };
  props.delete?.();
  return m;
}

function planeOf(p: SketchPlane, num: (e: string) => number, shift = 0): Plane {
  const { u, n } = FRAMES[p.base];
  return new Plane(add([0, 0, 0], n, num(p.offset) + shift), u, n);
}

function drawing(p: Profile, num: (e: string) => number): Drawing {
  const o = outline(p);
  if (o.kind === "circle") return drawCircle(num(o.r)).translate(num(o.c[0]), num(o.c[1]));
  const pts = o.points.map(([u, v]) => [num(u), num(v)] as [number, number]);
  let pen = draw(pts[0]);
  for (const pt of pts.slice(1)) pen = pen.lineTo(pt);
  return pen.close();
}

function toolOf(f: Feature, num: (e: string) => number): { make: () => Shape3D; op: Op } | null {
  switch (f.kind) {
    case "extrude": {
      const d = num(f.distance);
      return {
        op: f.op,
        make: () =>
          drawing(f.profile, num)
            .sketchOnPlane(planeOf(f.plane, num, f.symmetric ? -d / 2 : 0))
            .extrude(d) as Shape3D,
      };
    }
    case "revolve": {
      const { v } = FRAMES[f.plane.base];
      return {
        op: f.op,
        make: () => {
          const pl = planeOf(f.plane, num);
          const origin = [pl.origin.x, pl.origin.y, pl.origin.z] as Point;
          return drawing(f.profile, num)
            .sketchOnPlane(pl)
            .revolve(v, { origin, angle: num(f.angle) }) as Shape3D;
        },
      };
    }
    case "hole":
      return { op: "cut", make: () => holes(f, num) };
    default:
      return null;
  }
}

function holes(f: Extract<Feature, { kind: "hole" }>, num: (e: string) => number): Shape3D {
  const { u, v, n } = FRAMES[f.plane.base];
  const down: V3 = [-n[0], -n[1], -n[2]];
  const r = num(f.diameter) / 2;
  const depth = num(f.depth);
  let all: Shape3D | null = null;
  for (const [pu, pv] of f.points) {
    const top = add(add(add([0, 0, 0], n, num(f.plane.offset)), u, num(pu)), v, num(pv));
    // start a hair above the face so the cut never leaves a skin
    let hole: Shape3D = makeCylinder(r, depth + EPS, add(top, n, EPS), down);
    if (f.style === "counterbore") {
      hole = hole.fuse(makeCylinder(num(f.headDiameter!) / 2, num(f.headDepth!) + EPS, add(top, n, EPS), down));
    } else if (f.style === "countersink") {
      // 90° cone: as deep as the radius difference
      const R = num(f.headDiameter!) / 2;
      const pl = new Plane(top, u, cross(u, n));
      const cone = draw([0, EPS])
        .lineTo([R + EPS, EPS])
        .lineTo([0, -R])
        .close()
        .sketchOnPlane(pl)
        .revolve(n, { origin: top }) as Shape3D;
      hole = hole.fuse(cone);
    }
    all = all ? all.fuse(hole) : hole;
  }
  return all!;
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function modify(
  body: Shape3D,
  f: Feature,
  num: (e: string) => number,
  tools: Map<string, { make: () => Shape3D; op: Op }>,
  apply: (s: Shape3D, op: Op) => void,
): Shape3D | void {
  switch (f.kind) {
    case "fillet":
      return body.fillet(num(f.radius), edgeFilter(body, f.edges));
    case "chamfer":
      return body.chamfer(num(f.distance), edgeFilter(body, f.edges));
    case "shell": {
      const [[, , z0], [, , z1]] = body.boundingBox.bounds;
      const z = f.open === "top" ? z1 : z0;
      // positive thickness keeps the outside dimensions and hollows inwards
      return body.shell(num(f.thickness), (face) => face.inPlane("XY", z));
    }
    case "mirror":
      return body.fuse(body.clone().mirror(f.plane));
    case "pattern": {
      const tool = tools.get(f.target)!;
      const count = num(f.count);
      for (let i = 1; i < count; i++) {
        const copy =
          f.mode === "linear"
            ? tool.make().translate([num(f.dx) * i, num(f.dy) * i, num(f.dz) * i])
            : tool.make().rotate((360 * i) / count, [num(f.cx), num(f.cy), 0], [0, 0, 1]);
        apply(copy, tool.op);
      }
      return;
    }
  }
}

type EdgeFinderFn = Parameters<Shape3D["fillet"]>[1];

function edgeFilter(body: Shape3D, sel: EdgeSel): EdgeFinderFn {
  if (sel === "all") return undefined;
  if (sel === "vertical") return (e) => e.inDirection("Z");
  const [[x0, y0, z0], [x1, y1, z1]] = body.boundingBox.bounds;
  const z = sel === "top" ? z1 : z0;
  return (e) => e.inBox([x0 - 1, y0 - 1, z - SEL], [x1 + 1, y1 + 1, z + SEL]);
}
