// Peer-to-peer live review: files go straight from the host's machine to each viewer's browser over
// WebRTC (DTLS-encrypted). Signalling uses public Nostr relays via Trystero and is itself encrypted with
// the room password, which only ever travels in the link's #fragment.
import { joinRoom, selfId, type JsonValue } from "trystero";
import { WEB_VIEWER } from "./link";
import { parseMsg, type Msg } from "./protocol";

const APP_ID = "shapebridge-v1";
const MAX_BYTES = 512 * 1024 * 1024;

export interface SharedFile {
  name: string;
  data: ArrayBuffer;
}
export interface Turn {
  urls: string;
  username?: string;
  credential?: string;
}

export interface Session {
  link: string;
  selfId: string;
  send: (msg: Msg, target?: string) => void;
  sendFiles: (files: SharedFile[], target?: string) => void;
  leave: () => Promise<void>;
}

export interface Handlers {
  message: (msg: Msg, peer: string) => void;
  files: (files: SharedFile[], peer: string) => void;
  progress: (p: number, peer: string) => void;
  join: (peer: string) => void;
  leave: (peer: string) => void;
}

const randomId = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Starts a new room (host) or joins one from a link (guest). */
export function connect(link: { room: string; key: string } | null, on: Handlers, turn?: Turn): Session {
  const room_ = link ?? { room: randomId(8), key: randomId(16) };
  const room = joinRoom(
    { appId: APP_ID, password: room_.key, maxReceiveBytes: MAX_BYTES, ...(turn?.urls ? { turnConfig: [turn] } : {}) },
    room_.room,
  );
  const fileAction = room.makeAction<ArrayBuffer>("file");
  const msgAction = room.makeAction<JsonValue>("msg");

  const batches = new Map<string, SharedFile[]>();
  fileAction.onReceiveProgress = (p, ctx) => on.progress(p, ctx.peerId);
  fileAction.onMessage = (data, ctx) => {
    const meta = ctx.metadata as { name?: unknown; total?: unknown } | undefined;
    // trust boundary: names come from a peer; keep only a safe basename
    const name = String(meta?.name ?? "model")
      .replace(/[^\w.\- ]/g, "_")
      .slice(0, 120);
    const total = Math.min(Math.max(Number(meta?.total) || 1, 1), 64);
    const batch = [...(batches.get(ctx.peerId) ?? []), { name, data: data as ArrayBuffer }];
    if (batch.length >= total) {
      batches.delete(ctx.peerId);
      on.files(batch, ctx.peerId);
    } else batches.set(ctx.peerId, batch);
  };
  msgAction.onMessage = (raw, ctx) => {
    const msg = parseMsg(raw);
    if (msg) on.message(msg, ctx.peerId);
  };
  room.onPeerJoin = on.join;
  room.onPeerLeave = (id) => {
    batches.delete(id);
    on.leave(id);
  };

  return {
    link: `${WEB_VIEWER}#s=${room_.room}.${room_.key}`,
    selfId,
    send: (msg, target) => void msgAction.send(msg as unknown as JsonValue, target ? { target } : undefined),
    sendFiles: (files, target) =>
      files.forEach((f) => fileAction.send(f.data, { target, metadata: { name: f.name, total: files.length } })),
    leave: () => room.leave(),
  };
}
