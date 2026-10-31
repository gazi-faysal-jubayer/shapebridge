import { describe, expect, it } from "vitest";
import { evalParams, isLiteral, orderParams, parse, printExpr, evaluate } from "./params";

describe("expression engine", () => {
  it("respects precedence and right-assoc power", () => {
    expect(evaluate(parse("1 + 2 * 3 ^ 2 ^ 1 - -4 / 2"), {})).toBe(1 + 2 * 9 + 2);
    expect(evaluate(parse("2 ^ 3 ^ 2"), {})).toBe(512);
    expect(evaluate(parse("-2 ^ 2"), {})).toBe(-4);
    expect(evaluate(parse("sqrt(16) + abs(-3)"), {})).toBe(7);
  });

  it("rejects code injection and junk", () => {
    for (const bad of ["alert(1)", "a; b", "__proto__.x", "1 +", "(1", "x[0]", "import os", "Params"]) {
      expect(() => evaluate(parse(bad), {})).toThrow();
    }
  });

  it("resolves params in dependency order and detects cycles", () => {
    const params = [
      { name: "b", expr: "a * 2" },
      { name: "a", expr: "10" },
    ];
    expect(orderParams(params).map((p) => p.name)).toEqual(["a", "b"]);
    expect(evalParams(params)).toEqual({ a: 10, b: 20 });
    expect(() => evalParams([{ name: "x", expr: "y" }, { name: "y", expr: "x" }])).toThrow(/cycle/);
    expect(() => evalParams([{ name: "x", expr: "nope" }])).toThrow(/unknown/);
    expect(() => evalParams([{ name: "constructor", expr: "toString" }])).toThrow();
  });

  it("prints each dialect so it parses back to the same value", () => {
    const src = "a - (b - c) / (d * 2) + e ^ 2";
    expect(printExpr(src, "plain")).toBe("a - (b - c) / (d * 2) + e ^ 2");
    expect(printExpr(src, "python")).toBe("a - (b - c) / (d * 2) + e ** 2");
    expect(printExpr(src, "openscad")).toBe("a - (b - c) / (d * 2) + pow(e, 2)");
    expect(printExpr(src, "freecad")).toBe("Params.a - (Params.b - Params.c) / (Params.d * 2) + Params.e ^ 2");
    const env = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    expect(evaluate(parse(printExpr(src, "plain")), env)).toBe(evaluate(parse(src), env));
  });

  it("flags literals", () => {
    expect(isLiteral("40")).toBe(true);
    expect(isLiteral("-2.5")).toBe(true);
    expect(isLiteral("w / 2")).toBe(false);
  });
});
