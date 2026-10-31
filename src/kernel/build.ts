import { makeBox, makeCylinder, type Solid, type Shape3D } from "replicad";
import { resolve, type Doc } from "../model/doc";

/** Builds the doc's exact B-rep with OpenCascade (replicad must already have setOC called). */
export function buildShape(doc: Doc): Shape3D {
  const { features } = resolve(doc);
  let acc: Shape3D | null = null;
  for (const f of features) {
    const [x, y, z] = f.at;
    const solid: Solid =
      f.kind === "box"
        ? makeBox([x, y, z], [x + f.size[0], y + f.size[1], z + f.size[2]])
        : makeCylinder(f.radius, f.height, [x, y, z], [0, 0, 1]);
    acc = acc === null ? solid : f.op === "add" ? acc.fuse(solid) : acc.cut(solid);
  }
  return acc!;
}
