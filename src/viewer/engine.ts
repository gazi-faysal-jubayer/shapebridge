// The 3D engine, loaded lazily after the shell paints (it carries three.js + every importer: ~250 KB gz).
// Architecture: docs/adr/0001-viewer-architecture.md. OV's low-level Viewer does import/render/navigation;
// selection, measure, section, explode and display modes are our layers on top of its scene.
import * as OV from "online-3d-viewer";
import * as THREE from "three";
import type { Axis, DisplayMode, Measurement, Props, Section, StdView, Tool, TreeNode } from "../state/store";
import { explodeOffset, sectionPlane, viewDirection, zUpExtensions } from "./math";
import { buildTree, type OvModel } from "./tree";

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
export type MeshExt = (typeof meshExports)[number]["ext"];

type V3 = [number, number, number];
type Xyz = { x: number; y: number; z: number };
type UserData = { originalMeshInstance: { id: OV.MeshInstanceId } };
type Hit = THREE.Intersection & { face: THREE.Face };

export interface LoadResult {
  tree: TreeNode;
  triangles: number;
  parts: number;
  unit: string;
  upAxis: "y" | "z";
}

export interface EngineEvents {
  onPick(key: string | null, additive: boolean): void;
  /** model-space point for display, scene-space point for overlays */
  onHover(point: V3 | null, scene: V3 | null): void;
  /** a click on the model while the comment tool is active */
  onPlace(scene: V3): void;
  onMeasure(m: Measurement | null, points: number): void;
  onCamera(): void;
}

const SELECT_COLOR = new OV.RGBColor(59, 130, 246);
const BIG_MODEL_TRIANGLES = 300_000;
const keyOf = (ud: UserData) => ud.originalMeshInstance.id.GetKey();

