// The 3D engine, loaded lazily after the shell paints (it carries three.js + every importer: ~250 KB gz).
// Architecture: docs/adr/0001-viewer-architecture.md. OV's low-level Viewer does import/render/navigation;
// selection, measure, section, explode and display modes are our layers on top of its scene.
import * as OV from "online-3d-viewer";
import * as THREE from "three";
import type { Axis, DisplayMode, Measurement, Props, Section, StdView, Tool, TreeNode } from "../state/store";
import { explodeOffset, sectionPlane, viewDirection, zUpExtensions } from "./math";
import { buildTree, type OvModel } from "./tree";
import { writeStl, type LeanMesh } from "./stl";

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
  /** right-click without dragging (right-drag pans): screen position and the part under the cursor */
  onContext(x: number, y: number, key: string | null): void;
  onMeasure(m: Measurement | null, points: number): void;
  onCamera(): void;
}

const SELECT_COLOR = new OV.RGBColor(59, 130, 246);
const BIG_MODEL_TRIANGLES = 300_000;
/** STLs this big skip OV's per-vertex model (about 1.4 GB of heap per million triangles) for typed arrays */
const LEAN_STL_BYTES = 20e6;
const ORIGIN_SIZE = 50;
/** "part.step.glb": glTF that the desktop's native OpenCascade sidecar wrote from a STEP/IGES/BREP file */
const NATIVE_GLB = /\.(step|stp|iges|igs|brep|brp)\.glb$/i;

/**
 * The native reader's glTF arrives with physically based materials, which OV lights for an environment map we don't
 * use, so they look dark (and black with glTF's default metalness). STEP colours are plain paint: show them with
 * the same Phong materials OV's own STEP reader makes, so a file looks the same whichever reader opened it.
 */
function usePhong(object: THREE.Object3D) {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const phong = (m: THREE.Material) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return m;
      const p = new THREE.MeshPhongMaterial({ color: m.color, vertexColors: m.vertexColors, opacity: m.opacity, transparent: m.transparent, alphaTest: m.alphaTest, side: THREE.DoubleSide }); // prettier-ignore
      m.dispose();
      return p;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(phong) : phong(mesh.material);
  });
}

/** Front (XZ), Top (XY) and Right (YZ) planes in the part's Z-up frame, turned into the Y-up scene. */
function originPlanes(): THREE.Group {
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(ORIGIN_SIZE, ORIGIN_SIZE);
  const outline = new THREE.EdgesGeometry(quad);
  const fill = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const edge = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 });
  // PlaneGeometry lies in XY; rotate it into each part plane
  for (const rot of [new THREE.Euler(0, 0, 0), new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Euler(0, Math.PI / 2, 0)]) {
    const plane = new THREE.Group().add(new THREE.Mesh(quad, fill), new THREE.LineSegments(outline, edge));
    plane.rotation.copy(rot);
    group.add(plane);
  }
  group.rotation.x = -Math.PI / 2; // part Z-up → scene Y-up, as OV does for Z-up files
  return group;
}
const keyOf = (ud: UserData) => ud.originalMeshInstance.id.GetKey();

export class Engine {
  readonly viewer = new OV.Viewer();
  private loader = new OV.ThreeModelLoader();
  private model: OV.Model | null = null;
  /** a very large mesh loaded through the lean path instead of an OV model */
  private lean: { mesh: LeanMesh; name: string; geometry: THREE.BufferGeometry } | null = null;
  /** the BVH worker holds the lean mesh's vertex array until it finishes, so picking waits */
  private picking = true;
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
  private caps = new THREE.Group();

