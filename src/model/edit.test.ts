import { describe, expect, it } from "vitest";
import { templates } from "./doc";
import {
  addParam,
  deleteFeature,
  deleteParam,
  moveFeature,
  newFeature,
  renameFeature,
  renameParam,
  splitPair,
  toggleSuppressed,
  usedNames,
} from "./edit";
import { resolve } from "./doc";

const bracket = templates[0];

describe("document edits", () => {
  it("renames a parameter everywhere and keeps the model identical", () => {
    const d = renameParam(bracket, "thickness", "plate_t");
    expect(d.params.find((p) => p.name === "plate_t")).toBeTruthy();
    expect(JSON.stringify(d)).not.toMatch(/\bthickness\b/);
    // ids and enums are untouched even when they look like names
    expect(d.features.map((f) => f.id)).toEqual(bracket.features.map((f) => f.id));
    expect(resolve(d).features.length).toBe(resolve(bracket).features.length);
    expect(() => renameParam(bracket, "width", "depth")).toThrow(/exists/);
    expect(() => renameParam(bracket, "width", "1x")).toThrow(/valid/);
  });

  it("only deletes unused parameters", () => {
    expect(() => deleteParam(bracket, "width")).toThrow(/used/);
    const d = addParam(bracket);
    const added = d.params.at(-1)!.name;
    expect(usedNames(d).has(added)).toBe(false);
    expect(deleteParam(d, added).params.length).toBe(bracket.params.length);
  });

  it("guards feature deletion and moves features", () => {
    const flange = templates.find((t) => t.name === "flange")!;
    expect(() => deleteFeature(flange, "bolt")).toThrow(/bolt_ring/);
    const moved = moveFeature(bracket, 1, 1);
    expect(moved.features[2].id).toBe("corners");
    expect(moveFeature(bracket, 0, -1)).toBe(bracket);
  });

  it("creates valid new features of every kind", () => {
    for (const kind of ["extrude", "cut", "revolve", "hole", "fillet", "chamfer", "shell", "pattern", "mirror"] as const) {
      const f = newFeature(bracket, kind);
      expect(() => resolve({ ...bracket, features: [...bracket.features, f] }), kind).not.toThrow();
    }
  });

  it("suppresses features", () => {
    const d = toggleSuppressed(bracket, "corners");
    expect(resolve(d).features.some((f) => f.id === "corners")).toBe(false);
    expect(toggleSuppressed(d, "corners").suppressed).toEqual([]);
  });

  it("splits point pairs on the first top-level comma", () => {
    expect(splitPair("max(a, b), 3")).toEqual(["max(a, b)", "3"]);
    expect(splitPair("10, w / 2")).toEqual(["10", "w / 2"]);
    expect(splitPair("10")).toBeNull();
  });

  it("renames features and keeps references", () => {
    const flange = templates.find((t) => t.name === "flange")!;
    const d = renameFeature(toggleSuppressed(flange, "bolt"), "bolt", "bolt_hole");
    expect(d.features.find((f) => f.kind === "pattern")).toMatchObject({ target: "bolt_hole" });
    expect(d.suppressed).toEqual(["bolt_hole"]);
    expect(() => renameFeature(flange, "bolt", "disc")).toThrow(/exists/);
    expect(() => renameFeature(flange, "bolt", "2x")).toThrow(/valid/);
  });
});
