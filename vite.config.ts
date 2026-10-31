import { defineConfig, type Plugin } from "vitest/config";
import solid from "vite-plugin-solid";

// One policy for web and desktop (the Tauri config leaves CSP to this meta tag), so it is testable in a browser.
// jsDelivr: OV lazy-loads OCCT/rhino3dm/web-ifc readers from it; wss: live-share signalling relays;
// ipc: + ipc.localhost: Tauri's IPC; blob: workers: OV builds its OCCT worker from a blob.
export const csp = [
  "default-src 'self'",
  // unsafe-eval: occt-import-js (OV's STEP/IGES reader, an Emscripten build) evaluates strings in its worker
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https://cdn.jsdelivr.net wss: ipc: http://ipc.localhost",
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

// BASE is set by the Pages workflow (/shapebridge/); desktop and local builds use relative paths.
export default defineConfig({
  base: process.env.BASE ?? "./",
  plugins: [solid(), cspMeta()],
  worker: { format: "es" },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  preview: { port: 4173 },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { environment: "node" },
});
