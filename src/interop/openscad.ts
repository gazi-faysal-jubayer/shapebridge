import type { Doc, Feature, Profile, SketchPlane } from "../model/doc";
import { FRAMES, outline } from "../model/geometry";
import { printExpr } from "../model/params";
import { header, isTool, normalOf, prepare, scaled } from "./common";

// Literal parameters become top-level variables, which OpenSCAD's Customizer shows as editable fields.
// OpenSCAD has no fillet/chamfer/shell on solids: those features are listed as comments, not dropped silently.
export function openscad(doc: Doc): string {
  const { params, features, num } = prepare(doc);
  const s = (e: string) => printExpr(e, "openscad");
  const out: string[] = [header(doc, "//"), "$fn = 64;", ""];
  for (const p of params) out.push(`${p.name} = ${s(p.expr)};${p.note ? ` // ${p.note}` : ""}`);
  out.push("");

  // a plane frame as a multmatrix; `cols` picks which frame vectors become local X, Y, Z
  const frame = (pl: SketchPlane, cols: ("u" | "v" | "n" | "-n")[]) => {
    const f = FRAMES[pl.base];
    const vec = (c: string) => (c === "-n" ? f.n.map((x) => -x) : f[c as "u" | "v" | "n"]);
    const rows = [0, 1, 2].map((i) => `[${cols.map((c) => vec(c)[i]).join(", ")}, ${s(scaled(f.n[i], pl.offset))}]`);
    return `multmatrix([${rows.join(", ")}, [0, 0, 0, 1]])`;
  };
  const shape2d = (p: Profile) => {
    const o = outline(p);
    return o.kind === "circle"
      ? `translate([${s(o.c[0])}, ${s(o.c[1])}]) circle(r = ${s(o.r)});`
      : `polygon([${o.points.map(([u, v]) => `[${s(u)}, ${s(v)}]`).join(", ")}]);`;
  };

  const tool = (f: Extract<Feature, { kind: "extrude" | "revolve" | "hole" }>): string => {
    if (f.kind === "extrude") {
      const d = s(f.distance);
      const ext = f.symmetric
        ? `linear_extrude(height = abs(${d}), center = true)`
        : `translate([0, 0, min(0, ${d})]) linear_extrude(height = abs(${d}))`;
      return `${frame(f.plane, ["u", "v", "n"])} ${ext} ${shape2d(f.profile)}`;
    }
    if (f.kind === "revolve") {
      // rotate_extrude spins local X around local Z: map X → u, Z → v (the sketch's vertical axis)
      return `${frame(f.plane, ["u", "-n", "v"])} rotate_extrude(angle = ${s(f.angle)}) ${shape2d(f.profile)}`;
    }
    const r = `${s(f.diameter)} / 2`;
    const parts = [`translate([0, 0, -(${s(f.depth)})]) cylinder(r = ${r}, h = ${s(f.depth)} + 0.0001);`];
    if (f.style === "counterbore")
      parts.push(`translate([0, 0, -(${s(f.headDepth!)})]) cylinder(r = ${s(f.headDiameter!)} / 2, h = ${s(f.headDepth!)} + 0.0001);`);
    if (f.style === "countersink")
      parts.push(
        `translate([0, 0, -(${s(f.headDiameter!)} / 2)]) cylinder(r1 = 0, r2 = ${s(f.headDiameter!)} / 2, h = ${s(f.headDiameter!)} / 2 + 0.0001);`,
      );
    const holes = f.points.map(([u, v]) => `translate([${s(u)}, ${s(v)}, 0]) { ${parts.join(" ")} }`);
    return `${frame(f.plane, ["u", "v", "n"])} { ${holes.join(" ")} }`;
  };

  const indent = (block: string) => block.replace(/^/gm, "  ");
  const combine = (acc: string | null, part: string, op: "add" | "cut") =>
    acc === null ? part : `${op === "add" ? "union" : "difference"}() {\n${indent(acc)}\n  ${part}\n}`;

  const tools = new Map<string, { code: string; op: "add" | "cut" }>();
  let acc: string | null = null;
  for (const f of features) {
    if (isTool(f)) {
      const t = { code: tool(f), op: f.kind === "hole" ? ("cut" as const) : f.op };
      tools.set(f.id, t);
      acc = combine(acc, `${t.code} // ${f.id}`, t.op);
    } else if (f.kind === "pattern") {
      const t = tools.get(f.target)!;
      const n = s(f.count);
      const copy =
        f.mode === "linear"
          ? `for (i = [1 : ${n} - 1]) translate([${s(f.dx)} * i, ${s(f.dy)} * i, ${s(f.dz)} * i]) ${t.code}`
          : `for (i = [1 : ${n} - 1]) translate([${s(f.cx)}, ${s(f.cy)}, 0]) rotate([0, 0, 360 * i / ${n}]) translate([-(${s(f.cx)}), -(${s(f.cy)}), 0]) ${t.code}`;
      acc = combine(acc, `${copy} // ${f.id}`, t.op);
    } else if (f.kind === "mirror") {
      acc = `union() {\n${indent(acc!)}\n  mirror([${normalOf(f.plane).join(", ")}]) {\n${indent(indent(acc!))}\n  }\n} // ${f.id}`;
    } else {
      // keep it visible: someone reading the file must know the model differs here
      out.push(`// NOTE: ${f.kind} "${f.id}" has no OpenSCAD equivalent and is not applied (${describe(f, num)}).`);
    }
  }
  out.push("", acc ?? "// (no solid features)", "");
  return out.join("\n");
}

function describe(f: Feature, num: (e: string) => number): string {
  if (f.kind === "fillet") return `radius ${num(f.radius)} on ${f.edges} edges`;
  if (f.kind === "chamfer") return `${num(f.distance)} on ${f.edges} edges`;
  if (f.kind === "shell") return `wall ${num(f.thickness)}, open ${f.open}`;
  return f.kind;
}
