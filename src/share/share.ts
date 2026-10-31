// Peer-to-peer live sharing: the file goes straight from the host's machine to each viewer's
// browser over WebRTC (DTLS-encrypted). Signalling uses public Nostr relays via Trystero and is
// itself encrypted with the room password, which only ever travels in the link's #fragment.
import { joinRoom, type Room, type JsonValue } from "trystero";
import { WEB_VIEWER } from "./link";

const APP_ID = "shapebridge-v1";
const MAX_BYTES = 512 * 1024 * 1024;

export interface SharedFile {
  name: string;
  data: ArrayBuffer;
}
type Cam = { eye: Xyz; center: Xyz; up: Xyz; fov: number };
type Xyz = { x: number; y: number; z: number };

const randomId = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

export interface HostSession {
  link: string;
  setFiles: (files: SharedFile[]) => void;
  sendCamera: (cam: object) => void;
  onPeers: (cb: (count: number) => void) => void;
  stop: () => Promise<void>;
}

export function host(files: SharedFile[]): HostSession {
  const roomId = randomId(8);
  const key = randomId(16);
  const room = joinRoom({ appId: APP_ID, password: key }, roomId);
  const { fileAction, camAction } = actions(room);
  let current = files;
  let peers = 0;
  let peersCb: (n: number) => void = () => {};
  const sendTo = (target?: string) =>
    current.forEach((f) => fileAction.send(f.data, { target, metadata: { name: f.name, total: current.length } }));
  room.onPeerJoin = (id) => {
    peersCb(++peers);
    sendTo(id);
  };
  room.onPeerLeave = () => peersCb(--peers);
  return {
    link: `${WEB_VIEWER}#s=${roomId}.${key}`,
    setFiles: (f) => {
      current = f;
      sendTo();
    },
    sendCamera: (cam) => void camAction.send(JSON.parse(JSON.stringify(cam)) as JsonValue),
    onPeers: (cb) => (peersCb = cb),
    stop: () => room.leave(),
  };
}

export function join(
  room_: { room: string; key: string },
  on: { files: (f: SharedFile[]) => void; camera: (c: Cam) => void; progress: (p: number) => void; host: (connected: boolean) => void },
) {
  const room = joinRoom({ appId: APP_ID, password: room_.key, maxReceiveBytes: MAX_BYTES }, room_.room);
  const { fileAction, camAction } = actions(room);
  let batch: SharedFile[] = [];
  fileAction.onReceiveProgress = (p) => on.progress(p);
  fileAction.onMessage = (data, ctx) => {
    const meta = ctx.metadata as { name?: unknown; total?: unknown } | undefined;
    // trust boundary: names come from a peer; keep only a safe basename
    const name = String(meta?.name ?? "model").replace(/[^\w.\- ]/g, "_").slice(0, 120);
    const total = Math.min(Math.max(Number(meta?.total) || 1, 1), 64);
    batch.push({ name, data: data as ArrayBuffer });
    if (batch.length >= total) {
      on.files(batch);
      batch = [];
    }
  };
  camAction.onMessage = (c) => on.camera(c as unknown as Cam);
  room.onPeerJoin = () => on.host(true);
  room.onPeerLeave = () => on.host(false);
  return { leave: () => room.leave() };
}

function actions(room: Room) {
  return {
    fileAction: room.makeAction<ArrayBuffer>("file"),
    camAction: room.makeAction<JsonValue>("cam"),
  };
}
