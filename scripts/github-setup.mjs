// Creates or updates labels, milestones and roadmap issues from .github/roadmap.json with the gh CLI.
// Idempotent: existing labels are updated, existing milestones/issues (matched by title) are skipped.
// Usage: node scripts/github-setup.mjs [owner/repo] [--dry-run]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const repo = args.find((a) => !a.startsWith("--")) ?? "gazi-faysal-jubayer/shapebridge";
const roadmap = JSON.parse(readFileSync(new URL("../.github/roadmap.json", import.meta.url), "utf8"));

const gh = (...a) => (dry ? (console.log("gh", a.join(" ")), "[]") : execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 << 20 }));
const json = (...a) => JSON.parse(gh(...a) || "[]");

// labels
for (const l of roadmap.labels) {
  gh("label", "create", l.name, "--repo", repo, "--color", l.color, "--description", l.description, "--force");
}
console.log(`labels: ${roadmap.labels.length} created/updated`);

// milestones
const existingMs = dry ? [] : json("api", `repos/${repo}/milestones?state=all&per_page=100`);
for (const m of roadmap.milestones) {
  if (existingMs.some((e) => e.title === m.title)) continue;
  gh("api", `repos/${repo}/milestones`, "-f", `title=${m.title}`, "-f", `description=${m.description}`);
}
console.log(`milestones: ${roadmap.milestones.length} ensured`);

// issues
const existing = new Set(
  dry ? [] : json("issue", "list", "--repo", repo, "--state", "all", "--limit", "1000", "--json", "title").map((i) => i.title),
);
let created = 0;
for (const i of roadmap.issues) {
  if (existing.has(i.title)) continue;
  const body = [
    `## Goal\n\n${i.goal}`,
    `## Acceptance criteria\n\n${i.accept.map((a) => `- [ ] ${a}`).join("\n")}`,
    i.files.length ? `## Likely files\n\n${i.files.map((f) => `- \`${f}\``).join("\n")}` : "",
    `## Size\n\n${i.size} (S ≤ 1 day, M ≤ 3 days, L ≤ 2 weeks)`,
    `---\nFrom the roadmap in [docs/PLAN.md](https://github.com/${repo}/blob/main/docs/PLAN.md). Comment \`/assign\` to claim it.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  gh(
    "issue",
    "create",
    "--repo",
    repo,
    "--title",
    i.title,
    "--body",
    body,
    "--milestone",
    i.milestone,
    ...i.labels.flatMap((l) => ["--label", l]),
  );
  created++;
}
console.log(`issues: ${created} created, ${roadmap.issues.length - created} already existed`);
