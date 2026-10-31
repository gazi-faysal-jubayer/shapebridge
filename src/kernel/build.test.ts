// Builds the sample part with the real OpenCascade WASM in Node and checks the STEP output.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import opencascade from "replicad-opencascadejs";
import { setOC } from "replicad";
import { buildShape } from "./build";
import { sampleDoc } from "../model/doc";

const wasm = createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm");

describe("kernel", () => {
  it("builds the sample bracket and exports STEP + STL", async () => {
    const oc = await (opencascade as unknown as (o: object) => Promise<unknown>)({ locateFile: () => wasm });
    setOC(oc as Parameters<typeof setOC>[0]);
    const shape = buildShape(sampleDoc);
    const step = await shape.blobSTEP().text();
    expect(step).toMatch(/^ISO-10303-21;/);
    expect(step).toContain("MANIFOLD_SOLID_BREP");
    const stl = await shape.blobSTL({ binary: true }).arrayBuffer();
    expect(new DataView(stl).getUint32(80, true)).toBeGreaterThan(100); // triangle count
    // volume check: box - hole + boss ring - two slots
    const { measureVolume } = await import("replicad");
    const v = 80 * 40 * 8 + Math.PI * (144 - 36) * 16 - Math.PI * 36 * 8 - 2 * Math.PI * 16 * 8;
    expect(measureVolume(shape)).toBeCloseTo(v, 0);
  }, 60_000);
});
