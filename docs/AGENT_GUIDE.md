# Using AI coding agents on ShapeBridge

This repository is set up so an AI coding agent can work on it safely and productively. The guide covers each piece (instructions, hooks, skills, MCP servers and plugins) and how to install and use it. The examples use Claude Code because the repo ships ready-made config for it. The [AGENTS.md](../AGENTS.md) section covers other agents.

> You are responsible for every line an agent writes in your PR. The agent tooling helps; it doesn't review for you.

## 1. Overview

| Piece        | File(s)                                                    | What it does                                                            | Who gets it                                                   |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Instructions | `AGENTS.md`, `CLAUDE.md`                                   | project summary, commands, rules                                        | every agent that reads AGENTS.md; Claude Code reads CLAUDE.md |
| Hooks        | `.claude/settings.json` → `scripts/hooks/*.mjs`            | format on edit, block edits to generated files, verify before finishing | Claude Code, automatically in this folder                     |
| Skills       | `.claude/skills/*/SKILL.md`                                | step-by-step playbooks: add-format, add-feature, release, triage        | Claude Code, automatically in this folder                     |
| MCP servers  | `.mcp.json`                                                | Playwright (drive the web app), GitHub                                  | Claude Code, after you approve them                           |
| Plugin       | `plugins/shapebridge/` + `.claude-plugin/marketplace.json` | `sbridge-author` skill for designing parts in any folder                | anyone who installs it                                        |
| Permissions  | `.claude/settings.json` → `permissions`                    | pre-approves safe commands (dev server, tests, git status/diff)         | Claude Code                                                   |

## 2. Quick start (Claude Code)

```bash
git clone https://github.com/gazi-faysal-jubayer/shapebridge.git
cd shapebridge
npm install
claude                 # or open the folder in the Claude desktop app / IDE extension
```

