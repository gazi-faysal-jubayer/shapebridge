import type { Doc } from "../model/doc";
import { printExpr } from "../model/params";
import { header, prepare } from "./common";

// Literal parameters become keyword arguments of build(); derived ones are computed inside it.
export function cadquery(doc: Doc): string {
  const { params } = prepare(doc);
  const py = (e: string) => printExpr(e, "python");
  const args = params.filter((p) => p.literal).map((p) => `${p.name}=${py(p.expr)}`);
  const out: string[] = [header(doc, "#"), "import cadquery as cq", "from math import sqrt", "", "", `def build(${args.join(", ")}):`];
  for (const p of params.filter((p) => !p.literal)) out.push(`    ${p.name} = ${py(p.expr)}`);

  doc.features.forEach((f, i) => {
    const at = `(${f.at.map(py).join(", ")})`;
    const solid =
      f.kind === "box"
        ? `cq.Workplane("XY").box(${f.size.map(py).join(", ")}, centered=False).translate(${at})`
        : `cq.Workplane("XY").cylinder(${py(f.height)}, ${py(f.radius)}, centered=(True, True, False)).translate(${at})`;
    if (i === 0) out.push(`    result = ${solid}`);
    else out.push(`    result = result.${f.op === "add" ? "union" : "cut"}(${solid})  # ${f.id}`);
  });
  out.push("    return result", "", "", "result = build()");
  out.push('if "show_object" in globals():', "    show_object(result)", "else:", `    cq.exporters.export(result, ${JSON.stringify(doc.name + ".step")})`, "");
  return out.join("\n");
}
