@AGENTS.md

## Claude Code specifics

- Hooks in `.claude/settings.json` format edited files with Prettier, block edits to generated paths, and run typecheck + tests before you finish (only when `src/` or config changed). If the Stop hook reports a failure, fix it rather than working around it.
- Skills: `/add-format`, `/add-feature`, `/release` (user-invoked), `/triage` (user-invoked). Read the matching skill before starting that kind of task.
- A SessionStart hook runs `scripts/hooks/ensure-rea.mjs`, which installs REA if it is missing. Use the `rea` MCP tools as AGENTS.md describes.
- UI checks, **desktop first**: `npm run check:desktop -- --keep` installs and checks the Windows app and leaves it running, then the `desktop` MCP (Playwright over CDP on port 9222) can click through the running app. Use the `playwright` MCP on the web app (http://localhost:1420) only after that.
- `.mcp.json` offers rea, desktop, Playwright and GitHub. Each needs the user's approval on first use.
- See docs/AGENT_GUIDE.md for everything else.
