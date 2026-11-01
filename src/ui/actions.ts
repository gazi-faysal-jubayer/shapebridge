// Every user action, once: menus, the command palette and keyboard shortcuts are all generated from this list.
import { pickAndOpen } from "../platform/open";
import { setState, state, type DisplayMode, type StdView } from "../state/store";
import * as c from "../controller";
import * as live from "../live";
import { templates, type Feature } from "../model/doc";
import type { IconName } from "./icons";
import { targets } from "../interop";

export interface Action {
  id: string;
  label: string;
  group: "File" | "View" | "Inspect" | "Design" | "Share" | "Help";
  /** shortcut as shown, e.g. "Ctrl+O", "F", "Shift+H" */
  keys?: string;
  run: () => unknown;
  enabled?: () => boolean;
  icon?: IconName;
  /** short label for ribbon buttons */
  short?: string;
}

const hasModel = () => state.files.length > 0;
const hasSelection = () => state.selection.length > 0;
const display = (d: DisplayMode) => () => setState("settings", "display", d);
const view = (v: StdView) => () => c.setView(v);
const hasSolid = () => (c.doc()?.features.length ?? 0) > 0;
const hasTool = () => !!c.doc()?.features.some((f) => f.kind === "extrude" || f.kind === "revolve" || f.kind === "hole");
const feature = (id: string, label: string, short: string, icon: IconName, run: () => unknown, enabled?: () => boolean): Action => ({
  id,
  label,
  short,
  icon,
  group: "Design",
  run,
  enabled,
});
const withProfile = (profile: Extract<Feature, { kind: "extrude" }>["profile"]) => (f: Feature) => ({ ...f, profile }) as Feature;

