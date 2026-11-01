// Checks the real desktop app, Windows first. Installs a CI-built installer (no Rust needed), starts it with
// WebView2 remote debugging, drives it over CDP, and prints a pass/fail table.
//   npm run check:desktop                    latest green CI build of this branch, else nightly
//   npm run check:desktop -- --from nightly  the nightly-builds release
//   npm run check:desktop -- --from <setup.exe>
//   npm run check:desktop -- --dev           `tauri dev` instead of an installer (needs Rust)
//   add --keep to leave the app running on the debugging port for the `desktop` MCP
// Linux/macOS: pass --bin <path to the app binary> for a launch check; their webviews have no CDP.
import { execFileSync, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] ?? true) : def);
const PORT = Number(opt("port", 9222));
const OUT = "desktop-check";
const REPO = "gazi-faysal-jubayer/shapebridge";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: String(detail ?? "") });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
};
const report = () => {
  console.log("\n| check | result | detail |\n|---|---|---|");
  for (const r of results) console.log(`| ${r.name} | ${r.ok ? "pass" : "FAIL"} | ${r.detail.replace(/\n/g, " ").slice(0, 160)} |`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
};

if (process.platform !== "win32") {
  const bin = opt("bin");
  if (!bin) {
    console.log("UI checks need Windows (WebView2 is the only desktop webview with CDP). Pass --bin <app binary> for a launch check;");
    console.log("CI's desktop jobs run the same launch check on Linux and macOS for every PR.");
    process.exit(0);
  }
  await check("launch", () =>
    execFileSync(process.execPath, ["scripts/smoke-launch.mjs", bin, join(OUT, "launch.png")], { encoding: "utf8" }),
  );
  report();
}

// ---------- get and install the app ----------
const APP = join(process.env.LOCALAPPDATA, "ShapeBridge", "shapebridge.exe");
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }).trim();
const findSetup = (dir) => {
  for (const f of readdirSync(dir, { recursive: true })) if (/_x64-setup\.exe$/.test(f)) return join(dir, f);
  throw new Error(`no *_x64-setup.exe in ${dir}`);
};
function installer() {
  const from = opt("from", "branch");
  if (typeof from === "string" && from.endsWith(".exe")) return { file: from, source: from };
  const dir = mkdtempSync(join(tmpdir(), "sb-installer-"));
  if (from !== "nightly") {
    const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
    const runs = JSON.parse(
      gh(
        "run",
        "list",
        "-R",
        REPO,
        "--workflow",
        "build_all.yml",
        "--branch",
        branch,
        "--status",
        "success",
        "--limit",
        "1",
        "--json",
        "databaseId,headSha",
      ),
    );
    if (runs.length) {
      gh("run", "download", String(runs[0].databaseId), "-R", REPO, "-n", "ShapeBridge-Windows-x64", "-D", dir);
      return { file: findSetup(dir), source: `CI run ${runs[0].databaseId} (${branch} @ ${runs[0].headSha.slice(0, 7)})` };
    }
    console.log(`No green CI build for ${branch}; using the nightly-builds release.`);
  }
  gh("release", "download", "nightly-builds", "-R", REPO, "-p", "*_x64-setup.exe", "-D", dir, "--clobber");
  return { file: findSetup(dir), source: "nightly-builds" };
}

const wasRunning = execSync('tasklist /FI "IMAGENAME eq shapebridge.exe"', { encoding: "utf8" }).includes("shapebridge.exe");
const quit = () => {
  try {
    execSync("taskkill /IM shapebridge.exe /F", { stdio: "ignore" });
  } catch {
    // not running
  }
};
quit();

let app;
if (opt("dev")) {
  app = spawn("npx", ["tauri", "dev"], {
    shell: true,
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    stdio: "inherit",
  });
  results.push({ name: "build", ok: true, detail: "tauri dev" });
} else {
  await check("install", () => {
    const { file, source } = installer();
    execFileSync(file, ["/S"]); // per-user NSIS install, no admin prompt
    if (!existsSync(APP)) throw new Error(`installer finished but ${APP} is missing`);
    const version = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShapeBridge" /v DisplayVersion', {
      encoding: "utf8",
    }).match(/REG_SZ\s+(\S+)/)?.[1];
    return `${version ?? "?"} from ${source}`;
  });
  if (!results.at(-1).ok) report();
  app = spawn(APP, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    detached: true,
    stdio: "ignore",
  });
}

