import { expect, test } from "@playwright/test";

// Uses the real peer-to-peer stack and public signalling, so it needs a network. @network
test("a guest opens the share link and receives the model @network", async ({ browser }) => {
  test.slow();
  const host = await (await browser.newContext()).newPage();
  await host.goto("/");
  await host.locator(".samples button", { hasText: /Plate/ }).click();
  await expect(host.locator(".status-msg")).toHaveText(/Opened plate\.step/, { timeout: 60_000 });

  await host.getByRole("button", { name: "Share live" }).click();
  const linkBox = host.getByLabel("Share link");
  await expect(linkBox).toHaveValue(/#/, { timeout: 30_000 });
  const link = await linkBox.inputValue();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await expect(guest.locator(".status-msg")).toHaveText(/Opened plate\.step/, { timeout: 120_000 });
});
