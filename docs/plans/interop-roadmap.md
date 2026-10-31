# Interop roadmap

Goal: a part designed in ShapeBridge opens in each major CAD tool **with editable parameters**, and comes back again wherever the tool exposes its parameters.

| Tool | Export (to the tool) | Import (from the tool) | Mechanism | Milestone |
|---|---|---|---|---|
| FreeCAD | ✅ Part + Spreadsheet macro · PartDesign variant planned | read the `Params` spreadsheet from `.FCStd` | macro / zip+XML | M5 |
| OpenSCAD | ✅ `.scad` | parse top-level literal assignments back into params | text | M5 |
| CadQuery / build123d | ✅ `.py` | parse `build()` defaults | text | M5 |
| Fusion 360 | 🧪 script with User Parameters | add-in exports User Parameters JSON + STEP | Python API | M5 / M2b |
| SolidWorks | STEP + CSV design table | bridge exports global variables + STEP | VBA `.swb` / COM | M5 / M2b |
| Inventor | STEP + CSV | bridge exports parameters + STEP | iLogic / COM | M5 / M2b |
| Onshape | FeatureScript with `#variables` | REST API (user token) | FeatureScript | M5 |
| Solid Edge / NX / CATIA / Creo | STEP + CSV | bridges | journals / COM | community |
| Rhino / Grasshopper | 3DM (mesh) | n/a | rhino3dm | M1b |

## Feature coverage rule

A feature kind is **not** released until every ✅ target above can represent it. Otherwise the generator must emit a clear comment explaining the fallback, for example a fillet baked into STEP.

## Verification in CI (M5)

- `freecadcmd` runs the macro, then compares the volume with ShapeBridge's.
- `openscad -o out.stl bracket.scad`, then compares the volume.
- `python bracket.py` (CadQuery), then compares the STEP volume.
