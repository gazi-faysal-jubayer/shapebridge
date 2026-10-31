# Release & distribution

## Versioning

SemVer. The project stays on `0.x` while the `.sbridge.json` format may still change. Every format change ships a migration in `model/doc.ts`.

## Pipeline

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. The `release` agent skill does all three.
2. Update `CHANGELOG.md`.
3. `git tag vX.Y.Z && git push --tags`.
4. `publish_release.yml` builds Windows (.msi, .exe), macOS (aarch64 and x86_64 .dmg) and Linux (.AppImage, .deb, .rpm) into a **draft** GitHub Release.
5. Run the manual checklist in [testing-strategy.md](testing-strategy.md), then publish the draft.
6. `pages.yml` deploys the web viewer on every push to `main`.

## Unsigned builds (until M6)

- **Windows:** SmartScreen shows a warning. Click *More info → Run anyway*.
- **macOS:** right-click the app and choose *Open*, or run `xattr -dr com.apple.quarantine /Applications/ShapeBridge.app`.
- **Linux:** `chmod +x ShapeBridge*.AppImage`.

## Signing and updates (M6)

- Windows Authenticode via a cloud HSM or SignPath (free for open-source projects).
- Apple Developer ID and notarytool. Secrets: `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- Tauri updater plugin with a signing key; the update manifest is hosted on GitHub Releases.

## Channels (M6)

| Channel | Package |
|---|---|
| winget | `ShapeBridge.ShapeBridge` manifest PR to microsoft/winget-pkgs |
| Homebrew | cask in a `homebrew-tap` repo, later upstream |
| Flathub | `io.github.gazi_faysal_jubayer.ShapeBridge` |
| AUR | `shapebridge-bin` |
