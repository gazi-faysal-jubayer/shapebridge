# ShapeBridge user guide

## Open a model

- Drag a file onto the window, use **Open…** (Ctrl+O), or pick a sample on the start screen.
- Open several files at once when they belong together, for example `model.obj` + `model.mtl` + textures.
- Supported formats are listed in [FORMATS.md](FORMATS.md). Nothing is uploaded; files are read on your device.

## Find your way around

| Area                       | What it does                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Left panel, **Model** tab  | the part tree. Click to select (Shift/Ctrl adds), double-click to fit, eye icon to hide. **Saved views** sit underneath.            |
| Left panel, **Design** tab | the parametric designer (parameters, features, exports)                                                                             |
| Right panel                | properties of the selection, or of the whole model: size, area, volume (closed meshes only), triangle count, file properties, units |
| View cube (top right)      | click a face for that standard view; **ISO** for isometric                                                                          |
| Tool strip (bottom)        | Select, Measure, Section, Explode, Fit, display mode, Screenshot                                                                    |
| Status bar                 | messages, cursor coordinates, part and triangle counts, units, live-share status                                                    |

Mouse: left-drag orbits, right- or Shift-drag pans, the wheel or Ctrl-drag zooms.

## Tools

- **Measure (M):** click two points. You get the distance, the angle between the two faces, and the distance between the faces when they are parallel.
- **Section (S):** choose the X, Y or Z axis, drag the slider, and tick **Flip** to keep the other side.
- **Explode (E):** drag the slider to pull parts apart from the centre; **Reset** puts them back.
- **Hide (H) / Isolate (I) / Show all (Shift+H)** act on the selection.
- **Saved views (V):** saves the camera, hidden parts, section and explode state for this file name on this device.
- **Screenshot (P):** saves a PNG at twice the window size. A transparent-background version is in the File menu.

## Keyboard

Press **Ctrl+K** to search every command. Common shortcuts:

| Key             | Action                      | Key | Action                                     |
| --------------- | --------------------------- | --- | ------------------------------------------ |
| F               | fit                         | 1–7 | front, back, left, right, top, bottom, iso |
| M / S / E       | measure / section / explode | Esc | leave the tool or clear the selection      |
| H / I / Shift+H | hide / isolate / show all   | X   | x-ray                                      |
| O               | perspective ↔ orthographic  | U   | up axis Y ↔ Z                              |
| [ / ]           | toggle left / right panel   | P   | screenshot                                 |

## Theme and units

- **View → Cycle theme** switches between system, light and dark.
- Pick display units in the Properties panel. Files that don't state a unit are treated as millimetres.

## Design a parametric part

Open the **Design** tab, then pick a template (bracket, enclosure, flange, knob), or press Ctrl+K and type "template".

- **Parameters:** every dimension is a named value or an expression, such as `thickness * 2` or `r * cos(30)`. Angles are in degrees. Rename a parameter and every use is updated. A parameter that is still used can't be deleted.
- **Features:** **Add** extrude, cut, revolve, hole, fillet, chamfer, shell, pattern or mirror. Click a feature to edit it.
  - The arrow buttons reorder it.
  - The eye button suppresses it.
  - ↺ rolls the model back to just after it.
  - × deletes it.
  - A feature that fails turns red, with the reason below the list.
- **Undo/redo** with Ctrl+Z / Ctrl+Y. Your design is autosaved on this device ("Restore autosaved design"), and Ctrl+S saves a `.sbridge.json`.
- **Exact properties** (volume, area, size, centre of mass) come from the OpenCascade kernel.
- **Export, parameters stay editable:** FreeCAD macro, OpenSCAD, CadQuery, Fusion 360 script, CSV parameter table, or an exact STEP solid. See [INTEROP.md](INTEROP.md) for what each tool keeps editable.

## Live review

1. Open a model and click **Share live**. Send the link: it opens in any browser, and the model goes straight from your computer to theirs, peer-to-peer.
2. Viewers follow your camera, selection, hidden parts, section, explode and display mode. They can untick **Follow presenter** to look around on their own.
3. **Hold L** to show a laser pointer that everyone sees.
4. **Comments:** press **C** (or **Pin comment** in the Review tab), click the model and type. **D** (or **Markup**) lets you draw on the view first. Click a comment to jump back to the view it was made in, then reply or ✓ resolve it. **Export review** saves everything as Markdown.
5. **Host controls** in the share panel:
   - your name
   - who's in the review (× removes a viewer)
   - whether viewers may export the model
   - an end time
   - a TURN relay for strict company networks
   - **New link**, which revokes the old link
   - **Stop sharing**

The panel can be minimised with –.

**Without a call:** Share → *Export offline viewer (HTML)* saves one file of about 1 MB plus the model that anyone can open offline: email it, or put it on a drive.
