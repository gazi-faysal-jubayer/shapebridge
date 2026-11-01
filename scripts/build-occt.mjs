// Builds the desktop app's native STEP/IGES/BREP reader (native/occt-import → shapebridge-occt) into
// src-tauri/binaries/, where `tauri build --config src-tauri/tauri.native.conf.json` bundles it next to the app.
// OpenCascade and RapidJSON are downloaded once (pinned and hash-checked) and built into .occt/ (git-ignored;
// CI caches it). The first OCCT build takes 15-30 minutes; after that only the small sidecar is rebuilt.
//   node scripts/build-occt.mjs [--target <rust target triple>]     needs CMake and a C++17 compiler
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SOURCES = {
  occt: {
    url: "https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/V7_8_1.tar.gz",
    sha256: "7321af48c34dc253bf8aae3f0430e8cb10976961d534d8509e72516978aa82f5",
    dir: "OCCT-7_8_1",
  },
  rapidjson: {
    url: "https://github.com/Tencent/rapidjson/archive/refs/tags/v1.1.0.tar.gz",
    sha256: "bf7ced29704a1e696fbccf2a2b4ea068e7774fa37f6d7dd4039d0787f8bed98e",
    dir: "rapidjson-1.1.0",
  },
};

const args = process.argv.slice(2);
const target = args.includes("--target")
  ? args[args.indexOf("--target") + 1]
  : execSync("rustc -vV", { encoding: "utf8" }).match(/^host: (\S+)/m)[1];
const cache = resolve(process.env.OCCT_CACHE ?? ".occt");
const win = target.includes("windows");
const run = (cmd, a) => execFileSync(cmd, a, { stdio: "inherit" });
mkdirSync(cache, { recursive: true });

async function fetchSource({ url, sha256, dir }) {
  const out = join(cache, dir);
  if (existsSync(out)) return out;
  const tar = join(cache, `${dir}.tar.gz`);
  if (!existsSync(tar)) {
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(tar, Buffer.from(await res.arrayBuffer()));
  }
  const got = createHash("sha256").update(readFileSync(tar)).digest("hex");
  if (got !== sha256) throw new Error(`${tar}: sha256 ${got}, expected ${sha256}`);
  run("tar", ["-xzf", tar, "-C", cache]);
  return out;
}

const occtSrc = await fetchSource(SOURCES.occt);
const rapidjson = await fetchSource(SOURCES.rapidjson);
const install = join(cache, `install-${target}`);
// macOS builds both architectures on one runner; everything else builds for the host
const arch = target.startsWith("aarch64-apple")
  ? ["-DCMAKE_OSX_ARCHITECTURES=arm64"]
  : target.startsWith("x86_64-apple")
    ? ["-DCMAKE_OSX_ARCHITECTURES=x86_64"]
    : [];

if (!existsSync(join(install, "done"))) {
  const build = join(cache, `build-${target}`);
  // static libraries; only the geometry, meshing, XCAF and data-exchange toolkits (no viewer, no Draw, no Tcl)
  const off = ["Draw", "DETools", "Visualization"].map((m) => `-DBUILD_MODULE_${m}=FALSE`);
  const noDeps = [
    "D3D",
    "DRACO",
    "EIGEN",
    "FFMPEG",
    "FREEIMAGE",
    "FREETYPE",
    "GLES2",
    "OPENGL",
    "OPENVR",
    "TBB",
    "TCL",
    "TK",
    "VTK",
    "XLIB",
  ].map((u) => `-DUSE_${u}=FALSE`);
  run("cmake", [
    "-S", occtSrc, "-B", build, ...arch, ...off, ...noDeps,
    "-DBUILD_LIBRARY_TYPE=Static", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_MODULE_ApplicationFramework=TRUE",
    "-DUSE_RAPIDJSON=TRUE", `-D3RDPARTY_RAPIDJSON_INCLUDE_DIR=${join(rapidjson, "include")}`, `-DINSTALL_DIR=${install}`,
  ]); // prettier-ignore
  run("cmake", ["--build", build, "--config", "Release", "--parallel"]);
  run("cmake", ["--install", build, "--config", "Release"]);
  writeFileSync(join(install, "done"), "");
}

const sidecarBuild = join(cache, `sidecar-${target}`);
run("cmake", ["-S", "native/occt-import", "-B", sidecarBuild, ...arch, "-DCMAKE_BUILD_TYPE=Release", `-DCMAKE_PREFIX_PATH=${install}`]);
run("cmake", ["--build", sidecarBuild, "--config", "Release", "--parallel"]);

const exe = win ? ".exe" : "";
const built = [join(sidecarBuild, "Release", `shapebridge-occt${exe}`), join(sidecarBuild, `shapebridge-occt${exe}`)].find(existsSync);
if (!built) throw new Error(`shapebridge-occt not found in ${sidecarBuild}`);
mkdirSync("src-tauri/binaries", { recursive: true });
const dest = `src-tauri/binaries/shapebridge-occt-${target}${exe}`;
copyFileSync(built, dest); // Tauri's externalBin naming: <name>-<target triple>
console.log(`Built ${dest}`);
