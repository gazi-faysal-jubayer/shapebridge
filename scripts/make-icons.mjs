// Renders the SVG logo to a 1024px PNG; `tauri icon` then makes every platform icon from it.
// Usage: npm run icons
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const svg = await readFile("assets/logo/logo.svg");
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render().asPng();
await writeFile("assets/logo/logo-1024.png", png);
execSync("npx tauri icon assets/logo/logo-1024.png -o src-tauri/icons", { stdio: "inherit" });
