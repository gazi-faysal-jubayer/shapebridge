# Performance budget

| Metric | Budget | v0.1 measured | How to measure |
|---|---|---|---|
| Installer size (Windows .msi) | < 20 MB | see release artifact | release workflow artifact size |
| Initial JS (gzip) | < 300 KB | 264 KB | `npm run build` output |
| P2P chunk (lazy) | < 40 KB gz | 27 KB | build output `share-*.js` |
| OCCT kernel (lazy, designer only) | < 8 MB gz | 7.3 MB | build output `replicad_single-*.wasm` |
| Cold start to empty viewport | < 1 s | not yet measured | Tauri `--verbose` timestamps |
| Open a 1M-triangle STL | < 2 s | not yet measured | Playwright perf trace (M1) |
| Parameter edit to new geometry (sample) | < 500 ms warm | not yet measured | `performance.now()` around `build()` |
| Idle RAM (desktop, no model) | < 150 MB | not yet measured | OS task manager |

## Rules

- Any new runtime dependency states its gzip size in the PR. Anything over 30 KB must be lazy-loaded.
- Heavy WASM loads only behind `import()` or worker creation.
- No polyfills for browsers older than the Tauri webviews (WebView2, WKWebView, WebKitGTK 4.1).

## Known costs and plans

- The OV engine pulls in all its importers (~700 KB raw). Plan: build OV from source with only the importers we need (M1).
- The OCCT build includes modelling features we don't use yet. Plan: a custom opencascade.js build with STEP, IGES, BRep and only the modelling we need (M2). Target: 4 MB gz.