export class Engine {
  readonly viewer = new OV.Viewer();
  private loader = new OV.ThreeModelLoader();
  private model: OV.Model | null = null;
  private ids = new Map<string, OV.MeshInstanceId>();
  private upAxis: "y" | "z" = "y";
  private tool: Tool = "select";
  private display: DisplayMode = "edges";
  private clip: THREE.Plane | null = null;
  private original = new WeakMap<THREE.Material, Partial<THREE.Material> & { wireframe?: boolean }>();
  private explodeBase = new Map<THREE.Object3D, { pos: THREE.Vector3; center: V3; edge: boolean }>();
  private markers: { point: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  private canvas: HTMLCanvasElement;
  private lastHover = 0;

  constructor(
    private parent: HTMLElement,
    private events: EngineEvents,
  ) {
    this.canvas = document.createElement("canvas");
    parent.appendChild(this.canvas);
    this.viewer.Init(this.canvas);
    this.viewer.SetBackgroundColor(new OV.RGBAColor(0, 0, 0, 0));
    this.viewer.renderer.localClippingEnabled = true;
    this.resize();

    // run our own hooks after every render (camera changes drive the view cube)
    const render = this.viewer.Render.bind(this.viewer);
    this.viewer.Render = () => {
      render();
      this.events.onCamera();
    };

    this.viewer.SetMouseClickHandler((button: number, coords: OV.Coord2D) => this.click(button, coords));
    this.viewer.SetMouseMoveHandler((coords: OV.Coord2D) => this.move(coords));
    // OV's click callback has no modifier keys, so remember them at pointer-down
    this.canvas.addEventListener("pointerdown", (e) => (this.additive = e.shiftKey || e.ctrlKey || e.metaKey), true);
  }

  private additive = false;
  /** OV rotated a Z-up file into its Y-up scene (STL, 3MF, FCStd…) */
  private rotated = false;

  resize() {
    this.viewer.Resize(this.parent.clientWidth, this.parent.clientHeight);
  }

  load(files: File[]): Promise<LoadResult> {
    this.viewer.Clear();
    this.reset();
    const settings = new OV.ImportSettings();
    settings.defaultColor = new OV.RGBColor(176, 190, 197);
    let crashed: (e: PromiseRejectionEvent) => void = () => {};
    const loading = new Promise<LoadResult>((resolve, reject) => {
      // some readers crash inside their own promise chains and never call onLoadError; surface that as a failure
      crashed = (e) => reject(new Error(`the reader crashed (${String(e.reason?.message ?? e.reason).slice(0, 120)})`));
      window.addEventListener("unhandledrejection", crashed);
      this.loader.LoadModel(OV.InputFilesFromFileObjects(files), settings, {
        onLoadStart: () => {},
        onFileListProgress: () => {},
        onFileLoadProgress: () => {},
        onImportStart: () => {},
        onVisualizationStart: () => {},
        onTextureLoaded: () => this.viewer.Render(),
        onModelFinished: async (result: { model: OV.Model; upVector: number }, object: THREE.Object3D) => {
          this.viewer.SetMainObject(object);
          this.model = result.model;
          const ext = (files[0]?.name.split(".").pop() ?? "").toLowerCase();
          this.rotated = result.upVector === OV.Direction.Z;
          this.upAxis = zUpExtensions.has(ext) ? "z" : "y";
          this.viewer.SetUpVector(this.upAxis === "z" ? OV.Direction.Z : OV.Direction.Y, false);
          const tree = buildTree(result.model as unknown as OvModel, (n, m) => this.register(n, m), files[0]?.name ?? "Model");
          const triangles = result.model.TriangleCount();
          if (triangles > BIG_MODEL_TRIANGLES) await this.accelerate();
          this.applyMaterials();
          this.setView("iso");
          resolve({ tree, triangles, parts: tree.keys.length, unit: unitName(result.model.GetUnit()), upAxis: this.upAxis });
        },
        onLoadError: (err: { code: number; message: string | null }) =>
          reject(
            new Error(err.message ?? (err.code === OV.ImportErrorCode.NoImportableFile ? "No importable file found" : "Import failed")),
          ),
      });
    });
    return loading.finally(() => window.removeEventListener("unhandledrejection", crashed));
  }

  private register(nodeId: number, meshIndex: number) {
    const id = new OV.MeshInstanceId(nodeId, meshIndex);
    this.ids.set(id.GetKey(), id);
    return id.GetKey();
  }

  private reset() {
    this.model = null;
    this.ids.clear();
    this.explodeBase.clear();
    this.markers = [];
    this.clip = null;
  }

  // big meshes: BVH-accelerated picking, loaded only when needed
  private async accelerate() {
    const bvh = await import("three-mesh-bvh");
    THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
    this.meshes((m) => {
      const g = m.geometry as THREE.BufferGeometry & { computeBoundsTree?: () => void };
      g.computeBoundsTree = bvh.computeBoundsTree;
      g.computeBoundsTree();
    });
  }

  // ---------- picking, measure ----------

  setTool(tool: typeof this.tool) {
    if (this.tool === "measure" && tool !== "measure") this.clearMeasure();
    this.tool = tool;
  }

  private hit(coords: OV.Coord2D): Hit | null {
    return this.viewer.GetMeshIntersectionUnderMouse(OV.IntersectionMode.MeshOnly, coords) as Hit | null;
  }

  private click(button: number, coords: OV.Coord2D) {
    if (button !== 1) return;
    if (this.tool === "measure") return this.measureClick(coords);
    if (this.tool === "comment") {
      const h = this.hit(coords);
      return void (h && this.events.onPlace(h.point.toArray() as V3));
    }
    const ud = this.viewer.GetMeshUserDataUnderMouse(OV.IntersectionMode.MeshAndLine, coords) as UserData | null;
    this.events.onPick(ud ? keyOf(ud) : null, this.additive);
  }

  private move(coords: OV.Coord2D) {
    const now = performance.now();
    if (now - this.lastHover < 40 || !this.model) return; // raycasts are not free on big models
    this.lastHover = now;
    const h = this.hit(coords);
    this.events.onHover(h ? this.toModel(h.point) : null, h ? (h.point.toArray() as V3) : null);
  }

  /** Scene point back to model coordinates (undo OV's Z-up → Y-up rotation for display). */
  private toModel(p: THREE.Vector3): V3 {
    return this.rotated ? [p.x, -p.z, p.y] : [p.x, p.y, p.z];
  }

  private measureClick(coords: OV.Coord2D) {
    const h = this.hit(coords);
    if (!h) return this.clearMeasure();
    if (this.markers.length === 2) this.clearMeasure();
    const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    this.markers.push({ point: h.point.clone(), normal });
    this.drawMarker(h.point, normal);
    if (this.markers.length === 2) {
      const [a, b] = this.markers;
      this.viewer.AddExtraObject(line([a.point, b.point]));
      this.events.onMeasure(measure(a, b), 2);
    } else this.events.onMeasure(null, 1);
  }

  // marker and measurement maths ported from Online 3D Viewer's website/measuretool.js (MIT, Viktor Kovacs)
  private drawMarker(point: THREE.Vector3, normal: THREE.Vector3) {
    const r = (this.viewer.GetBoundingSphere(() => true)?.radius ?? 1) / 30;
    const marker = new THREE.Object3D();
    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, 2 * Math.PI, false, 0);
    marker.add(line(curve.getPoints(48).map((p) => new THREE.Vector3(p.x, p.y, 0))));
    marker.add(line([new THREE.Vector3(-r, 0, 0), new THREE.Vector3(r, 0, 0)]));
    marker.add(line([new THREE.Vector3(0, -r, 0), new THREE.Vector3(0, r, 0)]));
    marker.lookAt(normal);
    marker.position.copy(point);
    this.viewer.AddExtraObject(marker);
  }

