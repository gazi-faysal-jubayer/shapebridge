import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// BASE is set by the Pages workflow (/shapebridge/); desktop and local builds use relative paths.
export default defineConfig({
  base: process.env.BASE ?? "./",
  plugins: [solid()],
  worker: { format: "es" },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { environment: "node" },
});
