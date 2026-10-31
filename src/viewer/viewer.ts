// Thin wrapper over the Online 3D Viewer engine (MIT), which already reads ~20 CAD/mesh formats
// and lazy-loads heavy readers (OCCT for STEP/IGES/BREP, rhino3dm, web-ifc) only when needed.
import * as OV from "online-3d-viewer";

/** Extensions the engine imports; keep docs/FORMATS.md in sync. */
export const importExts = [
  "step", "stp", "iges", "igs", "brep", "brp", "fcstd", "3dm", "ifc", "bim",
  "stl", "obj", "mtl", "gltf", "glb", "bin", "3mf", "amf", "ply", "off", "fbx", "dae", "3ds", "wrl", "svg",
] as const;

/** Mesh exports available for any loaded model. */
export const meshExports = [
  { ext: "stl", label: "STL (binary)", format: OV.FileFormat.Binary },
  { ext: "obj", label: "OBJ", format: OV.FileFormat.Text },
  { ext: "glb", label: "glTF binary (GLB)", format: OV.FileFormat.Binary },
  { ext: "gltf", label: "glTF (text)", format: OV.FileFormat.Text },
  { ext: "ply", label: "PLY (binary)", format: OV.FileFormat.Binary },
  { ext: "off", label: "OFF", format: OV.FileFormat.Text },
  { ext: "3dm", label: "Rhino 3DM", format: OV.FileFormat.Binary },
  { ext: "bim", label: "dotbim", format: OV.FileFormat.Text },
] as const;

type Xyz = { x: number; y: number; z: number };

export interface ExportFile {
  name: string;
  data: Uint8Array;
}

export class CadViewer {
  private ev: OV.EmbeddedViewer;

  constructor(parent: HTMLElement, onLoaded: () => void, onFailed: () => void) {
    this.ev = new OV.EmbeddedViewer(parent, {
      backgroundColor: new OV.RGBAColor(0, 0, 0, 0),
      defaultColor: new OV.RGBColor(176, 190, 197),
      edgeSettings: new OV.EdgeSettings(true, new OV.RGBColor(30, 41, 59), 25),
      onModelLoaded: () => {
        // the engine rotates Z-up formats into its Y-up scene; look from front-right-top (isometric)
        const v = this.ev.GetViewer();
        const s = v.GetBoundingSphere(() => true);
        const c = new OV.Coord3D(s.center.x, s.center.y, s.center.z);
        v.SetCamera(new OV.Camera(new OV.Coord3D(c.x + 1, c.y + 0.8, c.z + 1), c, new OV.Coord3D(0, 1, 0), 45));
        v.FitSphereToWindow(s, false);
        onLoaded();
      },
      onModelLoadFailed: onFailed,
    });
  }

  load(files: File[]) {
    this.ev.LoadModelFromFileList(files);
  }

  hasModel() {
    return this.ev.GetModel() !== null;
  }

  resize() {
    this.ev.Resize();
  }

  getCamera(): object {
    return this.ev.GetViewer().GetCamera();
  }

  setCamera(c: { eye: Xyz; center: Xyz; up: Xyz; fov: number }) {
    const xyz = (p: Xyz) => new OV.Coord3D(p.x, p.y, p.z);
    this.ev.GetViewer().SetCamera(new OV.Camera(xyz(c.eye), xyz(c.center), xyz(c.up), c.fov));
  }

  export(ext: (typeof meshExports)[number]["ext"]): Promise<ExportFile[]> {
    const spec = meshExports.find((m) => m.ext === ext)!;
    return new Promise((ok, fail) => {
      new OV.Exporter().Export(this.ev.GetModel(), new OV.ExporterSettings({}), spec.format, ext, {
        onSuccess: (files: OV.ExportedFile[]) =>
          ok(
            files.map((f) => {
              const c = spec.format === OV.FileFormat.Text ? new TextEncoder().encode(f.GetTextContent()) : new Uint8Array(f.GetBufferContent());
              return { name: f.GetName(), data: c };
            }),
          ),
        onError: () => fail(new Error(`Export to ${ext} failed`)),
      });
    });
  }
}
