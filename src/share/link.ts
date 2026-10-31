// Kept apart from share.ts so the P2P stack only loads when someone shares or joins.
export const WEB_VIEWER = "https://gazi-faysal-jubayer.github.io/shapebridge/";

export function parseShareHash(hash: string): { room: string; key: string } | null {
  const m = /^#s=([0-9a-f]{16})\.([0-9a-f]{32})$/.exec(hash);
  return m ? { room: m[1], key: m[2] } : null;
}
