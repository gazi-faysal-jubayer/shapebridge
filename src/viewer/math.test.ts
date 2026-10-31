import { describe, expect, it } from "vitest";
import { convert, cubeFaceMatrix, explodeOffset, formatLength, sectionPlane, viewDirection } from "./math";
import { buildTree, type OvNode } from "./tree";

describe("viewer math", () => {
  it("explodes parts away from the centre", () => {
    expect(explodeOffset([10, 0, 0], [0, 0, 0], 0.5)).toEqual([5, 0, 0]);
    expect(explodeOffset([1, 2, 3], [1, 2, 3], 2)).toEqual([0, 0, 0]);
  });

  it("places section planes inside the bounding box and flips", () => {
    const p = sectionPlane("z", 0.25, false, [0, 0, 0], [10, 10, 40]);
    // keeps points with -z + 10 >= 0, i.e. z <= 10
    expect(p).toEqual({ normal: [0, 0, -1], constant: 10 });
    const f = sectionPlane("z", 0.25, true, [0, 0, 0], [10, 10, 40]);
    expect(f).toEqual({ normal: [0, 0, 1], constant: -10 });
    expect(sectionPlane("x", 7, false, [0, 0, 0], [10, 1, 1]).constant).toBe(10); // clamped
  });

  it("gives Z-up CAD views", () => {
    expect(viewDirection("front", "z").dir).toEqual([0, -1, 0]);
    expect(viewDirection("top", "z")).toEqual({ dir: [0, 0, 1], up: [0, 1, 0] });
    expect(viewDirection("front", "y").up).toEqual([0, 1, 0]);
  });

  it("orients view cube faces with the camera", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    // camera looking at the front of a Y-up model: the front face is flat towards the viewer
    expect(cubeFaceMatrix("front", "y", identity, 60)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1]);
    // top face points up (CSS -y) when seen from the front
    const top = cubeFaceMatrix("top", "y", identity, 60);
    expect(top.slice(12, 15)).toEqual([0, -30, 0]);
    // Z-up: "front" is the -Y face; from a front camera (rotate world -90° about X) it faces the viewer
    const zFront = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
    expect(cubeFaceMatrix("front", "z", zFront, 60).slice(8, 15)).toEqual([0, 0, 1, 0, 0, 0, 30]);
  });

  it("converts units for length, area and volume", () => {
    expect(convert(25.4, "Millimeter", "in")).toBeCloseTo(1);
    expect(convert(1, "Meter", "mm")).toBe(1000);
    expect(convert(1, "Centimeter", "mm", 3)).toBeCloseTo(1000);
    expect(formatLength(1234.5, "Unknown", "mm")).toMatch(/1,?235 mm/);
    expect(formatLength(2, "Unknown", "cm", 2)).toBe("0.02 cm²");
  });
});

describe("model tree", () => {
  const node = (id: number, name: string, meshes: number[], children: OvNode[] = []): OvNode => ({
    GetId: () => id,
    GetName: () => name,
    GetMeshIndices: () => meshes,
    GetChildNodes: () => children,
  });
  const model = {
    GetRootNode: () => node(0, "", [], [node(1, "Base", [0]), node(2, "Bolts", [], [node(3, "", [1]), node(4, "", [2])])]),
    GetMesh: (i: number) => ({ GetName: () => `m${i}` }),
  };

  it("collapses single-mesh nodes and aggregates keys", () => {
    const tree = buildTree(model, (n, m) => `${n}:${m}`, "plate.step");
    expect(tree.name).toBe("plate.step");
    expect(tree.keys).toEqual(["1:0", "3:1", "4:2"]);
    expect(tree.children.map((c) => c.name)).toEqual(["Base", "Bolts"]);
    expect(tree.children[1].children.map((c) => c.name)).toEqual(["m1", "m2"]);
  });
});
