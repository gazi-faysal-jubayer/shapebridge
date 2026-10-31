import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import DxfParser from "dxf-parser";
import { convert } from "./cli";

const dir = mkdtempSync(join(tmpdir(), "sb-cli-"));

describe("CLI convert", () => {
  it("STEP → BREP → STEP keeps the exact volume", async () => {
    const plate = 40 * 30 * 10 - Math.PI * 36 * 10;
    expect((await convert("public/samples/plate.step", join(dir, "p.brep"))).volume).toBeCloseTo(plate, 3);
    expect((await convert(join(dir, "p.brep"), join(dir, "p.step"))).volume).toBeCloseTo(plate, 3);
    expect(readFileSync(join(dir, "p.step"), "utf8")).toMatch(/^ISO-10303-21;/);
  });

  it("writes drawings and scaled meshes", async () => {
    await convert("public/samples/plate.step", join(dir, "p.dxf"));
    const dxf = new DxfParser().parseSync(readFileSync(join(dir, "p.dxf"), "utf8"))!;
    expect(dxf.entities.length).toBeGreaterThan(20);
    await convert("public/samples/plate.step", join(dir, "p.stl"), "coarse", 1 / 25.4);
    const stl = readFileSync(join(dir, "p.stl"));
    let maxX = -Infinity;
    for (let i = 0; i < stl.readUInt32LE(80); i++) maxX = Math.max(maxX, stl.readFloatLE(84 + i * 50 + 12));
    expect(maxX).toBeCloseTo(40 / 25.4, 4);
  });

  it("builds parametric documents and rejects unknown formats", async () => {
    expect((await convert("public/samples/bracket.sbridge.json", join(dir, "b.step"))).volume).toBeGreaterThan(0);
    await expect(convert("x.foo", join(dir, "y.step"))).rejects.toThrow(/Unsupported input/);
    await expect(convert("public/samples/plate.step", join(dir, "y.iges"))).rejects.toThrow(/Unsupported output/);
  });
}, 120_000);
