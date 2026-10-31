// 2D drawings from hidden-line projections: a third-angle sheet (front, top, right) as SVG, and as DXF.
// Input paths come from replicad's Drawing.toSVGPaths(): absolute M/L/H/V/C/Q/A/Z commands, y pointing down.

export interface View {
  name: "front" | "top" | "right";
  /** SVG path data, model units, y down */
  visible: string[];
  hidden: string[];
  /** replicad's viewBox for the view: "x y width height" */
  viewBox: string;
}

type P = [number, number];

export interface Sheet {
  width: number;
  height: number;
  /** each view's offset on the sheet */
  placed: { view: View; dx: number; dy: number }[];
}

/** Third-angle layout: top view above the front view, right view to the right of it. */
export function layout(views: View[], margin = 15): Sheet {
  const box = (v: View) => {
    const [x, y, w, h] = v.viewBox.split(/\s+/).map(Number);
    return { x, y, w, h };
  };
  const by = (n: View["name"]) => views.find((v) => v.name === n)!;
  const [front, top, right] = [by("front"), by("top"), by("right")].map((v) => ({ v, b: box(v) }));
  const gap = Math.max(front.b.w, front.b.h, 20) * 0.25;
  const left = margin;
  const topY = margin;
  const frontY = topY + top.b.h + gap;
  const placed = [
    { view: top.v, dx: left - top.b.x, dy: topY - top.b.y },
    { view: front.v, dx: left - front.b.x, dy: frontY - front.b.y },
    { view: right.v, dx: left + front.b.w + gap - right.b.x, dy: frontY - right.b.y },
  ];
  return {
    width: left + front.b.w + gap + right.b.w + margin,
    height: frontY + Math.max(front.b.h, right.b.h) + margin + 18,
    placed,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** SVG sheet sized in millimetres, so printing it to PDF at 100 % gives a 1:1 drawing. */
export function sheetSvg(sheet: Sheet, title: string, units = "mm", date = new Date()): string {
  const stroke = Math.max(sheet.width, sheet.height) / 600;
  const groups = sheet.placed.map(
    ({ view, dx, dy }) =>
      `<g transform="translate(${dx.toFixed(3)} ${dy.toFixed(3)})"><g class="hidden">${view.hidden
        .map((d) => `<path d="${esc(d)}"/>`)
        .join(
          "",
        )}</g><g class="visible">${view.visible.map((d) => `<path d="${esc(d)}"/>`).join("")}</g><text x="${0}" y="${0}" class="label">${view.name.toUpperCase()}</text></g>`,
  );
  const tb = `<g class="title"><rect x="${sheet.width - 95}" y="${sheet.height - 20}" width="90" height="16"/><text x="${sheet.width - 92}" y="${sheet.height - 13}">${esc(title)}</text><text x="${sheet.width - 92}" y="${sheet.height - 7}">Scale 1:1 · ${esc(units)} · ${date.toISOString().slice(0, 10)} · ShapeBridge</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width.toFixed(2)}mm" height="${sheet.height.toFixed(2)}mm" viewBox="0 0 ${sheet.width.toFixed(3)} ${sheet.height.toFixed(3)}">
<style>path{fill:none;stroke-linecap:round;stroke-linejoin:round}.visible path{stroke:#000;stroke-width:${(stroke * 1.4).toFixed(3)}}.hidden path{stroke:#777;stroke-width:${stroke.toFixed(3)};stroke-dasharray:${(stroke * 6).toFixed(3)} ${(stroke * 4).toFixed(3)}}.label{display:none}.title rect{fill:none;stroke:#000;stroke-width:${stroke.toFixed(3)}}.title text{font:3px sans-serif}</style>
<rect width="100%" height="100%" fill="#fff"/>
${groups.join("\n")}
${tb}
</svg>
`;
}

/** Turns SVG path data into polylines; arcs and curves become short straight segments. */
export function flatten(d: string, segments = 24): P[][] {
  const toks = d.match(/[MLHVCQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const lines: P[][] = [];
  let cur: P = [0, 0];
  let start: P = [0, 0];
  let line: P[] = [];
  let i = 0;
  const n = () => {
    const v = Number(toks[i++]);
    if (!Number.isFinite(v)) throw new Error(`Bad number in path "${d.slice(0, 40)}"`);
    return v;
  };
  const to = (p: P) => {
    line.push(p);
    cur = p;
  };
  while (i < toks.length) {
    const cmd = toks[i++];
    switch (cmd) {
      case "M":
        if (line.length > 1) lines.push(line);
        cur = start = [n(), n()];
        line = [cur];
        break;
      case "L":
        to([n(), n()]);
        break;
      case "H":
        to([n(), cur[1]]);
        break;
      case "V":
        to([cur[0], n()]);
        break;
      case "C": {
        const [p0, p1, p2, p3]: P[] = [cur, [n(), n()], [n(), n()], [n(), n()]];
        for (let s = 1; s <= segments; s++) {
          const t = s / segments,
            u = 1 - t;
          to([
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
          ]);
        }
        break;
      }
      case "Q": {
        const [p0, p1, p2]: P[] = [cur, [n(), n()], [n(), n()]];
        for (let s = 1; s <= segments; s++) {
          const t = s / segments,
            u = 1 - t;
          to([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
        }
        break;
      }
      case "A": {
        const [rx, ry, rot, large, sweep, x, y] = [n(), n(), n(), n(), n(), n(), n()];
        arc(cur, [x, y], rx, ry, rot, !!large, !!sweep, segments).forEach(to);
        break;
      }
      case "Z":
        to(start);
        break;
      default:
        throw new Error(`Unsupported path command "${cmd}"`);
    }
  }
  if (line.length > 1) lines.push(line);
  return lines;
}

// SVG arc endpoint → centre parameterisation (SVG 1.1 implementation notes, F.6.5)
function arc(p1: P, p2: P, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, segments: number): P[] {
  if (rx === 0 || ry === 0) return [p2];
  const phi = (rotDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p1[0] - p2[0]) / 2,
    dy = (p1[1] - p2[1]) / 2;
  const x1 = cos * dx + sin * dy,
    y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) ((rx *= Math.sqrt(lambda)), (ry *= Math.sqrt(lambda)));
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (k * rx * y1) / ry,
    cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p1[0] + p2[0]) / 2,
    cy = sin * cx1 + cos * cy1 + (p1[1] + p2[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((segments * Math.abs(dt)) / (2 * Math.PI)));
  const out: P[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = t1 + (dt * s) / steps;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  out[out.length - 1] = p2; // land exactly on the endpoint
  return out;
}

/** AutoCAD R12 DXF of the sheet: LINE entities on VISIBLE and HIDDEN layers, y flipped back to point up. */
export function sheetDxf(sheet: Sheet): string {
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const f = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(4);
  for (const { view, dx, dy } of sheet.placed) {
    for (const [layer, color, paths] of [
      ["VISIBLE", 7, view.visible],
      ["HIDDEN", 8, view.hidden],
    ] as const) {
      for (const d of paths)
        for (const line of flatten(d))
          for (let k = 1; k < line.length; k++) {
            const [a, b] = [line[k - 1], line[k]];
            out.push(
              "0",
              "LINE",
              "8",
              layer,
              "62",
              String(color),
              "10",
              f(a[0] + dx),
              "20",
              f(sheet.height - (a[1] + dy)),
              "11",
              f(b[0] + dx),
              "21",
              f(sheet.height - (b[1] + dy)),
            );
          }
    }
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n") + "\n";
}
