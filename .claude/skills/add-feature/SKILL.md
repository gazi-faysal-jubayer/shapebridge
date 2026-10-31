---
name: add-feature
description: Add a parametric modelling feature (fillet, chamfer, revolve, sketch extrude, pattern, shell, hole…) to ShapeBridge's document model, kernel and every interop exporter. Use when asked to add or change a feature kind in the parametric designer.
---

# Add a parametric feature

A feature is only done when **every** target can represent it (`docs/plans/interop-roadmap.md`, "Feature coverage rule").

1. **Model:** add the variant to `Feature` and `Resolved` in `src/model/doc.ts`. Every numeric field is an expression **string**. Extend `resolve()`: evaluate with `ev`, validate ranges (positive sizes, angles), and reject unknown fields. This is a trust boundary, because docs arrive from peers.
2. **Kernel:** build it in `src/kernel/build.ts` with replicad. Extend `src/kernel/build.test.ts` with an analytic volume check.
3. **Generators:** implement it in each of these. Every literal goes through `JSON.stringify` or `printExpr`, and only identifiers reach code position.
   - `src/interop/freecad.ts`: a Part or PartDesign object, every property bound with `setExpression`
   - `src/interop/openscad.ts`
   - `src/interop/cadquery.ts`
   - `src/interop/fusion360.ts`: dimensions bound to User Parameters where the API allows it; document anything baked as a number
   - `src/interop/index.ts` (CSV) needs no change
     If a target truly can't express it, emit a comment in that output explaining the fallback. Never drop it silently.
4. **Sample:** use it in `sampleDoc` (or a second sample doc) so the golden files cover it, then run `npx vitest run -u` and **review every golden diff**.
5. **UI:** show the feature in the Features list in `src/App.tsx`.
6. **Docs:** update `docs/INTEROP.md` (the `.sbridge.json` schema and the targets table) and `CHANGELOG.md`.
7. **Verify:** `npm run typecheck && npx vitest run`. Then in `npm run dev`, click _New parametric part_, edit a parameter, and check that the geometry updates.

PR labels: `parametric`, `interop`.
