# Security policy

## Supported versions

Only the latest release receives fixes while the project is on 0.x.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's [private vulnerability reporting](https://github.com/gazi-faysal-jubayer/shapebridge/security/advisories/new) instead.

Include the affected version or commit, the OS or browser, reproduction steps, and the impact. Expect an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for high-severity issues.

## Especially interesting areas

- Live share: anything that lets a non-invited party read a shared model, or lets a peer execute code on another peer.
- Parsing: crafted CAD files or `.sbridge.json` that escape the webview sandbox or cause code execution.
- Generated scripts: any input that makes a FreeCAD, OpenSCAD, CadQuery or Fusion export run unintended code.
- Desktop: Tauri capability escapes and file-system access beyond the file the user picked.

The threat model is in [docs/plans/security-privacy.md](docs/plans/security-privacy.md).
