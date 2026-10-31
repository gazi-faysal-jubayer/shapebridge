# Architecture

## Layout

```
src/
  main.tsx, App.tsx    shell: top bar, side panels, stage, status bar; mounts the engine after first paint
  state/store.ts       the single Solid store (settings, model, selection, tools, views)
  controller.ts        every app operation (open, select, tools, export, designer, share); owns the engine
  ui/actions.ts        action registry -> menus, command palette and keyboard shortcuts
  ui/*.tsx             TopBar, ModelTree, Properties, ToolStrip, ViewCube, StatusBar, Welcome, CommandPalette, Designer, ShareDialog
  viewer/engine.ts     lazy chunk: OV Viewer + ThreeModelLoader with our selection/measure/section/explode/display layers
  viewer/math.ts       pure maths: explode offsets, section planes, standard views, view-cube faces, units
  viewer/tree.ts       OV model -> part tree (pure, tested with a fake model)
  model/params.ts      expression parser/evaluator/printer (no eval), dependency ordering
  model/doc.ts         .sbridge.json document type, validation (trust boundary), sample part
  kernel/build.ts      doc -> OpenCascade solid (replicad)
  kernel/occt.worker.ts  keeps the current exact solid (built or imported); build, import, export, projected views
  kernel/protocol.ts   promise API over the worker; creates it on first use
  interop/*.ts         doc -> FreeCAD / OpenSCAD / CadQuery / Fusion 360 / CSV
  live.ts              live review: session lifecycle, presence, follow sync, pointers, comments
  share/protocol.ts    typed review messages + strict validation (trust boundary)
  share/offline.ts     self-contained viewer .html export
  convert/convert.ts   File → Convert: exact (kernel), mesh (engine), drawings, batch
  convert/drawing.ts   third-angle sheet layout, SVG and DXF writers, SVG path flattening
  cli.ts               `shapebridge convert` (built by vite.cli.config.ts into dist-cli/)
  share/link.ts        share-link format (kept tiny so the P2P stack stays lazy)
  share/share.ts       Trystero rooms: host streams files + camera, guest receives
  platform/save.ts     native save dialog in Tauri, download link on the web
src-tauri/             Rust shell: plugins (dialog, fs), bundle config, icons
scripts/               icons, samples, GitHub setup, agent hooks
public/samples/        small test models we generated ourselves (served by the app)
```

Decision record: [adr/0001-viewer-architecture.md](adr/0001-viewer-architecture.md).

## Data flow

**Viewing:** `File[]` → `controller.openFiles` → `Engine.load` → OV `ThreeModelLoader` chooses an importer by extension. Importers for OCCT, rhino3dm and web-ifc are fetched lazily → three.js scene. OV rotates some Z-up formats (STL, 3MF, FCStd) into its Y-up scene; STEP/IGES/BREP keep native Z-up and the engine switches the camera's up axis instead. Store changes (selection, hidden parts, section, explode, display mode) reach the engine through Solid effects in `controller.mountViewer`.

**Parametric:** a parameter edit → `structuredClone(doc)` → debounce 300 ms → `resolve(doc)` validates on the main thread for instant errors → `kernel.build(doc)` in the worker → `{stl, step}` → the STL is shown through the same viewer path (so mesh export works for designs too); the STEP is kept for exact export.

**Sharing:** the host calls `joinRoom({appId, password: key}, roomId)`. On each `onPeerJoin` it sends every file (ArrayBuffer + `{name, total}` metadata) to that peer, then broadcasts camera JSON every 200 ms while it changes. The guest page is the same app; `#s=<room>.<key>` in the URL switches it to guest mode. The fragment is never sent to any server.

## Trust boundaries

| Input | Validation |
|---|---|
| `.sbridge.json` from disk or a peer | `resolve()`: format tag, identifier names/ids, operator whitelist, cycles, finite and positive sizes |
| Expressions | own recursive-descent parser; whitelist of operators and two functions; reserved names blocked; `Object.hasOwn` lookup |
| Generated scripts | every string literal goes through `JSON.stringify`; ids and names are identifiers, so nothing user-controlled reaches code position |
| Peer file metadata | name reduced to a safe basename (120 chars); file count clamped 1–64; `maxReceiveBytes` 512 MB |
| CAD files | parsed by third-party readers inside the webview sandbox, OCCT inside a worker |

## Desktop vs web

The same `dist/` runs in both. `platform/save.ts` checks `__TAURI_INTERNALS__` to choose a native save dialog. Tauri's own drag-drop is disabled so the HTML5 drop zone works on every OS.

## Building the desktop app locally

Requires Rust stable plus platform deps ([Tauri prerequisites](https://tauri.app/start/prerequisites/)): MSVC Build Tools + WebView2 on Windows, Xcode CLT on macOS, `libwebkit2gtk-4.1-dev` etc. on Linux.

```bash
npm run tauri dev      # hot reload
npm run tauri build    # installers in src-tauri/target/release/bundle/
```

CI builds all platforms on tag push (`.github/workflows/publish_release.yml`); every PR also gets installers from `build_all.yml`, so contributors don't need every toolchain.
