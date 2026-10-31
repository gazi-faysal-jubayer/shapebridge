// ShapeBridge parametric document, format v2: named parameters + an ordered feature list.
// Every number is an expression string so it stays parametric in every export target.
import { evalParams, evaluate, parse, type Param } from "./params";

export type Op = "add" | "cut";
export type PlaneName = "XY" | "XZ" | "YZ";
export type EdgeSel = "all" | "vertical" | "top" | "bottom";
export type XY = [string, string];

/** Sketch plane: a base plane shifted along its normal (XY → +Z, XZ → −Y, YZ → +X). */
export interface SketchPlane {
  base: PlaneName;
  offset: string;
}

export type Profile =
  | { type: "rect"; x: string; y: string; w: string; h: string }
  | { type: "circle"; cx: string; cy: string; r: string }
  | { type: "polygon"; cx: string; cy: string; r: string; sides: number }
  | { type: "polyline"; points: XY[] };

export type Feature =
  | { id: string; kind: "extrude"; op: Op; plane: SketchPlane; profile: Profile; distance: string; symmetric?: boolean }
  /** revolves the profile about the sketch's vertical (v) axis; keep the profile at u >= 0 */
  | { id: string; kind: "revolve"; op: Op; plane: SketchPlane; profile: Profile; angle: string }
  /** drilled from the sketch plane against its normal */
  | {
      id: string;
      kind: "hole";
      plane: SketchPlane;
      points: XY[];
      diameter: string;
      depth: string;
      style: "simple" | "counterbore" | "countersink";
      headDiameter?: string;
      headDepth?: string;
    }
  | { id: string; kind: "fillet"; radius: string; edges: EdgeSel }
  | { id: string; kind: "chamfer"; distance: string; edges: EdgeSel }
  | { id: string; kind: "shell"; thickness: string; open: "top" | "bottom" }
  | { id: string; kind: "pattern"; target: string; mode: "linear"; dx: string; dy: string; dz: string; count: string }
  /** copies spaced evenly around the Z axis through (cx, cy) */
  | { id: string; kind: "pattern"; target: string; mode: "polar"; cx: string; cy: string; count: string }
  | { id: string; kind: "mirror"; plane: PlaneName };

export type Kind = Feature["kind"];

export interface Doc {
  format: "shapebridge/2";
  name: string;
  units: "mm";
  params: Param[];
  features: Feature[];
  /** features from this index on are rolled back (not built) */
  rollback?: number;
  suppressed?: string[];
}

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLANES = new Set(["XY", "XZ", "YZ"]);
const EDGES = new Set(["all", "vertical", "top", "bottom"]);
/** features whose solid can be patterned */
export const toolKinds = new Set<Kind>(["extrude", "revolve", "hole"]);

/** The features that will actually be built (honours rollback and suppression). */
export function activeFeatures(doc: Doc): Feature[] {
  const off = new Set(doc.suppressed ?? []);
  return doc.features.slice(0, doc.rollback ?? doc.features.length).filter((f) => !off.has(f.id));
}

/**
 * Validates a doc (trust boundary: files from disk or peers) and evaluates every expression.
 * Returns parameter values and a numeric getter for feature fields.
 */
