@AGENTS.md

## Claude Code specifics

- Hooks in `.claude/settings.json` format edited files with Prettier, block edits to generated paths, and run typecheck + tests before you finish (only when `src/` or config changed). If the Stop hook reports a failure, fix it rather than working around it.
- Skills: `/add-format`, `/add-feature`, `/release` (user-invoked), `/triage` (user-invoked). Read the matching skill before starting that kind of task.
- `.mcp.json` offers Playwright (drive the web app at http://localhost:1420 for UI checks) and GitHub. Both need the user's approval on first use.
- See docs/AGENT_GUIDE.md for everything else.
