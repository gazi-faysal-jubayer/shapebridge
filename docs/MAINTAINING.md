# Maintaining ShapeBridge

This repository's issue, PR and build workflow is modelled on [OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer): structured issue forms, a label taxonomy, installers built for every PR, a rolling nightly release, and bots for labels, assignment and stale threads. The files are our own; OrcaSlicer is AGPL, so nothing was copied.

## Issues

### Intake

Blank issues are disabled. Each form adds labels automatically:

| Form               | Labels                     | Asks for                                                     |
| ------------------ | -------------------------- | ------------------------------------------------------------ |
| 🐞 Bug report      | `bug`, `To be validated`   | nightly check, version, platform, area, format, steps, files |
| 💥 Crash report    | `crash`, `To be validated` | when/how often, logs, triggering file                        |
| ✨ Feature request | `enhancement`              | area, problem, solution, offer to implement                  |
| 📦 Format request  | `format`, `enhancement`    | producer app, direction, spec/licence, self-made sample      |

Questions go to Discussions (Q&A). Security reports go to private advisories.

### Triage loop

```
To be validated ──reproduced──▶ remove "To be validated", add area label (+ priority, milestone)
       │
       ├─ need details ──▶ "Need more information"  (stale bot: reminder at 30 days, closes 14 days later)
       ├─ can't reproduce ──▶ "Non reproducible", close
       ├─ duplicate ──▶ "duplicate", close with a link
       └─ third-party bug ──▶ "upstream bug" + link to the upstream issue
```

- Fixed in `main` but not released yet: add `nightly build` so reporters know where to test.
- Wanted but not soon: add `help wanted`. Small and well-scoped: add `good first issue`.
- Contributors comment `/assign` to claim an issue. The assign bot reminds them after 7 days and releases the claim after 21. Maintainers can always assign by hand.

## Pull requests

1. **Bot greeting:** first-time and outside contributors get a comment explaining `/bot add-label …` and where to find the test installers.
2. **Build all** runs on every PR:
   - `Web · typecheck, tests, build` is the **required** check. Its job summary shows the test count and bundle sizes.
   - Windows x64, macOS arm64, macOS x64 and Linux x64 installers are uploaded as artifacts for 14 days.
   - New pushes cancel the previous run. Closing the PR cancels any running build (`cancel_closed_pr_builds.yml`).
3. **Review:** CODEOWNERS requests the maintainer. Check the PR template checklist, especially the bundle size and licence lines.
4. **Asking the author for changes:** add `wait for response`. The stale bot pings after 60 days and closes 14 days later. Draft PRs are exempt.
5. **Ask for testing:** add `Community testers wanted` and point people at the artifacts.
6. **Merge:** squash-merge with a conventional title (`viewer: add section plane`).

### Branch protection (`main`)

- Changes go through a PR. Force-pushes and deletion are blocked.
- Required check: `Web · typecheck, tests, build`.
- Linear history (squash merges).
- The maintainer can bypass in an emergency.

## Builds

| Workflow              | Trigger                                | Output                                                                                 |
| --------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `build_all.yml`       | every push/PR to `main` or `release/*` | web + 4 desktop artifacts; on `main`, updates the **nightly-builds** pre-release       |
| `pages.yml`           | push to `main`                         | web viewer at https://gazi-faysal-jubayer.github.io/shapebridge/ (share links open it) |
| `publish_release.yml` | tag `v*`                               | draft release with installers for every OS                                             |
| `stale.yml`           | daily                                  | stale handling as above                                                                |
| `assign.yml`          | `/assign` comments, daily              | assignment bookkeeping                                                                 |
| `pr-label-bot.yml`    | PR opened, `/bot` comments             | self-service labels                                                                    |
| Dependabot            | monthly                                | grouped npm/cargo minor updates, action majors                                         |

## Labels

Run `node scripts/github-setup.mjs` to create or update every label, milestone and roadmap issue from [.github/roadmap.json](../.github/roadmap.json). The script is idempotent, so it's safe to re-run after editing the JSON.

- **Kind:** `bug`, `crash`, `regression`, `enhancement`, `QoL`, `optimization`, `bug-fix`, `SECURITY`, `format`
- **Area:** `viewer`, `converter`, `parametric`, `interop`, `share`, `desktop`, `web`, `UI/UX`
- **Infrastructure:** `build`, `test`, `dependencies`, `documentation`, `github_actions`, `agent-tooling`
- **Workflow:** `To be validated`, `Need more information`, `wait for response`, `Non reproducible`, `duplicate`, `wontfix`, `upstream bug`, `nightly build`, `Community testers wanted`, `stale`
- **Contributor:** `good first issue`, `help wanted`
- **Priority:** `priority: p0` (broken for everyone), `p1` (next release), `p2` (later)

## Releases

See [plans/release-distribution.md](plans/release-distribution.md). In short: run the `release` skill (or bump the versions by hand), update the CHANGELOG, tag, check the draft release on each OS, then publish.
