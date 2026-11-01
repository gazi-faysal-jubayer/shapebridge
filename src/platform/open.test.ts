import { describe, expect, it } from "vitest";
import { pushRecent } from "./open";

describe("pushRecent", () => {
  it("puts the newest first and drops duplicates", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });
  it("keeps at most ten", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `f${i}`);
    expect(pushRecent(ten, "new")).toEqual(["new", ...ten.slice(0, 9)]);
  });
});
