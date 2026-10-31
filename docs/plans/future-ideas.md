# Future ideas (unscheduled)

- **Real-time co-editing** of a `.sbridge.json` over the same P2P room (a CRDT via Yjs), so the boss can change a parameter too.
- **Mobile viewer:** the web viewer as a PWA first, then Tauri mobile (iOS and Android).
- **AI parameter assistant:** "make it 20% lighter" adjusts parameters using mass properties. Exposed through `shapebridge-mcp` so any agent can drive it.
- **Text-to-part:** natural language → `.sbridge.json` via MCP, validated by `resolve()`.
- **PDM-lite:** git-backed version history of parts, with a visual 3D diff that highlights the boolean difference.
- **AR preview:** export USDZ or glTF for phone AR quick-look.
- **Drawing generator:** automatic 3-view drawings dimensioned from the parameters.
- **Plugin API:** third-party importers, exporters and bridges as signed WASM plugins.
- **Print prep:** orientation, a supports preview, and direct send to OctoPrint, Bambu or Prusa Connect.
