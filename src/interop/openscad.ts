import type { Doc } from "../model/doc";
import { printExpr } from "../model/params";
import { header, prepare } from "./common";

// Literal parameters become top-level variables, which OpenSCAD's Customizer shows as editable fields.
export function openscad(doc: Doc): string {
  const { params, features } = prepare(doc);
  const s = (e: string) => printExpr(e, "openscad");
  const out: string[] = [header(doc, "//"), "$fn = 64;", ""];
  for (const p of params) out.push(`${p.name} = ${s(p.expr)};${p.note ? ` // ${p.note}` : ""}`);
  out.push("");

  const solid = (i: number) => {
    const f = doc.features[i];
    const at = `translate([${f.at.map(s).join(", ")}])`;
    return f.kind === "box"
      ? `${at} cube([${f.size.map(s).join(", ")}]);`
      : `${at} cylinder(r = ${s(f.radius)}, h = ${s(f.height)});`;
  };
  const indent = (block: string) => block.replace(/^/gm, "  ");

  let acc = solid(0);
  for (let i = 1; i < features.length; i++) {
    acc = `${features[i].op === "add" ? "union" : "difference"}() {\n${indent(acc)}\n  ${solid(i)}\n}`;
  }
  out.push(acc, "");
  return out.join("\n");
}
