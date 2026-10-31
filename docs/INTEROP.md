# Parametric interop

No neutral file format can move an editable feature tree between CAD systems. STEP and IGES carry exact geometry only. So ShapeBridge exports a **generator script** in each target's native language, and every parameter becomes that tool's own editable parameter.

Source: `src/interop/`. Each generator is a pure function `Doc → string`. Golden outputs for the sample bracket live in `src/interop/__golden__/` and act as tests: CI fails if the output changes without the snapshot being updated.

## The ShapeBridge document (`.sbridge.json`)

```json
{
  "format": "shapebridge/1",
  "name": "bracket",
  "units": "mm",
  "params": [{ "name": "width", "expr": "80" }, { "name": "boss_h", "expr": "thickness * 2" }],
  "features": [
    { "id": "base", "kind": "box", "op": "add", "at": ["0","0","0"], "size": ["width","depth","thickness"] },
    { "id": "hole", "kind": "cylinder", "op": "cut", "at": ["width / 2","depth / 2","0"], "radius": "hole_r", "height": "thickness" }
  ]
}
```

- Expressions support `+ - * / ^`, parentheses, parameter names, `sqrt()` and `abs()`. They are parsed by our own parser (`src/model/params.ts`), never with `eval`.
- Features apply in order. Each adds to or cuts from everything before it. Cylinders stand on `at` (base centre) along +Z; boxes start at their `at` corner.
- Documents are validated on load (names, ids, cycles, positive sizes) because they may come from untrusted peers.

## Targets

| Target | Output | How parameters stay editable | Verified |
|---|---|---|---|
| FreeCAD ≥ 0.21 | `.FCMacro` (Macro → Execute) | `Params` spreadsheet with aliases; every dimension and placement is bound by `setExpression` | golden test; manual FreeCAD run is tracked as an M5 issue |
| OpenSCAD | `.scad` | top-level variables appear in the Customizer | golden test |
| CadQuery / build123d | `.py` | literal parameters are `build()` keyword arguments | golden test |
| Fusion 360 | script `.py` (Utilities → Scripts and Add-Ins) | User Parameters drive sketch dimensions, extrude distances and plane offsets | 🧪 untested in Fusion; x/y positions are fixed numbers for now |
| SolidWorks / Inventor / Onshape | STEP + `params.csv` | import the CSV as a design table, or retype it | — |

## Planned (M5)

- SolidWorks `.swb` macro (text VBA) that builds features from a design table
- Onshape FeatureScript with `#width` variables
- FreeCAD PartDesign body (sketch-based) instead of Part primitives
- More features: fillet, chamfer, revolve, sketch extrude, patterns, shell. Each one must land in **all** generators in the same PR (the `add-feature` skill enforces this)
