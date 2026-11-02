// Every file in public/samples must import with triangles (#15). A new sample in a format without a
// reader here fails the test, which keeps the add-format rule honest.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as OV from "online-3d-viewer";
import occtImport from "occt-import-js";
import { IfcAPI, IFCSLAB, IFCWALL } from "web-ifc";
import { migrate, resolve } from "../model/doc";

const dir = new URL("../../public/samples/", import.meta.url);
const samples = readdirSync(dir).filter((f) => !/^(README\.md|license.*)$/i.test(f));
const bytes = (f: string) => {
  const b = readFileSync(new URL(f, dir));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// Node has File but not FileReader; OV reads dropped files with readAsArrayBuffer only
class NodeFileReader {
  static DONE = 2;
  readyState = 0;
  result: ArrayBuffer | null = null;
  onloadend: ((e: { target: NodeFileReader }) => void) | null = null;
  onerror: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then(
      (r) => ((this.result = r), (this.readyState = NodeFileReader.DONE), this.onloadend?.({ target: this })),
      () => this.onerror?.(),
    );
  }
}
globalThis.FileReader ??= NodeFileReader as unknown as typeof FileReader;

/** Triangles from OV's own importer, the same code the viewer runs for dropped files. */
function ovTriangles(name: string, content: ArrayBuffer): Promise<number> {
  const importer = new OV.Importer();
  return new Promise((ok, fail) =>
    importer.ImportFiles([new OV.InputFile(name, OV.FileSource.File, new File([content], name))], new OV.ImportSettings(), {
      onLoadStart: () => {},
      onFileListProgress: () => {},
      onFileLoadProgress: () => {},
      onImportStart: () => {},
      onImportSuccess: (r: { model: OV.Model }) => ok(r.model.TriangleCount()),
      onImportError: (e: { code: number; message: string | null }) =>
        fail(new Error(e.message ?? `import of ${name} failed (OV error ${e.code})`)),
    }),
  );
}

/** Triangles from the OCCT reader the viewer uses for exact formats. */
async function occtTriangles(content: ArrayBuffer): Promise<number> {
  const occt = await occtImport();
  const r = occt.ReadStepFile(new Uint8Array(content), null);
  expect(r.success).toBe(true);
  return r.meshes.reduce((n, m) => n + m.index.array.length / 3, 0);
}

/** Triangles and element names from web-ifc, the IFC reader the viewer ships (OV loads it with a script tag, so not in Node). */
async function ifc(content: ArrayBuffer): Promise<{ triangles: number; names: string[] }> {
  const api = new IfcAPI();
  await api.Init();
  const id = api.OpenModel(new Uint8Array(content));
  let triangles = 0;
  api.StreamAllMeshes(id, (m) => {
    for (let i = 0; i < m.geometries.size(); i++)
      triangles += api.GetGeometry(id, m.geometries.get(i).geometryExpressID).GetIndexDataSize() / 3;
  });
  const names: string[] = [];
  for (const type of [IFCWALL, IFCSLAB]) {
    const ids = api.GetLineIDsWithType(id, type);
    for (let i = 0; i < ids.size(); i++) names.push(api.GetLine(id, ids.get(i)).Name.value);
  }
  api.CloseModel(id);
  return { triangles, names };
}

describe("sample files", () => {
  it("building.ifc keeps its element names (#81)", async () => {
    expect((await ifc(bytes("building.ifc"))).names).toEqual(["Wall south", "Wall west", "Floor slab"]);
  });

  it("has samples to test", () => expect(samples.length).toBeGreaterThan(0));

  it.each(samples)("%s imports with triangles", async (f) => {
    const ext = f.toLowerCase().split(".").pop();
    if (f.endsWith(".sbridge.json")) {
      // parametric documents build in the kernel; their geometry is checked by src/kernel/*.test.ts
      const doc = migrate(JSON.parse(new TextDecoder().decode(bytes(f))));
      expect(resolve(doc).env).toBeDefined();
      return;
    }
    const n =
      ext === "step" || ext === "stp"
        ? await occtTriangles(bytes(f))
        : ext === "ifc"
          ? (await ifc(bytes(f))).triangles
          : await ovTriangles(f, bytes(f));
    expect(n).toBeGreaterThan(0);
  });
});
