import { expect, test, type Page } from "@playwright/test";

/** The exact (kernel) volume from the Properties panel, in mm³. */
async function exactVolume(page: Page): Promise<number> {
  const text = await page.locator(".props").innerText();
  const all = [...text.matchAll(/Volume\s+([\d,.]+)\s*mm³/g)].map((m) => Number(m[1].replace(/,/g, "")));
  return all.at(-1) ?? NaN;
}

test("editing a parameter rebuilds the part, and undo restores it", async ({ page }) => {
  await page.goto("/");
  await page.locator(".samples button", { hasText: /Bracket/ }).click();
  // the first build downloads the OpenCascade kernel
  await expect.poll(() => exactVolume(page), { timeout: 90_000 }).toBeGreaterThan(0);
  const before = await exactVolume(page);

  await page.getByText(/^Equations/).click();
  const width = page.getByLabel("width expression");
  await width.fill("100");
  await expect.poll(() => exactVolume(page), { timeout: 60_000 }).toBeGreaterThan(before);

  await page.locator(".pm-ok").click();
  await page.keyboard.press("Control+z");
  await expect.poll(() => exactVolume(page), { timeout: 60_000 }).toBeCloseTo(before, 0);
});
