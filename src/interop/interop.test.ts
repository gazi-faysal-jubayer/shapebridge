import { describe, expect, it } from "vitest";
import { sampleDoc } from "../model/doc";
import { targets } from "./index";

describe("parametric exporters", () => {
  for (const t of targets) {
    it(`${t.id} matches golden output`, async () => {
      await expect(t.generate(sampleDoc)).toMatchFileSnapshot(`__golden__/${sampleDoc.name}.${t.id}.${t.ext}`);
    });
  }

  it("rejects malicious docs before generating code", () => {
    const evil = structuredClone(sampleDoc);
    evil.params[0].expr = '1"); import os; os.system("x'; // would break out of a Python string
    for (const t of targets) expect(() => t.generate(evil)).toThrow();
    const evilId = structuredClone(sampleDoc);
    evilId.features[0].id = "x = 1\nimport os";
    for (const t of targets) expect(() => t.generate(evilId)).toThrow();
  });
});