  clearMeasure() {
    this.markers = [];
    this.viewer.ClearExtra();
    this.events.onMeasure(null, 0);
  }

  // ---------- visibility, selection, display ----------

  update(hidden: string[], selection: string[]) {
    const h = new Set(hidden);
    const s = new Set(selection);
    this.viewer.SetMeshesVisibility((ud: UserData) => !h.has(keyOf(ud)));
    this.viewer.SetMeshesHighlight(SELECT_COLOR, (ud: UserData) => s.has(keyOf(ud)));
    this.applyMaterials(); // highlight swaps materials, so re-apply clipping and display mode
  }

  setDisplay(mode: DisplayMode) {
    this.display = mode;
    this.viewer.SetEdgeSettings(new OV.EdgeSettings(mode === "edges" || mode === "xray", new OV.RGBColor(30, 41, 59), 25));
    this.applyMaterials();
  }

  private applyMaterials() {
    const planes = this.clip ? [this.clip] : [];
    const each = (m: THREE.Material, isEdge: boolean) => {
      if (!this.original.has(m)) {
        this.original.set(m, {
          side: m.side,
          transparent: m.transparent,
          opacity: m.opacity,
          depthWrite: m.depthWrite,
          wireframe: (m as THREE.MeshBasicMaterial).wireframe,
        });
      }
      const o = this.original.get(m)!;
      m.clippingPlanes = planes;
      if (!isEdge) {
        const xray = this.display === "xray";
        (m as THREE.MeshBasicMaterial).wireframe = this.display === "wireframe" || !!o.wireframe;
        m.transparent = xray || !!o.transparent;
        m.opacity = xray ? 0.25 : o.opacity!;
        m.depthWrite = xray ? false : o.depthWrite!;
        // with a section active, show inner faces so the cut reads as solid
        m.side = this.clip ? THREE.DoubleSide : o.side!;
      }
      m.needsUpdate = true;
    };
    this.meshes((mesh) => [mesh.material].flat().forEach((m) => each(m, false)));
    this.edges((e) => [e.material].flat().forEach((m) => each(m as THREE.Material, true)));
    this.viewer.Render();
  }

  setProjection(p: "perspective" | "orthographic") {
    this.viewer.SetProjectionMode(p === "orthographic" ? OV.ProjectionMode.Orthographic : OV.ProjectionMode.Perspective);
  }

