// Parametric exporters: each turns a Doc into a script the target CAD tool runs natively,
// with the doc's parameters exposed as that tool's own editable parameters.
import type { Doc } from "../model/doc";
import { printExpr } from "../model/params";
import { prepare } from "./common";
import { freecad } from "./freecad";
import { openscad } from "./openscad";
import { cadquery } from "./cadquery";
import { fusion360 } from "./fusion360";

export interface InteropTarget {
  id: string;
  label: string;
  ext: string;
  generate: (doc: Doc) => string;
}

export const targets: InteropTarget[] = [
  { id: "freecad", label: "FreeCAD macro", ext: "FCMacro", generate: freecad },
  { id: "openscad", label: "OpenSCAD", ext: "scad", generate: openscad },
  { id: "cadquery", label: "CadQuery (Python)", ext: "py", generate: cadquery },
  { id: "fusion360", label: "Fusion 360 script", ext: "py", generate: fusion360 },
  { id: "csv", label: "Parameter table (CSV)", ext: "csv", generate: paramsCsv },
];

/** Parameter table for tools without a scriptable import (SolidWorks design tables, Inventor, Onshape). */
export function paramsCsv(doc: Doc): string {
  const { env, params } = prepare(doc);
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = params.map((p) => [p.name, q(printExpr(p.expr, "plain")), env[p.name], q(p.note ?? "")].join(","));
  return ["name,expression,value_mm,note", ...rows].join("\n") + "\n";
}