export function resolve(doc: Doc): { env: Record<string, number>; num: (e: string) => number; features: Feature[] } {
  if (doc?.format !== "shapebridge/2") throw new Error("Not a ShapeBridge v2 document");
  if (!ID.test(doc.name ?? "")) throw new Error("Document name must be a simple identifier");
  if (!Array.isArray(doc.features)) throw new Error("Document has no feature list");
  const env = evalParams(doc.params ?? []);
  const num = (e: string) => {
    const v = evaluate(parse(String(e)), env);
    if (!Number.isFinite(v)) throw new Error(`"${e}" is not a finite number`);
    return v;
  };
  const pos = (e: string, what: string, id: string) => {
    if (num(e) <= 0) throw new Error(`${id}: ${what} must be positive`);
  };
  const ids = new Set<string>();
  const features = activeFeatures(doc);
  features.forEach((f, i) => {
    if (!ID.test(f.id) || ids.has(f.id)) throw new Error(`Bad or duplicate feature id "${f.id}"`);
    ids.add(f.id);
    const solidSoFar = i > 0;
    switch (f.kind) {
      case "extrude":
      case "revolve":
        if (f.op !== "add" && f.op !== "cut") throw new Error(`${f.id}: unknown op`);
        if (!solidSoFar && f.op === "cut") throw new Error(`${f.id}: the first feature must add material`);
        checkPlane(f.plane, num, f.id);
        checkProfile(f.profile, num, f.id);
        if (f.kind === "revolve") pos(f.angle, "angle", f.id);
        else if (num(f.distance) === 0) throw new Error(`${f.id}: distance can't be 0`);
        break;
      case "hole":
        if (!solidSoFar) throw new Error(`${f.id}: a hole needs a solid to cut`);
        checkPlane(f.plane, num, f.id);
        if (!Array.isArray(f.points) || f.points.length === 0 || f.points.length > 256) throw new Error(`${f.id}: 1–256 hole positions`);
        f.points.forEach((p) => p.forEach(num));
        pos(f.diameter, "diameter", f.id);
        pos(f.depth, "depth", f.id);
        if (!["simple", "counterbore", "countersink"].includes(f.style)) throw new Error(`${f.id}: unknown hole style`);
        if (f.style !== "simple") {
          pos(f.headDiameter ?? "0", "head diameter", f.id);
          if (num(f.headDiameter!) <= num(f.diameter)) throw new Error(`${f.id}: head diameter must exceed the hole diameter`);
        }
        if (f.style === "counterbore") pos(f.headDepth ?? "0", "head depth", f.id);
        break;
      case "fillet":
      case "chamfer":
        if (!solidSoFar) throw new Error(`${f.id}: needs a solid`);
        pos(f.kind === "fillet" ? f.radius : f.distance, f.kind === "fillet" ? "radius" : "distance", f.id);
        if (!EDGES.has(f.edges)) throw new Error(`${f.id}: unknown edge selection`);
        break;
      case "shell":
        if (!solidSoFar) throw new Error(`${f.id}: needs a solid`);
        pos(f.thickness, "thickness", f.id);
        if (f.open !== "top" && f.open !== "bottom") throw new Error(`${f.id}: open must be top or bottom`);
        break;
      case "pattern": {
        const target = features.slice(0, i).find((t) => t.id === f.target);
        if (!target || !toolKinds.has(target.kind)) throw new Error(`${f.id}: target must be an earlier extrude, revolve or hole`);
        const n = num(f.count);
        if (!Number.isInteger(n) || n < 2 || n > 200) throw new Error(`${f.id}: count must be a whole number from 2 to 200`);
        if (f.mode === "linear") [f.dx, f.dy, f.dz].forEach(num);
        else if (f.mode === "polar") [f.cx, f.cy].forEach(num);
        else throw new Error(`${(f as { id: string }).id}: unknown pattern mode`);
        break;
      }
      case "mirror":
        if (!solidSoFar) throw new Error(`${f.id}: needs a solid`);
        if (!PLANES.has(f.plane)) throw new Error(`${f.id}: unknown mirror plane`);
        break;
      default:
        throw new Error(`Unknown feature kind "${(f as Feature).kind}"`);
    }
  });
  return { env, num, features };
}

function checkPlane(p: SketchPlane, num: (e: string) => number, id: string) {
  if (!p || !PLANES.has(p.base)) throw new Error(`${id}: unknown sketch plane`);
  num(p.offset);
}

function checkProfile(p: Profile, num: (e: string) => number, id: string) {
  switch (p?.type) {
    case "rect":
      if (num(p.w) <= 0 || num(p.h) <= 0) throw new Error(`${id}: rectangle needs positive width and height`);
      [p.x, p.y].forEach(num);
      return;
    case "circle":
    case "polygon":
      if (num(p.r) <= 0) throw new Error(`${id}: radius must be positive`);
      [p.cx, p.cy].forEach(num);
      if (p.type === "polygon" && (!Number.isInteger(p.sides) || p.sides < 3 || p.sides > 64))
        throw new Error(`${id}: polygon needs 3–64 sides`);
      return;
    case "polyline":
      if (!Array.isArray(p.points) || p.points.length < 3 || p.points.length > 500) throw new Error(`${id}: polyline needs 3–500 points`);
      p.points.forEach((pt) => pt.forEach(num));
      return;
    default:
      throw new Error(`${id}: unknown profile`);
  }
}

/** Accepts v1 (box/cylinder primitives) and v2 documents; returns v2. */
export function migrate(raw: unknown): Doc {
  const d = raw as { format?: string };
  if (d?.format === "shapebridge/2") return raw as Doc;
  if (d?.format !== "shapebridge/1") throw new Error("Not a ShapeBridge document");
  const v1 = raw as { name: string; params: Param[]; features: V1Feature[] };
  return {
    format: "shapebridge/2",
    name: v1.name,
    units: "mm",
    params: v1.params,
    features: v1.features.map((f): Feature => {
      const plane = { base: "XY" as const, offset: f.at[2] };
      return f.kind === "box"
        ? {
            id: f.id,
            kind: "extrude",
            op: f.op,
            plane,
            profile: { type: "rect", x: f.at[0], y: f.at[1], w: f.size[0], h: f.size[1] },
            distance: f.size[2],
          }
        : {
            id: f.id,
            kind: "extrude",
            op: f.op,
            plane,
            profile: { type: "circle", cx: f.at[0], cy: f.at[1], r: f.radius },
            distance: f.height,
          };
    }),
  };
}
type V1Feature =
  | { id: string; kind: "box"; op: Op; at: [string, string, string]; size: [string, string, string] }
  | { id: string; kind: "cylinder"; op: Op; at: [string, string, string]; radius: string; height: string };

const plane = (base: PlaneName = "XY", offset = "0"): SketchPlane => ({ base, offset });

