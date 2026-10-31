# ShapeBridge: master plan

> Living document. Each milestone below maps to a GitHub milestone of the same name, and each bullet to an issue. Update this file in the same PR that changes the scope.

## 1. Vision

One small, free, open-source app that every engineer can install anywhere to:

1. **Open** almost any CAD or 3D file.
2. **Convert** it to whatever the next tool or person needs.
3. **Design** simple-to-moderate parts **parametrically**, and hand them to the big CAD tools *with the parameters still editable*.
4. **Show** a local model live to anyone, anywhere, with nothing but a browser link and no upload.

### Non-goals (for now)

- Replacing SolidWorks/CATIA for complex assemblies, drawings or simulation.
- Cloud storage or accounts. ShapeBridge stays local-first.
- Decompiling or cloning proprietary CAD applications. We build from open specs and open-source kernels only.

## 2. Users and key stories

| Persona | Story | Success |
|---|---|---|
| Design engineer | "My boss is in another country and has no CAD licence. I want them to see my part *now*." | link opened in < 30 s; model visible; they follow my camera |
| Supplier / machinist | "A customer sent `.stp`, my slicer wants `.stl`/`.3mf`." | drop → export in 3 clicks |
| Maker | "I want a bracket where I change width and hole size, then print or send it to FreeCAD." | parameter edit → rebuild < 1 s; FreeCAD macro re-creates it with the spreadsheet |
| BIM coordinator | "Quick look at an IFC without installing Revit." | IFC opens; model tree browsable |
| Student | "I can't afford Fusion. I want to learn parametric thinking." | free, installs in seconds, export scripts teach the API |

## 3. Constraints

- **Lightweight:** installer < 20 MB, idle RAM < 150 MB, cold start < 1 s (no kernel loaded).
- **Cross-platform:** Windows 10+, macOS 12+, mainstream Linux (AppImage/deb/rpm), plus any evergreen browser.
- **Fully open source:** Apache-2.0 core. LGPL kernels loaded as replaceable modules. GPL pieces (LibreDWG) only as opt-in plugins.
- **Privacy:** files never leave the machine except peer-to-peer to people the user explicitly shares with.

## 4. Architecture summary

See [ARCHITECTURE.md](ARCHITECTURE.md). The short version:

```
 ┌──────────── Tauri 2 shell (Rust, OS webview) ─────────────┐   ┌── Browser (GitHub Pages) ──┐
 │  SolidJS UI ─ viewer (OV engine + three.js)               │   │  same frontend, guest mode │
 │      │            │ lazy: occt-import-js, rhino3dm, web-ifc│   │                            │
 │      │            └ exporters: stl obj gltf ply off 3dm bim│   │                            │
 │      ├ model/params.ts  (safe expressions)                 │   │                            │
 │      ├ interop/*        (FreeCAD, OpenSCAD, CadQuery, F360)│   │                            │
 │      ├ kernel worker    (replicad + OCCT WASM, lazy)       │   │                            │
 │      └ share/           (Trystero WebRTC) ◀───── P2P ─────────▶  guest viewer             │
 │  Rust: dialogs, fs, file associations, bridges (M2b)       │   └────────────────────────────┘
 └────────────────────────────────────────────────────────────┘        signalling: Nostr relays
```

## 5. Milestones

Effort: S ≤ 1 day, M ≤ 3 days, L ≤ 2 weeks (one contributor).

### M0 Foundation ✅ (v0.1.0)
- [x] Repo, licence, community files, logo and icons
- [x] Vite + SolidJS + TypeScript scaffold; Tauri 2 config
- [x] CI (typecheck, unit + kernel tests, build), Pages deploy, release matrix
- [x] Agent tooling: hooks, skills, plugin, MCP config, [AGENT_GUIDE.md](AGENT_GUIDE.md)
- [x] Thin vertical slice: open → view → export mesh; parametric sample → STEP and 5 interop targets; live P2P share

### M1 Viewer (v0.2)
- Model tree panel (assemblies, names, colours, visibility toggles) · M
- Measure: point-to-point distance, edge length, bounding box · M
- Section plane with cap · M
- View cube / standard views, ortho/perspective toggle, Z-up/Y-up toggle · S
- Wireframe / shaded / shaded+edges modes · S
- **Offline readers:** vendor occt-import-js, rhino3dm, web-ifc into the desktop bundle with a CDN fallback · M
- OS file associations + "Open with" + open from CLI args (Rust side) · M
- Recent files, drag-drop of folders (OBJ+MTL+textures) · S
- Large-model performance: worker-side import, progressive display, 5M-triangle target · L

### M1b Formats (v0.3)
- assimpjs catch-all reader (FBX, Blender, LWO, X, AC3D, MD5 …) · M
- USD/USDZ, X3D, VTK, PCD/XYZ point clouds · M
- 3MF, AMF, FBX, DAE, VRML writers · M
- IFC writer (web-ifc) for simple solids · M
- DXF reader (`dxf-parser`) for 2D drawings · M
- DWG opt-in plugin (LibreDWG WASM, GPL, separate download) · L
- ODA File Converter auto-detect bridge (DWG/DGN) · M