export const actions: Action[] = [
  { id: "open", label: "Open…", group: "File", keys: "Ctrl+O", run: () => void pickAndOpen() },
  { id: "new-part", label: "New Part", short: "New Part", group: "File", keys: "Ctrl+N", run: c.newPart },
  ...templates.map((t): Action => ({
    id: `template-${t.name}`,
    label: `New from Template: ${t.name[0].toUpperCase()}${t.name.slice(1)}`,
    group: "Design",
    run: () => c.loadDoc(t),
  })),
  feature("feat-extrude", "Extruded boss", "Extrude", "extrude", () => c.addFeature("extrude")),
  feature("feat-cut", "Extruded cut", "Cut", "cut", () => c.addFeature("cut"), hasSolid),
  feature("feat-revolve", "Revolve", "Revolve", "revolve", () => c.addFeature("revolve")),
  feature("feat-hole", "Hole", "Hole", "hole", () => c.addFeature("hole"), hasSolid),
  feature("feat-fillet", "Fillet", "Fillet", "fillet", () => c.addFeature("fillet"), hasSolid),
  feature("feat-chamfer", "Chamfer", "Chamfer", "chamfer", () => c.addFeature("chamfer"), hasSolid),
  feature("feat-shell", "Shell", "Shell", "shell", () => c.addFeature("shell"), hasSolid),
  feature("feat-linear", "Linear pattern", "Linear", "linearPattern", () => c.addFeature("pattern"), hasTool),
  feature(
    "feat-polar",
    "Circular pattern",
    "Circular",
    "polarPattern",
    () =>
      c.addFeature("pattern", (f) => ({
        id: f.id,
        kind: "pattern",
        target: (f as { target: string }).target,
        mode: "polar",
        cx: "0",
        cy: "0",
        count: "6",
      })),
    hasTool,
  ),
  feature("feat-mirror", "Mirror", "Mirror", "mirror", () => c.addFeature("mirror"), hasSolid),
  feature("sketch-rect", "Sketch: rectangle extrude", "Rectangle", "sketchRect", () => c.addFeature("extrude")),
  feature("sketch-circle", "Sketch: circle extrude", "Circle", "sketchCircle", () =>
    c.addFeature("extrude", withProfile({ type: "circle", cx: "0", cy: "0", r: "10" })),
  ),
  feature("sketch-polygon", "Sketch: polygon extrude", "Polygon", "sketchPolygon", () =>
    c.addFeature("extrude", withProfile({ type: "polygon", cx: "0", cy: "0", r: "10", sides: 6 })),
  ),
  feature("sketch-polyline", "Sketch: polyline extrude", "Polyline", "sketchPolyline", () =>
    c.addFeature(
      "extrude",
      withProfile({
        type: "polyline",
        points: [
          ["0", "0"],
          ["30", "0"],
          ["30", "10"],
          ["10", "25"],
          ["0", "25"],
        ],
      }),
    ),
  ),
  feature(
    "equations",
    "Equations (parameters)",
    "Equations",
    "equations",
    () => c.beginEdit("equations"),
    () => !!c.doc(),
  ),
  { id: "undo", label: "Undo", group: "Design", keys: "Ctrl+Z", run: c.undo, enabled: c.canUndo },
  { id: "redo", label: "Redo", group: "Design", keys: "Ctrl+Y", run: c.redo, enabled: c.canRedo },
  {
    id: "save-design",
    label: "Save Part",
    short: "Save Part",
    group: "File",
    keys: "Ctrl+S",
    run: () => c.exportInterop("json"),
    enabled: () => !!c.doc(),
  },
  { id: "restore-design", label: "Recover Autosaved Part", group: "Design", run: c.restoreAutosave, enabled: c.hasAutosave },
  { id: "sample-plate", label: "Sample: Plate (STEP)", group: "File", run: () => c.openSample("plate.step") },
  { id: "sample-assembly", label: "Sample: Assembly (STEP)", group: "File", run: () => c.openSample("assembly.step") },
  { id: "convert", label: "Convert & Export…", group: "File", keys: "Ctrl+E", run: () => setState("convertOpen", true) },
  { id: "screenshot", label: "Save screenshot (PNG)", group: "File", keys: "P", run: () => c.screenshot(2), enabled: hasModel },
  {
    id: "screenshot-transparent",
    label: "Save screenshot, transparent",
    group: "File",
    run: () => c.screenshot(2, true),
    enabled: hasModel,
  },

  { id: "fit", label: "Fit to view", group: "View", keys: "F", run: c.fit, enabled: hasModel },
  { id: "view-front", label: "Front view", group: "View", keys: "1", run: view("front"), enabled: hasModel },
  { id: "view-back", label: "Back view", group: "View", keys: "2", run: view("back"), enabled: hasModel },
  { id: "view-left", label: "Left view", group: "View", keys: "3", run: view("left"), enabled: hasModel },
  { id: "view-right", label: "Right view", group: "View", keys: "4", run: view("right"), enabled: hasModel },
  { id: "view-top", label: "Top view", group: "View", keys: "5", run: view("top"), enabled: hasModel },
  { id: "view-bottom", label: "Bottom view", group: "View", keys: "6", run: view("bottom"), enabled: hasModel },
  { id: "view-iso", label: "Isometric view", group: "View", keys: "7", run: view("iso"), enabled: hasModel },
  { id: "display-shaded", label: "Display: shaded", group: "View", run: display("shaded") },
  { id: "display-edges", label: "Display: shaded with edges", group: "View", run: display("edges") },
  { id: "display-wireframe", label: "Display: wireframe", group: "View", run: display("wireframe") },
  {
    id: "display-xray",
    label: "Display: x-ray",
    group: "View",
    keys: "X",
    run: () => setState("settings", "display", state.settings.display === "xray" ? "edges" : "xray"),
  },
  {
    id: "projection",
    label: "Toggle perspective / orthographic",
    group: "View",
    keys: "O",
    run: () => setState("settings", "projection", state.settings.projection === "perspective" ? "orthographic" : "perspective"),
  },
  {
    id: "up-axis",
    label: "Toggle up axis (Y / Z)",
    group: "View",
    keys: "U",
    run: () => c.setUpAxis(state.upAxis === "z" ? "y" : "z"),
    enabled: hasModel,
  },
  { id: "save-view", label: "Save current view", group: "View", keys: "V", run: c.saveView, enabled: hasModel },
  { id: "toggle-left", label: "Toggle left panel", group: "View", keys: "[", run: () => setState("settings", "showLeft", (v) => !v) },
  {
    id: "toggle-right",
    label: "Toggle properties panel",
    group: "View",
    keys: "]",
    run: () => setState("settings", "showRight", (v) => !v),
  },
  {
    id: "theme",
    label: "Cycle theme (system / light / dark)",
    group: "View",
    run: () => setState("settings", "theme", (t) => (t === "system" ? "light" : t === "light" ? "dark" : "system")),
  },

  { id: "tool-measure", label: "Measure", group: "Inspect", keys: "M", run: () => c.setTool("measure"), enabled: hasModel },
  { id: "tool-section", label: "Section plane", group: "Inspect", keys: "S", run: () => c.setTool("section"), enabled: hasModel },
  { id: "tool-explode", label: "Explode", group: "Inspect", keys: "E", run: () => c.setTool("explode"), enabled: hasModel },
  { id: "hide", label: "Hide selected", group: "Inspect", keys: "H", run: c.hideSelected, enabled: hasSelection },
  { id: "isolate", label: "Isolate selected", group: "Inspect", keys: "I", run: c.isolateSelected, enabled: hasSelection },
  { id: "show-all", label: "Show all", group: "Inspect", keys: "Shift+H", run: c.showAll, enabled: hasModel },
  {
    id: "escape",
    label: "Exit tool / clear selection",
    group: "Inspect",
    keys: "Escape",
    run: () => (live.live.draft ? live.cancelDraft() : state.tool !== "select" ? setState("tool", "select") : c.clearSelection()),
  },

  { id: "share", label: "Share live…", group: "Share", run: live.startShare, enabled: () => hasModel() && live.live.role === "none" },
  { id: "stop-share", label: "Stop sharing", group: "Share", run: () => live.stopShare(), enabled: () => live.live.role !== "none" },
  { id: "comment", label: "Pin a comment", group: "Share", keys: "C", run: () => setState("tool", "comment"), enabled: hasModel },
  { id: "markup", label: "Draw a markup", group: "Share", keys: "D", run: live.startMarkup, enabled: hasModel },
  {
    id: "export-review",
    label: "Export review (Markdown)",
    group: "Share",
    run: live.exportReview,
    enabled: () => live.live.comments.length > 0,
  },
  { id: "offline-viewer", label: "Export offline viewer (HTML)", group: "Share", run: live.exportViewerHtml, enabled: hasModel },

  { id: "palette", label: "Command palette", group: "Help", keys: "Ctrl+K", run: () => setState("paletteOpen", true) },
  { id: "docs", label: "Documentation", group: "Help", run: () => open("https://github.com/gazi-faysal-jubayer/shapebridge#readme") },
  {
    id: "bug",
    label: "Report a bug",
    group: "Help",
    run: () => open("https://github.com/gazi-faysal-jubayer/shapebridge/issues/new?template=bug_report.yml"),
  },
];

