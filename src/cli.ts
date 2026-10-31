// shapebridge CLI: exact conversions and drawings without the app, using the same kernel and writers.
//   shapebridge convert <input.step|.stp|.brep|.sbridge.json> <output.step|.brep|.stl|.svg|.dxf> [--quality coarse|normal|fine] [--scale n]
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname } from "node:path";
import opencascade from "replicad-opencascadejs";
import { setOC, importSTEP, deserializeShape, drawProjection, type Shape3D } from "replicad";
import { buildShape, measure } from "./kernel/build";
import { QUALITY, type Quality } from "./kernel/protocol";
import { migrate } from "./model/doc";
import { layout, sheetDxf, sheetSvg, type View } from "./convert/drawing";

const USAGE = `Usage: shapebridge convert <input> <output> [--quality coarse|normal|fine] [--scale n]

  input:  .step .stp .brep .brp .sbridge.json
  output: .step .brep .stl .svg (drawing sheet) .dxf (drawing sheet)
  --scale only applies to .stl (meshes carry no unit); STEP/BREP stay in millimetres.`;

export async function convert(input: string, output: string, quality: Quality = "normal", scale = 1): Promise<{ volume: number }> {
  const wasm = createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm");
  setOC(await (opencascade as unknown as (o: object) => Promise<Parameters<typeof setOC>[0]>)({ locateFile: () => wasm }));
  const inExt = input.toLowerCase().endsWith(".sbridge.json") ? ".sbridge.json" : extname(input).toLowerCase();
  const outExt = extname(output).toLowerCase();
  if (![".sbridge.json", ".step", ".stp", ".brep", ".brp"].includes(inExt)) throw new Error(`Unsupported input "${inExt}"\n\n${USAGE}`);
  if (![".step", ".brep", ".stl", ".svg", ".dxf"].includes(outExt)) throw new Error(`Unsupported output "${outExt}"\n\n${USAGE}`);
  const buf = await readFile(input);
  let shape: Shape3D;
  if (inExt === ".sbridge.json") shape = buildShape(migrate(JSON.parse(buf.toString("utf8"))));
  else if (inExt === ".step" || inExt === ".stp") shape = (await importSTEP(new Blob([buf]))) as Shape3D;
  else if (inExt === ".brep" || inExt === ".brp") shape = deserializeShape(buf.toString("utf8")) as Shape3D;
  else throw new Error(`Unsupported input "${inExt}"\n\n${USAGE}`);

  let data: Uint8Array | string;
  if (outExt === ".step") data = new Uint8Array(await shape.blobSTEP().arrayBuffer());
  else if (outExt === ".brep") data = shape.serialize();
  else if (outExt === ".stl") {
    const s = scale === 1 ? shape : shape.clone().scale(scale, [0, 0, 0]);
    data = new Uint8Array(await s.blobSTL({ binary: true, ...QUALITY[quality] }).arrayBuffer());
  } else if (outExt === ".svg" || outExt === ".dxf") {
    const views: View[] = (["front", "top", "right"] as const).map((name) => {
      const { visible, hidden } = drawProjection(shape, name);
      return { name, visible: visible.toSVGPaths().flat(), hidden: hidden.toSVGPaths().flat(), viewBox: visible.toSVGViewBox() };
    });
    const sheet = layout(views);
    data = outExt === ".svg" ? sheetSvg(sheet, input.replace(/^.*[\\/]/, "").replace(/\..*$/, "")) : sheetDxf(sheet);
  } else throw new Error(`Unsupported output "${outExt}"\n\n${USAGE}`);
  await writeFile(output, data);
  return { volume: measure(shape).volume };
}

async function main(argv: string[]) {
  const [cmd, input, output, ...rest] = argv;
  if (cmd !== "convert" || !input || !output) {
    console.log(USAGE);
    process.exit(cmd === "--help" || cmd === "-h" ? 0 : 1);
  }
  const flag = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const quality = (flag("--quality") ?? "normal") as Quality;
  if (!(quality in QUALITY)) throw new Error(`--quality must be coarse, normal or fine`);
  const scale = Number(flag("--scale") ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("--scale must be a positive number");
  const { volume } = await convert(input, output, quality, scale);
  console.log(`${input} -> ${output} (volume ${volume.toFixed(3)} mm³)`);
}

// run only when executed directly, not when imported by tests
if (process.argv[1] && /shapebridge(\.m?js)?$|cli\.(t|j)s$/.test(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
