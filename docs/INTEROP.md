# Parametric interop

No neutral file format can move an editable feature tree between CAD systems. STEP and IGES carry exact geometry only. So ShapeBridge exports a **generator script** in each target's native language, and the parameters become that tool's own editable parameters.

Source: `src/interop/`. Each generator is a pure function `Doc → string`. Golden outputs for every template live in `src/interop/__golden__/` and act as tests. The **Interop verify** workflow (`.github/workflows/interop_verify.yml`) runs those files in real **CadQuery, OpenSCAD and FreeCAD** and checks each volume against ShapeBridge's own kernel (`volumes.json`) within 0.5 %.

## The ShapeBridge document (`.sbridge.json`, format `shapebridge/2`)

```json
{
  "format": "shapebridge/2",
  "name": "bracket",
  "units": "mm",
  "params": [
    { "name": "width", "expr": "80" },
    { "name": "boss_h", "expr": "thickness * 2" }
  ],
  "features": [
    {
      "id": "base",
      "kind": "extrude",
      "op": "add",
      "plane": { "base": "XY", "offset": "0" },
      "profile": { "type": "rect", "x": "0", "y": "0", "w": "width", "h": "depth" },
      "distance": "thickness"
    },
    { "id": "corners", "kind": "fillet", "radius": "4", "edges": "vertical" }
  ],
  "rollback": 2,
  "suppressed": ["corners"]
}
```

- **Expressions:** `+ - * / ^`, parentheses, parameter names, `sqrt abs sin cos tan asin acos atan atan2 min max round floor ceil`. Angles are in **degrees**. Our own parser (`src/model/params.ts`) evaluates them, never `eval`.
- **Sketch planes:** `XY` (normal +Z), `XZ` (normal −Y), `YZ` (normal +X), each shifted by `offset` along its normal. Sketch axes are u, v, and the normal is u × v. Every exporter places sketches with these explicit frames instead of the tool's own named planes, which differ between tools and versions.
- **Profiles:** `rect`, `circle`, `polygon` (regular, `sides` fixed), `polyline` (closed).
- **Features:**
  - `extrude` (add/cut, distance, symmetric)
  - `revolve` (about the sketch's v axis, angle in degrees)
  - `hole` (drilled against the plane normal; simple, counterbore or 90° countersink; many positions)
  - `fillet` and `chamfer` (edges: `all`, `vertical`, `top`, `bottom`)
  - `shell` (open `top` or `bottom`, walls grow inwards)
  - `pattern` (`linear` dx/dy/dz or `polar` about Z through cx/cy; count ≥ 2)
  - `mirror` (fuses a mirror image across XY, XZ or YZ)
- **Edges are chosen by rule, never by index**, which side-steps CAD's topological-naming problem.
- **Version 1** files (box and cylinder primitives) are migrated automatically on open.
- Documents are validated on load because they may come from untrusted peers: names, ids, enums, ranges and cycles.

## Targets

| Target                          | Output                                         | Parameters live in               | Fully parametric                                                                                                               | Verified                                                                                                  |
| ------------------------------- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| FreeCAD ≥ 0.21                  | `.FCMacro` (Macro → Execute)                   | `Params` spreadsheet             | sketch vertices, plane offsets, extrude/revolve extents, hole sizes, shell thickness, pattern count and spacing (Draft arrays) | CI (`freecadcmd`)                                                                                         |
| OpenSCAD                        | `.scad`                                        | top-level variables (Customizer) | everything it can express                                                                                                      | CI. Fillet, chamfer and shell have no OpenSCAD equivalent; they're listed as `// NOTE:` lines and skipped |
| CadQuery / build123d            | `.py`                                          | `build()` keyword arguments      | everything                                                                                                                     | CI (`pip install cadquery`)                                                                               |
| Fusion 360                      | script `.py` (Utilities → Scripts and Add-Ins) | User Parameters                  | extents, hole sizes, fillet/chamfer/shell sizes, pattern counts, plane offsets                                                 | 🧪 manual only                                                                                            |
| SolidWorks / Inventor / Onshape | STEP + `params.csv`                            | design table / manual            | n/a                                                                                                                            | n/a                                                                                                       |

### Known limits

- **FreeCAD:** fillet and chamfer use `Part::Fillet`/`Part::Chamfer`, whose radius and edge list can't be expression-bound. They're evaluated when the macro runs, so re-run the macro after large changes.
- **Fusion 360:**
  - Sketch vertex positions are fixed numbers; sizes and depths stay parametric.
  - A linear pattern must run along one axis.
  - A polar pattern must be centred on the origin. Otherwise the script writes a `# NOTE:` instead.
- **Polygon side count** is fixed at export.

## Planned

- Constraint sketcher (planegcs) whose geometric and dimensional constraints map 1:1 to FreeCAD Sketcher
- SolidWorks `.swb` macro and Onshape FeatureScript generators
- FreeCAD PartDesign variant; importing edited parameters back from OpenSCAD/CadQuery/FreeCAD