  setUpAxis(up: "y" | "z") {
    this.upAxis = up;
    this.viewer.SetUpVector(up === "z" ? OV.Direction.Z : OV.Direction.Y, false);
    this.setView("iso");
  }

  // ---------- camera ----------

  setView(view: StdView) {
    const sphere = this.viewer.GetBoundingSphere(() => true);
    if (!sphere) return;
    const { dir, up } = viewDirection(view, this.upAxis);
    const c = new OV.Coord3D(sphere.center.x, sphere.center.y, sphere.center.z);
    this.viewer.SetCamera(new OV.Camera(new OV.Coord3D(c.x + dir[0], c.y + dir[1], c.z + dir[2]), c, new OV.Coord3D(...up), 45));
    this.viewer.FitSphereToWindow(sphere, false);
  }

  fit(keys?: string[]) {
    const only = keys?.length ? new Set(keys) : null;
    const sphere = this.viewer.GetBoundingSphere((ud: UserData) => !only || only.has(keyOf(ud)));
    if (sphere) this.viewer.FitSphereToWindow(sphere, true);
  }

  getCamera(): { eye: Xyz; center: Xyz; up: Xyz; fov: number } {
    return this.viewer.GetCamera();
  }

  setCamera(c: { eye: Xyz; center: Xyz; up: Xyz; fov: number }) {
    const xyz = (p: Xyz) => new OV.Coord3D(p.x, p.y, p.z);
    this.viewer.SetCamera(new OV.Camera(xyz(c.eye), xyz(c.center), xyz(c.up), c.fov));
  }

  /** Rotation of the camera for the CSS view cube: world→view rotation matrix (column-major 3x3). */
  cameraRotation(): number[] {
    return this.viewer.camera.matrixWorldInverse.elements.slice();
  }

  // ---------- section, explode ----------

  setSection(s: Section) {
    const box = this.sceneBox();
    if (!s.enabled || !box) this.clip = null;
    else {
      const axis = this.sceneAxis(s.axis);
      const p = sectionPlane(axis, s.offset, s.flip, box.min.toArray() as V3, box.max.toArray() as V3);
      this.clip = new THREE.Plane(new THREE.Vector3(...p.normal), p.constant);
    }
    this.applyMaterials();
  }

  /** The user's X/Y/Z are CAD axes; map them onto the Y-up scene when the model was rotated. */
  private sceneAxis(axis: Axis): Axis {
    return this.upAxis === "z" ? axis : ({ x: "x", y: "z", z: "y" } as const)[axis];
  }

