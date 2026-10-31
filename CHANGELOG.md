# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-31

### Added

- Viewer for STEP, IGES, BREP, FCStd, 3DM, IFC, dotbim, STL, OBJ, glTF/GLB, 3MF, AMF, PLY, OFF, FBX, DAE, 3DS, VRML and SVG (Online 3D Viewer engine).
- Mesh export to STL, OBJ, glTF/GLB, PLY, OFF, 3DM and dotbim.
- Parametric designer: named parameters with safe expressions; box and cylinder add/cut features; live rebuild with OpenCascade WASM; exact STEP export.
- Parametric exports with editable parameters for FreeCAD (macro + spreadsheet), OpenSCAD (Customizer variables), CadQuery (function arguments) and Fusion 360 (User Parameters, experimental), plus a CSV parameter table.
- Live peer-to-peer share: link opens the web viewer; the file streams directly from the host; viewers follow the presenter's camera.
- Tauri 2 desktop shell, CI, GitHub Pages deploy, release workflow for Windows, macOS and Linux.
- Agent tooling: Claude Code hooks, skills, plugin and marketplace, MCP config, AGENTS.md and the agent guide.
