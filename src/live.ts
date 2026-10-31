// Live review: hosting and joining a peer-to-peer session, presence, follow-the-presenter sync,
// laser pointers, comment pins and markups. The transport (Trystero) loads only when used.
import { createEffect, createRoot, on, onCleanup } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import { setState, state } from "./state/store";
import { HOST_ONLY, mergeComment, reviewMarkdown, type Cam, type Comment, type Msg, type V3, type ViewState } from "./share/protocol";
import type { Session, SharedFile } from "./share/share";
import * as c from "./controller";
import { saveFile } from "./platform/save";

export interface Peer {
  id: string;
  name: string;
  color: string;
}

export const [live, setLive] = createStore({
  role: "none" as "none" | "host" | "guest",
  link: "",
  hostId: "",
  hostConnected: false,
  peers: [] as Peer[],
  comments: [] as Comment[],
  pointers: {} as Record<string, { p: V3; color: string; name: string }>,
  follow: true,
  allowDownload: false,
  expiresAt: null as number | null,
  /** comment whose camera and markup are being shown */
  active: null as string | null,
  /** comment being written: a pin point and/or markup strokes */
  draft: null as { point: V3 | null; strokes: [number, number][][] } | null,
  laser: false,
  ended: "",
});

let session: Session | null = null;
let dispose: (() => void) | null = null;
let expiryTimer: number | undefined;
const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];

const me = () => ({
  name: state.settings.reviewName.trim() || (live.role === "host" ? "Presenter" : "Viewer"),
  color: session ? colorFor(session.selfId) : COLORS[0],
});

const viewState = (): ViewState => ({
  camera: (c.getEngine()?.getCamera() as Cam | undefined) ?? null,
  selection: [...state.selection],
  hidden: [...state.hidden],
  section: { ...state.section },
  explode: state.explode,
  display: state.settings.display,
});

const filesOf = (list: File[]) => Promise.all(list.map(async (f): Promise<SharedFile> => ({ name: f.name, data: await f.arrayBuffer() })));

async function open(link: { room: string; key: string } | null) {
  const { connect } = await import("./share/share");
  const turn = state.settings.turn;
  session = connect(
    link,
    {
      message: onMessage,
      files: (files, peer) => {
        if (live.role === "guest" && peer === live.hostId) c.show(files.map((f) => new File([f.data], f.name)));
      },
      progress: (p) => live.role === "guest" && setState("status", `Receiving model… ${Math.round(p * 100)}%`),
      join: onJoin,
      leave: (peer) => {
        setLive(
          produce((l) => {
            l.peers = l.peers.filter((p) => p.id !== peer);
            delete l.pointers[peer];
            if (peer === l.hostId) l.hostConnected = false;
          }),
        );
        if (live.role === "guest" && peer === live.hostId) setState("status", "Presenter disconnected. The last model stays on screen.");
      },
    },
    turn.urls ? { urls: turn.urls, username: turn.username || undefined, credential: turn.credential || undefined } : undefined,
  );
  setLive({ link: session.link, ended: "" });
  dispose = createRoot((d) => {
    syncEffects();
    return d;
  });
}

export async function startShare() {
  if (!state.files.length || session) return;
  setLive({ role: "host", peers: [], pointers: {}, hostId: "" });
  await open(null);
}

export async function joinShare(link: { room: string; key: string }) {
  setLive({ role: "guest" });
  setState("status", "Connecting to the presenter… (peer-to-peer, nothing is uploaded to a server)");
  await open(link);
}

export async function stopShare(reason = "") {
  clearTimeout(expiryTimer);
  dispose?.();
  dispose = null;
  await session?.leave();
  session = null;
  setLive({
    role: "none",
    link: "",
    peers: [],
    pointers: {},
    hostId: "",
    hostConnected: false,
    expiresAt: null,
    ended: reason,
    laser: false,
  });
}

/** A fresh link: everyone with the old one is out (the reliable way to revoke access). */
export async function newLink() {
  await stopShare();
  await startShare();
}

