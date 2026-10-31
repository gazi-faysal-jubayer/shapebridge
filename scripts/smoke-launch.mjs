// CI smoke test for the desktop build: start the app, check it is still running after a while, take a
// screenshot of the desktop, then quit. Usage: node scripts/smoke-launch.mjs <binary> <screenshot.png>
import { spawn, execSync } from "node:child_process";

const [bin, shot] = process.argv.slice(2);
const WAIT_MS = 20_000;

const app = spawn(bin, [], { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
app.stdout.on("data", (d) => (log += d));
app.stderr.on("data", (d) => (log += d));
const exited = new Promise((r) => app.on("exit", (code, signal) => r({ code, signal })));

const result = await Promise.race([exited, new Promise((r) => setTimeout(() => r(null), WAIT_MS))]);
if (result) {
  console.error(`The app exited after start-up (${JSON.stringify(result)}).\n${log}`);
  process.exit(1);
}
console.log(`The app is still running after ${WAIT_MS / 1000} s.`);

// a screenshot is evidence for reviewers, not part of the pass/fail check
const cmd = {
  win32: `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height; [System.Drawing.Graphics]::FromImage($i).CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $i.Save('${shot}')"`,
  darwin: `screencapture -x "${shot}"`,
  linux: `import -window root "${shot}"`,
}[process.platform];
try {
  execSync(cmd, { stdio: "inherit" });
} catch (e) {
  console.warn(`Screenshot failed: ${e.message}`);
}

app.kill();
if (log.trim()) console.log(log.slice(-4000));
process.exit(0);
