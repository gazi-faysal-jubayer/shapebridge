// One store for the whole app; the viewer, panels and (later) live share all read and write it.
import { createStore } from "solid-js/store";
import { createEffect } from "solid-js";

export type Tool = "select" | "measure" | "section" | "explode" | "comment" | "markup";
export type DisplayMode = "shaded" | "edges" | "wireframe" | "xray";
export type Units = "mm" | "cm" | "m" | "in";
export type Axis = "x" | "y" | "z";
export type StdView = "front" | "back" | "left" | "right" | "top" | "bottom" | "iso";

export interface TreeNode {
  id: string;
  name: string;
  /** mesh-instance keys under this node (its own and all descendants') */
  keys: string[];
  children: TreeNode[];
}

export interface Measurement {
  distance: number;
  parallelDistance: number | null;
  angleDeg: number;
}

export interface Props {
  name: string;
  vertices: number;
  triangles: number;
  size: [number, number, number];
  area: number | null;
  volume: number | null;
  properties: { group: string; name: string; value: string }[];
}

export interface Section {
  enabled: boolean;
  axis: Axis;
  /** 0..1 along the model's bounding box on that axis */
  offset: number;
  flip: boolean;
}

export interface SavedView {
  name: string;
  camera: object;
  hidden: string[];
  section: Section;
  explode: number;
}

const settingsKey = "shapebridge.settings.v1";

interface Settings {
  theme: "system" | "light" | "dark";
  units: Units;
  display: DisplayMode;
  projection: "perspective" | "orthographic";
  showLeft: boolean;
  showRight: boolean;
  /** live review: your name, and an optional TURN relay for strict networks */
  reviewName: string;
  ribbonCompact: boolean;
  turn: { urls: string; username: string; credential: string };
  /** desktop: paths of recently opened files, newest first */
  recent: string[];
}

const defaults: Settings = {
  theme: "dark",
  units: "mm",
  display: "edges",
  projection: "perspective",
  showLeft: true,
  showRight: true,
  reviewName: "",
  ribbonCompact: false,
  turn: { urls: "", username: "", credential: "" },
  recent: [],
};

function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") };
  } catch {
    return defaults;
  }
}

export const [state, setState] = createStore({
  settings: loadSettings(),
  status: "",
  engineReady: false,
  loading: false,
  files: [] as File[],
  modelName: "",
  /** model unit as an OV Unit enum name; "Unknown" is treated as millimetres */
  modelUnit: "Unknown",
  upAxis: "y" as "y" | "z",
  tree: null as TreeNode | null,
  stats: { parts: 0, triangles: 0 },
  selection: [] as string[],
  hidden: [] as string[],
  tool: "select" as Tool,
  section: { enabled: false, axis: "z", offset: 0.5, flip: false } as Section,
  explode: 0,
  measurement: null as Measurement | null,
  measurePoints: 0,
  props: null as Props | null,
  hover: null as [number, number, number] | null,
  hoverScene: null as [number, number, number] | null,
  views: [] as SavedView[],
  paletteOpen: false,
  convertOpen: false,
  contextMenu: null as { x: number; y: number } | null,
});

export function persistSettings() {
  createEffect(() => {
    const s = JSON.stringify(state.settings);
    try {
      localStorage.setItem(settingsKey, s);
    } catch {
      // private mode or blocked storage: settings just don't persist
    }
  });
}

const viewsKey = (file: string) => `shapebridge.views.${file}`;

export function loadViews(file: string): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(viewsKey(file)) ?? "[]");
  } catch {
    return [];
  }
}

export function storeViews(file: string, views: SavedView[]) {
  try {
    localStorage.setItem(viewsKey(file), JSON.stringify(views));
  } catch {
    // ignore: views are a convenience
  }
}
