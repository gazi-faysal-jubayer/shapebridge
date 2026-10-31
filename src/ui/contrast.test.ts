import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WCAG contrast of the theme tokens, read from the real stylesheet so a palette change can't drift
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const block = (selector: string) => {
  const body = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each([
  ["dark", block(":root")],
  ["light", block(':root[data-theme="light"]')],
])("%s theme contrast", (_, t) => {
  it.each([
    ["text", "bg", 4.5],
    ["text", "surface", 4.5],
    ["text", "surface-3", 4.5],
    ["muted", "surface", 4.5],
    ["muted", "bg", 4.5],
    ["accent-text", "accent-fill", 4.5],
    ["accent", "surface", 3],
    ["text", "accent-soft", 4.5],
    ["error", "surface", 4.5],
    ["success", "surface", 3],
    ["focus", "bg", 3],
    ["focus", "surface", 3],
  ])("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
