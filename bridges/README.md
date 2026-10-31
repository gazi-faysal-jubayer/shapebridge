# Bridges

Bridges open proprietary native CAD files (SolidWorks, Inventor, CATIA, NX, Solid Edge, Creo, Fusion 360) by asking **the user's own installed copy** of that tool to export STEP. No vendor code ships with ShapeBridge.

Status: design stage (milestone **M2b**). Each bridge is a separate issue.

## Contract

```
bridges/<app>/
  bridge.json      { "name", "extensions": [...], "platforms": ["windows"], "detect": {...}, "run": "export.ps1" }
  export.ps1|.py   receives: <input path> <output dir>
                   writes:   <output dir>/<name>.step
                   optional: <output dir>/<name>.params.json   [{ "name", "value", "unit", "expr"? }]
                   exit 0 on success; human-readable errors on stderr
  README.md        tested versions, licence notes, how to run it by hand
```

The Rust side (planned) detects installed apps, runs the script with a timeout, streams progress, and opens the STEP.

## Rules

- Use only the vendor's **public automation API** (COM, NXOpen, J-Link, the Fusion API) through the user's licence.
- Never redistribute vendor DLLs or SDK files.
- See [docs/plans/native-formats-research.md](../docs/plans/native-formats-research.md).
