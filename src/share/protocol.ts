// Live-review messages. Everything arriving from a peer is untrusted: `parseMsg` rebuilds each
// message field by field with type, size and range checks, and drops anything it doesn't recognise.

export type V3 = [number, number, number];
export interface Cam {
  eye: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  fov: number;
}
export interface Reply {
  author: string;
  text: string;
  at: number;
}
export interface Comment {
  id: string;
  author: string;
  color: string;
  text: string;
  /** scene point the pin sits on; null for markup-only comments */
  point: V3 | null;
  camera: Cam;
  /** freehand markup: strokes of [x, y] in 0..1 viewport coordinates */
  strokes: [number, number][][];
  resolved: boolean;
  replies: Reply[];
  at: number;
}
export interface ViewState {
  camera: Cam | null;
  selection: string[];
  hidden: string[];
  section: { enabled: boolean; axis: "x" | "y" | "z"; offset: number; flip: boolean };
  explode: number;
  display: "shaded" | "edges" | "wireframe" | "xray";
}

export type Msg =
  | { v: 1; type: "hello"; name: string; color: string; host: boolean }
  | ({ v: 1; type: "state" } & ViewState)
  | { v: 1; type: "pointer"; p: V3 | null }
  | { v: 1; type: "comment"; comment: Comment }
  | { v: 1; type: "comments"; comments: Comment[] }
  | { v: 1; type: "perm"; allowDownload: boolean; expiresAt: number | null }
  | { v: 1; type: "kick" };

/** Messages only the host may send; guests ignore them from anyone else. */
export const HOST_ONLY = new Set<Msg["type"]>(["state", "perm", "kick", "comments"]);

const LIMITS = { name: 40, text: 2000, keys: 5000, key: 64, strokes: 60, points: 600, comments: 500, replies: 100 };

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isFinite(x)) throw 0;
  return x;
};
const str = (x: unknown, max: number): string => {
  if (typeof x !== "string") throw 0;
  return x.slice(0, max);
};
const bool = (x: unknown) => x === true;
const arr = (x: unknown, max: number): unknown[] => {
  if (!Array.isArray(x) || x.length > max) throw 0;
  return x;
};
const v3 = (x: unknown): V3 => {
  const a = arr(x, 3);
  if (a.length !== 3) throw 0;
  return [num(a[0]), num(a[1]), num(a[2])];
};
const xyz = (x: unknown) => {
  if (!isObj(x)) throw 0;
  return { x: num(x.x), y: num(x.y), z: num(x.z) };
};
const cam = (x: unknown): Cam => {
  if (!isObj(x)) throw 0;
  const fov = num(x.fov);
  if (fov <= 0 || fov >= 180) throw 0;
  return { eye: xyz(x.eye), center: xyz(x.center), up: xyz(x.up), fov };
};
const color = (x: unknown) => {
  const c = str(x, 7);
  if (!/^#[0-9a-f]{6}$/i.test(c)) throw 0;
  return c;
};
const unit = (x: unknown) => Math.min(Math.max(num(x), 0), 1);
const oneOf = <T extends string>(x: unknown, options: readonly T[]): T => {
  if (!options.includes(x as T)) throw 0;
  return x as T;
};

function comment(x: unknown): Comment {
  if (!isObj(x)) throw 0;
  return {
    id: str(x.id, LIMITS.key),
    author: str(x.author, LIMITS.name),
    color: color(x.color),
    text: str(x.text, LIMITS.text),
    point: x.point === null ? null : v3(x.point),
    camera: cam(x.camera),
    strokes: arr(x.strokes, LIMITS.strokes).map((s) =>
      arr(s, LIMITS.points).map((p) => [unit(arr(p, 2)[0]), unit(arr(p, 2)[1])] as [number, number]),
    ),
    resolved: bool(x.resolved),
    replies: arr(x.replies, LIMITS.replies).map((r) => {
      if (!isObj(r)) throw 0;
      return { author: str(r.author, LIMITS.name), text: str(r.text, LIMITS.text), at: num(r.at) };
    }),
    at: num(x.at),
  };
}

/** Returns a clean message, or null if the input isn't a valid v1 message. */
export function parseMsg(x: unknown): Msg | null {
  try {
    if (!isObj(x) || x.v !== 1) return null;
    switch (x.type) {
      case "hello":
        return { v: 1, type: "hello", name: str(x.name, LIMITS.name) || "Guest", color: color(x.color), host: bool(x.host) };
      case "state": {
        const s = x.section;
        if (!isObj(s)) return null;
        return {
          v: 1,
          type: "state",
          camera: x.camera === null ? null : cam(x.camera),
          selection: arr(x.selection, LIMITS.keys).map((k) => str(k, LIMITS.key)),
          hidden: arr(x.hidden, LIMITS.keys).map((k) => str(k, LIMITS.key)),
          section: { enabled: bool(s.enabled), axis: oneOf(s.axis, ["x", "y", "z"] as const), offset: unit(s.offset), flip: bool(s.flip) },
          explode: Math.min(Math.max(num(x.explode), 0), 2),
          display: oneOf(x.display, ["shaded", "edges", "wireframe", "xray"] as const),
        };
      }
      case "pointer":
        return { v: 1, type: "pointer", p: x.p === null ? null : v3(x.p) };
      case "comment":
        return { v: 1, type: "comment", comment: comment(x.comment) };
      case "comments":
        return { v: 1, type: "comments", comments: arr(x.comments, LIMITS.comments).map(comment) };
      case "perm":
        return { v: 1, type: "perm", allowDownload: bool(x.allowDownload), expiresAt: x.expiresAt === null ? null : num(x.expiresAt) };
      case "kick":
        return { v: 1, type: "kick" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Upserts a comment by id, keeping the newest version (comments carry their own timestamps). */
export function mergeComment(list: Comment[], c: Comment): Comment[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c];
  const latest = (x: Comment) => Math.max(x.at, ...x.replies.map((r) => r.at));
  if (latest(list[i]) > latest(c) && list[i].resolved === c.resolved) return list;
  return list.map((x, j) => (j === i ? c : x));
}

/** A readable review report for sharing after the call. */
export function reviewMarkdown(model: string, comments: Comment[], when = new Date()): string {
  const lines = [
    `# Review: ${model}`,
    "",
    `Exported ${when.toISOString().slice(0, 16).replace("T", " ")} UTC · ${comments.length} comment(s)`,
    "",
  ];
  comments.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.resolved ? "✅ " : ""}${c.author}`, "", c.text || "_(markup only)_");
    if (c.point) lines.push("", `Pinned at (${c.point.map((v) => v.toFixed(1)).join(", ")})`);
    if (c.strokes.length) lines.push("", `Markup: ${c.strokes.length} stroke(s)`);
    for (const r of c.replies) lines.push("", `> **${r.author}:** ${r.text}`);
    lines.push("");
  });
  return lines.join("\n");
}
