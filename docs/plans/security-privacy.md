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
| The link is forwarded to the wrong person | the host sees the viewer count and can **Stop sharing** to end the room; per-viewer revoke and expiry are planned (M4) |
| A malicious host sends a crafted file | parsers run inside the webview sandbox; the filename is sanitised; size is capped at 512 MB; the file count is clamped |
| A malicious `.sbridge.json` | strict validation and our own expression parser, no `eval` (see ARCHITECTURE.md, trust boundaries) |
| Generated scripts are used to inject code into FreeCAD or Fusion | only identifiers and `JSON.stringify`-escaped literals are emitted; covered by tests |
| IP address exposure | inherent to WebRTC and documented; a TURN relay option (M4) hides direct IPs |

## Open items

- Add a strict CSP to `tauri.conf.json` that allows jsDelivr for readers and wss for Nostr relays · M1
- Vendor the CDN readers with SRI hashes · M1
- Signed releases and reproducible-build notes · M6
- Dependency audit in CI (`npm audit --omit=dev`, `cargo audit`) · M0 follow-up

## Reporting

See [SECURITY.md](../../SECURITY.md).
