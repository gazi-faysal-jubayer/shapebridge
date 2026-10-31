---
name: add-format
description: Add or improve import/export support for a CAD or 3D file format in ShapeBridge (viewer readers, mesh/B-rep exporters, DXF/DWG, bridges to native CAD apps). Use when asked to support, open, read, export or convert a file extension.
---

# Add a file format

1. **Decide the tier.** Read `docs/FORMATS.md`:
   - Tier 1/2 open formats: reader or writer in the web stack.
   - Tier 3 (2D): DXF/SVG/PDF projection, or the DWG opt-in plugin.
   - Tier 4 proprietary formats: **bridge only** (`bridges/README.md`). Never decompile vendor software or use leaked SDKs (`docs/plans/native-formats-research.md`).
2. **Check licence and size.** The library must be Apache/MIT/BSD/ISC/MPL, or LGPL loaded as a separate module. GPL is never allowed in core. Note its gzip size. Anything over 30 KB must load through `import()` or a worker (`docs/plans/performance-budget.md`).
3. **Implement.**
   - The engine already reads it: add the extension to `accept` in `src/App.tsx` and to `fileAssociations` in `src-tauri/tauri.conf.json`.
   - New mesh export: add an entry to `meshExports` in `src/viewer/engine.ts` and `meshFormats` in `src/ui/TopBar.tsx` if the OV engine supports it. Otherwise write `src/io/<format>.ts` with a pure `(model) => Uint8Array` function.
   - Exact B-rep export: extend the kernel worker (`src/kernel/occt.worker.ts`) and add to `KernelResponse` in `src/kernel/protocol.ts`.
4. **Sample + test.** Generate a tiny sample yourself (extend `scripts/make-samples.mjs`), keep it under 200 KB, list it in `public/samples/README.md`, and add a test that parses it or round-trips it.
5. **Docs.** Update the row in `docs/FORMATS.md` and add a line to `CHANGELOG.md` under `[Unreleased]`.
6. **Verify.** Run `npm run typecheck && npx vitest run && npm run build`. Then open the sample in `npm run dev` and export it.

PR label: `format` plus the area (`viewer` or `converter`).