// ---------- drive it over CDP ----------
let ws;
let seq = 0;
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const onMsg = (m) => {
      const d = JSON.parse(m.data);
      if (d.id !== id) return;
      ws.removeEventListener("message", onMsg);
      d.error ? reject(new Error(d.error.message)) : resolve(d.result);
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (fn) => {
  const r = await call("Runtime.evaluate", { expression: `(${fn})()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await check("starts and stays up", async () => {
  const t = Date.now();
  while (Date.now() - t < (opt("dev") ? 600_000 : 30_000)) {
    if (app.exitCode !== null) throw new Error(`exited with code ${app.exitCode}`);
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((p) => p.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
        return `window "${page.title}" after ${Math.round((Date.now() - t) / 1000)} s`;
      }
    } catch {
      // the webview is not listening yet
    }
    await sleep(500);
  }
  throw new Error("no WebView2 page on the debugging port");
});
if (!ws) report();

await check("ribbon", async () => {
  await evaluate(
    `async () => { for (let i = 0; i < 40 && !document.querySelector(".ribbon-tabs"); i++) await new Promise((r) => setTimeout(r, 250)); }`,
  );
  const tabs = await evaluate(`() => [...document.querySelectorAll(".ribbon-tabs [role=tab]")].map((b) => b.textContent)`);
  if (tabs.length < 6) throw new Error(`tabs: ${tabs.join(", ") || "none"}`);
  return tabs.join(", ");
});

const openFromLibrary = (label, wait) =>
  evaluate(`async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const status = () => document.querySelector("footer")?.innerText.replace(/\\n/g, " · ") ?? "";
    document.querySelector('.task-tabs button[aria-label="Design library"]')?.click();
    await w(200);
    const b = [...document.querySelectorAll(".library button")].find((b) => b.textContent.toLowerCase().includes(${JSON.stringify(label)}));
    if (!b) throw new Error("not in the Design library");
    b.click();
    const t = performance.now();
    while (performance.now() - t < ${wait}) {
      await w(300);
      if (/Opened ${label.split(".")[0]}/i.test(status())) return status() + " in " + Math.round(performance.now() - t) + " ms";
      if (/fail|error|could not/i.test(status())) throw new Error(status());
    }
    throw new Error("timed out: " + status());
  }`);
for (const f of ["plate.step", "plate.stl", "assembly.step"]) await check(`open ${f}`, () => openFromLibrary(f, 60_000));
await check("parametric build (bracket)", async () => {
  const s = await openFromLibrary("bracket", 120_000);
  const n = await evaluate(`() => document.querySelectorAll("li.feature").length`);
  if (!n) throw new Error("no features in the tree");
  return `${n} features · ${s}`;
});

await check("screenshot", async () => {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `windows-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
  writeFileSync(file, Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64"));
  return file;
});

if (!opt("dev"))
  await check("app icon is the current logo", () => {
    // compare the exe's 32 px icon with the committed one; an old or default icon differs by far more than resampling noise
    const ps = `Add-Type -AssemblyName System.Drawing
$a = ([System.Drawing.Icon]::ExtractAssociatedIcon('${APP}')).ToBitmap()
$b = New-Object System.Drawing.Bitmap ([System.Drawing.Image]::FromFile('${join(process.cwd(), "src-tauri/icons/32x32.png")}')), 32, 32
$d = 0; for ($x = 0; $x -lt 32; $x++) { for ($y = 0; $y -lt 32; $y++) { $p = $a.GetPixel($x, $y); $q = $b.GetPixel($x, $y)
  $d += [math]::Abs($p.R - $q.R) + [math]::Abs($p.G - $q.G) + [math]::Abs($p.B - $q.B) } }
[math]::Round($d / (32 * 32 * 3), 1)`;
    const diff = Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
    if (!(diff < 20)) throw new Error(`exe icon differs from src-tauri/icons/32x32.png (mean ${diff}/255)`);
    return `mean difference ${diff}/255`;
  });

// leave no debugging port open (unless --keep, for the `desktop` MCP); restore the app if the user had it running
ws?.close();
if (opt("keep")) console.log(`\nThe app is still running with its debugging port on ${PORT}; the desktop MCP can attach now.`);
else if (opt("dev")) app.kill();
else {
  quit();
  if (wasRunning) spawn(APP, [], { detached: true, stdio: "ignore" }).unref();
}
report();
