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

## Live share

**Share live** gives you a link that opens in any browser. The model is sent directly, peer-to-peer, and viewers follow your camera. **Stop sharing** ends the session.
