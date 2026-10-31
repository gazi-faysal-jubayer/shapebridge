# Native formats: bridges and clean-room research

## Why ShapeBridge can't just read SLDPRT

SolidWorks, Inventor, CATIA, NX, Creo and Fusion store models in closed formats built around licensed kernels: Parasolid, ACIS, ShapeManager, CGM and Granite. No open-source reader exists. Commercial SDKs (HOOPS Exchange, ODA, CAD Exchanger) cost thousands per year and can't ship in an Apache-2.0 app.

## Strategy 1: bridges (works today wherever the user owns the tool)

A bridge is a small script in `bridges/<app>/` that asks the user's own installed copy of the tool to export STEP, plus parameters where possible. The Rust side:

1. detects the app (registry keys on Windows, `/Applications` on macOS),
2. runs the script with a timeout and progress events,
3. opens the resulting STEP in the viewer.

Every bridge follows this contract:

```
input:  absolute path of the native file
output: <tmp>/<name>.step  and optionally <tmp>/<name>.params.json  ([{name, value, unit, expr?}])
exit 0 on success; stderr carries a human-readable error
```

## Strategy 2: preview thumbnails (no host app needed)

Many native files are OLE compound documents or zips that embed a preview bitmap, and sometimes a lightweight tessellation. Reading **containers** we can inspect ourselves is ordinary file parsing: list the streams, then decode a PNG or BMP. That answers "what is this file?" without any vendor code.

## Strategy 3: clean-room format research (long term)

Allowed: documenting a format's structure from **sample files we create ourselves**, using hex and structure analysis, for interoperability. The EU Software Directive (2009/24/EC, Art. 6) and US DMCA §1201(f) protect this, within limits.

Not allowed in this project:

- decompiling or disassembling vendor executables or DLLs,
- using leaked SDKs or documentation,
- contributions from anyone bound by a vendor NDA on that format.

Each research spike produces `docs/formats/<format>.md` (structure notes) and a reader behind an "experimental" flag. Candidates, most feasible first:

1. Parasolid text `x_t`, largely described in public literature.
2. ACIS text `sat`, older versions publicly described.
3. JT, since ISO 14306 is a published standard.

## Tooling note

The REA MCP (see AGENT_GUIDE.md) may inspect **our own sample files and our own build outputs**: containers, strings, sqlite/plist streams and bundle sizes. Do not point it at proprietary CAD executables.
