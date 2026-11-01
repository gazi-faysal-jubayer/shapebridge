# Formats

Status legend: ✅ works today · 🧪 experimental · 🗺️ planned (see the linked milestone) · 🌉 through a bridge to an installed host app · ❌ not possible with open-source tools today

ShapeBridge reads files through the [Online 3D Viewer engine](https://github.com/kovacsv/Online3DViewer). Its heavy readers (OCCT for STEP/IGES/BREP, rhino3dm, web-ifc, draco) ship with the app under `libs/` and load only when a file needs them, so everything works offline. On the desktop, STEP, IGES and BREP files opened from disk are read by native, multi-threaded OpenCascade instead, about twice as fast on big assemblies (see `docs/plans/performance-budget.md`).

## Tier 1: neutral CAD (exact geometry)

| Format             | Extensions   | Read                                             | Write                                               | Notes                                      |
| ------------------ | ------------ | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------ |
| STEP AP203/214/242 | `.step .stp` | ✅                                               | ✅ exact, from STEP/BREP files and parametric parts | colours and assembly names kept on read    |
| IGES               | `.iges .igs` | ✅                                               | 🗺️ needs IGES in our OCCT build                     |                                            |
| OpenCascade BREP   | `.brep .brp` | ✅                                               | ✅ exact                                            |                                            |
| FreeCAD            | `.FCStd`     | ✅                                               | ✅ as `.FCMacro` (parametric)                       | the reader uses shapes embedded in the zip |
| Rhino / openNURBS  | `.3dm`       | ✅                                               | ✅ (mesh)                                           | via rhino3dm                               |
| IFC (BIM)          | `.ifc`       | 🧪 reader bundled, sample not yet verified (#81) | 🗺️ M1b                                              | Revit, ArchiCAD and Tekla exchange         |
| dotbim             | `.bim`       | ✅                                               | ✅                                                  |                                            |
| VRML               | `.wrl`       | ✅                                               | 🗺️ M1b                                              |                                            |

## Tier 2: mesh, visualisation, 3D printing

| Format                                                                            | Extensions             | Read              | Write  |
| --------------------------------------------------------------------------------- | ---------------------- | ----------------- | ------ |
| STL (ascii/binary)                                                                | `.stl`                 | ✅                | ✅     |
| Wavefront OBJ                                                                     | `.obj .mtl`            | ✅                | ✅     |
| glTF 2.0                                                                          | `.gltf .glb .bin`      | ✅                | ✅     |
| 3MF                                                                               | `.3mf`                 | ✅                | 🗺️ M1b |
| AMF                                                                               | `.amf`                 | ✅                | 🗺️ M1b |
| PLY                                                                               | `.ply`                 | ✅                | ✅     |
| OFF                                                                               | `.off`                 | ✅                | ✅     |
| Autodesk FBX                                                                      | `.fbx`                 | ✅                | 🗺️ M1b |
| Collada                                                                           | `.dae`                 | ✅                | 🗺️ M1b |
| 3D Studio                                                                         | `.3ds`                 | ✅                | ❌     |
| USD / USDZ                                                                        | `.usd .usdz`           | 🗺️ M1b            | ❌     |
| X3D, VTK/VTP, PCD/XYZ point clouds                                                |                        | 🗺️ M1b            | 🗺️     |
| Blender, LightWave, DirectX X, AC3D, MD2/MD5 and the rest of assimp's ~40 formats | `.blend .lwo .x .ac …` | 🗺️ M1b (assimpjs) | ❌     |

## Tier 3: 2D drafting

| Format             | Read                  | Write                                                          | Notes                                                                                  |
| ------------------ | --------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SVG                | ✅ (as 3D outline)    | ✅ drawing sheet: front/top/right with hidden lines, 1:1 in mm |                                                                                        |
| DXF                | 🗺️ M1b                | ✅ drawing sheet (R12 LINE entities, VISIBLE/HIDDEN layers)    | verified by re-parsing with `dxf-parser`                                               |
| PDF drawing        | ❌                    | ✅ print the SVG sheet at 100 %                                |                                                                                        |
| DWG (AutoCAD)      | 🗺️ optional plugin    | 🗺️ optional plugin                                             | LibreDWG is GPL, so it ships as a separate opt-in download to keep the core Apache-2.0 |
| DGN (MicroStation) | 🌉 ODA File Converter | 🌉                                                             | free but closed-source; auto-detected if installed                                     |

## Tier 4: proprietary native formats

No open-source library can read the feature trees in these files, so we can't promise full support. ShapeBridge gives you what it legally and technically can:

| App               | Extensions                | Preview thumbnail                                                     | Full geometry                                           |
| ----------------- | ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| SolidWorks        | `.sldprt .sldasm .slddrw` | 🗺️ M2b (embedded bitmap); opening one now explains how to export STEP | 🌉 SolidWorks COM → STEP                                |
| Autodesk Inventor | `.ipt .iam .idw`          | 🗺️ M2b                                                                | 🌉 Inventor / free Inventor Apprentice → STEP           |
| Fusion 360        | `.f3d .f3z`               | ❌                                                                    | 🌉 Fusion add-in → STEP + parameters                    |
| CATIA V5          | `.CATPart .CATProduct`    | 🗺️ M2b                                                                | 🌉 CATIA COM → STEP                                     |
| Siemens NX        | `.prt`                    | ❌                                                                    | 🌉 NXOpen journal → STEP                                |
| Solid Edge        | `.par .asm .psm`          | 🗺️ M2b                                                                | 🌉 Solid Edge COM → STEP                                |
| PTC Creo          | `.prt .asm`               | ❌                                                                    | 🌉 Creo journal → STEP                                  |
| SketchUp          | `.skp`                    | ✅ (Collada export from SketchUp)                                     | 🌉 optional plugin built on the free SketchUp SDK       |
| Parasolid         | `.x_t .x_b`               | n/a                                                                   | 🌉 host app · 🗺️ clean-room text reader (research)      |
| ACIS              | `.sat .sab`               | n/a                                                                   | 🌉 host app · 🗺️ clean-room text reader (research)      |
| JT                | `.jt`                     | n/a                                                                   | 🗺️ clean-room reader from the ISO 14306 spec (research) |

How bridges work, and the legal limits on the clean-room research, are in [plans/native-formats-research.md](plans/native-formats-research.md).

## Adding a format

Use the `add-format` agent skill (`.claude/skills/add-format/SKILL.md`), or follow it by hand. Every new format needs a sample in `public/samples/`, a smoke test, and a row in this file.
