# Contributing to ShapeBridge

Thanks for helping! Small, focused PRs are the fastest way in.

## Setup

```bash
npm install
npm run dev            # http://localhost:1420
npm test -- --run      # must pass before you push
npm run typecheck
```

For the desktop shell, install the [Tauri prerequisites](https://tauri.app/start/prerequisites/), then run `npm run tauri dev`. CI builds every OS, so you only need your own.

## Where to start

- Issues labelled [`good first issue`](https://github.com/gazi-faysal-jubayer/shapebridge/labels/good%20first%20issue).
- [docs/PLAN.md](docs/PLAN.md) shows what each milestone needs.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains where code lives.

## Rules of the road

- **One concern per PR.** Link the issue (`Closes #12`).
- **Tests:** bug fixes start with a failing test. New formats add a sample and a smoke test. New parametric features update **every** interop generator and its golden file (`npx vitest run -u`, then review the diff).
- **Size:** state the gzip size of any new runtime dependency. Anything over 30 KB must be lazy-loaded ([performance budget](docs/plans/performance-budget.md)).
- **Licences:** only Apache, MIT, BSD, ISC, MPL, or LGPL as a separately loaded module. No GPL code in the core.
- **Clean room:** never contribute code or knowledge from decompiled vendor software, leaked SDKs, or under an NDA ([native-formats-research.md](docs/plans/native-formats-research.md)).
- **Style:** Prettier defaults with a 140-column width. Match the surrounding code. Comment only the *why*.

## Using AI coding agents

This repo ships hooks, skills and a plugin for Claude Code, plus `AGENTS.md` for other agents. See [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md). You are responsible for every line an agent writes in your PR.

## Commit messages

Imperative mood, with an optional area prefix: `viewer: add section plane`, `interop(freecad): bind placement to spreadsheet`.

## Licence

By contributing, you agree that your contribution is licensed under Apache-2.0.
