// Claude Code PostToolUse hook: formats the file an agent just edited with Prettier.
// Never blocks: formatting problems are reported but don't stop the agent.
import { execFileSync } from "node:child_process";

const input = JSON.parse((await new Response(process.stdin).text()) || "{}");
const file = input.tool_input?.file_path;
if (file && /\.(tsx?|mjs|js|css|json|md|ya?ml|html)$/.test(file) && !/node_modules|[\\/]dist[\\/]|__golden__/.test(file)) {
  try {
    // Windows needs a shell to run npx.cmd, and the shell needs the path quoted
    const win = process.platform === "win32";
    execFileSync(win ? "npx.cmd" : "npx", ["prettier", "--write", "--log-level", "warn", win ? `"${file}"` : file], {
      stdio: "inherit",
      shell: win,
    });
  } catch {
    console.error(`prettier could not format ${file}`);
  }
}
