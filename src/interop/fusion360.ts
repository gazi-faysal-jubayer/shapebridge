import type { Doc, Profile, SketchPlane } from "../model/doc";
import { FRAMES, outline, toWorld } from "../model/geometry";
import { printExpr } from "../model/params";
import { header, isTool, prepare } from "./common";

// Creates Fusion 360 User Parameters and drives plane offsets, extrude/revolve extents, hole sizes,
// fillet/chamfer/shell sizes and pattern counts from them. Run via Utilities > Scripts and Add-Ins.
// shortcut: sketch vertex positions are placed as numbers (sizes and depths stay parametric); bind them with sketch dimensions once a Fusion test rig exists.
// Experimental: not verified in Fusion automatically; directions are resolved at run time from Fusion's own plane normals.
export function fusion360(doc: Doc): string {
  const { params, features, num } = prepare(doc);
  const fx = (e: string) => JSON.stringify(printExpr(e, "fusion"));
  const mm = (e: string) => JSON.stringify(`(${printExpr(e, "fusion")}) * 1 mm`);
  const cm = (e: string) => +(num(e) / 10).toFixed(6); // Fusion API geometry is in cm
  const out: string[] = [
    header(doc, "#"),
    "import adsk.core, adsk.fusion, traceback",
    "",
    `FRAMES = {${Object.entries(FRAMES)
      .map(([k, f]) => `"${k}": (${tup(f.u)}, ${tup(f.v)}, ${tup(f.n)})`)
      .join(", ")}}`,
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
    "        Dir = adsk.fusion.ExtentDirections",
    "        bases = {'XY': root.xYConstructionPlane, 'XZ': root.xZConstructionPlane, 'YZ': root.yZConstructionPlane}",
    "",
    "        def param(name, expr, note):",
    "            existing = up.itemByName(name)",
    "            if existing:",
    "                existing.expression = expr",
    "            else:",
    '                up.add(name, V(expr), "mm", note)',
    "",
    "        def sketch_on(base, offset_expr):",
    "            # Fusion's base planes may face the other way from ShapeBridge's; flip the offset to match",
    "            n = FRAMES[base][2]",
    "            fn = bases[base].geometry.normal",
    "            sign = '' if fn.x * n[0] + fn.y * n[1] + fn.z * n[2] > 0 else '-'",
    "            pi = root.constructionPlanes.createInput()",
    "            pi.setByOffset(bases[base], V(sign + '(' + offset_expr + ')'))",
    "            sk = root.sketches.add(root.constructionPlanes.add(pi))",
    "            same = sk.xDirection.crossProduct(sk.yDirection).dotProduct(adsk.core.Vector3D.create(*n)) > 0",
    "            return sk, same",
    "",
    "        def to_sketch(sk, world):",
    "            return sk.modelToSketchSpace(P(*world))",
    "",
    "        def poly(sk, pts):",
    "            lines = sk.sketchCurves.sketchLines",
    "            ps = [to_sketch(sk, p) for p in pts]",
    "            for i in range(len(ps)):",
    "                lines.addByTwoPoints(ps[i], ps[(i + 1) % len(ps)])",
    "",
    "        def pick_edges(body, sel):",
    "            edges = adsk.core.ObjectCollection.create()",
    "            box = body.boundingBox",
    "            for e in body.edges:",
    "                ok = sel == 'all'",
    "                if sel == 'vertical':",
    "                    g = e.geometry",
    "                    ok = isinstance(g, adsk.core.Line3D) and abs(abs(g.startPoint.vectorTo(g.endPoint).z) - g.startPoint.distanceTo(g.endPoint)) < 1e-6",
    "                elif sel in ('top', 'bottom'):",
    "                    z = box.maxPoint.z if sel == 'top' else box.minPoint.z",
    "                    ok = abs(e.boundingBox.minPoint.z - z) < 1e-3 and abs(e.boundingBox.maxPoint.z - z) < 1e-3",
    "                if ok:",
    "                    edges.add(e)",
    "            return edges",
    "",
  ];
  for (const p of params) {
    const expr = p.literal ? `${printExpr(p.expr, "fusion")} mm` : printExpr(p.expr, "fusion");
    out.push(`        param(${JSON.stringify(p.name)}, ${JSON.stringify(expr)}, ${JSON.stringify(p.note ?? "")})`);
  }
  out.push("        body = None", "");

  const sketch = (pl: SketchPlane, profile: Profile) => {
    out.push(`        sk, same = sketch_on("${pl.base}", ${fx(pl.offset)})`);
    const o = outline(profile);
    const world = (pt: [string, string]) => tup(toWorld(pl, pt).map((e) => cm(e)));
    if (o.kind === "circle") out.push(`        sk.sketchCurves.sketchCircles.addByCenterRadius(to_sketch(sk, ${world(o.c)}), ${cm(o.r)})`);
    else out.push(`        poly(sk, [${o.points.map(world).join(", ")}])`);
  };
  const opOf = (op: "add" | "cut") =>
    `ops.NewBodyFeatureOperation if body is None else ops.${op === "add" ? "Join" : "Cut"}FeatureOperation`;

  for (const f of features) {
    out.push(`        # ${f.id}`);
    if (f.kind === "extrude") {
      sketch(f.plane, f.profile);
      out.push(`        inp = root.features.extrudeFeatures.createInput(sk.profiles.item(0), ${opOf(f.op)})`);
      if (f.symmetric) out.push(`        inp.setSymmetricExtent(V(${mm(f.distance)}), True)`);
      else
        out.push(
          `        inp.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(V(${mm(`abs(${f.distance})`)})), Dir.PositiveExtentDirection if same == (${num(f.distance) > 0 ? "True" : "False"}) else Dir.NegativeExtentDirection)`,
        );
      out.push(`        ${f.id} = root.features.extrudeFeatures.add(inp)`);
    } else if (f.kind === "revolve") {
      sketch(f.plane, f.profile);
      const axisEnd = tup(toWorld(f.plane, ["0", "1"]).map((e) => cm(e)));
      const axisStart = tup(toWorld(f.plane, ["0", "0"]).map((e) => cm(e)));
      out.push(
        `        axis = sk.sketchCurves.sketchLines.addByTwoPoints(to_sketch(sk, ${axisStart}), to_sketch(sk, ${axisEnd}))`,
        "        axis.isConstruction = True",
        `        inp = root.features.revolveFeatures.createInput(sk.profiles.item(0), axis, ${opOf(f.op)})`,
        `        inp.setAngleExtent(False, V(${JSON.stringify(`(${printExpr(f.angle, "fusion")}) * 1 deg`)}))`,
        `        ${f.id} = root.features.revolveFeatures.add(inp)`,
      );
    } else if (f.kind === "hole") {
      out.push(
        `        sk, same = sketch_on("${f.plane.base}", ${fx(f.plane.offset)})`,
        "        pts = adsk.core.ObjectCollection.create()",
      );
      for (const pt of f.points)
        out.push(`        pts.add(sk.sketchPoints.add(to_sketch(sk, ${tup(toWorld(f.plane, pt).map((e) => cm(e)))})))`);
      const holes = "root.features.holeFeatures";
      if (f.style === "simple") out.push(`        inp = ${holes}.createSimpleInput(V(${mm(f.diameter)}))`);
      if (f.style === "counterbore")
        out.push(`        inp = ${holes}.createCounterboreInput(V(${mm(f.diameter)}), V(${mm(f.headDiameter!)}), V(${mm(f.headDepth!)}))`);
      if (f.style === "countersink")
        out.push(`        inp = ${holes}.createCountersinkInput(V(${mm(f.diameter)}), V(${mm(f.headDiameter!)}), V("90 deg"))`);
      out.push(
        "        inp.setPositionBySketchPoints(pts)",
        `        inp.setDistanceExtent(V(${mm(f.depth)}))`,
        `        ${f.id} = ${holes}.add(inp)`,
      );
    } else if (f.kind === "fillet") {
      out.push(
        "        inp = root.features.filletFeatures.createInput()",
        `        inp.edgeSetInputs.addConstantRadiusEdgeSet(pick_edges(body, "${f.edges}"), V(${mm(f.radius)}), True)`,
        `        ${f.id} = root.features.filletFeatures.add(inp)`,
      );
    } else if (f.kind === "chamfer") {
      out.push(
        `        inp = root.features.chamferFeatures.createInput2()`,
        `        inp.chamferEdgeSets.addEqualDistanceChamferEdgeSet(pick_edges(body, "${f.edges}"), V(${mm(f.distance)}), True)`,
        `        ${f.id} = root.features.chamferFeatures.add(inp)`,
      );
    } else if (f.kind === "shell") {
      out.push(
        "        faces = adsk.core.ObjectCollection.create()",
        `        z = body.boundingBox.${f.open === "top" ? "maxPoint" : "minPoint"}.z`,
        "        [faces.add(fc) for fc in body.faces if abs(fc.boundingBox.minPoint.z - z) < 1e-3 and abs(fc.boundingBox.maxPoint.z - z) < 1e-3]",
        "        inp = root.features.shellFeatures.createInput(faces, False)",
        `        inp.insideThickness = V(${mm(f.thickness)})`,
        `        ${f.id} = root.features.shellFeatures.add(inp)`,
      );
    } else if (f.kind === "pattern") {
      out.push("        ents = adsk.core.ObjectCollection.create()", `        ents.add(${f.target})`);
      if (f.mode === "polar") {
        if (num(f.cx) !== 0 || num(f.cy) !== 0)
          out.push(`        # NOTE: Fusion's Z axis is at the origin; this pattern's centre (${num(f.cx)}, ${num(f.cy)}) is not applied`);
        out.push(
          "        inp = root.features.circularPatternFeatures.createInput(ents, root.zConstructionAxis)",
          `        inp.quantity = V(${fx(f.count)})`,
          `        ${f.id} = root.features.circularPatternFeatures.add(inp)`,
        );
      } else {
        const [dx, dy, dz] = [f.dx, f.dy, f.dz].map(num);
        const axis =
          dy === 0 && dz === 0
            ? ["xConstructionAxis", f.dx]
            : dx === 0 && dz === 0
              ? ["yConstructionAxis", f.dy]
              : dx === 0 && dy === 0
                ? ["zConstructionAxis", f.dz]
                : null;
        if (!axis)
          out.push(`        # NOTE: Fusion patterns run along one axis; diagonal spacing (${dx}, ${dy}, ${dz}) is not supported here`);
        else
          out.push(
            `        inp = root.features.rectangularPatternFeatures.createInput(ents, root.${axis[0]}, V(${fx(f.count)}), V(${mm(axis[1])}), adsk.fusion.PatternDistanceType.SpacingPatternDistanceType)`,
            `        ${f.id} = root.features.rectangularPatternFeatures.add(inp)`,
          );
      }
    } else if (f.kind === "mirror") {
      const plane = { XY: "xYConstructionPlane", XZ: "xZConstructionPlane", YZ: "yZConstructionPlane" }[f.plane];
      out.push(
        "        ents = adsk.core.ObjectCollection.create()",
        "        ents.add(body)",
        `        inp = root.features.mirrorFeatures.createInput(ents, root.${plane})`,
        "        inp.isCombine = True",
        `        ${f.id} = root.features.mirrorFeatures.add(inp)`,
      );
    }
    if (isTool(f) || f.kind === "fillet") out.push("        body = body or root.bRepBodies.item(0)");
    out.push("");
  }
  out.push("    except:", "        if ui:", "            ui.messageBox(traceback.format_exc())", "");
  return out.join("\n");
}

const tup = (v: (number | string)[]) => `(${v.join(", ")})`;
