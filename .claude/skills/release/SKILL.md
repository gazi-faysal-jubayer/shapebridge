---
name: release
description: Prepare a ShapeBridge release - bump versions in all three manifests, move the changelog, tag, and explain the draft-release check. Use when asked to release, cut a version, bump the version or publish installers.
disable-model-invocation: true
---

# Release ShapeBridge

Argument: the new version, `X.Y.Z` (SemVer; stay on 0.x while `.sbridge.json` may change).

1. Check that you're on an up-to-date `main` with a clean tree, and that the last **Build all** run on `main` is green: `gh run list --workflow build_all.yml --branch main --limit 1`.
2. Set the version to `X.Y.Z` in **all three**: `package.json` (`version`), `src-tauri/tauri.conf.json` (`version`) and `src-tauri/Cargo.toml` (`[package] version`). Then run `npm install --package-lock-only` to update the lock file.
3. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today) and add a fresh empty `## [Unreleased]` above it.
4. Run `npm run typecheck && npx vitest run && npm run build`.
5. Commit `release: vX.Y.Z` on a branch and open a PR. After it merges: `git tag vX.Y.Z && git push origin vX.Y.Z`.
6. `publish_release.yml` creates a **draft** release.
   - Check the **Windows installer first**: `npm run check:desktop -- --from <path to the draft's setup.exe>`.
   - Ask the user to run the manual checklist in `docs/plans/testing-strategy.md` on Linux and macOS.
   - Check the web build last.
   - Then publish the draft.
7. Once per release, check for a newer REA (`npm view rea-agents version`) and bump it everywhere the agent guide lists.

Never push tags or publish releases without the user's explicit go-ahead.
