# Testing strategy

## Layers

| Layer | Tool | What | Where |
|---|---|---|---|
| Unit | Vitest | expression parser/printer, doc validation, share-link parsing | `src/**/*.test.ts` |
| Golden | Vitest `toMatchFileSnapshot` | every interop generator on the sample doc | `src/interop/__golden__/` |
| Kernel | Vitest + real OCCT WASM in Node | build the sample, STEP header, triangle count, **volume matches the analytic value** | `src/kernel/build.test.ts` |
| Format smoke | Vitest + OV engine in a DOM environment (M1) | each file in `samples/` imports with > 0 triangles | planned |
| Target execution | CI jobs with `freecadcmd`, `openscad`, `pip install cadquery` (M5) | generated scripts run and the volume matches ours | planned |
| E2E | Playwright (M1) | open sample, export, parameter edit, two-page share session | planned |
| Desktop smoke | tauri-action build + `tauri-driver` (M6) | app launches and opens a file from argv | planned |

## Rules

- A bug fix starts with a failing test.
- Each new format adds a sample (< 200 KB, made by us or permissively licensed, with its source in `samples/README.md`) and a smoke test.
- Each new parametric feature updates every generator and its golden file in the same PR.
- To update golden files, run `npx vitest run -u`, then review the diff like code.

## Manual release checklist

1. Open every file in `samples/` on the Windows, macOS and Linux builds.
2. Share from desktop to a phone browser on mobile data, to exercise NAT traversal.
3. Run the generated FreeCAD macro, OpenSCAD file and Fusion script. Change one parameter in each tool and confirm the model rebuilds.
