// Conversion: the open model to any supported format (mesh, exact solid, 2D drawing), and batches of files.
import { state } from "../state/store";
import { convert as unitScale } from "../viewer/math";
import type { MeshExt } from "../viewer/engine";
import type { Quality } from "../kernel/protocol";
import { saveFile } from "../platform/save";
import * as c from "../controller";

export type Target = MeshExt | "step" | "brep" | "stl-exact" | "svg" | "dxf";

export const TARGETS: { id: Target; label: string; group: "Exact solid" | "Mesh" | "2D drawing"; exact?: boolean }[] = [
  { id: "step", label: "STEP (AP214)", group: "Exact solid", exact: true },
  { id: "brep", label: "OpenCascade BREP", group: "Exact solid", exact: true },
  { id: "stl-exact", label: "STL from the exact solid (choose quality)", group: "Mesh", exact: true },
  { id: "stl", label: "STL (binary)", group: "Mesh" },
  { id: "obj", label: "OBJ", group: "Mesh" },
  { id: "glb", label: "glTF binary (GLB)", group: "Mesh" },
  { id: "gltf", label: "glTF (text)", group: "Mesh" },
  { id: "ply", label: "PLY", group: "Mesh" },
  { id: "off", label: "OFF", group: "Mesh" },
  { id: "3dm", label: "Rhino 3DM", group: "Mesh" },
  { id: "bim", label: "dotbim", group: "Mesh" },
  { id: "svg", label: "Drawing sheet: front, top, right (SVG, prints to PDF at 1:1)", group: "2D drawing", exact: true },
  { id: "dxf", label: "Drawing sheet (DXF, AutoCAD R12)", group: "2D drawing", exact: true },
];

export const EXACT_EXTS = new Set(["step", "stp", "brep", "brp"]);
const ext = (name: string) => (name.split(".").pop() ?? "").toLowerCase();
const stem = (name: string) => name.replace(/\.sbridge\.json$/, "").replace(/\.[^.]+$/, "");

/** Whether the open model has an exact B-rep the kernel can convert and draw (STEP/BREP file or a parametric part). */
export const hasExact = () => !!c.doc() || EXACT_EXTS.has(ext(state.files[0]?.name ?? ""));

let importedFor: File | null = null;
/** Loads the open STEP/BREP file into the kernel once (parametric parts are already there after a build). */
async function ensureExact() {
  if (c.doc()) return;
  const file = state.files[0];
  if (!file || importedFor === file) return;
  const { importExact } = await import("../kernel/protocol");
  await importExact(["brep", "brp"].includes(ext(file.name)) ? "brep" : "step", await file.arrayBuffer());
  importedFor = file;
}

export interface Options {
  units: "mm" | "cm" | "m" | "in";
  quality: Quality;
}

/** Converts the open model; returns the files to save. */
export async function convertCurrent(target: Target, opts: Options): Promise<{ name: string; data: Uint8Array | string }[]> {
  const name = stem(state.modelName || state.files[0]?.name || "model");
  // mesh formats carry no unit, so scale the geometry into the chosen one
  const scale = unitScale(1, state.modelUnit, opts.units);
  if (target === "svg" || target === "dxf" || target === "step" || target === "brep" || target === "stl-exact") {
    await ensureExact();
    const kernel = await import("../kernel/protocol");
    if (target === "svg" || target === "dxf") {
      const { views } = await kernel.projectViews();
      const { layout, sheetSvg, sheetDxf } = await import("./drawing");
      const sheet = layout(views);
      return [{ name: `${name}-drawing.${target}`, data: target === "svg" ? sheetSvg(sheet, name, "mm") : sheetDxf(sheet) }];
    }
    // STEP and BREP files declare millimetres, so exact solids keep their size; only meshes get scaled
    const fmt = target === "stl-exact" ? "stl" : target;
    const { data } = await kernel.exportExact(fmt, opts.quality, fmt === "stl" ? scale : 1);
    return [{ name: `${name}.${fmt}`, data: new Uint8Array(data) }];
  }
  const files = await c.getEngine()!.export(target, scale);
  return files.length === 1 ? [{ name: `${name}.${target}`, data: files[0].data }] : files;
}

export async function saveConverted(target: Target, opts: Options) {
  for (const f of await convertCurrent(target, opts)) await saveFile(f.name, f.data);
}

/** Opens each file, converts it to a mesh format, and saves everything as one zip. */
export async function batchConvert(
  files: File[],
  target: MeshExt,
  opts: Options,
  progress: (done: number, total: number, error?: string) => void,
) {
  const { zipSync } = await import("fflate");
  const out: Record<string, Uint8Array> = {};
  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      await c.show([files[i]]);
      for (const f of await convertCurrent(target, opts))
        out[f.name] = typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data;
      progress(i + 1, files.length);
    } catch (e) {
      errors.push(`${files[i].name}: ${(e as Error).message}`);
      progress(i + 1, files.length, errors.at(-1));
    }
  }
  if (errors.length) out["errors.txt"] = new TextEncoder().encode(errors.join("\n") + "\n");
  await saveFile(`converted-${target}.zip`, zipSync(out));
  return { converted: files.length - errors.length, errors };
}
