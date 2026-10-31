// "Share without a call": one self-contained .html file (Online 3D Viewer's standalone build + the model)
// that opens in any browser, offline, from email or a shared drive. ~1 MB plus the model.
// OBJ + MTL rather than GLB: glTF's PBR materials need an environment map to look right; OBJ shades like the app.
import ovUrl from "online-3d-viewer/build/engine/o3dv.min.js?url";

/** Escapes `</script` so embedded text can never close the script element early. */
const scriptSafe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
const htmlSafe = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const b64 = (data: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
};
// file names come from the exporter; keep them to safe characters before they land in script text
const safeName = (n: string) => n.replace(/[^\w.-]/g, "_").slice(0, 80);

export function viewerHtml(ovSource: string, title: string, files: { name: string; data: Uint8Array }[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlSafe(title)} · ShapeBridge viewer</title>
<style>
  html, body { margin: 0; height: 100%; font: 13px system-ui, sans-serif; background: #eef2f6; color: #0f172a; }
  #v { position: absolute; inset: 0; }
  header { position: absolute; left: 12px; top: 10px; z-index: 1; background: #fffc; padding: 6px 10px; border-radius: 8px; }
  @media (prefers-color-scheme: dark) { html, body { background: #0a0f1a; color: #e5e7eb; } header { background: #111827cc; } }
</style>
</head>
<body>
<header><b>${htmlSafe(title)}</b> · drag to orbit, right-drag to pan, scroll to zoom · made with ShapeBridge</header>
<div id="v"></div>
<script>${scriptSafe(ovSource)}</script>
<script>
  const files = [${files.map((f) => `["${safeName(f.name)}", "${b64(f.data)}"]`).join(", ")}].map(
    ([name, data]) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name)
  );
  const viewer = new OV.EmbeddedViewer(document.getElementById("v"), {
    backgroundColor: new OV.RGBAColor(0, 0, 0, 0),
    edgeSettings: new OV.EdgeSettings(true, new OV.RGBColor(30, 41, 59), 25),
  });
  viewer.LoadModelFromFileList(files);
</script>
</body>
</html>
`;
}

export async function buildViewerHtml(title: string, files: { name: string; data: Uint8Array }[]): Promise<string> {
  const res = await fetch(ovUrl);
  if (!res.ok) throw new Error("Could not load the offline viewer template");
  return viewerHtml(await res.text(), title, files);
}
