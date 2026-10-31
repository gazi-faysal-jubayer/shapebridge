import { describe, expect, it } from "vitest";
import { templates } from "../model/doc";
import { targets } from "./index";

describe("parametric exporters", () => {
  for (const doc of templates) {
    for (const t of targets) {
      it(`${doc.name} → ${t.id} matches golden output`, async () => {
        await expect(t.generate(doc)).toMatchFileSnapshot(`__golden__/${doc.name}.${t.id}.${t.ext}`);
      });
    }
  }

  it("rejects malicious docs before generating code", () => {
    const evil = structuredClone(templates[0]);
    evil.params[0].expr = '1"); import os; os.system("x'; // would break out of a Python string
    for (const t of targets) expect(() => t.generate(evil)).toThrow();
    const evilId = structuredClone(templates[0]);
    evilId.features[0].id = "x = 1\nimport os";
    for (const t of targets) expect(() => t.generate(evilId)).toThrow();
    const evilPlane = structuredClone(templates[0]);
    (evilPlane.features[0] as { plane: { base: string } }).plane.base = 'XY"); os.system("x';
    for (const t of targets) expect(() => t.generate(evilPlane)).toThrow();
  });

  it("prints degree trig per dialect", async () => {
    const { printExpr } = await import("../model/params");
    expect(printExpr("r * cos(a)", "python")).toBe("r * math.cos(math.radians(a))");
    expect(printExpr("atan2(y, x)", "python")).toBe("math.degrees(math.atan2(y, x))");
    expect(printExpr("r * cos(a)", "openscad")).toBe("r * cos(a)");
    expect(printExpr("max(a, b)", "freecad")).toBe("max(Params.a, Params.b)");
  });
});
