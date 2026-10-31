<p align="center"><img src="assets/logo/logo.svg" width="96" alt="ShapeBridge logo"></p>

<h1 align="center">ShapeBridge</h1>

<p align="center"><b>Open-source, lightweight CAD viewer, format converter and parametric designer, with live peer-to-peer sharing.</b><br>
Windows · macOS · Linux · any browser</p>

<p align="center">
<a href="https://github.com/gazi-faysal-jubayer/shapebridge/actions/workflows/build_all.yml?query=branch%3Amain"><img alt="Build all" src="https://github.com/gazi-faysal-jubayer/shapebridge/actions/workflows/build_all.yml/badge.svg?branch=main&event=push"></a>
<a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-0d9488"></a>
<a href="https://gazi-faysal-jubayer.github.io/shapebridge/"><img alt="Web viewer" src="https://img.shields.io/badge/try-web%20viewer-14b8a6"></a>
</p>

---

## Why

- **View** STEP, IGES, BREP, FreeCAD, Rhino 3DM, IFC, STL, OBJ, glTF, 3MF, FBX, Collada, 3DS, PLY, OFF, VRML, AMF and more, in an app that installs in a few MB.
- **Convert** any loaded model to STL, OBJ, glTF/GLB, PLY, OFF, 3DM or dotbim. Parametric parts also export an exact **STEP** solid.
- **Design parametrically** with named parameters and expressions, then hand the model to **FreeCAD, OpenSCAD, CadQuery or Fusion 360 with the parameters still editable** there.
- **Show your local file to someone across the world**: click **Share live**, send the link, and they see your model (and follow your camera) in their browser. The file goes **directly peer-to-peer**. It is never uploaded to a server.

## Quick start

**Web:** open <https://gazi-faysal-jubayer.github.io/shapebridge/> and drop a file on it.

**Desktop:** download the installer for your OS from [Releases](https://github.com/gazi-faysal-jubayer/shapebridge/releases).

**From source:**

```bash
git clone https://github.com/gazi-faysal-jubayer/shapebridge.git
cd shapebridge
npm install
npm run dev          # web app at http://localhost:1420
npm test -- --run    # unit + kernel tests
npm run tauri dev    # desktop app (needs Rust + platform deps, see docs/ARCHITECTURE.md)
```

## How it stays light

| Part | Choice |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app) on the OS webview, not a bundled Chromium |
| UI | [SolidJS](https://solidjs.com), about 7 KB |
| Import/export | [Online 3D Viewer engine](https://github.com/kovacsv/Online3DViewer) on three.js |
| CAD kernel | [OpenCascade](https://dev.opencascade.org) WASM via [replicad](https://replicad.xyz), loaded only when you design |
| Sharing | [Trystero](https://github.com/dmotz/trystero) WebRTC, with no server of ours |

Heavy readers (OCCT for STEP/IGES, rhino3dm, web-ifc) are fetched only when you open a file that needs them.

## Formats

See [docs/FORMATS.md](docs/FORMATS.md) for the full matrix, including how ShapeBridge handles **SolidWorks, Inventor, CATIA, NX, Creo, SketchUp and DWG** files. No open-source reader exists for those, so ShapeBridge uses *bridges* to your own installed copy of each tool.

## Parametric interop

See [docs/INTEROP.md](docs/INTEROP.md). In short:

| Target | You get | Parameters live in |
|---|---|---|
| FreeCAD | `.FCMacro` | Spreadsheet `Params` |
| OpenSCAD | `.scad` | top-level variables (Customizer) |
| CadQuery | `.py` | `build()` arguments |
| Fusion 360 | script `.py` | User Parameters |
| SolidWorks / Inventor / Onshape | STEP + `params.csv` | design table / manual |

## Project docs

- [docs/PLAN.md](docs/PLAN.md): the full product and engineering plan, with milestones
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code fits together
- [docs/MAINTAINING.md](docs/MAINTAINING.md): issue triage, PR flow, builds and labels (modelled on OrcaSlicer)
- [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md): **using AI coding agents on this repo** (hooks, skills, MCP, plugins)
- [docs/plans/](docs/plans): testing, performance, security, release, interop, native formats, governance, future
- [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## AI agents

Design parts with any Claude Code agent using the `shapebridge` plugin:

```text
/plugin install shapebridge --marketplace gazi-faysal-jubayer/shapebridge
```

The repo's own hooks, skills and MCP setup for contributors are described in [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md).

## License

Apache-2.0. Bundled third-party components keep their own licences: OpenCascade (via `replicad-opencascadejs` and `occt-import-js`) is LGPL-2.1 and is loaded as a separate, replaceable WebAssembly module.
