// Pure helpers used by the viewer engine; kept free of three.js/OV so they are unit-testable.
import type { Axis, StdView, Units } from "../state/store";

type V3 = [number, number, number];

/** Exploded position offset: push a part away from the model centre in proportion to its distance. */
export function explodeOffset(partCenter: V3, modelCenter: V3, factor: number): V3 {
  return [0, 1, 2].map((i) => (partCenter[i] - modelCenter[i]) * factor) as V3;
}

/** Section plane in scene space: three.js keeps the side where normal·p + constant >= 0. */
export function sectionPlane(axis: Axis, offset: number, flip: boolean, min: V3, max: V3): { normal: V3; constant: number } {
  const i = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const at = min[i] + (max[i] - min[i]) * Math.min(Math.max(offset, 0), 1);
  const normal: V3 = [0, 0, 0];
  normal[i] = flip ? 1 : -1;
  return { normal, constant: flip ? -at : at };
}

/** Camera direction (from centre towards the eye) and up vector for a standard view. */
export function viewDirection(view: StdView, up: "y" | "z"): { dir: V3; up: V3 } {
  // scene axes: with Z-up models, CAD "front" looks along +Y (eye at -Y)
  const z = up === "z";
  const table: Record<StdView, V3> = z
    ? { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1], iso: [1, -1, 1] }
    : { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0], iso: [1, 1, 1] };
  const upVec: V3 = z ? [0, 0, 1] : [0, 1, 0];
  // looking straight down the up axis needs a different screen-up
  const vertical = view === "top" || view === "bottom";
  return { dir: table[view], up: vertical ? (z ? [0, 1, 0] : [0, 0, -1]) : upVec };
}

/**
 * CSS matrix3d (column-major) that places one view-cube face so it matches the 3D camera.
 * `view` is the camera's world→view matrix (three.js matrixWorldInverse.elements); faces are the
 * standard views, so clicking one simply calls setView(face).
 */
export function cubeFaceMatrix(face: Exclude<StdView, "iso">, up: "y" | "z", view: ArrayLike<number>, size: number): number[] {
  const { dir: n, up: u } = viewDirection(face, up);
  const r: V3 = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  // face local axes: x → r, y (CSS down) → -u, z → n; pushed out by half the cube size
  const local = [r, u.map((v) => -v), n, n.map((v) => (v * size) / 2)];
  const rot = (v: number[]) => [0, 1, 2].map((i) => view[i] * v[0] + view[4 + i] * v[1] + view[8 + i] * v[2]);
  // view space is y-up; CSS is y-down
  const cols = local.map((v) => {
    const w = rot(v);
    return [w[0], -w[1], w[2]];
  });
  return [...cols[0], 0, ...cols[1], 0, ...cols[2], 0, ...cols[3], 1].map((v) => (Math.abs(v) < 1e-10 ? 0 : v));
}

const toMm: Record<string, number> = { Unknown: 1, Millimeter: 1, Centimeter: 10, Meter: 1000, Inch: 25.4, Foot: 304.8 };
const fromMm: Record<Units, number> = { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4 };

/** Converts a length (power 1), area (2) or volume (3) from the model unit to display units. */
export function convert(value: number, modelUnit: string, units: Units, power: 1 | 2 | 3 = 1): number {
  return value * ((toMm[modelUnit] ?? 1) * fromMm[units]) ** power;
}

export function formatLength(value: number, modelUnit: string, units: Units, power: 1 | 2 | 3 = 1): string {
  const raw = convert(value, modelUnit, units, power);
  const v = Math.abs(raw) < 1e-9 ? 0 : raw; // kernel round-off would print as "-0"
  const digits = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : 3;
  const suffix = power === 1 ? units : `${units}${power === 2 ? "²" : "³"}`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${suffix}`;
}

/** Extensions whose importer keeps the file's native Z-up axis (OCCT readers report Y-up but data is Z-up). */
export const zUpExtensions = new Set(["step", "stp", "iges", "igs", "brep", "brp"]);