On first launch, Claude Code asks you to trust the folder (that's what activates the hooks), then asks you to approve the MCP servers in `.mcp.json`. Try:

- "Fix issue #12" (it reads the issue via `gh` or the GitHub MCP)
- `/add-format` "support .ply export"
- `/add-feature` "add a fillet feature"
- `/triage`
- `/release 0.2.0`

## 3. Instructions: AGENTS.md and CLAUDE.md

- **AGENTS.md** is the cross-agent standard file. It holds the project summary, the exact commands, and the rules that matter here: trust boundaries, bundle size, licences, clean room, and generated paths.
- **CLAUDE.md** imports AGENTS.md (`@AGENTS.md`) and adds Claude-specific notes.
- Keep both short. They load into every session, so every line costs context. Put long procedures into skills instead.

## 4. Hooks

Hooks are commands the **harness** runs at fixed points. The model can't skip them. They are defined in `.claude/settings.json`, and the scripts are plain Node, so they work the same on Windows, macOS and Linux.

| Event         | Matcher                  | Script                     | Behaviour                                                                                                                                                                       |
| ------------- | ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse`  | `Edit\|Write\|MultiEdit` | `scripts/hooks/guard.mjs`  | **blocks** (exit 2) edits to `node_modules/`, `dist/`, `src-tauri/target                                                                                                        | gen | icons/`, golden files, `package-lock.json`, `LICENSE`, and tells the agent how to change them properly |
| `PostToolUse` | `Edit\|Write\|MultiEdit` | `scripts/hooks/format.mjs` | runs Prettier on the edited file; never blocks                                                                                                                                  |
| `Stop`        | –                        | `scripts/hooks/verify.mjs` | if `src/` or config changed (per `git status`), runs `typecheck` and `vitest`; on failure, exit 2 sends the error back so the agent fixes it. `stop_hook_active` prevents loops |

**Input format:** each hook gets JSON on stdin (`tool_name`, `tool_input.file_path`, `stop_hook_active`, …). Exit `0` means OK, and exit `2` means block, with stderr shown to the agent.

**Test a hook by hand:**

```bash
echo '{"tool_input":{"file_path":"dist/index.html"}}' | node scripts/hooks/guard.mjs; echo "exit $?"   # → exit 2
echo '{"stop_hook_active":false}' | node scripts/hooks/verify.mjs; echo "exit $?"
```

**Turn hooks off for yourself:** put `"disableAllHooks": true` in `.claude/settings.local.json`, which is git-ignored. Don't remove them from the shared file.

**Add a hook:** write a Node script in `scripts/hooks/`, register it in `.claude/settings.json`, test it with piped JSON like above, and document it in this table.

## 5. Skills

A skill is a folder with a `SKILL.md`: YAML front-matter (`name`, `description`) plus instructions. Claude Code reads the descriptions, loads the full skill when a task matches, and you can also run one as a slash command. Skills marked `disable-model-invocation: true` only run when you call them.

| Skill         | Invoke                 | Use it for                                                                                   |
| ------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| `add-format`  | auto or `/add-format`  | new readers/writers, file associations, samples, FORMATS.md                                  |
| `add-feature` | auto or `/add-feature` | new parametric feature across doc model, kernel, **all** generators and golden files         |
| `release`     | `/release X.Y.Z` only  | bump 3 manifests, changelog, PR, tag (never pushes a tag without your OK)                    |
| `triage`      | `/triage` only         | apply the MAINTAINING.md triage loop with `gh`; proposes, then applies only what you approve |

**Write a new skill:** create `.claude/skills/<name>/SKILL.md`. The description should say _when_ to use the skill, with trigger words. The body should give numbered steps, the exact files and commands, and a verification step. Keep it under ~60 lines and link to docs rather than repeating them. (Claude Code's `anthropic-skills:skill-creator` skill can draft and evaluate one.)

## 6. MCP servers

MCP (Model Context Protocol) servers give the agent extra tools. Project servers live in `.mcp.json`, and Claude Code asks you to approve each one the first time.

| Server       | Why it's here                                                                                        | Setup                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `playwright` | open http://localhost:1420, click through the UI, take screenshots, and test a two-tab share session | needs `npx` (Node 18+); downloads a browser on first use |
| `github`     | read issues and PRs, comment, label (prefer the `gh` CLI if you have it)                             | run `/mcp` in Claude Code and sign in with GitHub        |

### Optional: REA (reverse-engineering toolkit)

[REA](https://github.com/morluto/rea) can inspect **our own** outputs: bundle composition (`analyze_web_bundle` on `dist/`), our generated sample files' containers, and release artifacts. Its own docs say not to commit it to `.mcp.json`, so install it per user:

```bash
npx rea-agents setup     # run outside the repo; choose Claude Code
```

Allowed uses here: our own build output and sample files we made. **Not allowed:** proprietary CAD executables or vendor files you don't have rights to analyse ([plans/native-formats-research.md](plans/native-formats-research.md)).

### Planned: `shapebridge-mcp` (M6)

A headless server exposing `open_model`, `list_params`, `set_param`, `measure` and `export`, so any agent can drive ShapeBridge itself. Tracked in the M6 milestone.

## 7. Plugins

A Claude Code plugin bundles skills, hooks, MCP servers and commands so they can be installed anywhere. This repo is also a **plugin marketplace**:

```text
/plugin install shapebridge --marketplace gazi-faysal-jubayer/shapebridge

# older Claude Code versions:
/plugin marketplace add gazi-faysal-jubayer/shapebridge
/plugin install shapebridge@shapebridge
```

The `shapebridge` plugin ships the **`sbridge-author`** skill. In _any_ folder, ask "design a 40 mm spacer with an M6 hole as a ShapeBridge part" and the agent writes a valid `.sbridge.json` that you open in ShapeBridge and export to FreeCAD, OpenSCAD, CadQuery or Fusion 360.

Repository development tooling (hooks and the four dev skills) is **not** in the plugin. It loads automatically from `.claude/` whenever you work inside this repo.

**Add to the plugin:** put skills in `plugins/shapebridge/skills/<name>/SKILL.md`. Hooks would go in `plugins/shapebridge/hooks/hooks.json` and MCP servers in `plugins/shapebridge/.mcp.json`, using `${CLAUDE_PLUGIN_ROOT}` for paths. Bump `version` in both `plugin.json` and `marketplace.json`, then run `claude plugin validate plugins/shapebridge` before opening the PR.

## 8. Other agents

| Agent                | What it reads                                             | Notes                                               |
| -------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| OpenAI Codex CLI     | `AGENTS.md`                                               | run the commands in AGENTS.md before finishing      |
| Cursor               | `AGENTS.md` (plus `.cursor/rules` if you add one)         | MCP: copy `.mcp.json` entries to `.cursor/mcp.json` |
| GitHub Copilot agent | `AGENTS.md`, `.github/copilot-instructions.md` if present | runs CI from `build_all.yml`                        |
| Gemini CLI           | `AGENTS.md` (configure `contextFileName`)                 |                                                     |

Hooks are Claude Code-specific, but the scripts are plain Node. You can wire the same scripts into other tools' hook systems, or into a git pre-commit hook.

## 9. Recommended workflow for an agent-made PR

1. Pick an issue and comment `/assign`.
2. Branch: `git switch -c viewer/section-plane`.
3. Ask the agent to read the issue and the relevant skill, then plan before editing.
4. Let the hooks do their job: formatting, the guard, and the verify-on-stop step.
5. For UI changes, have it run `npm run dev` and check the result with Playwright (or the Claude desktop browser pane), with screenshots in the PR.
6. Open the PR with the template filled in. CI builds installers for every OS.

## 10. Troubleshooting

| Symptom                           | Fix                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Hooks don't run                   | the folder isn't trusted, or `disableAllHooks` is set in local settings; check with `/hooks` in a terminal session |
| Stop hook loops or is slow        | it only runs when `src/` or config changed; make sure tests pass with `npx vitest run`                             |
| `prettier` not found in a hook    | run `npm install`                                                                                                  |
| MCP server missing                | `/mcp` lists servers and their status; approve or re-authenticate there                                            |
| Agent edits golden files directly | the guard blocks it; change the generator, then `npx vitest run -u`                                                |