### M2 Converter (v0.4)
- B-rep → B-rep conversions STEP ⇄ IGES ⇄ BREP via a custom OCCT build that includes IGES · M
- Tessellation quality slider (linear and angular deflection) · S
- HLR projected views → DXF/SVG/PDF drawing export · L
- Faceted STEP from meshes (clearly labelled lossy) · M
- Batch convert dialog (folder in, format out) · M
- CLI `npx shapebridge convert in.step out.glb` (Node, same code) · M
- Unit handling (mm/in/m) and scale on export · S

### M2b Native bridges (v0.5)
- Thumbnail extractor for OLE compound files (SolidWorks/Inventor/Solid Edge/CATIA previews) · M
- Bridge contract: `bridges/<app>/` script + Rust runner + detection + progress + timeout · M
- SolidWorks COM bridge (Windows) → STEP + custom properties · M
- Inventor / Inventor Apprentice bridge · M
- Fusion 360 add-in bridge (export STEP + User Parameters JSON) · M
- CATIA V5, Solid Edge, NX (NXOpen), Creo bridges · L each, community-owned
- SketchUp SDK opt-in plugin · M
- Research spikes: clean-room `x_t` text, `sat` text, JT (ISO 14306) · L each

### M3 Parametric designer (v0.6)
- Feature panel: add, reorder, delete, suppress features · M
- New features: sketch extrude (polyline/arc/circle), revolve, fillet, chamfer, shell, linear/polar pattern, hole wizard · L
- Sketcher with dimensional constraints (start with dimension-only, then a geometric solver such as planegcs WASM) · L
- Undo/redo, autosave, `.sbridge.json` versioning and migration · M
- Parameter units (mm, deg) and trig functions with per-target degree/radian mapping · S
- Mass properties: volume, area, centre of mass · S

### M4 Share (v0.7)
- Presenter controls: follow-me toggle (done), laser pointer, comment pins synced to peers · M
- Guest-side permissions: view-only vs allow-download, set by the host · S
- Host revokes a single viewer; session expiry · S
- Optional TURN server setting for strict NATs · S
- **Offline share:** export a self-contained viewer `.html` with the model embedded (email/Drive) · M
- Transfer resume + progress UI for large files · M
- Measurements visible to guests · S

### M5 Interop (v0.8)
- Verify FreeCAD macro in FreeCAD 0.21 / 1.0 in CI (headless `freecadcmd`) · M
- Verify CadQuery script in CI (pip cadquery) · S
- Verify OpenSCAD in CI (`openscad -o out.stl`) · S
- Fusion 360 manual test protocol and parametric x/y positions · M
- SolidWorks `.swb` macro generator · M
- Onshape FeatureScript generator · M
- FreeCAD PartDesign variant (sketch-based body) · M
- Import parametric: read OpenSCAD/CadQuery parameter blocks back into ShapeBridge · M

### M6 Release & ecosystem (v1.0)
- Code signing (Windows Authenticode, macOS notarisation) and Tauri updater · M
- winget, Homebrew cask, Flathub, AUR packaging · M
- `shapebridge-mcp` server so AI agents can open, measure, set parameters and export headlessly · M
- i18n (en, bn, es, de, zh, ja) · M
- Accessibility audit (keyboard navigation, screen-reader labels, contrast) · M
- Docs site and video tutorials · M

## 6. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebRTC blocked by corporate NAT/firewall | medium | share fails | TURN setting (M4), offline HTML export (M4) |
| Public Nostr relays unreliable | medium | slow or failed connect | Trystero strategy fallback (torrent/mqtt), configurable relays |
| OCCT WASM size (23 MB raw / 7 MB gz) | certain | first designer load | lazy load, cache, custom smaller build (M2) |
| Online 3D Viewer readers fetched from CDN | certain | offline desktop can't open STEP | vendor readers (M1) |
| Proprietary-format expectations | high | user disappointment | honest FORMATS.md tiers, bridges, thumbnails |
| Fusion/SolidWorks script APIs change | medium | broken exports | golden tests + manual protocol per release |
| Licence contamination (GPL/closed SDKs) | low | can't ship | opt-in plugins, licence check in CI (M6) |

## 7. Definition of done (every PR)

- `npm run typecheck`, `npm test -- --run` and `npm run build` pass (CI enforces this).
- New behaviour has a test (unit, golden or smoke).
- Docs updated: FORMATS/INTEROP/PLAN rows touched by the change.
- No new runtime dependency without a size note in the PR (see [plans/performance-budget.md](plans/performance-budget.md)).

## 8. Additional plans

- [Testing strategy](plans/testing-strategy.md)
- [Performance budget](plans/performance-budget.md)
- [Security & privacy](plans/security-privacy.md)
- [Release & distribution](plans/release-distribution.md)
- [Interop roadmap](plans/interop-roadmap.md)
- [Native formats research](plans/native-formats-research.md)
- [Governance & community](plans/governance-community.md)
- [Future ideas](plans/future-ideas.md)
