import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const status = (page: Page) => page.locator(".status-msg");

async function openSample(page: Page, button: RegExp, file: string) {
  await page.goto("/");
  await page.locator(".samples button", { hasText: button }).click();
  await expect(status(page)).toHaveText(new RegExp(`Opened ${file.replace(".", "\.")}`), { timeout: 60_000 });
}

test("opens a STEP sample with its parts and properties", async ({ page }) => {
  await openSample(page, /Assembly/, "assembly.step");
  await expect(page.locator(".statusbar")).toContainText("7 parts");
  await expect(page.locator(".side.left")).toContainText("Bolt M6 #1");
  await expect(page.locator(".props")).toContainText("Volume");
});

/** Binary STL of a box `l` × `w` × `w` mm. */
function boxStl(l: number, w: number): Buffer {
  const v = (i: number) => [i & 1 ? l : 0, i & 2 ? w : 0, i & 4 ? w : 0];
  const faces = [[0, 2, 1], [1, 2, 3], [4, 5, 6], [5, 7, 6], [0, 1, 4], [1, 5, 4], [2, 6, 3], [3, 6, 7], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5]]; // prettier-ignore
  const buf = Buffer.alloc(84 + faces.length * 50);
  buf.writeUInt32LE(faces.length, 80);
  faces.forEach((f, i) => f.forEach((c, j) => v(c).forEach((x, k) => buf.writeFloatLE(x, 84 + i * 50 + 12 + j * 12 + k * 4))));
  return buf;
}

test("draws all of a model bigger than a metre", async ({ page }) => {
  // the camera's far plane once stayed at OV's default 1 m, so anything bigger was cut off or vanished
  await page.goto("/");
  await page.locator("#file-input").setInputFiles({ name: "beam.stl", mimeType: "model/stl", buffer: boxStl(3000, 60) });
  await expect(status(page)).toHaveText(/Opened beam\.stl/, { timeout: 60_000 });
  const png = (await page.locator(".viewport canvas").screenshot()).toString("base64");
  // share of the view's width where the light grey beam shows (the background is a dark gradient, never this bright)
  const span = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const ctx = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height }).getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    const bright = (i: number) => Math.min(data[i], data[i + 1], data[i + 2]) > 80;
    let cols = 0;
    // rows between the heads-up toolbar and view cube (top) and the triad (bottom left), which overlay the canvas
    for (let x = 0; x < width; x++)
      for (let y = Math.round(height * 0.3); y < height * 0.8; y += 2)
        if (bright((y * width + x) * 4)) {
          cols++;
          break;
        }
    return cols / width;
  }, png);
  expect(span).toBeGreaterThan(0.4);
});

test("exports the open model as STL", async ({ page }) => {
  await openSample(page, /Plate/, "plate.step");
  await page.locator("button[title='Export']").click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /STL/ }).first().click();
  const file = await (await download).path();
  // binary STL: 80-byte header, a count, then 50 bytes per triangle
  expect(statSync(file).size).toBeGreaterThan(84 + 50 * 12);
});