function onJoin(peer: string) {
  if (!session) return;
  session.send({ v: 1, type: "hello", ...me(), host: live.role === "host" }, peer);
  if (live.role !== "host") return;
  filesOf(state.files).then((f) => session?.sendFiles(f, peer));
  session.send({ v: 1, type: "state", ...viewState() }, peer);
  session.send({ v: 1, type: "perm", allowDownload: live.allowDownload, expiresAt: live.expiresAt }, peer);
  session.send({ v: 1, type: "comments", comments: unwrap(live.comments) }, peer);
}

function onMessage(msg: Msg, peer: string) {
  // guests take session control only from the peer that introduced itself as host; hosts never do
  if (HOST_ONLY.has(msg.type) && (live.role === "host" || peer !== live.hostId)) return;
  switch (msg.type) {
    case "hello":
      setLive(
        produce((l) => {
          l.peers = [...l.peers.filter((p) => p.id !== peer), { id: peer, name: msg.name, color: msg.color }];
          // first host wins: a second peer can't take over by claiming to be host
          if (msg.host && l.role === "guest" && (!l.hostId || l.hostId === peer)) {
            l.hostId = peer;
            l.hostConnected = true;
          }
        }),
      );
      if (msg.host && live.hostId === peer) setState("status", `Connected to ${msg.name}`);
      return;
    case "state":
      if (live.follow) applyState(msg);
      return;
    case "pointer":
      setLive(
        produce((l) => {
          const who = l.peers.find((p) => p.id === peer);
          if (msg.p && who) l.pointers[peer] = { p: msg.p, color: who.color, name: who.name };
          else delete l.pointers[peer];
        }),
      );
      return;
    case "comment":
      setLive("comments", (list) => mergeComment(list, msg.comment));
      return;
    case "comments":
      setLive("comments", (list) => msg.comments.reduce(mergeComment, list));
      return;
    case "perm":
      setLive({ allowDownload: msg.allowDownload, expiresAt: msg.expiresAt });
      return;
    case "kick":
      stopShare("The presenter ended your access to this review.");
      return;
  }
}

function applyState(s: ViewState) {
  setState({ selection: s.selection, hidden: s.hidden, section: s.section, explode: s.explode });
  setState("settings", "display", s.display);
  if (s.camera) c.getEngine()?.setCamera(s.camera);
}

/** Effects that run while a session is open: host broadcasts its view; everyone can point. */
function syncEffects() {
  let last = 0;
  let pending: number | undefined;
  const broadcast = () => {
    if (live.role !== "host" || !session) return;
    // at most ~10 updates a second; the final position always goes out
    clearTimeout(pending);
    const wait = Math.max(0, 100 - (performance.now() - last));
    pending = window.setTimeout(() => {
      last = performance.now();
      session?.send({ v: 1, type: "state", ...viewState() });
    }, wait);
  };
  const stopCam = c.onCamera(broadcast);
  createEffect(
    on(
      [
        () => [...state.selection],
        () => [...state.hidden],
        () => ({ ...state.section }),
        () => state.explode,
        () => state.settings.display,
      ],
      broadcast,
    ),
  );
  const stopFiles = c.onFiles((list) => live.role === "host" && filesOf(list).then((f) => session?.sendFiles(f)));

  // a name typed after joining reaches everyone
  createEffect(on(() => state.settings.reviewName, () => session?.send({ v: 1, type: "hello", ...me(), host: live.role === "host" }), { defer: true }));

  let lastPointer = 0;
  createEffect(
    on([() => live.laser, () => state.hoverScene], ([laser, p]) => {
      if (!session) return;
      if (!laser) return session.send({ v: 1, type: "pointer", p: null });
      if (p && performance.now() - lastPointer > 50) {
        lastPointer = performance.now();
        session.send({ v: 1, type: "pointer", p: [...p] as V3 });
      }
    }),
  );
  const keys = (down: boolean) => (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey && !(t && ["INPUT", "TEXTAREA"].includes(t.tagName)))
      setLive("laser", down);
  };
  const kd = keys(true);
  const ku = keys(false);
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  onCleanup(() => {
    stopCam();
    stopFiles();
    clearTimeout(pending);
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
  });
}

