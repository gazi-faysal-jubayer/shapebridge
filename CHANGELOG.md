# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Parametric designer v2 (`shapebridge/2` documents, v1 files migrate automatically):
  - sketches on XY/XZ/YZ with offsets (rectangle, circle, regular polygon, polyline)
  - extrude and cut (with symmetric), revolve, holes (simple, counterbore, countersink)
  - fillet and chamfer by edge rule, shell, linear and polar patterns, mirror
- Feature tree with per-feature forms, reorder, suppress, roll back and delete. Parameter add, rename (rewrites every use) and delete. Undo/redo, autosave and restore, Ctrl+S to save.
- Templates: bracket, enclosure, flange, knob. Exact volume, area, size and centre of mass from the kernel.
- Degree-based trig, min/max/round/floor/ceil in expressions.
- Every feature exports to FreeCAD (Sketcher + spreadsheet), OpenSCAD, CadQuery and Fusion 360. A new **Interop verify** CI runs the outputs in CadQuery, OpenSCAD and FreeCAD and compares volumes with the kernel.

- Pro viewer layout: menu bar, model tree with hide/isolate, properties panel (size, area, volume, file properties, units), view cube, floating tool strip, status bar with cursor coordinates, welcome screen with samples.
- Measure (distance, angle between faces, parallel-face distance), section plane (X/Y/Z, offset, flip), exploded view, display modes (shaded, edges, wireframe, x-ray), perspective/orthographic, Y/Z up axis, standard views, saved views, PNG screenshots.
- Command palette (Ctrl+K) and keyboard shortcuts generated from one action registry.
- Light/dark/system theme.
- Sample assembly (`public/samples/assembly.step`, 7 named parts).
- Content-Security-Policy for web and desktop.

### Changed

- The 3D engine loads after the interface appears: initial JavaScript fell from 264 KB to ~65 KB gzipped.
- Large models (> 300k triangles) use BVH-accelerated picking.
- Samples moved to `public/samples/` so the app can open them.

## [0.1.0] - 2026-10-31

### Added

- Viewer for STEP, IGES, BREP, FCStd, 3DM, IFC, dotbim, STL, OBJ, glTF/GLB, 3MF, AMF, PLY, OFF, FBX, DAE, 3DS, VRML and SVG (Online 3D Viewer engine).
- Mesh export to STL, OBJ, glTF/GLB, PLY, OFF, 3DM and dotbim.
- Parametric designer: named parameters with safe expressions; box and cylinder add/cut features; live rebuild with OpenCascade WASM; exact STEP export.
- Parametric exports with editable parameters for FreeCAD (macro + spreadsheet), OpenSCAD (Customizer variables), CadQuery (function arguments) and Fusion 360 (User Parameters, experimental), plus a CSV parameter table.
- Live peer-to-peer share: link opens the web viewer; the file streams directly from the host; viewers follow the presenter's camera.
- Tauri 2 desktop shell, CI, GitHub Pages deploy, release workflow for Windows, macOS and Linux.
- Agent tooling: Claude Code hooks, skills, plugin and marketplace, MCP config, AGENTS.md and the agent guide.
