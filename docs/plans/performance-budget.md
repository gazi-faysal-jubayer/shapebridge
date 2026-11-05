# Performance budget

| Metric                                      | Budget                              | v0.1 measured                                                      | How to measure                                       |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Installer size (Windows .msi)               | < 20 MB                             | see release artifact                                               | release workflow artifact size                       |
| Initial JS (gzip)                           | < 300 KB (target < 60 KB)           | 65 KB (v0.2; was 264 KB)                                           | `npm run build` output                               |
| 3D engine chunk (lazy, after first paint)   | < 300 KB gz                         | 260 KB                                                             | build output `engine-*.js`                           |
| P2P chunk (lazy)                            | < 40 KB gz                          | 27 KB                                                              | build output `share-*.js`                            |
| OCCT kernel (lazy, designer/converter only) | < 8 MB gz                           | 7.3 MB                                                             | build output `replicad_single-*.wasm`                |
| Offline readers (lazy, per format)          | < 7 MB gz total                     | ~6.5 MB (OCCT importer 3.2, rhino3dm 1.0, web-ifc 0.9+, draco 0.1) | `dist/libs/`                                         |
| Cold start to empty viewport                | < 1 s                               | not yet measured                                                   | Tauri `--verbose` timestamps                         |
| Open a 1M-triangle STL                      | < 2 s, no main-thread task > 200 ms | see _Large meshes_ below                                           | `node scripts/make-big-mesh.mjs`, then drop the file |
| Parameter edit to new geometry (sample)     | < 500 ms warm                       | not yet measured                                                   | `performance.now()` around `build()`                 |
| Idle RAM (desktop, no model)                | < 150 MB                            | not yet measured                                                   | OS task manager                                      |

## Large meshes (#14)

Measured 2026-11-01 on an Intel i5-10500 with 26 GB RAM, in Chromium (the desktop app's WebView2 engine). The test meshes are tori from `node scripts/make-big-mesh.mjs <triangles> public/_perf/<name>.stl`; `public/_perf/` is git-ignored.

| File                           | Before (OV model on the main thread)                                                            | After (lean path)                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1M triangles, 50 MB binary STL | opens in 7.4 s; the main thread is blocked the whole time (longest task 3.8 s); +1.4 GB JS heap | parse in the worker: 0.12 s; no main-thread task ≥ 50 ms; +0.17 GB heap                   |
| 2.5M triangles, 125 MB         | not measured (between the other two)                                                            | parse 0.29 s                                                                              |
| 5M triangles, 250 MB           | **the tab runs out of memory and crashes**                                                      | opens; parse 0.59 s; no main-thread task ≥ 50 ms; +1.06 GB heap including the 250 MB file |

How it works:

- STL files over 20 MB skip OV's model, which allocates one JS object per vertex and per triangle. That allocation, not the parsing, was the cost.
- `src/viewer/import.worker.ts` parses the file into transferable `Float32Array`s, and computes exact size, area and volume in the same pass (`src/viewer/stl.ts`, unit-tested).
- The engine shows the arrays as one `BufferGeometry` part with OV's mesh `userData`, so picking, hide, highlight, fit, section with caps and display modes still work.
- The picking BVH is built in three-mesh-bvh's own worker. Picking waits for it; rendering doesn't.
- On a lean mesh, the "shaded with edges" outline is skipped, and mesh export is STL only.

Parse times come from Node (the same `parseStl` code the worker runs). Main-thread long tasks and heap growth were measured in the app with a `PerformanceObserver` while dropping the file. Wall-clock open time in the background test tab was distorted by Chrome's timer throttling, so it isn't reported. The REA static analysis of `dist/` (engine and OV chunks) confirmed that `ThreeModelLoader` runs all non-OCCT importers on the main thread.

Next: the same lean path for very large OBJ and PLY files.

## Large STEP assemblies on the desktop

Measured 2026-11-01 in the **installed Windows app** on the same i5-10500 (12 threads), with `npm run check:desktop -- --from installed --bench <file>`.

- The test assemblies come from `node scripts/make-big-assembly.mjs <plates> <out>`: drilled plates with four bolts each.
- _Open_ is from app start to "Opened".
- _Peak memory_ is the sum of the peak working sets of `shapebridge.exe` and its WebView2 processes.

| Assembly             | Reader                 | Open       | Longest main-thread task | Orbit  | Peak memory |
| -------------------- | ---------------------- | ---------- | ------------------------ | ------ | ----------- |
| 1,000 parts, 18.5 MB | built-in (WebAssembly) | 16.3 s     | 0.98 s                   | — ¹    | 1.16 GB     |
| 1,000 parts, 18.5 MB | **native OpenCascade** | **9.0 s**  | 0.95 s                   | 60 fps | 1.18 GB     |
| 2,500 parts, 46.8 MB | built-in (WebAssembly) | 45.0 s     | 2.79 s                   | — ¹    | 2.22 GB     |
| 2,500 parts, 46.8 MB | **native OpenCascade** | **23.4 s** | 2.58 s                   | 45 fps | 2.18 GB     |

¹ Not comparable: before this change, the camera's far plane stayed at 1 m, so most of these assemblies was never drawn (see below).

**What changed:**

- **Native reader.** On the desktop, STEP, IGES and BREP go through `shapebridge-occt` (`native/occt-import/`), a separate OpenCascade 7.8 program.
  - It meshes parts in parallel and writes glTF that keeps the tree, names and colours.
  - On the 2,500-part file it spends 3.8 s parsing, 8.8 s transferring, 2.1 s meshing and 0.4 s writing. WebAssembly needs 42.5 s for the same work.
  - The remaining time is OV's glTF import on the main thread.
- **Far plane.** OV's low-level `Viewer` sizes the camera's clip planes only when the projection changes. Every model kept a 1 m far plane, so assemblies bigger than about a metre were cut off. The engine now fits the planes to each model.
  - `e2e/viewer.spec.ts` checks this with a 3 m beam.
  - The desktop check's bench also fails a model that loads but doesn't draw.

**Next:**

- Split the XCAF transfer (8.8 s, single-threaded) across processes.
- Show the glTF without OV's per-vertex model (the 2.6 s task and most of the memory), as #296 did for STL.

## Rules

- Any new runtime dependency states its gzip size in the PR. Anything over 30 KB must be lazy-loaded.
- Heavy WASM loads only behind `import()` or worker creation.
- No polyfills for browsers older than the Tauri webviews (WebView2, WKWebView, WebKitGTK 4.1).

## Known costs and plans

- The OV engine pulls in all its importers (~700 KB raw). Plan: build OV from source with only the importers we need (M1).
- The OCCT build includes modelling features we don't use yet. Plan: a custom opencascade.js build with STEP, IGES, BRep and only the modelling we need (M2). Target: 4 MB gz.
