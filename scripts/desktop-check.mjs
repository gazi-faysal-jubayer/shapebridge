// Checks the real desktop app, Windows first. Installs a CI-built installer (no Rust needed), starts it with
// WebView2 remote debugging, drives it over CDP, and prints a pass/fail table.
//   npm run check:desktop                    latest green CI build of this branch, else nightly
//   npm run check:desktop -- --from nightly  the nightly-builds release
//   npm run check:desktop -- --from local    build this checkout with `tauri build` first (needs Rust)
//   npm run check:desktop -- --from <setup.exe>
//   npm run check:desktop -- --dev           `tauri dev` instead of an installer (needs Rust)
//   add --keep to leave the app running on the debugging port for the `desktop` MCP
// Linux/macOS: pass --bin <path to the app binary> for a launch check; their webviews have no CDP.
import { execFileSync, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(`--${name}`) ? (args[args.indexOf(`--${name}`) + 1] ?? true) : def);
const PORT = Number(opt("port", 9222));
const BENCH = opt("bench");
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
  if (from === "local") {
    // rustup's default bin dir may not be on PATH in a fresh shell; CARGO_HOME says where it is
    const env = { ...process.env };
    if (env.CARGO_HOME) env.PATH = `${join(env.CARGO_HOME, "bin")};${env.PATH}`;
    // bundle the native STEP reader when scripts/build-occt.mjs has built it; otherwise the app uses the built-in one
    const native = existsSync("src-tauri/binaries/shapebridge-occt-x86_64-pc-windows-msvc.exe");
    execSync(`npx tauri build --bundles nsis${native ? " --config src-tauri/tauri.native.conf.json" : ""}`, { stdio: "inherit", env });
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- src src-tauri", { encoding: "utf8" }).trim() ? " + local changes" : "";
    return { file: findSetup(join("src-tauri", "target", "release", "bundle", "nsis")), source: `local build (${sha}${dirty})` };
  }
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
    if (opt("from") === "installed") {
      if (!existsSync(APP)) throw new Error(`--from installed, but ${APP} is missing`);
      return "using the installed app";
    }
    const { file, source } = installer();
    execFileSync(file, ["/S"]); // per-user NSIS install, no admin prompt
    if (!existsSync(APP)) throw new Error(`installer finished but ${APP} is missing`);
    const version = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ShapeBridge" /v DisplayVersion', {
      encoding: "utf8",
    }).match(/REG_SZ\s+(\S+)/)?.[1];
    return `${version ?? "?"} from ${source}`;
  });
  if (!results.at(-1).ok) report();
  // --bench opens the file the way the OS does: as a command-line argument at start-up
  app = spawn(APP, BENCH ? [resolve(BENCH)] : [], {
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
const evaluate = async (fn, retry = true) => {
  try {
    const r = await call("Runtime.evaluate", { expression: `(${fn})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  } catch (e) {
    // a freshly installed app can reload its page once while WebView2 sets up its profile
    if (!retry || !/context was destroyed/.test(e.message)) throw e;
    await sleep(2000);
    return evaluate(fn, false);
  }
};

await check("starts and stays up", async () => {
  const t = Date.now();
  while (Date.now() - t < (opt("dev") ? 600_000 : 30_000)) {
    if (app.exitCode !== null) throw new Error(`exited with code ${app.exitCode}`);
    try {
      // wait for the app's own page (it has a title), not the blank one WebView2 starts with
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((p) => p.type === "page" && p.title);
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

if (BENCH && ws) {
  mkdirSync(OUT, { recursive: true });
  await check(`bench ${basename(BENCH)}`, async () => {
    // long tasks since the page started, including those before we attached
    await evaluate(`() => {
      window.__long = [];
      new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({ type: "longtask", buffered: true });
    }`);
    let s;
    for (const t = Date.now(); Date.now() - t < 900_000; await sleep(250)) {
      s = await evaluate(
        `() => ({ status: document.querySelector("footer")?.innerText.replace(/\\n/g, " · ") ?? "", t: performance.now() })`,
      );
      if (/Opened|Could not|fail/i.test(s.status)) break;
    }
    if (!/Opened/.test(s.status)) throw new Error(s.status);
    await sleep(1500); // let post-load work (BVH, materials) land in the long-task list
    // a model that loads but doesn't draw (clip planes, materials) has fooled us before: measure it in the fitted view
    const coverage = await modelCoverage();
    if (coverage < 0.02) throw new Error(`opened, but the model covers only ${(coverage * 100).toFixed(1)}% of the view`);
    const orbit = await orbitFps(3000);
    const longTasks = await evaluate(`() => window.__long`);
    const heap = (await call("Runtime.getHeapUsage")).usedSize;
    const r = {
      file: `${basename(BENCH)} (${(statSync(BENCH).size / 1e6).toFixed(1)} MB)`,
      model: s.status
        .split(" · ")
        .filter((x) => /parts|tris/.test(x))
        .join(" "),
      openSeconds: +(s.t / 1000).toFixed(1),
      longestTaskMs: Math.round(Math.max(0, ...longTasks)),
      longTasksOver200ms: longTasks.filter((d) => d > 200).length,
      viewCoverage: `${Math.round(coverage * 100)}%`,
      orbitFps: orbit,
      jsHeapMB: Math.round(heap / 1e6),
      peakMemoryMB: peakWorkingSetMB(),
    };
    writeFileSync(join(OUT, `bench-${basename(BENCH)}.json`), JSON.stringify(r, null, 2));
    return Object.entries(r)
      .map(([k, v]) => `${k}=${v}`)
      .join(" · ");
  });
}

/** Frames per second while dragging to orbit, as the user would; OV renders on every mouse move. */
async function orbitFps(ms) {
  const [x, y] = await evaluate(
    `() => { const r = document.querySelector(".viewport canvas").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`,
  );
  await evaluate(
    `() => { window.__frames = 0; window.__orbit = true; const f = () => { window.__frames++; if (window.__orbit) requestAnimationFrame(f); }; requestAnimationFrame(f); }`,
  );
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  const t = Date.now();
  for (let i = 0; Date.now() - t < ms; i++) {
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + 150 * Math.sin(i / 10),
      y: y + 60 * Math.cos(i / 13),
      button: "left",
      buttons: 1,
    });
    await sleep(16);
  }
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  const frames = await evaluate(`() => { window.__orbit = false; return window.__frames; }`);
  return Math.round((frames * 1000) / (Date.now() - t));
}

/** Sum of the per-process peak working sets of the app and every process under it (its WebView2 tree). */
function peakWorkingSetMB() {
  // WebView2 children don't name the app on their command line, so walk the process tree instead
  const ps = `$all = Get-CimInstance Win32_Process
$ids = @($all | Where-Object Name -eq 'shapebridge.exe' | ForEach-Object ProcessId)
do { $n = $ids.Count; $ids = @($ids + ($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId)) | Select-Object -Unique } while ($ids.Count -gt $n)
($all | Where-Object { $ids -contains $_.ProcessId } | Measure-Object PeakWorkingSetSize -Sum).Sum`;
  const kb = Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim()); // reported in KB
  return Math.round(kb / 1024);
}
if (!ws || BENCH) finish();

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
    // samples and templates only: Recent entries (their tooltip is a disk path) reopen from disk with the native reader
    const b = [...document.querySelectorAll(".library button")].find(
      (b) => !/[\\\\/]/.test(b.title) && b.textContent.toLowerCase().includes(${JSON.stringify(label)}),
    );
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

await check("open from the OS: STEP with the native reader", async () => {
  // the same file through the built-in reader first, as the reference for how much of the view it should cover
  await openFromLibrary("assembly.step", 60_000);
  const builtIn = await modelCoverage();
  // a second launch with a path is what double-clicking a file does; the running window opens it
  spawn(APP, [resolve("public/samples/assembly.step")], { detached: true, stdio: "ignore" }).unref();
  const r = await evaluate(`async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const reader = () => [...document.querySelectorAll(".task-body dt")].find((d) => d.textContent === "Reader")?.nextElementSibling?.textContent ?? "";
    document.querySelector('.task-tabs button[aria-label="Properties"]')?.click();
    for (const t = performance.now(); performance.now() - t < 60000 && !/native/.test(reader()); ) await w(300);
    await w(500);
    return { status: document.querySelector("footer")?.innerText.replace(/\\n/g, " · ") ?? "", reader: reader() };
  }`);
  if (!/Opened assembly.step/.test(r.status)) throw new Error(r.status);
  if (!/native/.test(r.reader)) throw new Error(`opened with the ${r.reader || "unknown"} reader, not the native one`);
  // loading isn't enough: the parts must draw like the built-in reader's (glTF defaults once made them black on black)
  const shown = await modelCoverage();
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  if (shown < builtIn * 0.6)
    throw new Error(`the model covers ${pct(shown)} of the view, against ${pct(builtIn)} with the built-in reader`);
  return `${r.reader} · covers ${pct(shown)} of the view (built-in reader: ${pct(builtIn)}) · ${r.status}`;
});

/** Share of the 3D view whose pixels differ clearly from its background (the top-left corner). */
async function modelCoverage() {
  const box = await evaluate(
    `() => { const r = document.querySelector(".viewport canvas").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; }`,
  );
  const file = join(tmpdir(), `sb-view-${process.pid}.png`);
  writeFileSync(file, Buffer.from((await call("Page.captureScreenshot", { format: "png", clip: box })).data, "base64"));
  const ps = `Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap '${file}'
$bg = $b.GetPixel(4, 4); $n = 0; $hit = 0
for ($x = 0; $x -lt $b.Width; $x += 4) { for ($y = 0; $y -lt $b.Height; $y += 4) { $p = $b.GetPixel($x, $y); $n++
  if ([math]::Abs($p.R - $bg.R) + [math]::Abs($p.G - $bg.G) + [math]::Abs($p.B - $bg.B) -gt 20) { $hit++ } } }
$b.Dispose(); [math]::Round($hit / $n, 4)`;
  return Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
}

await check("New Part (Ctrl+N) is empty", async () => {
  const r = await evaluate(`async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    return {
      features: document.querySelectorAll("li.feature").length,
      welcome: !!document.querySelector(".welcome"),
      status: document.querySelector("footer")?.innerText.replace(/\\n/g, " · ") ?? "",
    };
  }`);
  if (r.features || r.welcome || !/New part/.test(r.status)) throw new Error(JSON.stringify(r));
  return r.status;
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

finish();

function finish() {
  // leave no debugging port open (unless --keep, for the `desktop` MCP); restore the app if the user had it running
  ws?.close();
  if (opt("keep")) console.log(`\nThe app is still running with its debugging port on ${PORT}; the desktop MCP can attach now.`);
  else if (opt("dev")) app.kill();
  else {
    quit();
    if (wasRunning) spawn(APP, [], { detached: true, stdio: "ignore" }).unref();
  }
  report();
}
