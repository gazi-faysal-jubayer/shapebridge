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

test("exports the open model as STL", async ({ page }) => {
  await openSample(page, /Plate/, "plate.step");
  await page.locator("button[title='Export']").click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /STL/ }).first().click();
  const file = await (await download).path();
  // binary STL: 80-byte header, a count, then 50 bytes per triangle
  expect(statSync(file).size).toBeGreaterThan(84 + 50 * 12);
});
