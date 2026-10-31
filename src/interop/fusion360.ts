import type { Doc } from "../model/doc";
import { printExpr } from "../model/params";
import { header, prepare } from "./common";

// Creates Fusion 360 User Parameters and drives sketch dimensions, extrude distances and
// sketch-plane offsets from them. Run via Utilities > Scripts and Add-Ins > Create > paste.
// shortcut: in-plane x/y positions are baked as numbers (only sizes, heights and z are parametric); upgrade with sketch distance dimensions to the origin.
export function fusion360(doc: Doc): string {
  const { params, features } = prepare(doc);
  const fx = (e: string) => JSON.stringify(printExpr(e, "fusion"));
  const cm = (mm: number) => +(mm / 10).toFixed(6); // Fusion API geometry is in cm
  const out: string[] = [
    header(doc, "#"),
    "import adsk.core, adsk.fusion, traceback",
    "",
    "",
    "def run(context):",
    "    ui = None",
    "    try:",
    "        app = adsk.core.Application.get()",
    "        ui = app.userInterface",
    "        design = adsk.fusion.Design.cast(app.activeProduct)",
    "        design.designType = adsk.fusion.DesignTypes.ParametricDesignType",
    "        up = design.userParameters",
    "        root = design.rootComponent",
    "        V = adsk.core.ValueInput.createByString",
    "        P = adsk.core.Point3D.create",
    "        ops = adsk.fusion.FeatureOperations",
    "",
    "        def param(name, expr, note):",
    "            existing = up.itemByName(name)",
    "            if existing:",
    "                existing.expression = expr",
    "            else:",
    '                up.add(name, V(expr), "mm", note)',
    "",
  ];
  for (const p of params) {
    const expr = p.literal ? `${printExpr(p.expr, "fusion")} mm` : printExpr(p.expr, "fusion");
    out.push(`        param(${JSON.stringify(p.name)}, ${JSON.stringify(expr)}, ${JSON.stringify(p.note ?? "")})`);
  }
  out.push("");

  features.forEach((r, i) => {
    const f = doc.features[i];
    const op = i === 0 ? "ops.NewBodyFeatureOperation" : f.op === "add" ? "ops.JoinFeatureOperation" : "ops.CutFeatureOperation";
    out.push(`        # ${f.id}`);
    out.push("        pi = root.constructionPlanes.createInput()");
    out.push(`        pi.setByOffset(root.xYConstructionPlane, V(${fx(f.at[2])}))`);
    out.push("        sk = root.sketches.add(root.constructionPlanes.add(pi))");
    out.push("        dims = sk.sketchDimensions");
    const [x, y] = [cm(r.at[0]), cm(r.at[1])];
    if (f.kind === "box" && r.kind === "box") {
      const [w, d] = [cm(r.size[0]), cm(r.size[1])];
      out.push(`        rect = sk.sketchCurves.sketchLines.addTwoPointRectangle(P(${x}, ${y}, 0), P(${x + w}, ${y + d}, 0))`);
      out.push(`        dims.addDistanceDimension(rect.item(0).startSketchPoint, rect.item(0).endSketchPoint, adsk.fusion.DimensionOrientations.HorizontalDimensionOrientation, P(${x + w / 2}, ${y - 0.5}, 0)).parameter.expression = ${fx(f.size[0])}`);
      out.push(`        dims.addDistanceDimension(rect.item(1).startSketchPoint, rect.item(1).endSketchPoint, adsk.fusion.DimensionOrientations.VerticalDimensionOrientation, P(${x + w + 0.5}, ${y + d / 2}, 0)).parameter.expression = ${fx(f.size[1])}`);
      out.push(`        root.features.extrudeFeatures.addSimple(sk.profiles.item(0), V(${fx(f.size[2])}), ${op})`);
    } else if (f.kind === "cylinder" && r.kind === "cylinder") {
      out.push(`        c = sk.sketchCurves.sketchCircles.addByCenterRadius(P(${x}, ${y}, 0), ${cm(r.radius)})`);
      out.push(`        dims.addDiameterDimension(c, P(${x + cm(r.radius)}, ${y + cm(r.radius)}, 0)).parameter.expression = ${JSON.stringify(`(${printExpr(f.radius, "fusion")}) * 2`)}`);
      out.push(`        root.features.extrudeFeatures.addSimple(sk.profiles.item(0), V(${fx(f.height)}), ${op})`);
    }
    out.push("");
  });
  out.push("    except:", "        if ui:", "            ui.messageBox(traceback.format_exc())", "");
  return out.join("\n");
}
