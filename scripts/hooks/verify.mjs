// Claude Code Stop hook: before an agent finishes, typecheck and run tests if source changed.
// Exit code 2 sends the failure back to the agent so it fixes it; stop_hook_active prevents loops.
import { execSync } from "node:child_process";

const input = JSON.parse(await new Response(process.stdin).text() || "{}");
if (input.stop_hook_active) process.exit(0);

let changed = "";
try {
  changed = execSync("git status --porcelain -- src scripts vite.config.ts tsconfig.json package.json", { encoding: "utf8" });
} catch {
  process.exit(0); // not a git checkout: nothing to compare against
}
if (!changed.trim()) process.exit(0);

for (const cmd of ["npm run typecheck --silent", "npx vitest run --reporter=dot"]) {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8" });
  } catch (e) {
    console.error(`"${cmd}" failed. Fix it before finishing:\n${String(e.stdout ?? "").slice(-3000)}${String(e.stderr ?? "").slice(-1000)}`);
    process.exit(2);
  }
}