// ---------- host controls ----------

export function setAllowDownload(allow: boolean) {
  setLive("allowDownload", allow);
  session?.send({ v: 1, type: "perm", allowDownload: allow, expiresAt: live.expiresAt });
}

export function setExpiry(hours: number | null) {
  clearTimeout(expiryTimer);
  const at = hours ? Date.now() + hours * 3_600_000 : null;
  setLive("expiresAt", at);
  session?.send({ v: 1, type: "perm", allowDownload: live.allowDownload, expiresAt: at });
  if (hours) expiryTimer = window.setTimeout(() => stopShare("The review session expired."), hours * 3_600_000);
}

export function kick(peer: string) {
  session?.send({ v: 1, type: "kick" }, peer);
  setLive("peers", (p) => p.filter((x) => x.id !== peer));
}

export function setFollow(on: boolean) {
  setLive("follow", on);
}

// ---------- comments & markups ----------

c.onPlace((point) => setLive("draft", { point, strokes: live.draft?.strokes ?? [] }));

export function startMarkup() {
  setLive("draft", { point: live.draft?.point ?? null, strokes: [] });
  setState("tool", "markup");
}

export function addStroke(stroke: [number, number][]) {
  if (stroke.length > 1) setLive("draft", (d) => ({ point: d?.point ?? null, strokes: [...(d?.strokes ?? []), stroke] }));
}

export function cancelDraft() {
  setLive("draft", null);
  if (state.tool === "markup" || state.tool === "comment") setState("tool", "select");
}

export function submitDraft(text: string) {
  const d = live.draft;
  const cam = c.getEngine()?.getCamera() as Cam | undefined;
  if (!d || !cam || (!text.trim() && !d.strokes.length)) return;
  const who = me();
  const comment: Comment = {
    id: `${session?.selfId ?? "local"}-${Date.now().toString(36)}`,
    author: who.name,
    color: who.color,
    text: text.trim().slice(0, 2000),
    point: d.point,
    camera: cam,
    strokes: d.strokes,
    resolved: false,
    replies: [],
    at: Date.now(),
  };
  upsert(comment);
  setLive("draft", null);
  setState("tool", "select");
}

function upsert(comment: Comment) {
  setLive("comments", (list) => mergeComment(list, comment));
  session?.send({ v: 1, type: "comment", comment });
}

export function reply(id: string, text: string) {
  const found = live.comments.find((x) => x.id === id);
  if (!found || !text.trim()) return;
  upsert({
    ...structuredClone(unwrap(found)),
    replies: [...found.replies, { author: me().name, text: text.trim().slice(0, 2000), at: Date.now() }],
  });
}

export function toggleResolved(id: string) {
  const found = live.comments.find((x) => x.id === id);
  if (found) upsert({ ...structuredClone(unwrap(found)), resolved: !found.resolved, at: Date.now() });
}

export function focusComment(id: string | null) {
  setLive("active", live.active === id ? null : id);
  const found = live.comments.find((x) => x.id === id);
  if (found && live.active) c.getEngine()?.setCamera(found.camera);
}

export async function exportReview() {
  const name = state.modelName || "model";
  await saveFile(`${name.replace(/\.[^.]+$/, "")}-review.md`, reviewMarkdown(name, unwrap(live.comments)));
}

export async function exportViewerHtml() {
  const engine = c.getEngine();
  if (!engine || !state.files.length) return;
  const files = await engine.export("obj");
  const { buildViewerHtml } = await import("./share/offline");
  const title = state.modelName || "model";
  await saveFile(`${title.replace(/\.[^.]+$/, "")}-viewer.html`, await buildViewerHtml(title, files));
  setState("status", "Saved a self-contained viewer: send it by email or drive, it opens in any browser.");
}
