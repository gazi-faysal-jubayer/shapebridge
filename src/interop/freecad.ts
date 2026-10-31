import type { Doc, Feature, Profile, SketchPlane } from "../model/doc";
import { FRAMES, outline, toWorld } from "../model/geometry";
import { printExpr } from "../model/params";
import { header, isTool, normalOf, prepare, scaled } from "./common";

// Parameters live in a Spreadsheet named "Params" (aliases = names). Sketches are Sketcher objects whose
// vertex and radius constraints are bound to it, and solids are Part workbench features with bound
// lengths, so editing a cell rebuilds the model.
// shortcut: fillet/chamfer radii and their edge picks are evaluated when the macro runs (FreeCAD can't bind them); re-run the macro after big changes.
export function freecad(doc: Doc): string {
  const { params, features, num } = prepare(doc);
  const alias = aliases(params.map((p) => p.name));
  const rename = (e: string, re: RegExp) => e.replace(re, (_m, pre: string, n: string) => pre + (alias.get(n) ?? n));
  // Params.<name> in object expressions, bare names inside the sheet
  const fc = (e: string) => JSON.stringify(rename(printExpr(e, "freecad"), /(Params\.)(\w+)/g));
  const sheetExpr = (e: string) => rename(printExpr(e, "plain"), /(^|[^\w.])([A-Za-z_]\w*)/g);
  const out: string[] = [
    header(doc, "#"),
    "import FreeCAD as App",
    "import Part",
    "import Sketcher",
    "import Draft",
    "",
    "",
    "def pick_edges(shape, sel):",
    '    """Edge indices (1-based) matching ShapeBridge edge selections."""',
    "    bb = shape.BoundBox",
    "    picked = []",
    "    for i, e in enumerate(shape.Edges, 1):",
    "        zs = [v.Point.z for v in e.Vertexes]",
    '        if sel == "all":',
    "            picked.append(i)",
    '        elif sel == "vertical":',
    "            if isinstance(e.Curve, Part.Line) and abs(abs(e.Curve.Direction.normalize().z) - 1) < 1e-6:",
    "                picked.append(i)",
    '        elif all(abs(z - (bb.ZMax if sel == "top" else bb.ZMin)) < 1e-2 for z in zs):',
    "            picked.append(i)",
    "    return picked",
    "",
    "",
    "def pick_face(shape, side):",
    '    z = shape.BoundBox.ZMax if side == "top" else shape.BoundBox.ZMin',
    "    for i, f in enumerate(shape.Faces, 1):",
    "        if abs(f.BoundBox.ZMin - z) < 1e-2 and abs(f.BoundBox.ZMax - z) < 1e-2:",
    '            return "Face%d" % i',
    "",
    "",
    `doc = App.newDocument(${JSON.stringify(doc.name)})`,
    'sheet = doc.addObject("Spreadsheet::Sheet", "Params")',
  ];
  params.forEach((p, i) => {
    const row = i + 1;
    // plain names resolve to aliases inside the same sheet
    const value = p.literal ? printExpr(p.expr, "plain") : `=${sheetExpr(p.expr)}`;
    out.push(
      `sheet.set("A${row}", ${JSON.stringify(p.name)})`,
      `sheet.set("B${row}", ${JSON.stringify(value)})`,
      `sheet.setAlias("B${row}", ${JSON.stringify(alias.get(p.name) ?? p.name)})`,
    );
    if (p.note) out.push(`sheet.set("C${row}", ${JSON.stringify(p.note)})`);
  });
  out.push("doc.recompute()", "");

  const sketch = (id: string, pl: SketchPlane, profile: Profile) => {
    const { u, v, n } = FRAMES[pl.base];
    out.push(
      `${id} = doc.addObject("Sketcher::SketchObject", "${id}")`,
      `${id}.Placement = App.Placement(App.Vector(0, 0, 0), App.Rotation(App.Vector${tup(u)}, App.Vector${tup(v)}, App.Vector${tup(n)}, "ZXY"))`,
      ...["x", "y", "z"].map((a, i) => `${id}.setExpression("Placement.Base.${a}", ${fc(scaled(n[i], pl.offset))})`),
    );
    const o = outline(profile);
    const fix = (geo: number, pos: number, [eu, ev]: [string, string], tag: string) => {
      out.push(
        `c = ${id}.addConstraint(Sketcher.Constraint("DistanceX", -1, 1, ${geo}, ${pos}, ${num(eu)}))`,
        `${id}.setExpression("Constraints[%d]" % c, ${fc(eu)})`,
        `c = ${id}.addConstraint(Sketcher.Constraint("DistanceY", -1, 1, ${geo}, ${pos}, ${num(ev)}))`,
        `${id}.setExpression("Constraints[%d]" % c, ${fc(ev)})  # ${tag}`,
      );
    };
    if (o.kind === "circle") {
      out.push(`${id}.addGeometry(Part.Circle(App.Vector(${num(o.c[0])}, ${num(o.c[1])}, 0), App.Vector(0, 0, 1), ${num(o.r)}))`);
      fix(0, 3, o.c, "centre");
      out.push(
        `c = ${id}.addConstraint(Sketcher.Constraint("Radius", 0, ${num(o.r)}))`,
        `${id}.setExpression("Constraints[%d]" % c, ${fc(o.r)})`,
      );
    } else {
      o.points.forEach((a, i) => {
        const b = o.points[(i + 1) % o.points.length];
        out.push(
          `${id}.addGeometry(Part.LineSegment(App.Vector(${num(a[0])}, ${num(a[1])}, 0), App.Vector(${num(b[0])}, ${num(b[1])}, 0)))`,
        );
        fix(i, 1, a, `line ${i} start`);
        fix(i, 2, b, `line ${i} end`);
      });
    }
  };

  const tool = (f: Extract<Feature, { kind: "extrude" | "revolve" | "hole" }>): string => {
    const id = f.id;
    if (f.kind === "extrude") {
      sketch(`${id}_sketch`, f.plane, f.profile);
      const reversed = num(f.distance) < 0;
      out.push(
        `${id} = doc.addObject("Part::Extrusion", "${id}")`,
        `${id}.Base = ${id}_sketch`,
        `${id}.DirMode = "Normal"`,
        `${id}.Solid = True`,
        `${id}.Symmetric = ${f.symmetric ? "True" : "False"}`,
        `${id}.Reversed = ${reversed ? "True" : "False"}`,
        `${id}.setExpression("LengthFwd", ${fc(reversed ? `-(${f.distance})` : f.distance)})`,
      );
    } else if (f.kind === "revolve") {
      sketch(`${id}_sketch`, f.plane, f.profile);
      const { v, n } = FRAMES[f.plane.base];
      out.push(
        `${id} = doc.addObject("Part::Revolution", "${id}")`,
        `${id}.Source = ${id}_sketch`,
        `${id}.Axis = App.Vector${tup(v)}`,
        ...["x", "y", "z"].map((a, i) => `${id}.setExpression("Base.${a}", ${fc(scaled(n[i], f.plane.offset))})`),
        `${id}.Solid = True`,
        `${id}.setExpression("Angle", ${fc(f.angle)})`,
      );
    } else {
      const n = FRAMES[f.plane.base].n;
      const parts: string[] = [];
      f.points.forEach((pt, i) => {
        const top = toWorld(f.plane, pt);
        const add = (kind: string, name: string, props: [string, string][], depth: string) => {
          // primitives grow along +n from a base point `depth` below the face (plus a hair above it)
          out.push(
            `${name} = doc.addObject("Part::${kind}", "${name}")`,
            `${name}.Placement = App.Placement(App.Vector(0, 0, 0), App.Rotation(App.Vector(0, 0, 1), App.Vector${tup(n)}))`,
            ...props.map(([k, e]) => `${name}.setExpression("${k}", ${fc(e)})`),
            ...["x", "y", "z"].map((a, j) => `${name}.setExpression("Placement.Base.${a}", ${fc(`(${top[j]}) - ${scaled(n[j], depth)}`)})`),
          );
          parts.push(name);
        };
        add(
          "Cylinder",
          `${id}_${i}`,
          [
            ["Radius", `(${f.diameter}) / 2`],
            ["Height", `(${f.depth}) + 0.0001`],
          ],
          f.depth,
        );
        if (f.style === "counterbore")
          add(
            "Cylinder",
            `${id}_${i}_head`,
            [
              ["Radius", `(${f.headDiameter}) / 2`],
              ["Height", `(${f.headDepth}) + 0.0001`],
            ],
            f.headDepth!,
          );
        if (f.style === "countersink")
          add(
            "Cone",
            `${id}_${i}_head`,
            [
              ["Radius1", "0"],
              ["Radius2", `(${f.headDiameter}) / 2`],
              ["Height", `(${f.headDiameter}) / 2 + 0.0001`],
            ],
            `(${f.headDiameter}) / 2`,
          );
      });
      // MultiFuse refuses a single shape, so a lone cylinder is the tool itself
      if (parts.length === 1) out.push(`${id} = ${parts[0]}`);
      else out.push(`${id} = doc.addObject("Part::MultiFuse", "${id}")`, `${id}.Shapes = [${parts.join(", ")}]`);
    }
    return id;
  };

  let acc: string | null = null;
  const combine = (obj: string, op: "add" | "cut", tag: string) => {
    if (acc === null) return void (acc = obj);
    const name = `${op === "add" ? "fuse" : "cut"}_${tag}`;
    out.push(
      `${name} = doc.addObject("Part::${op === "add" ? "Fuse" : "Cut"}", "${name}")`,
      `${name}.Base = ${acc}`,
      `${name}.Tool = ${obj}`,
    );
    acc = name;
  };
  const tools = new Map<string, "add" | "cut">();

  for (const f of features) {
    out.push(`# ${f.id}`);
    if (isTool(f)) {
      const op = f.kind === "hole" ? "cut" : f.op;
      tools.set(f.id, op);
      combine(tool(f), op, f.id);
    } else if (f.kind === "pattern") {
      // Draft arrays stay parametric: their count and spacing are bound to the sheet
      if (f.mode === "linear") {
        out.push(
          `${f.id} = Draft.make_ortho_array(${f.target}, v_x=App.Vector(1, 0, 0), n_x=${num(f.count)}, n_y=1, n_z=1, use_link=False)`,
          `${f.id}.setExpression("NumberX", ${fc(f.count)})`,
          ...["x", "y", "z"].map((a, i) => `${f.id}.setExpression("IntervalX.${a}", ${fc([f.dx, f.dy, f.dz][i])})`),
        );
      } else {
        out.push(
          `${f.id} = Draft.make_polar_array(${f.target}, number=${num(f.count)}, angle=360, center=App.Vector(0, 0, 0), use_link=False)`,
          `${f.id}.setExpression("NumberPolar", ${fc(f.count)})`,
          `${f.id}.setExpression("Center.x", ${fc(f.cx)})`,
          `${f.id}.setExpression("Center.y", ${fc(f.cy)})`,
        );
      }
      combine(f.id, tools.get(f.target)!, f.id);
    } else if (f.kind === "fillet" || f.kind === "chamfer") {
      const amount = num(f.kind === "fillet" ? f.radius : f.distance);
      out.push(
        "doc.recompute()",
        `${f.id} = doc.addObject("Part::${f.kind === "fillet" ? "Fillet" : "Chamfer"}", "${f.id}")`,
        `${f.id}.Base = ${acc}`,
        `${f.id}.Edges = [(i, ${amount}, ${amount}) for i in pick_edges(${acc}.Shape, "${f.edges}")]`,
      );
      acc = f.id;
    } else if (f.kind === "shell") {
      out.push(
        "doc.recompute()",
        `${f.id} = doc.addObject("Part::Thickness", "${f.id}")`,
        `${f.id}.Faces = (${acc}, [pick_face(${acc}.Shape, "${f.open}")])`,
        `${f.id}.setExpression("Value", ${fc(`-(${f.thickness})`)})  # negative = walls grow inwards`,
        `${f.id}.Join = "Intersection"`,
      );
      acc = f.id;
    } else if (f.kind === "mirror") {
      out.push(
        `${f.id} = doc.addObject("Part::Mirroring", "${f.id}")`,
        `${f.id}.Source = ${acc}`,
        `${f.id}.Normal = App.Vector${tup(normalOf(f.plane))}`,
      );
      combine(f.id, "add", f.id);
    }
    out.push("");
  }
  out.push(
    `${acc}.Label = ${JSON.stringify(doc.name)}`,
    "doc.recompute()",
    "if App.GuiUp:",
    "    import FreeCADGui",
    '    FreeCADGui.SendMsgToActiveView("ViewFit")',
    "",
  );
  return out.join("\n");
}

const tup = (v: number[]) => `(${v.join(", ")})`;

// FreeCAD rejects aliases that read as unit symbols (h = hour, m, s, deg…) or cell addresses (A1)
const UNITS = new Set("m mm cm dm km um nm in ft yd mi thou mil h s ms min g kg mg t lb oz A K J W V C F T N Pa kPa MPa GPa psi deg rad gon M e pi".split(" "));
export function aliases(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of names) if (UNITS.has(n) || /^[A-Za-z]{1,2}\d+$/.test(n)) map.set(n, `p_${n}`);
  return map;
}
