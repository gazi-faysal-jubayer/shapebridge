// Claude Code PreToolUse hook: blocks edits to generated or vendored files.
// Exit code 2 blocks the tool call and shows stderr to the agent.
const input = JSON.parse(await new Response(process.stdin).text() || "{}");
const file = String(input.tool_input?.file_path ?? "").replace(/\\/g, "/");

const blocked = [
  [/\/node_modules\//, "node_modules is installed by npm; change package.json instead"],
  [/\/dist\//, "dist/ is build output; edit src/ and run npm run build"],
  [/\/src-tauri\/(target|gen)\//, "src-tauri/target and gen are build output"],
  [/\/src-tauri\/icons\//, "icons are generated: edit assets/logo/logo.svg and run npm run icons"],
  [/\/__golden__\//, "golden files are snapshots: change the generator, then run npx vitest run -u and review the diff"],
  [/package-lock\.json$/, "package-lock.json is written by npm install"],
  [/\/LICENSE$/, "the licence text must not be edited by an agent"],
];

for (const [re, why] of blocked) {
  if (re.test(file)) {
    console.error(`Blocked edit to ${file}: ${why}.`);
    process.exit(2);
  }
}
