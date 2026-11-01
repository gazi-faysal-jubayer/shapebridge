# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **New Part** (Ctrl+N) starts an empty part that shows only its Front, Top and Right planes, ready for the first sketch or feature. Before, it opened the bracket template.
- `npm run check:desktop -- --from local` builds the Windows app from your checkout, installs it and checks it, including New Part.

### Changed

- Command names now read like a CAD application: New Part, Open…, Save Part, Recover Autosaved Part, New from Template, Convert & Export…, Export with Parameters.

- Section views now fill the cut with a solid cap in each part's colour, instead of showing hollow inner faces.
- Very large STL files (over 20 MB) load in a background worker without freezing the window. A 5M-triangle mesh, which used to crash the app, now opens (parsed in 0.6 s), with exact size, area and volume.
- Desktop: double-clicking a CAD file or "Open with" opens it in ShapeBridge, and a second file goes to the window that is already running. The native Open dialog and a recent-files list (File → Open recent, the start screen, the Design library).
- Dropping a folder opens everything in it.
- Tests: every sample file must import with triangles (Vitest), plus Playwright end-to-end tests in CI covering opening, STL export, parameter edit with undo, and a two-browser live share.
- CI: a dependency audit (`npm audit` for runtime packages, `cargo audit` for the desktop shell) and a launch smoke test that starts every desktop build and saves a screenshot.
- CAD-style workspace:
  - a ribbon command bar (Features, Sketch, Evaluate, Review, View, Convert) with an original icon set
  - a feature history tree with origin planes, Equations, right-click commands, rename and a draggable rollback bar
  - a feature panel with OK / Cancel (Cancel undoes everything since it opened)
  - a heads-up view toolbar, an XYZ triad, a right-click menu in the viewport, and a task pane (Properties, Review, Design library)
- Converter (File → Convert, Ctrl+E):
  - exact STEP ⇄ BREP from STEP/BREP files or parametric parts
  - STL from the exact solid at coarse, normal or fine quality
  - unit conversion for mesh exports
  - 2D drawing sheets (front, top and right views with hidden lines) as SVG (prints to PDF at 1:1) and DXF R12
  - batch conversion of many files into one zip, with an error report
- `shapebridge convert` CLI (`npm run build:cli`): the same exact conversions and drawings from the command line.
- Offline readers: OCCT, rhino3dm, web-ifc and draco now ship with the app under `libs/` instead of loading from jsDelivr. The desktop app opens STEP, IGES, 3DM and IFC without internet, and jsDelivr is gone from the CSP.

### Fixed

- A reader that crashes inside its own code now fails the load with a message instead of leaving "Loading…" forever.

- Live review:
  - names and colours for everyone; viewers follow the presenter's camera, selection, hidden parts, section, explode and display mode
  - hold **L** for a laser pointer that everyone sees
  - 3D comment pins and freehand markups that remember their camera; replies and resolve; Markdown review export
- Host controls: participant list, remove a viewer, a fresh link (revokes the old one), "viewers may export" permission, session expiry (1/8/24 h), optional TURN relay.
- Offline share: a single self-contained viewer `.html` (~1 MB plus the model) that opens anywhere without the app or a network.
- A typed, versioned share protocol with strict validation. Guests accept session control only from the host.

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

- New look: a dark engineering theme by default (light still available), the Inter typeface, a blue accent, consistent focus rings, hover and disabled states, a busy spinner, reduced-motion support and larger touch targets.
- New logo: two solids joined by a span. All app icons are regenerated from it.
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