  setExplode(factor: number) {
    if (this.explodeBase.size === 0) {
      this.meshes((m) => this.rememberExplode(m, false));
      this.edges((e) => this.rememberExplode(e, true));
    }
    const box = this.sceneBox();
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3()).toArray() as V3;
    for (const [obj, base] of this.explodeBase) {
      const world = new THREE.Vector3(...explodeOffset(base.center, center, factor));
      if (base.edge || !obj.parent) obj.position.copy(base.pos).add(world);
      else {
        // meshes live under OV's (possibly rotated) root: convert the world offset into parent space
        const origin = obj.parent.worldToLocal(new THREE.Vector3(0, 0, 0));
        obj.position.copy(base.pos).add(obj.parent.worldToLocal(world).sub(origin));
      }
    }
    this.viewer.Render();
  }

  private rememberExplode(obj: THREE.Object3D, edge: boolean) {
    const center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()).toArray() as V3;
    this.explodeBase.set(obj, { pos: obj.position.clone(), center, edge });
  }

  // ---------- data ----------

  properties(keys: string[]): Props | null {
    if (!this.model) return null;
    const target = keys.length === 1 ? this.model.GetMeshInstance(this.ids.get(keys[0])!) : this.model;
    if (!target) return null;
    const bb = OV.GetBoundingBox(target);
    const size: V3 = bb ? [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] : [0, 0, 0];
    const manifold = OV.IsTwoManifold(target);
    const props: Props["properties"] = [];
    for (let g = 0; g < target.PropertyGroupCount(); g++) {
      const group = target.GetPropertyGroup(g);
      for (let p = 0; p < group.PropertyCount(); p++) {
        const prop = group.GetProperty(p);
        props.push({ group: group.name, name: prop.name, value: OV.PropertyToString(prop) });
      }
    }
    const name = keys.length === 1 ? (target as OV.MeshInstance).GetMesh().GetName() || "Part" : `${keys.length || this.ids.size} parts`;
    return {
      name,
      vertices: target.VertexCount(),
      triangles: target.TriangleCount(),
      size,
      area: OV.CalculateSurfaceArea(target),
      volume: manifold ? OV.CalculateVolume(target) : null,
      properties: props,
    };
  }

  /** Scene point → CSS pixels inside the viewport, or null when it's behind the camera. */
  project(p: V3): [number, number] | null {
    const v = new THREE.Vector3(...p).project(this.viewer.camera);
    if (v.z > 1) return null;
    return [((v.x + 1) / 2) * this.parent.clientWidth, ((1 - v.y) / 2) * this.parent.clientHeight];
  }

  screenshot(scale: number, transparent: boolean): string {
    const { width, height } = this.viewer.GetCanvasSize();
    return this.viewer.GetImageAsDataUrl(Math.round(width * scale), Math.round(height * scale), transparent);
  }

  /** Mesh export of what's loaded; `scale` converts units (OBJ/STL/… carry no unit of their own). */
  export(ext: MeshExt, scale = 1): Promise<{ name: string; data: Uint8Array }[]> {
    const spec = meshExports.find((m) => m.ext === ext)!;
    return new Promise((ok, fail) => {
      if (!this.model) return fail(new Error("Nothing to export"));
      const transformation = new OV.Transformation(new OV.Matrix(null).CreateScale(scale, scale, scale));
      new OV.Exporter().Export(this.model, new OV.ExporterSettings(scale === 1 ? {} : { transformation }), spec.format, ext, {
        onSuccess: (files: OV.ExportedFile[]) =>
          ok(
            files.map((f) => ({
              name: f.GetName(),
              data:
                spec.format === OV.FileFormat.Text ? new TextEncoder().encode(f.GetTextContent()) : new Uint8Array(f.GetBufferContent()),
            })),
          ),
        onError: () => fail(new Error(`Export to ${ext} failed`)),
      });
    });
  }

  // ---------- internals ----------

  private sceneBox(): THREE.Box3 | null {
    return this.viewer.GetBoundingBox(() => true);
  }

  private meshes(fn: (m: THREE.Mesh) => void) {
    (this.viewer as unknown as { mainModel: { EnumerateMeshes(f: (m: THREE.Mesh) => void): void } }).mainModel.EnumerateMeshes(fn);
  }

  private edges(fn: (e: THREE.LineSegments) => void) {
    (this.viewer as unknown as { mainModel: { EnumerateEdges(f: (e: THREE.LineSegments) => void): void } }).mainModel.EnumerateEdges(fn);
  }
}

const unitName = (u: number) => Object.entries(OV.Unit).find(([, v]) => v === u)?.[0] ?? "Unknown";

function line(points: THREE.Vector3[]) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }),
  );
}

function measure(a: { point: THREE.Vector3; normal: THREE.Vector3 }, b: { point: THREE.Vector3; normal: THREE.Vector3 }): Measurement {
  const angle = a.normal.angleTo(b.normal);
  const parallel = angle < 1e-3 || Math.abs(angle - Math.PI) < 1e-3;
  return {
    distance: a.point.distanceTo(b.point),
    parallelDistance: parallel
      ? Math.abs(new THREE.Plane().setFromNormalAndCoplanarPoint(a.normal, a.point).distanceToPoint(b.point))
      : null,
    angleDeg: (angle * 180) / Math.PI,
  };
}
