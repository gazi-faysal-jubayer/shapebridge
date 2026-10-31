// Pure document edits used by the designer UI (each returns a new doc; the store keeps history).
import type { Doc, Feature, Kind } from "./doc";
import { isValidName, parse, refs } from "./params";

// fields that hold names/enums, never expressions
const NOT_EXPR = new Set([
  "id",
  "kind",
  "op",
  "base",
  "type",
  "style",
  "edges",
  "open",
  "mode",
  "target",
  "name",
  "note",
  "format",
  "units",
  "plane",
]);

/** Calls `fn` on every expression string in a feature (including nested plane/profile/points). */
function eachExpr(node: unknown, fn: (e: string) => string, key = ""): unknown {
  if (typeof node === "string") return NOT_EXPR.has(key) ? node : fn(node);
  if (Array.isArray(node)) return node.map((x) => eachExpr(x, fn, key));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === "plane" && typeof v === "string" ? v : eachExpr(v, fn, k)]));
  }
  return node;
}

/** Every parameter name used anywhere in the document's features and other parameters. */
export function usedNames(doc: Doc, except?: string): Set<string> {
  const used = new Set<string>();
  const collect = (e: string) => {
    try {
      refs(parse(e)).forEach((r) => used.add(r));
    } catch {
      // an invalid expression references nothing yet; resolve() reports it
    }
    return e;
  };
  doc.features.forEach((f) => eachExpr(f, collect));
  doc.params.filter((p) => p.name !== except).forEach((p) => collect(p.expr));
  return used;
}

export function renameParam(doc: Doc, from: string, to: string): Doc {
  if (!isValidName(to)) throw new Error(`"${to}" is not a valid parameter name`);
  if (doc.params.some((p) => p.name === to)) throw new Error(`"${to}" already exists`);
  const re = new RegExp(`\\b${from}\\b`, "g");
  const swap = (e: string) => e.replace(re, to);
  return {
    ...doc,
    params: doc.params.map((p) => ({ ...p, name: p.name === from ? to : p.name, expr: swap(p.expr) })),
    features: doc.features.map((f) => eachExpr(f, swap) as Feature),
  };
}

export function deleteParam(doc: Doc, name: string): Doc {
  if (usedNames(doc, name).has(name)) throw new Error(`"${name}" is still used; remove its uses first`);
  return { ...doc, params: doc.params.filter((p) => p.name !== name) };
}

export function addParam(doc: Doc): Doc {
  let i = doc.params.length + 1;
  while (doc.params.some((p) => p.name === `p${i}`)) i++;
  return { ...doc, params: [...doc.params, { name: `p${i}`, expr: "10" }] };
}

export function uniqueId(doc: Doc, base: string): string {
  let i = 1;
  while (doc.features.some((f) => f.id === `${base}${i}`)) i++;
  return `${base}${i}`;
}

const xy = { base: "XY" as const, offset: "0" };

/** A sensible new feature of each kind, pointing at earlier features where needed. */
export function newFeature(doc: Doc, kind: Kind | "cut"): Feature {
  const id = uniqueId(doc, kind);
  const lastTool = [...doc.features].reverse().find((f) => f.kind === "extrude" || f.kind === "revolve" || f.kind === "hole");
  switch (kind) {
    case "extrude":
    case "cut":
      return {
        id,
        kind: "extrude",
        op: kind === "cut" ? "cut" : "add",
        plane: xy,
        profile: { type: "rect", x: "0", y: "0", w: "20", h: "20" },
        distance: "10",
      };
    case "revolve":
      return {
        id,
        kind: "revolve",
        op: "add",
        plane: { base: "XZ", offset: "0" },
        profile: { type: "rect", x: "0", y: "0", w: "10", h: "20" },
        angle: "360",
      };
    case "hole":
      return { id, kind: "hole", plane: xy, points: [["10", "10"]], diameter: "5", depth: "10", style: "simple" };
    case "fillet":
      return { id, kind: "fillet", radius: "1", edges: "top" };
    case "chamfer":
      return { id, kind: "chamfer", distance: "1", edges: "top" };
    case "shell":
      return { id, kind: "shell", thickness: "2", open: "top" };
    case "pattern":
      return { id, kind: "pattern", target: lastTool?.id ?? "", mode: "linear", dx: "15", dy: "0", dz: "0", count: "3" };
    case "mirror":
      return { id, kind: "mirror", plane: "YZ" };
  }
}

export function moveFeature(doc: Doc, i: number, by: -1 | 1): Doc {
  const j = i + by;
  if (j < 0 || j >= doc.features.length) return doc;
  const features = [...doc.features];
  [features[i], features[j]] = [features[j], features[i]];
  return { ...doc, features };
}

export function deleteFeature(doc: Doc, id: string): Doc {
  const users = doc.features.filter((f) => f.kind === "pattern" && f.target === id).map((f) => f.id);
  if (users.length) throw new Error(`${users.join(", ")} uses "${id}"; delete ${users.length > 1 ? "them" : "it"} first`);
  return { ...doc, features: doc.features.filter((f) => f.id !== id), suppressed: doc.suppressed?.filter((s) => s !== id) };
}

export function toggleSuppressed(doc: Doc, id: string): Doc {
  const s = new Set(doc.suppressed ?? []);
  s.has(id) ? s.delete(id) : s.add(id);
  return { ...doc, suppressed: [...s] };
}

/** "a, b" → ["a", "b"], splitting on the first top-level comma so max(a, b) survives. */
export function splitPair(line: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") depth--;
    else if (line[i] === "," && depth === 0) return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }
  return null;
}

/** Renames a feature, keeping patterns that copy it and the suppressed list pointing at it. */
export function renameFeature(doc: Doc, from: string, to: string): Doc {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(to)) throw new Error(`"${to}" is not a valid feature name (letters, digits, _)`);
  if (doc.features.some((f) => f.id === to)) throw new Error(`"${to}" already exists`);
  return {
    ...doc,
    features: doc.features.map((f) => ({
      ...f,
      id: f.id === from ? to : f.id,
      ...(f.kind === "pattern" && f.target === from ? { target: to } : {}),
    })) as Feature[],
    suppressed: doc.suppressed?.map((s) => (s === from ? to : s)),
  };
}
