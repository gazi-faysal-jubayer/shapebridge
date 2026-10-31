// Builds the Node CLI (`shapebridge convert …`) from the same sources as the app.
import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node20",
    outDir: "dist-cli",
    emptyOutDir: true,
    ssr: "src/cli.ts",
    rollupOptions: {
      // the kernel and its WASM are resolved from node_modules at run time
      external: [...builtinModules, /^node:/, "replicad", "replicad-opencascadejs"],
      output: { entryFileNames: "shapebridge.mjs", banner: "#!/usr/bin/env node" },
    },
  },
});