  constructor(
    private parent: HTMLElement,
    private events: EngineEvents,
  ) {
    this.canvas = document.createElement("canvas");
    parent.appendChild(this.canvas);
    // OV's renderer asks for no stencil buffer; creating the context first gives three one for section caps
    this.canvas.getContext("webgl2", { stencil: true, antialias: true });
    this.viewer.Init(this.canvas);
    this.viewer.scene.add(this.caps);
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
    this.viewer.SetContextMenuHandler((global: OV.Coord2D, local: OV.Coord2D) => {
      const ud = this.picking ? (this.viewer.GetMeshUserDataUnderMouse(OV.IntersectionMode.MeshOnly, local) as UserData | null) : null;
      this.events.onContext(global.x, global.y, ud ? keyOf(ud) : null);
    });
    // OV's click callback has no modifier keys, so remember them at pointer-down
    this.canvas.addEventListener("pointerdown", (e) => (this.additive = e.shiftKey || e.ctrlKey || e.metaKey), true);
  }

  private additive = false;
  /** OV rotated a Z-up file into its Y-up scene (STL, 3MF, FCStd…) */
  private rotated = false;
  private origin: THREE.Group | null = null;

  resize() {
    this.viewer.Resize(this.parent.clientWidth, this.parent.clientHeight);
  }

