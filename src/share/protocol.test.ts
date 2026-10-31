import { describe, expect, it } from "vitest";
import { mergeComment, parseMsg, reviewMarkdown, type Comment } from "./protocol";

const cam = { eye: { x: 1, y: 2, z: 3 }, center: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, fov: 45 };
const comment = (over: Partial<Comment> = {}): Comment => ({
  id: "c1",
  author: "Boss",
  color: "#ff8800",
  text: "Thicker wall here",
  point: [1, 2, 3],
  camera: cam,
  strokes: [],
  resolved: false,
  replies: [],
  at: 1,
  ...over,
});

describe("live-review protocol", () => {
  it("accepts well-formed messages", () => {
    expect(parseMsg({ v: 1, type: "hello", name: "Ana", color: "#00aa88", host: true })).toEqual({
      v: 1,
      type: "hello",
      name: "Ana",
      color: "#00aa88",
      host: true,
    });
    expect(parseMsg({ v: 1, type: "pointer", p: [1, 2, 3] })).toEqual({ v: 1, type: "pointer", p: [1, 2, 3] });
    expect(parseMsg({ v: 1, type: "comment", comment: comment() })?.type).toBe("comment");
    const state = {
      v: 1,
      type: "state",
      camera: cam,
      selection: ["1:0"],
      hidden: [],
      section: { enabled: true, axis: "z", offset: 0.4, flip: false },
      explode: 0.5,
      display: "xray",
    };
    expect(parseMsg(state)).toEqual(state);
  });

  it("rejects or sanitises hostile input", () => {
    expect(parseMsg(null)).toBeNull();
    expect(parseMsg({ v: 2, type: "kick" })).toBeNull();
    expect(parseMsg({ v: 1, type: "eval", code: "alert(1)" })).toBeNull();
    expect(parseMsg({ v: 1, type: "hello", name: "x", color: "red;background:url(x)", host: false })).toBeNull();
    expect(parseMsg({ v: 1, type: "pointer", p: [1, NaN, 3] })).toBeNull();
    expect(parseMsg({ v: 1, type: "comment", comment: { ...comment(), camera: { ...cam, fov: 1e9 } } })).toBeNull();
    // over-long fields are clipped, and out-of-range markup points are clamped
    const big = parseMsg({ v: 1, type: "comment", comment: comment({ text: "x".repeat(10_000), strokes: [[[2, -1]]] }) });
    expect(big?.type === "comment" && big.comment.text.length).toBe(2000);
    expect(big?.type === "comment" && big.comment.strokes[0][0]).toEqual([1, 0]);
    // unknown extra fields never survive
    const hello = parseMsg({ v: 1, type: "hello", name: "a", color: "#000000", host: false, __proto__: { admin: true }, extra: 1 });
    expect(Object.keys(hello!)).toEqual(["v", "type", "name", "color", "host"]);
    expect(
      parseMsg({
        v: 1,
        type: "state",
        camera: null,
        selection: Array(6000).fill("k"),
        hidden: [],
        section: { axis: "x" },
        explode: 0,
        display: "edges",
      }),
    ).toBeNull();
  });

  it("merges comment edits, keeping the newest", () => {
    const a = comment();
    let list = mergeComment([], a);
    list = mergeComment(list, { ...a, replies: [{ author: "Me", text: "OK", at: 5 }] });
    expect(list).toHaveLength(1);
    expect(list[0].replies).toHaveLength(1);
    // a stale copy (older, same resolved state) doesn't overwrite
    list = mergeComment(list, { ...a, text: "old" });
    expect(list[0].text).toBe(a.text);
    list = mergeComment(list, { ...a, resolved: true });
    expect(list[0].resolved).toBe(true);
  });

  it("writes a review report", () => {
    const md = reviewMarkdown(
      "bracket.step",
      [comment({ replies: [{ author: "Me", text: "Done", at: 2 }], resolved: true })],
      new Date("2026-10-31T10:00:00Z"),
    );
    expect(md).toContain("# Review: bracket.step");
    expect(md).toContain("## 1. ✅ Boss");
    expect(md).toContain("> **Me:** Done");
  });
});
