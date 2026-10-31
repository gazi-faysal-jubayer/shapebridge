import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";
import solid from "vite-plugin-solid";

// One policy for web and desktop (the Tauri config leaves CSP to this meta tag), so it is testable in a browser.
// wss: live-share signalling relays; ipc: + ipc.localhost: Tauri's IPC; blob: workers: OV builds its OCCT worker from a blob.
export const csp = [
  "default-src 'self'",
  // unsafe-eval: occt-import-js (OV's STEP/IGES reader, an Emscripten build) evaluates strings in its worker
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' wss: ipc: http://ipc.localhost",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

// dev keeps no CSP: Vite's HMR client needs inline scripts and its own websocket
const cspMeta = (): Plugin => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: csp }, injectTo: "head-prepend" }],
});

/**
 * The Online 3D Viewer engine fetches its heavy readers (OCCT for STEP/IGES/BREP, rhino3dm, web-ifc, draco)
 * from jsDelivr at run time. We ship the same pinned files under `libs/` instead, so the desktop app works
 * offline and nothing about the user's files reaches a CDN. Paths mirror jsDelivr's, so only the prefix changes.
 */
export const LIBS: Record<string, string> = {
  "occt-import-js@0.0.22/dist/occt-import-js.js": "occt-import-js/dist/occt-import-js.js",
  "occt-import-js@0.0.22/dist/occt-import-js.wasm": "occt-import-js/dist/occt-import-js.wasm",
  "occt-import-js@0.0.22/dist/occt-import-js-worker.js": "occt-import-js/dist/occt-import-js-worker.js",
  "rhino3dm@8.17.0/rhino3dm.min.js": "rhino3dm/rhino3dm.min.js",
  "rhino3dm@8.17.0/rhino3dm.wasm": "rhino3dm/rhino3dm.wasm",
  "web-ifc@0.0.68/web-ifc-api-iife.js": "web-ifc/web-ifc-api-iife.js",
  "web-ifc@0.0.68/web-ifc.wasm": "web-ifc/web-ifc.wasm",
  "web-ifc@0.0.68/web-ifc-mt.wasm": "web-ifc/web-ifc-mt.wasm",
  // jsDelivr minifies on the fly; the npm package only has the unminified file
  "draco3d@1.5.7/draco_decoder_nodejs.min.js": "draco3d/draco_decoder_nodejs.js",
  "draco3d@1.5.7/draco_decoder.wasm": "draco3d/draco_decoder.wasm",
};
const CDN = "https://cdn.jsdelivr.net/npm/";

const localReaders = (): Plugin => ({
  name: "local-readers",
  transform(code, id) {
    if (!id.includes("online-3d-viewer") || !code.includes(CDN)) return;
    // SB_LIB_BASE is set in main.tsx to an absolute URL (OV's OCCT worker runs from a blob: and can't resolve relative ones)
    return { code: code.replaceAll(`'${CDN}`, "globalThis.SB_LIB_BASE + '"), map: null };
  },
  configureServer(server) {
    server.middlewares.use("/libs/", (req, res, next) => {
      const src = LIBS[decodeURIComponent((req.url ?? "").split("?")[0].replace(/^\//, ""))];
      if (!src) return next();
      res.setHeader("Content-Type", src.endsWith(".wasm") ? "application/wasm" : "text/javascript");
      res.end(readFileSync(`node_modules/${src}`));
    });
  },
  generateBundle() {
    for (const [path, src] of Object.entries(LIBS))
      this.emitFile({ type: "asset", fileName: `libs/${path}`, source: readFileSync(`node_modules/${src}`) });
  },
});

// BASE is set by the Pages workflow (/shapebridge/); desktop and local builds use relative paths.
export default defineConfig({
  base: process.env.BASE ?? "./",
  plugins: [solid(), cspMeta(), localReaders()],
  worker: { format: "es" },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  preview: { port: 4173 },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { environment: "node" },
  // OV must go through the transform above rather than Vite's pre-bundling cache
  optimizeDeps: { exclude: ["online-3d-viewer"] },
});
