# Security & privacy

## Principles

1. **Local-first.** No accounts, no telemetry, no upload server.
2. **Sharing is peer-to-peer.** Model bytes travel only over WebRTC data channels (DTLS) between the host and the viewers who hold the link.
3. **Least privilege on desktop.** Tauri capabilities allow only `dialog:allow-save` and writing the file the user picked.

## Live-share threat model

| Threat | Mitigation |
|---|---|
| Relay operators read signalling | Trystero encrypts SDP/ICE with the room password (a random 128-bit key) |
| The link leaks the key to servers | the key lives in the URL `#fragment`, which browsers never send to servers |
| Someone guesses the room | 64-bit room id plus 128-bit key; signalling can't be decrypted without the key |
| A guest impersonates the host | only the first peer announcing itself as host may send state, permissions, comment sync or kick; hosts ignore those messages entirely (`HOST_ONLY` in `src/share/protocol.ts`) |
| Malformed or oversized messages | every message is rebuilt field by field by `parseMsg`: types, enums, ranges, string and array limits; unknown fields are dropped (tested with hostile inputs) |
| The link is forwarded to the wrong person | the host sees everyone by name, can remove a viewer, set an expiry, or issue a **New link** (old key stops working) |
| A malicious host sends a crafted file | parsers run inside the webview sandbox; the filename is sanitised; size is capped at 512 MB; the file count is clamped |
| A malicious `.sbridge.json` | strict validation and our own expression parser, no `eval` (see ARCHITECTURE.md, trust boundaries) |
| Generated scripts are used to inject code into FreeCAD or Fusion | only identifiers and `JSON.stringify`-escaped literals are emitted; covered by tests |
| IP address exposure | inherent to WebRTC and documented; the optional TURN relay setting hides direct IPs |

## What "view-only" and "remove" really mean

- **View-only** hides export for viewers, but the model's bytes are already in their browser. It's a courtesy, not DRM. Don't share files a viewer must never possess.
- **Remove** asks that viewer's app to leave. A modified client could ignore it and rejoin with the same link. **New link** is the real revocation: it closes the room, and the old key is useless.

## Open items

- ~~Strict CSP~~ done in v0.2 (meta tag shared by web and desktop); `'unsafe-eval'` remains for the CDN OCCT reader until readers are vendored · M2
- Vendor the CDN readers with SRI hashes · M1
- Signed releases and reproducible-build notes · M6
- Dependency audit in CI (`npm audit --omit=dev`, `cargo audit`) · M0 follow-up

## Reporting

See [SECURITY.md](../../SECURITY.md).
