import type { Doc } from "../model/doc";
import { printExpr } from "../model/params";
import { header, prepare } from "./common";

// Parameters live in a Spreadsheet named "Params" (aliases = names); every feature
// dimension and placement is bound to it with setExpression, so editing a cell rebuilds.
export function freecad(doc: Doc): string {
  const { params } = prepare(doc);
  const fc = (e: string) => JSON.stringify(printExpr(e, "freecad"));
  const out: string[] = [header(doc, "#"), "import FreeCAD as App", "", `doc = App.newDocument(${JSON.stringify(doc.name)})`];
  out.push('sheet = doc.addObject("Spreadsheet::Sheet", "Params")');
  params.forEach((p, i) => {
    const row = i + 1;
    out.push(`sheet.set("A${row}", ${JSON.stringify(p.name)})`);
    // plain names resolve to aliases inside the same sheet
    const value = p.literal ? printExpr(p.expr, "plain") : `=${printExpr(p.expr, "plain")}`;
    out.push(`sheet.set("B${row}", ${JSON.stringify(value)})`);
    out.push(`sheet.setAlias("B${row}", ${JSON.stringify(p.name)})`);
    if (p.note) out.push(`sheet.set("C${row}", ${JSON.stringify(p.note)})`);
  });
  out.push("doc.recompute()", "");

  let acc = "";
  for (const f of doc.features) {
    if (f.kind === "box") {
      out.push(`${f.id} = doc.addObject("Part::Box", "${f.id}")`);
      ["Length", "Width", "Height"].forEach((prop, i) => out.push(`${f.id}.setExpression("${prop}", ${fc(f.size[i])})`));
    } else {
      out.push(`${f.id} = doc.addObject("Part::Cylinder", "${f.id}")`);
      out.push(`${f.id}.setExpression("Radius", ${fc(f.radius)})`);
      out.push(`${f.id}.setExpression("Height", ${fc(f.height)})`);
    }
    ["x", "y", "z"].forEach((axis, i) => out.push(`${f.id}.setExpression("Placement.Base.${axis}", ${fc(f.at[i])})`));
    if (acc) {
      const name = `${f.op === "add" ? "fuse" : "cut"}_${f.id}`;
      out.push(`${name} = doc.addObject("Part::${f.op === "add" ? "Fuse" : "Cut"}", "${name}")`);
      out.push(`${name}.Base = ${acc}`, `${name}.Tool = ${f.id}`);
      acc = name;
    } else acc = f.id;
    out.push("");
  }
  out.push(`${acc}.Label = ${JSON.stringify(doc.name)}`, "doc.recompute()");
  out.push("if App.GuiUp:", "    import FreeCADGui", '    FreeCADGui.SendMsgToActiveView("ViewFit")', "");
  return out.join("\n");
}
