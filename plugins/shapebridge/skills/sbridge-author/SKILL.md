---
name: sbridge-author
description: Write or edit a ShapeBridge parametric part (.sbridge.json) from a plain-language description - brackets, plates, spacers, enclosures made of boxes and cylinders with named parameters - and explain how to open it in ShapeBridge and export it to FreeCAD, OpenSCAD, CadQuery or Fusion 360. Use when someone wants a simple parametric CAD part or wants to tweak one.
---

# Author a ShapeBridge part

## Format (`shapebridge/1`, millimetres)

```json
{
  "format": "shapebridge/1",
  "name": "spacer",
  "units": "mm",
  "params": [
    { "name": "od", "expr": "20", "note": "outer diameter" },
    { "name": "id", "expr": "od / 2" },
    { "name": "h", "expr": "10" }
  ],
  "features": [
    { "id": "body", "kind": "cylinder", "op": "add", "at": ["0", "0", "0"], "radius": "od / 2", "height": "h" },
    { "id": "bore", "kind": "cylinder", "op": "cut", "at": ["0", "0", "0"], "radius": "id / 2", "height": "h" }
  ]
}
```

## Rules (the app rejects documents that break them)

- `name`, parameter names and feature `id`s are identifiers: `[A-Za-z_][A-Za-z0-9_]*`. Reserved: `sqrt abs pi Params` and Python keywords.
- Expressions use only numbers, parameter names, `+ - * / ^`, parentheses, `sqrt()` and `abs()`. Every field is a **string**.
- No cycles between parameters. Every size must evaluate to a positive number.
- Features apply in order, and the first one must be `"op": "add"`.
  - `box`: `at` = min corner `[x, y, z]`, `size` = `[x, y, z]`
  - `cylinder`: `at` = centre of the base, axis +Z, plus `radius` and `height`
- Put the dimensions a user would want to change in literal parameters (`"expr": "40"`) and derive the rest. Literal parameters become the editable inputs in every target tool.
- Cut holes slightly taller than the material if they start at its surface, so faces don't coincide.

## Using it

1. Save the file as `<name>.sbridge.json`.
2. Open it in ShapeBridge (desktop app, or https://gazi-faysal-jubayer.github.io/shapebridge/) with **Open…** or drag-and-drop. Parameters appear on the left and edits rebuild the model live.
3. Under **Export (stays editable)**:
   - FreeCAD macro: the `Params` spreadsheet drives the model
   - OpenSCAD: Customizer variables
   - CadQuery: `build()` arguments
   - Fusion 360 script: User Parameters
   - STEP: exact solid for any other CAD tool

Only boxes and cylinders exist in format v1. For fillets, revolves, sketches and so on, say so and suggest an approximation, or point to the ShapeBridge roadmap (docs/PLAN.md, milestone M3).