  load(files: File[]): Promise<LoadResult> {
    this.viewer.Clear();
    this.reset();
    this.hideOrigin();
    if (files.length === 1 && /\.stl$/i.test(files[0].name) && files[0].size > LEAN_STL_BYTES) return this.loadLean(files[0]);
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
          if (NATIVE_GLB.test(files[0]?.name ?? "")) usePhong(object);
          this.setMainObject(object);
          this.model = result.model;
          const name = files[0]?.name ?? "Model";
          // a STEP/IGES/BREP that the desktop's native reader turned into glTF keeps its own Z-up frame and millimetres
          const native = NATIVE_GLB.test(name);
          const ext = ((native ? name.split(".").at(-2) : name.split(".").pop()) ?? "").toLowerCase();
          this.rotated = result.upVector === OV.Direction.Z;
          this.upAxis = zUpExtensions.has(ext) ? "z" : "y";
          this.viewer.SetUpVector(this.upAxis === "z" ? OV.Direction.Z : OV.Direction.Y, false);
          const tree = buildTree(result.model as unknown as OvModel, (n, m) => this.register(n, m), name.replace(NATIVE_GLB, ".$1"));
          const triangles = result.model.TriangleCount();
          if (triangles > BIG_MODEL_TRIANGLES) await this.accelerate();
          this.applyMaterials();
          this.setView("iso");
          const unit = native ? "Millimeter" : unitName(result.model.GetUnit());
          resolve({ tree, triangles, parts: tree.keys.length, unit, upAxis: this.upAxis });
        },
        onLoadError: (err: { code: number; message: string | null }) =>
          reject(
            new Error(err.message ?? (err.code === OV.ImportErrorCode.NoImportableFile ? "No importable file found" : "Import failed")),
          ),
      });
    });
    return loading.finally(() => window.removeEventListener("unhandledrejection", crashed));
  }

  /** Large STL: parsed in a worker into typed arrays and shown as one buffer-geometry part. */
  private async loadLean(file: File): Promise<LoadResult> {
    const worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
    const res = await new Promise<{ ok: true; mesh: LeanMesh } | { ok: false; error: string }>((ok) => {
      worker.onmessage = (e) => ok(e.data);
      worker.onerror = (e) => ok({ ok: false, error: e.message });
      worker.postMessage(file);
    }).finally(() => worker.terminate());
    if (!res.ok) throw new Error(res.error);
    const { mesh } = res;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    // OV expects a material array per mesh, like its own converter makes
    geometry.addGroup(0, mesh.stats.triangles * 3, 0);
    const part = new THREE.Mesh(geometry, [new THREE.MeshPhongMaterial({ color: 0xb0bec5 })]);
    const key = this.register(0, 0);
    // the shape OV's picking, highlight and visibility look for
    part.userData = { originalMeshInstance: { id: this.ids.get(key) }, threeMaterials: null };
    const root = new THREE.Object3D();
    root.add(part);
    // STL is Z-up; OV turns Z-up files into its Y-up scene the same way
    root.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.lean = { mesh, name: file.name, geometry };
    // an edge outline over millions of triangles is both unreadable and seconds of main-thread work
    this.setDisplay(this.display);
    this.setMainObject(root);
    this.rotated = true;
    this.upAxis = "y";
    this.viewer.SetUpVector(OV.Direction.Y, false);
    this.applyMaterials();
    this.setView("iso");
    void this.accelerateInWorker(geometry);
    const name = file.name.replace(/\.stl$/i, "");
    return {
      tree: { id: "root", name, keys: [key], children: [] },
      triangles: mesh.stats.triangles,
      parts: 1,
      unit: "Unknown",
      upAxis: "y",
    };
  }

  /** Picking acceleration for the lean path, built in three-mesh-bvh's worker so the UI stays responsive. */
  private async accelerateInWorker(geometry: THREE.BufferGeometry) {
    const [bvh, { GenerateMeshBVHWorker }] = await Promise.all([import("three-mesh-bvh"), import("three-mesh-bvh/worker")]);
    const worker = new GenerateMeshBVHWorker();
    this.picking = false;
    try {
      (geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree = await worker.generate(geometry);
      THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
    } finally {
      worker.dispose();
      this.picking = true;
    }
  }

  private register(nodeId: number, meshIndex: number) {
    const id = new OV.MeshInstanceId(nodeId, meshIndex);
    this.ids.set(id.GetKey(), id);
    return id.GetKey();
  }

  private reset() {
    this.model = null;
    this.lean = null;
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
    if (!this.picking) return null;
    return this.viewer.GetMeshIntersectionUnderMouse(OV.IntersectionMode.MeshOnly, coords) as Hit | null;
  }

  private click(button: number, coords: OV.Coord2D) {
    if (button !== 1) return;
    if (this.tool === "measure") return this.measureClick(coords);
    if (this.tool === "comment") {
      const h = this.hit(coords);
      return void (h && this.events.onPlace(h.point.toArray() as V3));
    }
    const ud = this.picking ? (this.viewer.GetMeshUserDataUnderMouse(OV.IntersectionMode.MeshAndLine, coords) as UserData | null) : null;
    this.events.onPick(ud ? keyOf(ud) : null, this.additive);
  }

  private move(coords: OV.Coord2D) {
    const now = performance.now();
    if (now - this.lastHover < 40 || !(this.model || this.lean)) return; // raycasts are not free on big models
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
    const edges = (mode === "edges" || mode === "xray") && !this.lean;
    this.viewer.SetEdgeSettings(new OV.EdgeSettings(edges, new OV.RGBColor(30, 41, 59), 25));
    this.applyMaterials();
  }

  private applyMaterials() {
    const capped = this.updateCaps();
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
        // without caps, show inner faces so the cut still reads as solid
        m.side = this.clip && !capped ? THREE.DoubleSide : o.side!;
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

  /**
   * Shows a loaded model and fits the camera's clip planes to it. OV's low-level Viewer only does that when the
   * projection changes, so without it every model kept a 1 m far plane and anything bigger was cut off.
   */
  private setMainObject(object: THREE.Object3D) {
    object.updateMatrixWorld(true); // the bounds must include each part's placement, before the first render
    this.viewer.SetMainObject(object);
    this.viewer.AdjustClippingPlanes();
  }

  /** Empty scene with the Front/Top/Right origin planes, for a new part before its first feature. */
  showOrigin() {
    this.viewer.Clear();
    this.reset();
    this.origin ??= originPlanes();
    if (!this.origin.parent) this.viewer.scene.add(this.origin);
    this.origin.visible = true;
    // parametric parts are Z-up and shown like a Z-up STL, so the planes use the same frame
    this.rotated = true;
    this.upAxis = "y";
    this.viewer.SetUpVector(OV.Direction.Y, false);
    const sphere = { center: new OV.Coord3D(0, 0, 0), radius: ORIGIN_SIZE };
    const { dir, up } = viewDirection("iso", "y");
    this.viewer.SetCamera(new OV.Camera(new OV.Coord3D(...dir), new OV.Coord3D(0, 0, 0), new OV.Coord3D(...up), 45));
    this.viewer.AdjustClippingPlanesToSphere(sphere);
    this.viewer.FitSphereToWindow(sphere, false);
    this.viewer.Render();
  }

  private hideOrigin() {
    if (this.origin) this.origin.visible = false;
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

  /**
   * Solid caps on the section plane, one per visible part, drawn with the stencil technique: the part's
   * back faces add and its front faces subtract, so the cap fills only where the plane is inside the part.
   * Returns whether caps are shown.
   */
  private updateCaps(): boolean {
    for (const o of this.caps.children as THREE.Mesh[]) [o.material].flat().forEach((m) => m.dispose());
    this.capPlane?.dispose();
    this.caps.clear();
    const parts: THREE.Mesh[] = [];
    this.meshes((m) => m.visible && parts.push(m));
    // shortcut: one stencil pass per part, so very large assemblies keep the double-sided fallback; upgrade with merged geometry
    if (!this.clip || this.display === "xray" || this.display === "wireframe" || !parts.length || parts.length > 300) return false;
    const box = this.sceneBox()!;
    const size = box.getSize(new THREE.Vector3()).length() * 2;
    const plane = (this.capPlane = new THREE.PlaneGeometry(size, size));
    const at = this.clip.coplanarPoint(new THREE.Vector3());
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.clip.normal);
    parts.forEach((part, i) => {
      const order = 10 + i * 3;
      const stencil = (side: THREE.Side, op: THREE.StencilOp) =>
        new THREE.MeshBasicMaterial({
          side,
          colorWrite: false,
          depthWrite: false,
          depthTest: false,
          clippingPlanes: [this.clip!],
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilFail: op,
          stencilZFail: op,
          stencilZPass: op,
        });
      for (const [mat, k] of [
        [stencil(THREE.BackSide, THREE.IncrementWrapStencilOp), 0],
        [stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp), 1],
      ] as const) {
        const pass = new THREE.Mesh(part.geometry, mat);
        pass.matrixAutoUpdate = pass.matrixWorldAutoUpdate = false;
        pass.renderOrder = order + k;
        // follow the part when it moves (explode) without re-parenting it
        pass.onBeforeRender = () => pass.matrixWorld.copy(part.matrixWorld);
        this.caps.add(pass);
      }
      const src = [part.material].flat()[0] as THREE.MeshPhongMaterial;
      const cap = new THREE.Mesh(
        plane,
        new THREE.MeshPhongMaterial({
          color: src.color ?? 0x9aa8b8,
          side: THREE.DoubleSide,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.NotEqualStencilFunc,
          // writing 0 where the cap draws leaves the stencil clear for the next part
          stencilFail: THREE.ReplaceStencilOp,
          stencilZFail: THREE.ReplaceStencilOp,
          stencilZPass: THREE.ReplaceStencilOp,
        }),
      );
      cap.position.copy(at);
      cap.quaternion.copy(turn);
      cap.renderOrder = order + 2;
      this.caps.add(cap);
    });
    return true;
  }
  private capPlane: THREE.PlaneGeometry | null = null;

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
    if (this.lean) {
      const { stats } = this.lean.mesh;
      return {
        name: this.lean.name,
        vertices: stats.triangles * 3,
        triangles: stats.triangles,
        size: [0, 1, 2].map((i) => stats.max[i] - stats.min[i]) as V3,
        area: stats.area,
        volume: stats.volume > 0 ? stats.volume : null,
        properties: [],
      };
    }
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
    if (this.lean) {
      if (ext !== "stl") return Promise.reject(new Error("Very large meshes export as STL only"));
      // read the live attribute: the BVH worker hands back a new array in place of the one it borrowed
      const positions = this.lean.geometry.attributes.position.array as Float32Array;
      return Promise.resolve([{ name: this.lean.name, data: writeStl(positions, scale) }]);
    }
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