// parametric exports (FreeCAD, OpenSCAD, CadQuery, Fusion 360, CSV, exact STEP, .sbridge.json)
actions.push(
  ...[...targets.map((t) => ({ id: t.id, label: t.label })), { id: "step", label: "STEP (exact solid)" }].map((t): Action => ({
    id: `export-${t.id}`,
    label: `Export: ${t.label}`,
    short: t.label.split(" ")[0],
    group: "Design",
    icon: "exportParam",
    run: () => c.exportInterop(t.id),
    enabled: () => !!c.doc(),
  })),
);

// icons for actions defined above without one
const ICONS: Record<string, IconName> = {
  open: "open",
  "new-part": "newPart",
  undo: "undo",
  redo: "redo",
  "save-design": "save",
  convert: "convert",
  screenshot: "screenshot",
  fit: "zoomFit",
  "view-front": "viewFront",
  "view-top": "viewTop",
  "view-right": "viewRight",
  "view-iso": "viewIso",
  "display-shaded": "displayShaded",
  "display-edges": "displayEdges",
  "display-wireframe": "wireframe",
  "display-xray": "xray",
  "tool-measure": "measure",
  "tool-section": "section",
  "tool-explode": "explode",
  hide: "hide",
  isolate: "isolate",
  "show-all": "showAll",
  share: "share",
  comment: "comment",
  markup: "markup",
  "export-review": "drawing",
  "offline-viewer": "exportParam",
};
for (const a of actions) a.icon ??= ICONS[a.id];

export const byId = (id: string) => actions.find((a) => a.id === id)!;

/** Normalises a keyboard event to the `keys` notation above. */
export function eventKeys(e: KeyboardEvent): string {
  // Shift only counts for letters and named keys; for symbols it's already in e.key ("?" not "Shift+/")
  const shift = e.shiftKey && (e.key.length > 1 || /^[a-z]$/i.test(e.key));
  const mods = [(e.ctrlKey || e.metaKey) && "Ctrl", shift && "Shift"].filter(Boolean);
  return [...mods, e.key.length === 1 ? e.key.toUpperCase() : e.key].join("+");
}

export function handleShortcut(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) && e.key !== "Escape") return false;
  const k = eventKeys(e);
  const a = actions.find((x) => x.keys === k || (k === "Ctrl+Shift+P" && x.id === "palette"));
  if (!a || (a.enabled && !a.enabled())) return false;
  e.preventDefault();
  a.run();
  return true;
}
