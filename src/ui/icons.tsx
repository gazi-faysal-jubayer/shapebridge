// ShapeBridge's own CAD icon set (Apache-2.0). Two-tone: outlines use currentColor, the accent fill uses
// --icon-accent, so icons work in both themes. Drawn for this project; not traced from any vendor's artwork.
import type { JSX } from "solid-js";

type Props = { size?: number; title?: string };
// `body` is a function so every icon instance gets its own DOM nodes
const svg = (body: () => JSX.Element) => (p: Props) => (
  <svg
    class="cad-icon"
    viewBox="0 0 24 24"
    width={p.size ?? 20}
    height={p.size ?? 20}
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linejoin="round"
    stroke-linecap="round"
    aria-hidden={p.title ? undefined : "true"}
    role={p.title ? "img" : undefined}
  >
    {p.title && <title>{p.title}</title>}
    {body()}
  </svg>
);
const fill = { fill: "var(--icon-accent)", "fill-opacity": "0.35" };

// a box drawn in isometric: top face, left face, right face
const box = (top: string, left: string, right: string) => (
  <>
    <path d={top} style={fill} />
    <path d={left} />
    <path d={right} />
  </>
);

export const icons = {
  extrude: svg(() => (
    <>
      {box("M4 9 12 5l8 4-8 4z", "M4 9v6l8 4v-6", "M20 9v6l-8 4")}
      <path d="M12 1v3M10.5 2.5 12 1l1.5 1.5" />
    </>
  )),
  cut: svg(() => (
    <>
      {box("M3 10 12 6l9 4-9 4z", "M3 10v6l9 4v-6", "M21 10v6l-9 4")}
      <path d="M9 9.5 12 8l3 1.5-3 1.5z" style={{ fill: "currentColor" }} />
    </>
  )),
  revolve: svg(() => (
    <>
      <path d="M12 3v18" stroke-dasharray="2 2" />
      <path d="M12 6h5v3l-2 3 2 3v3h-5" style={fill} />
      <path d="M5 8a8 3 0 0 0 0 8" />
      <path d="M3.5 14.5 5 16l1.8-1" />
    </>
  )),
  hole: svg(() => (
    <>
      {box("M3 10 12 6l9 4-9 4z", "M3 10v5l9 4v-5", "M21 10v5l-9 4")}
      <ellipse cx="12" cy="10" rx="3" ry="1.4" style={{ fill: "currentColor" }} />
      <path d="M12 2v5" stroke-dasharray="1.5 1.5" />
    </>
  )),
  fillet: svg(() => (
    <>
      <path d="M4 20V10a6 6 0 0 1 6-6h10" />
      <path d="M4 10a6 6 0 0 1 6-6v6z" style={fill} />
      <path d="M8 20V12a2 2 0 0 1 2-2h10" stroke-opacity=".5" />
    </>
  )),
  chamfer: svg(() => (
    <>
      <path d="M4 20V10l6-6h10" />
      <path d="M4 10l6-6v6z" style={fill} />
      <path d="M8 20v-8l2-2h10" stroke-opacity=".5" />
    </>
  )),
  shell: svg(() => (
    <>
      {box("M3 9 12 5l9 4-9 4z", "M3 9v7l9 4v-7", "M21 9v7l-9 4")}
      <path d="M6 9.2 12 6.6l6 2.6-6 2.6z" style={{ fill: "var(--surface)" }} />
    </>
  )),
  linearPattern: svg(() => (
    <>
      <rect x="3" y="9" width="5" height="6" rx="1" style={fill} />
      <rect x="10" y="9" width="5" height="6" rx="1" />
      <rect x="17" y="9" width="4" height="6" rx="1" stroke-dasharray="1.5 1.5" />
      <path d="M3 19h18M18.5 17.5 21 19l-2.5 1.5" />
    </>
  )),
  polarPattern: svg(() => (
    <>
      <circle cx="12" cy="12" r="7" stroke-dasharray="2 2" />
      <circle cx="12" cy="5" r="2" style={fill} />
      <circle cx="18.1" cy="15.5" r="2" />
      <circle cx="5.9" cy="15.5" r="2" />
      <circle cx="12" cy="12" r="1" style={{ fill: "currentColor" }} />
    </>
  )),
  mirror: svg(() => (
    <>
      <path d="M12 2v20" stroke-dasharray="2 2" />
      <path d="M10 6H4v12h6z" style={fill} />
      <path d="M14 6h6v12h-6z" />
    </>
  )),
  sketchRect: svg(() => (
    <>
      <rect x="4" y="6" width="16" height="12" style={fill} />
      <circle cx="4" cy="6" r="1.4" style={{ fill: "currentColor" }} />
      <circle cx="20" cy="18" r="1.4" style={{ fill: "currentColor" }} />
    </>
  )),
  sketchCircle: svg(() => (
    <>
      <circle cx="12" cy="12" r="8" style={fill} />
      <path d="M12 12h8" />
      <circle cx="12" cy="12" r="1.3" style={{ fill: "currentColor" }} />
    </>
  )),
  sketchPolygon: svg(() => <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" style={fill} />),
  sketchPolyline: svg(() => (
    <>
      <path d="M3 18 8 6l6 9 7-10" />
      {[
        [3, 18],
        [8, 6],
        [14, 15],
        [21, 5],
      ].map(([x, y]) => (
        <circle cx={x} cy={y} r="1.4" style={{ fill: "currentColor" }} />
      ))}
    </>
  )),
  plane: svg(() => <path d="M3 15 9 7h12l-6 8z" style={fill} />),
  origin: svg(() => (
    <>
      <path d="M12 12V3M12 12l7.8 4.5M12 12l-7.8 4.5" />
      <circle cx="12" cy="12" r="2" style={{ fill: "var(--icon-accent)" }} />
    </>
  )),
  equations: svg(() => (
    <>
      <path d="M4 8h6M4 12h6M7 5v6" />
      <path d="M14 7h6M14 11h6M14 16l6 4M20 16l-6 4" />
    </>
  )),
  part: svg(() => box("M4 8 12 4l8 4-8 4z", "M4 8v8l8 4v-8", "M20 8v8l-8 4")),
  measure: svg(() => (
    <>
      <path d="M3 17 17 3l4 4L7 21z" style={fill} />
      <path d="M7 13l2 2M10 10l1.5 1.5M13 7l2 2" />
    </>
  )),
  section: svg(() => (
    <>
      {box("M3 10 12 6l9 4-9 4z", "M3 10v6l9 4v-6", "M21 10v6l-9 4")}
      <path d="M8 2v20" stroke="var(--icon-accent)" stroke-width="2.2" />
    </>
  )),
  explode: svg(() => (
    <>
      <rect x="9" y="9" width="6" height="6" style={fill} />
      <path d="M7 7 3 3M17 7l4-4M7 17l-4 4M17 17l4 4M3 6V3h3M21 6V3h-3M3 18v3h3M21 18v3h-3" />
    </>
  )),
  massProps: svg(() => (
    <>
      <path d="M6 20 9 8h6l3 12z" style={fill} />
      <circle cx="12" cy="5" r="2" />
    </>
  )),
  comment: svg(() => (
    <>
      <path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" style={fill} />
      <circle cx="12" cy="10" r="2" />
    </>
  )),
  markup: svg(() => (
    <>
      <path d="M3 17c3-4 5 2 8-2s4-6 7-4" />
      <path d="M15 4l5 5-9 9H6v-5z" style={fill} />
    </>
  )),
  share: svg(() => (
    <>
      <circle cx="6" cy="12" r="3" style={fill} />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M8.7 10.7 15.3 7.3M8.7 13.3l6.6 3.4" />
    </>
  )),
  viewIso: svg(() => box("M4 8 12 4l8 4-8 4z", "M4 8v8l8 4v-8", "M20 8v8l-8 4")),
  viewFront: svg(() => (
    <>
      <rect x="5" y="5" width="14" height="14" style={fill} />
      <path d="M5 5l3-3h14l-3 3M19 19l3-3V2" stroke-opacity=".4" />
    </>
  )),
  viewTop: svg(() => (
    <>
      <path d="M2 9l5-5h15l-5 5z" style={fill} />
      <path d="M2 9v11h15V9M22 4v11l-5 5" stroke-opacity=".4" />
    </>
  )),
  viewRight: svg(() => (
    <>
      <path d="M17 4l5-2v16l-5 4z" style={fill} />
      <path d="M17 4H3v18h14M3 4l5-2h14" stroke-opacity=".4" />
    </>
  )),
  displayShaded: svg(() => <path d="M4 8 12 4l8 4v8l-8 4-8-4z" style={{ fill: "var(--icon-accent)", "fill-opacity": "0.6" }} />),
  displayEdges: svg(() => (
    <>
      <path d="M4 8 12 4l8 4v8l-8 4-8-4z" style={fill} />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </>
  )),
  wireframe: svg(() => <path d="M4 8 12 4l8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8M4 16l8-4 8 4M12 4v8" stroke-opacity=".9" />),
  xray: svg(() => (
    <>
      <path d="M4 8 12 4l8 4v8l-8 4-8-4z" style={{ fill: "var(--icon-accent)", "fill-opacity": "0.15" }} />
      <path d="M4 8l8 4 8-4M12 12v8M4 16l8-4 8 4M12 4v8" stroke-dasharray="1.5 1.5" />
    </>
  )),
  zoomFit: svg(() => (
    <>
      <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
      <rect x="8" y="8" width="8" height="8" style={fill} />
    </>
  )),
  zoomSelection: svg(() => (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5 21 21" />
      <rect x="8" y="8" width="4" height="4" style={{ fill: "var(--icon-accent)" }} />
    </>
  )),
  previousView: svg(() => (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h10a6 6 0 0 1 6 6" />
    </>
  )),
  convert: svg(() => (
    <>
      <path d="M4 4h9l3 3v5" />
      <path d="M20 20h-9l-3-3v-5" style={fill} />
      <path d="M17 13l3 3-3 3M7 11l-3-3 3-3" />
    </>
  )),
  drawing: svg(() => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <rect x="6" y="6" width="5" height="5" style={fill} />
      <rect x="6" y="13" width="5" height="5" style={fill} />
      <rect x="13" y="13" width="5" height="5" style={fill} />
      <path d="M13 6h5M13 8.5h5" />
    </>
  )),
  exportParam: svg(() => (
    <>
      <path d="M5 4h10l4 4v12H5z" style={fill} />
      <path d="M9 12h6M9 16h4M12 8v-6M10 4l2-2 2 2" />
    </>
  )),
  newPart: svg(() => (
    <>
      {box("M4 9 11 5.5l7 3.5-7 3.5z", "M4 9v7l7 3.5v-7", "M18 9v7l-7 3.5")}
      <path d="M19 2v6M16 5h6" />
    </>
  )),
  open: svg(() => <path d="M3 7h6l2 2h10v10H3z" style={fill} />),
  undo: svg(() => <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />),
  redo: svg(() => <path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />),
  save: svg(() => (
    <>
      <path d="M4 4h13l3 3v13H4z" style={fill} />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </>
  )),
  screenshot: svg(() => (
    <>
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" style={fill} />
      <circle cx="12" cy="13" r="3.5" />
    </>
  )),
  hide: svg(() => (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" style={fill} />
      <path d="M4 20 20 4" />
    </>
  )),
  isolate: svg(() => (
    <>
      <rect x="3" y="3" width="18" height="18" stroke-dasharray="2 2" />
      <rect x="8" y="8" width="8" height="8" style={{ fill: "var(--icon-accent)", "fill-opacity": "0.6" }} />
    </>
  )),
  showAll: svg(() => (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" style={fill} />
      <circle cx="12" cy="12" r="3" />
    </>
  )),
};
export type IconName = keyof typeof icons;

export function Icon(p: Props & { name: IconName }) {
  const I = icons[p.name];
  return <I size={p.size} title={p.title} />;
}
