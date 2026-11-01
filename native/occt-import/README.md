# shapebridge-occt: native STEP/IGES/BREP reader

The desktop app opens STEP, IGES and BREP files with this small program instead of the WebAssembly reader. It uses native, multi-threaded OpenCascade and writes binary glTF that keeps the assembly tree, part names and colours.

On a 2,500-part assembly it is about 3× faster than WebAssembly (15 s against 42 s on an i5-10500); see `docs/plans/performance-budget.md`.

- **How the app uses it:** Tauri ships it next to the app as `shapebridge-occt` (`externalBin` in `src-tauri/tauri.native.conf.json`). `native_import` in `src-tauri/src/main.rs` runs it on the file the user opened. If it is missing or fails, the app falls back to the built-in reader.
- **Build:** run `node scripts/build-occt.mjs`. It needs CMake and a C++17 compiler.
  - The script downloads OpenCascade 7.8.1 and RapidJSON 1.1.0 (pinned, SHA-256 checked) and builds static OCCT once into `.occt/`.
  - Then it builds this program into `src-tauri/binaries/`.
  - CI caches the OCCT build per target.
- **Licence:** LGPL-2.1 with the Open CASCADE exception, like OpenCascade.
  - It is a separate executable that ShapeBridge (Apache-2.0) only runs and reads files from, which matches the rule in `AGENTS.md`: LGPL only as a separate module.
  - RapidJSON is MIT.
