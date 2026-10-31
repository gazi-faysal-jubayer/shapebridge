import { evalParams, evaluate, parse, type Param } from "./params";

export type Vec3 = [string, string, string];
export type Op = "add" | "cut";

/** Primitive solids combined in order: each feature is added to or cut from everything before it. */
export type Feature =
  | { id: string; kind: "box"; op: Op; at: Vec3; size: Vec3 }
  | { id: string; kind: "cylinder"; op: Op; at: Vec3; radius: string; height: string };

export interface Doc {
  format: "shapebridge/1";
  name: string;
  units: "mm";
  params: Param[];
  features: Feature[];
}

export type Resolved =
  | { id: string; kind: "box"; op: Op; at: number[]; size: number[] }
  | { id: string; kind: "cylinder"; op: Op; at: number[]; radius: number; height: number };

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Validates a doc (trust boundary: files from disk or peers) and evaluates every expression. */
export function resolve(doc: Doc): { env: Record<string, number>; features: Resolved[] } {
  if (doc?.format !== "shapebridge/1") throw new Error("Not a ShapeBridge document");
  if (!ID.test(doc.name ?? "")) throw new Error("Document name must be a simple identifier");
  if (!Array.isArray(doc.features) || doc.features.length === 0) throw new Error("Document has no features");
  if (doc.features[0].op !== "add") throw new Error("First feature must add material");
  const env = evalParams(doc.params ?? []);
  const ev = (e: string) => {
    const v = evaluate(parse(String(e)), env);
    if (!Number.isFinite(v)) throw new Error(`"${e}" is not a finite number`);
    return v;
  };
  const ids = new Set<string>();
  const features = doc.features.map((f): Resolved => {
    if (!ID.test(f.id) || ids.has(f.id)) throw new Error(`Bad or duplicate feature id "${f.id}"`);
    ids.add(f.id);
    if (f.op !== "add" && f.op !== "cut") throw new Error(`Feature "${f.id}" has unknown op`);
    if (f.kind === "box") return { ...f, at: f.at.map(ev), size: f.size.map(ev) };
    if (f.kind === "cylinder") return { ...f, at: f.at.map(ev), radius: ev(f.radius), height: ev(f.height) };
    throw new Error(`Unknown feature kind "${(f as Feature).kind}"`);
  });
  for (const f of features) {
    const dims = f.kind === "box" ? f.size : [f.radius, f.height];
    if (dims.some((v) => v <= 0)) throw new Error(`Feature "${f.id}" needs positive dimensions`);
  }
  return { env, features };
}

export const sampleDoc: Doc = {
  format: "shapebridge/1",
  name: "bracket",
  units: "mm",
  params: [
    { name: "width", expr: "80", note: "overall length" },
    { name: "depth", expr: "40" },
    { name: "thickness", expr: "8" },
    { name: "boss_r", expr: "12" },
    { name: "boss_h", expr: "thickness * 2" },
    { name: "hole_r", expr: "boss_r / 2" },
  ],
  features: [
    { id: "base", kind: "box", op: "add", at: ["0", "0", "0"], size: ["width", "depth", "thickness"] },
    { id: "boss", kind: "cylinder", op: "add", at: ["width / 2", "depth / 2", "thickness"], radius: "boss_r", height: "boss_h" },
    { id: "hole", kind: "cylinder", op: "cut", at: ["width / 2", "depth / 2", "0"], radius: "hole_r", height: "thickness + boss_h" },
    { id: "slot_l", kind: "cylinder", op: "cut", at: ["thickness * 1.5", "depth / 2", "0"], radius: "thickness / 2", height: "thickness" },
    { id: "slot_r", kind: "cylinder", op: "cut", at: ["width - thickness * 1.5", "depth / 2", "0"], radius: "thickness / 2", height: "thickness" },
  ],
};
