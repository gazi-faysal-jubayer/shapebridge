// Every agent in this repo uses REA (https://github.com/morluto/rea). Claude Code runs this at session start;
// other agents run `node scripts/hooks/ensure-rea.mjs` first (AGENTS.md). Installs REA when it is missing.
import { execSync } from "node:child_process";
import { join } from "node:path";

// keep in sync with the rea entries in .mcp.json, .cursor/, .gemini/, .vscode/ and .codex/
const VERSION = "6.5.0";
const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const version = (bin) => {
  try {
    return run(`"${bin}" --version`).match(/\d+\.\d+\.\d+/)?.[0];
  } catch {
    return undefined;
  }
};

let found = version("rea");
if (!found) {
  console.error(`REA is not installed; installing rea-agents@${VERSION} globally…`);
  try {
    run(`npm install --global rea-agents@${VERSION}`);
    // look in npm's global bin directly: a fresh install may not be on this shell's PATH yet
    const prefix = run("npm prefix --global");
    found = version(process.platform === "win32" ? join(prefix, "rea.cmd") : join(prefix, "bin", "rea"));
  } catch (e) {
    console.error(`Installing REA failed: ${e.message}\nInstall it by hand: npm install --global rea-agents@${VERSION}`);
    process.exit(1);
  }
}
console.log(
  `REA ${found} is ready. Use the rea MCP tools (or the rea CLI) as AGENTS.md describes: ` +
    "analyze our dist/ and desktop binaries after builds, and only ever our own artifacts or open-source dependencies.",
);
