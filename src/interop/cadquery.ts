import type { Doc, EdgeSel, Feature, Profile, SketchPlane } from "../model/doc";
import { FRAMES, outline, toWorld } from "../model/geometry";
import { printExpr } from "../model/params";
import { header, isTool, prepare } from "./common";

const selector: Record<Exclude<EdgeSel, "all">, string> = { vertical: "|Z", top: ">Z", bottom: "<Z" };

// Literal parameters become keyword arguments of build(); derived ones are computed inside it.
export function cadquery(doc: Doc): string {
  const { params, features } = prepare(doc);
  const py = (e: string) => printExpr(e, "python");
  const args = params.filter((p) => p.literal).map((p) => `${p.name}=${py(p.expr)}`);
  const out: string[] = [
    header(doc, "#"),
    "import math",
    "import cadquery as cq",
    "",
    "# sketch planes: (x direction, normal); the normal is x × y",
    "FRAMES = {" +
      Object.entries(FRAMES)
        .map(([k, f]) => `"${k}": (${tuple(f.u)}, ${tuple(f.n)})`)
        .join(", ") +
      "}",
    "",
    "",
    "def plane(base, offset):",
    "    x, n = FRAMES[base]",
    "    return cq.Workplane(cq.Plane(origin=tuple(c * offset for c in n), xDir=x, normal=n))",
    "",
    "",
    `def build(${args.join(", ")}):`,
  ];
  for (const p of params.filter((p) => !p.literal)) out.push(`    ${p.name} = ${py(p.expr)}`);

  const wp = (pl: SketchPlane) => `plane("${pl.base}", ${py(pl.offset)})`;
  const sketch = (p: Profile) => {
    const o = outline(p);
    return o.kind === "circle"
      ? `.moveTo(${py(o.c[0])}, ${py(o.c[1])}).circle(${py(o.r)})`
      : `.polyline([${o.points.map(([u, v]) => `(${py(u)}, ${py(v)})`).join(", ")}]).close()`;
  };
  const vec = (xyz: string[]) => `cq.Vector(${xyz.map(py).join(", ")})`;

  const tool = (f: Extract<Feature, { kind: "extrude" | "revolve" | "hole" }>): string[] => {
    if (f.kind === "extrude") {
      // both=True extrudes the distance to each side, so halve it for a symmetric total
      const ext = f.symmetric ? `.extrude(${py(f.distance)} / 2, both=True)` : `.extrude(${py(f.distance)})`;
      return [`return ${wp(f.plane)}${sketch(f.profile)}${ext}`];
    }
    if (f.kind === "revolve") return [`return ${wp(f.plane)}${sketch(f.profile)}.revolve(${py(f.angle)}, (0, 0, 0), (0, 1, 0))`];
    const n = FRAMES[f.plane.base].n;
    const lines = ["solids = []"];
    for (const pt of f.points) {
      const top = vec(toWorld(f.plane, pt));
      lines.push(`top = ${top} + cq.Vector(${tuple(n)}) * 0.0001`);
      lines.push(
        `solids.append(cq.Solid.makeCylinder(${py(f.diameter)} / 2, ${py(f.depth)} + 0.0001, top, cq.Vector(${tuple(n.map((x) => -x))})))`,
      );
      if (f.style === "counterbore")
        lines.push(
          `solids.append(cq.Solid.makeCylinder(${py(f.headDiameter!)} / 2, ${py(f.headDepth!)} + 0.0001, top, cq.Vector(${tuple(n.map((x) => -x))})))`,
        );
      if (f.style === "countersink")
        lines.push(
          `solids.append(cq.Solid.makeCone(${py(f.headDiameter!)} / 2, 0, ${py(f.headDiameter!)} / 2, top, cq.Vector(${tuple(n.map((x) => -x))})))`,
        );
    }
    // overlapping solids in one compound don't boolean reliably, so fuse them into one tool
    lines.push("return cq.Workplane().add(solids[0].fuse(*solids[1:]) if len(solids) > 1 else solids[0])");
    return lines;
  };

  const tools = new Map<string, "add" | "cut">();
  let first = true;
  const apply = (expr: string, op: "add" | "cut") => {
    out.push(first ? `    result = ${expr}` : `    result = result.${op === "add" ? "union" : "cut"}(${expr})`);
    first = false;
  };
  for (const f of features) {
    out.push(`    # ${f.id}`);
    if (isTool(f)) {
      out.push(`    def tool_${f.id}():`, ...tool(f).map((l) => `        ${l}`));
      const op = f.kind === "hole" ? "cut" : f.op;
      tools.set(f.id, op);
      apply(`tool_${f.id}()`, op);
    } else if (f.kind === "pattern") {
      const op = tools.get(f.target)!;
      out.push(`    for i in range(1, int(${py(f.count)})):`);
      const copy =
        f.mode === "linear"
          ? `tool_${f.target}().translate((${py(f.dx)} * i, ${py(f.dy)} * i, ${py(f.dz)} * i))`
          : `tool_${f.target}().rotate((${py(f.cx)}, ${py(f.cy)}, 0), (${py(f.cx)}, ${py(f.cy)}, 1), 360 * i / ${py(f.count)})`;
      out.push(`        result = result.${op === "add" ? "union" : "cut"}(${copy})`);
    } else if (f.kind === "fillet" || f.kind === "chamfer") {
      const pick =
        f.edges === "all"
          ? ".edges()"
          : f.edges === "vertical"
            ? `.edges("${selector.vertical}")`
            : `.faces("${selector[f.edges]}").edges()`;
      const amount = py(f.kind === "fillet" ? f.radius : f.distance);
      out.push(`    result = result${pick}.${f.kind}(${amount})`);
    } else if (f.kind === "shell") {
      out.push(`    result = result.faces("${f.open === "top" ? ">Z" : "<Z"}").shell(-(${py(f.thickness)}))`);
    } else if (f.kind === "mirror") {
      out.push(`    result = result.union(result.mirror("${f.plane}"))`);
    }
  }
  out.push("    return result", "", "", "result = build()");
  out.push(
    'if "show_object" in globals():',
    "    show_object(result)",
    'elif __name__ == "__main__":',
    `    cq.exporters.export(result, ${JSON.stringify(doc.name + ".step")})`,
    "",
  );
  return out.join("\n");
}

const tuple = (v: number[]) => `(${v.join(", ")})`;
