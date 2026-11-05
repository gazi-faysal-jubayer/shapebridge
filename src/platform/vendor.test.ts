import { describe, expect, it } from "vitest";
import { vendorFileMessage } from "./vendor";

describe("closed CAD formats", () => {
  it("explains SolidWorks files instead of failing silently", () => {
    expect(vendorFileMessage("Champagne Cage.SLDASM")).toMatch(/SolidWorks file.*Save As → STEP/);
    expect(vendorFileMessage("Cap.sldprt")).toMatch(/SolidWorks/);
  });

  it("leaves formats we read alone", () => {
    for (const f of ["a.step", "b.stp", "c.stl", "d.3dm", "e.sbridge.json", "f.iges"]) expect(vendorFileMessage(f)).toBeNull();
  });
});
