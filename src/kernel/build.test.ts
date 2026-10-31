// Builds every template with the real OpenCascade WASM in Node and checks volumes against hand calculations.
import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import opencascade from "replicad-opencascadejs";
import { setOC } from "replicad";
import { buildShape, measure } from "./build";
import { migrate, templates, type Doc } from "../model/doc";

const wasm = createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm");
const PI = Math.PI;
const byName = (n: string) => templates.find((t) => t.name === n)!;
const fillet = (r: number, h: number) => r * r * (1 - PI / 4) * h; // material removed by one straight-edge fillet

beforeAll(async () => {
  const oc = await (opencascade as unknown as (o: object) => Promise<unknown>)({ locateFile: () => wasm });
  setOC(oc as Parameters<typeof setOC>[0]);
}, 60_000);

describe("kernel", () => {
  it("builds every template (volumes are the reference for scripts/verify)", async () => {
    const volumes: Record<string, number> = {};
    for (const t of templates) {
      const m = measure(buildShape(t));
      expect(m.volume, t.name).toBeGreaterThan(0);
      volumes[t.name] = +m.volume.toFixed(3);
    }
    await expect(JSON.stringify(volumes, null, 2) + "\n").toMatchFileSnapshot("../interop/__golden__/volumes.json");
  });

  it("bracket: extrude, vertical fillets, boss, through bore, counterbored holes", () => {
    const hole = (r: number, h: number) => PI * r * r * h;
    const cbore = hole(3.3, 8) + hole(5.5, 3) - hole(3.3, 3);
    const expected = 80 * 40 * 8 - 4 * fillet(4, 8) + hole(12, 16) - hole(6, 24) - 2 * cbore;
    expect(measure(buildShape(byName("bracket"))).volume).toBeCloseTo(expected, -1);
  });

  it("enclosure: shell keeps outside size and hollows inwards", () => {
    const outerArea = 100 * 60 - 4 * 36 * (1 - PI / 4);
    const innerArea = 95 * 55 - 4 * 3.5 * 3.5 * (1 - PI / 4);
    const expected = outerArea * 35 - innerArea * 32.5;
    const m = measure(buildShape(byName("enclosure")));
    expect(m.volume / expected).toBeCloseTo(1, 2);
    expect(m.bbox[1][2] - m.bbox[0][2]).toBeCloseTo(35, 3);
  });

  it("flange: polar pattern places every bolt hole", () => {
    const body = PI * 3600 * 12 + PI * 900 * 20 - PI * 400 * 32 - 6 * PI * 4.5 * 4.5 * 12;
    const m = measure(buildShape(byName("flange")));
    // the 1 mm top chamfer removes a little material on the hub and bore edges
    expect(m.volume).toBeLessThan(body);
    expect(m.volume / body).toBeGreaterThan(0.995);
    const fewer = structuredClone(byName("flange"));
    fewer.params.find((p) => p.name === "bolts")!.expr = "3";
    expect(measure(buildShape(fewer)).volume - m.volume).toBeCloseTo(3 * PI * 4.5 * 4.5 * 12, -1);
  });

  it("knob: revolve on the XZ plane spins about Z", () => {
    const m = measure(buildShape(byName("knob")));
    // revolve axis is world Z, so the knob is centred on X/Y
    expect(m.centerOfMass[0]).toBeCloseTo(0, 3);
    expect(m.centerOfMass[1]).toBeCloseTo(0, 3);
    expect(m.bbox[1][2]).toBeCloseTo(18, 3);
  });

  it("mirror and linear pattern", () => {
    const d: Doc = {
      format: "shapebridge/2",
      name: "t",
      units: "mm",
      params: [],
      features: [
        {
          id: "a",
          kind: "extrude",
          op: "add",
          plane: { base: "XY", offset: "0" },
          profile: { type: "rect", x: "1", y: "0", w: "10", h: "10" },
          distance: "5",
        },
        {
          id: "b",
          kind: "extrude",
          op: "add",
          plane: { base: "XY", offset: "5" },
          profile: { type: "circle", cx: "3", cy: "3", r: "1" },
          distance: "1",
        },
        { id: "row", kind: "pattern", target: "b", mode: "linear", dx: "3", dy: "0", dz: "0", count: "3" },
        { id: "m", kind: "mirror", plane: "YZ" },
      ],
    };
    expect(measure(buildShape(d)).volume).toBeCloseTo(2 * (500 + 3 * PI), 3);
  });

  it("migrates v1 documents", () => {
    const v1 = {
      format: "shapebridge/1",
      name: "old",
      params: [{ name: "w", expr: "10" }],
      features: [
        { id: "b", kind: "box", op: "add", at: ["0", "0", "0"], size: ["w", "w", "w"] },
        { id: "c", kind: "cylinder", op: "cut", at: ["5", "5", "0"], radius: "2", height: "w" },
      ],
    };
    expect(measure(buildShape(migrate(v1))).volume).toBeCloseTo(1000 - PI * 40, 3);
  });

  it("names the failing feature", () => {
    const d = structuredClone(byName("bracket"));
    d.params.find((p) => p.name === "corner_r")!.expr = "50"; // larger than the part
    expect(() => buildShape(d)).toThrow(/^corners: \S/);
  });
}, 120_000);
