# ADR-0001: Keep Online 3D Viewer for import; own the interaction layers

**Status:** Accepted
**Date:** 2026-10-31
**Deciders:** maintainers

## Context

v0.1 wrapped Online 3D Viewer's (OV) `EmbeddedViewer`. A professional viewer needs a model tree, selection, measuring, section planes, an exploded view, display modes, a view cube and saved views. Later it also needs live-review sync of all of those. `EmbeddedViewer` hides the events, camera lifecycle and scene those features need. The app must also stay light: initial JS under 300 KB gzipped.

## Decision

Build our own `Engine` (`src/viewer/engine.ts`) on OV's low-level `Viewer` + `ThreeModelLoader`. OV keeps doing what it is good at: ~20 importers, exporters, rendering and navigation. We own selection, measure, section, explode, display modes and overlays on its public scene, renderer and camera.

App state lives in one Solid store (`src/state/store.ts`). UI, viewer effects and (later) live share all read and write it. Every user action is defined once in `src/ui/actions.ts`, and the menus, command palette and keyboard shortcuts are generated from that list.

The engine is a lazy chunk loaded after the shell paints.

## Options considered

| Option                                                  | Complexity               | Cost                                        | Verdict    |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------- | ---------- |
| A. Bolt features onto `EmbeddedViewer`                  | Low at first, high later | Every feature fights hidden internals       | Rejected   |
| **B. Own engine on OV `Viewer` + `ThreeModelLoader`**   | Medium                   | ~400 lines of our own; keeps every importer | **Chosen** |
| C. Drop OV, write our own three.js viewer and importers | High                     | Months to re-implement ~20 formats          | Rejected   |

## Consequences

- **Easier:**
  - Every viewer feature is a small layer, tested through pure helpers (`math.ts`, `tree.ts`).
  - Live review can sync store state, not pixels.
- **Easier:** initial JS fell from 264 KB to ~65 KB gzipped. The engine (~260 KB) loads in the background.
- **Harder:** we depend on OV internals that aren't part of its documented API (`viewer.mainModel.EnumerateMeshes/EnumerateEdges`). We pin OV's version and cover these paths with browser checks.
- **Revisit:**
  - Stencil-capped sections need a renderer with a stencil buffer, which OV's `Viewer.Init` doesn't request. The engine creates the WebGL context with `stencil: true` before calling `Init`, so three reuses it (#69). Assemblies of more than 300 parts fall back to double-sided inner faces.
  - The OCCT reader loaded from the CDN requires `'unsafe-eval'` in the CSP. Vendoring a build that doesn't need it is part of the converter work.

## Action items

1. [x] Engine, store, actions registry, pro layout (PR "Pro viewer").
2. [ ] Stencil section caps (follow-up issue).
3. [ ] Remove `'unsafe-eval'` once readers are vendored (converter PR).
