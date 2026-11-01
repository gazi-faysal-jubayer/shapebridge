import { describe, expect, it } from "vitest";
import { actions, eventKeys } from "./actions";
import * as c from "../controller";

const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

describe("shortcuts", () => {
  it("normalises key events", () => {
    expect(eventKeys(ev("o", { ctrlKey: true }))).toBe("Ctrl+O");
    expect(eventKeys(ev("H", { shiftKey: true }))).toBe("Shift+H");
    expect(eventKeys(ev("f"))).toBe("F");
    expect(eventKeys(ev("Escape"))).toBe("Escape");
    expect(eventKeys(ev("k", { metaKey: true }))).toBe("Ctrl+K");
  });

  it("New Part starts an empty part, not a template", () => {
    actions.find((a) => a.id === "new-part")!.run();
    expect(c.doc()).toMatchObject({ params: [], features: [] });
  });

  it("has unique ids and shortcuts", () => {
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = actions.flatMap((a) => (a.keys ? [a.keys] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
