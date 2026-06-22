import { expect, test, type Page } from "@playwright/test";

const DEFAULT_RESULT_HASH = "bb110fed";

const collectConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
};

const startDefaultBattle = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Impossible Battlegrounds" })).toBeVisible();
  await expect(page.getByText(DEFAULT_RESULT_HASH)).toHaveCount(0);
  await page.getByRole("button", { name: /Start battle/i }).click();
  await expect(page.getByRole("heading", { name: "Precomputing battle" })).toBeVisible();
  await expect(page.getByText(/victory|Winner|Result hash/i)).toHaveCount(0);
  await expect(page.getByLabel("3D battle playback")).toBeVisible({ timeout: 60_000 });
};

test.describe("Impossible Battlegrounds user flow", () => {
  test("runs setup to playback to report without winner leakage", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await startDefaultBattle(page);

    await page.getByRole("button", { name: "0.25x" }).click();
    await page.getByRole("button", { name: "4x" }).click();
    await page.getByTitle("Reset camera").click();
    await expect(page.getByText(/Unit inspection/i)).toBeVisible();

    await page.getByRole("button", { name: /Skip to report/i }).click();
    await expect(page.getByRole("heading", { name: "Battle report" })).toBeVisible();
    await expect(page.getByText(DEFAULT_RESULT_HASH)).toBeVisible();
    await expect(page.getByText(/Key contributing factors/i)).toBeVisible();
    await expect(page.getByText(/Projectile fire/i).first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("matches the fixed determinism hash in browser", async ({ page }) => {
    await startDefaultBattle(page);
    await page.getByRole("button", { name: /Skip to report/i }).click();
    await expect(page.getByText(DEFAULT_RESULT_HASH)).toBeVisible();
  });

  test("captures a local screenshot and supports return to setup", async ({ page }) => {
    await startDefaultBattle(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTitle("Capture screenshot").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(DEFAULT_RESULT_HASH);

    await page.getByRole("button", { name: /Return to setup/i }).click();
    await expect(page.getByRole("heading", { name: "Battle setup" })).toBeVisible();
    await expect(page.locator("input").filter({ hasText: "" }).first()).toBeVisible();
  });

  test("activates developer mode through the query string", async ({ page }) => {
    await page.goto("/?dev=true");
    await page.getByRole("button", { name: /Start battle/i }).click();
    await expect(page.getByLabel("3D battle playback")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Tick/)).toBeVisible();
    await expect(page.getByText(DEFAULT_RESULT_HASH)).toBeVisible();
  });
});