export const templates: Doc[] = [
  {
    format: "shapebridge/2",
    name: "bracket",
    units: "mm",
    params: [
      { name: "width", expr: "80", note: "overall length" },
      { name: "depth", expr: "40" },
      { name: "thickness", expr: "8" },
      { name: "boss_r", expr: "12" },
      { name: "boss_h", expr: "thickness * 2" },
      { name: "hole_d", expr: "boss_r" },
      { name: "corner_r", expr: "4" },
    ],
    features: [
      {
        id: "base",
        kind: "extrude",
        op: "add",
        plane: plane(),
        profile: { type: "rect", x: "0", y: "0", w: "width", h: "depth" },
        distance: "thickness",
      },
      { id: "corners", kind: "fillet", radius: "corner_r", edges: "vertical" },
      {
        id: "boss",
        kind: "extrude",
        op: "add",
        plane: plane("XY", "thickness"),
        profile: { type: "circle", cx: "width / 2", cy: "depth / 2", r: "boss_r" },
        distance: "boss_h",
      },
      {
        id: "bore",
        kind: "hole",
        plane: plane("XY", "thickness + boss_h"),
        points: [["width / 2", "depth / 2"]],
        diameter: "hole_d",
        depth: "thickness + boss_h",
        style: "simple",
      },
      {
        id: "mount",
        kind: "hole",
        plane: plane("XY", "thickness"),
        points: [
          ["thickness * 1.5", "depth / 2"],
          ["width - thickness * 1.5", "depth / 2"],
        ],
        diameter: "6.6",
        depth: "thickness",
        style: "counterbore",
        headDiameter: "11",
        headDepth: "3",
      },
    ],
  },
  {
    format: "shapebridge/2",
    name: "enclosure",
    units: "mm",
    params: [
      { name: "length", expr: "100" },
      { name: "width", expr: "60" },
      { name: "height", expr: "35" },
      { name: "wall", expr: "2.5" },
      { name: "radius", expr: "6" },
    ],
    features: [
      {
        id: "body",
        kind: "extrude",
        op: "add",
        plane: plane(),
        profile: { type: "rect", x: "0", y: "0", w: "length", h: "width" },
        distance: "height",
      },
      { id: "round", kind: "fillet", radius: "radius", edges: "vertical" },
      { id: "hollow", kind: "shell", thickness: "wall", open: "top" },
    ],
  },
  {
    format: "shapebridge/2",
    name: "flange",
    units: "mm",
    params: [
      { name: "outer_d", expr: "120" },
      { name: "bore_d", expr: "40" },
      { name: "plate", expr: "12" },
      { name: "hub_d", expr: "60" },
      { name: "hub_h", expr: "20" },
      { name: "bolt_circle", expr: "45" },
      { name: "bolts", expr: "6" },
    ],
    features: [
      {
        id: "disc",
        kind: "extrude",
        op: "add",
        plane: plane(),
        profile: { type: "circle", cx: "0", cy: "0", r: "outer_d / 2" },
        distance: "plate",
      },
      {
        id: "hub",
        kind: "extrude",
        op: "add",
        plane: plane("XY", "plate"),
        profile: { type: "circle", cx: "0", cy: "0", r: "hub_d / 2" },
        distance: "hub_h",
      },
      {
        id: "bore",
        kind: "hole",
        plane: plane("XY", "plate + hub_h"),
        points: [["0", "0"]],
        diameter: "bore_d",
        depth: "plate + hub_h",
        style: "simple",
      },
      {
        id: "bolt",
        kind: "hole",
        plane: plane("XY", "plate"),
        points: [["bolt_circle", "0"]],
        diameter: "9",
        depth: "plate",
        style: "simple",
      },
      { id: "bolt_ring", kind: "pattern", target: "bolt", mode: "polar", cx: "0", cy: "0", count: "bolts" },
      { id: "edge", kind: "chamfer", distance: "1", edges: "top" },
    ],
  },
  {
    format: "shapebridge/2",
    name: "knob",
    units: "mm",
    params: [
      { name: "r", expr: "15" },
      { name: "h", expr: "18" },
      { name: "grip", expr: "2" },
      { name: "shaft_d", expr: "6" },
    ],
    features: [
      {
        id: "body",
        kind: "revolve",
        op: "add",
        plane: plane("XZ"),
        profile: {
          type: "polyline",
          points: [
            ["0", "0"],
            ["r", "0"],
            ["r", "h * 0.7"],
            ["r * 0.6", "h"],
            ["0", "h"],
          ],
        },
        angle: "360",
      },
      {
        id: "flute",
        kind: "extrude",
        op: "cut",
        plane: plane(),
        profile: { type: "circle", cx: "r + grip * 0.4", cy: "0", r: "grip" },
        distance: "h * 0.7",
      },
      { id: "flutes", kind: "pattern", target: "flute", mode: "polar", cx: "0", cy: "0", count: "12" },
      { id: "shaft", kind: "hole", plane: plane("XY", "h * 0.6"), points: [["0", "0"]], diameter: "shaft_d", depth: "h * 0.6", style: "simple" },
    ],
  },
];

export const sampleDoc: Doc = templates[0];
