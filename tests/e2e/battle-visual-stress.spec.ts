import { stat } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const DEFAULT_RESULT_HASH = "bb110fed";
const BENIGN_BROWSER_ERRORS = new Set([
  "ResizeObserver loop completed with undelivered notifications.",
]);

type CanvasPaintSample = {
  bitmapHeight: number;
  bitmapWidth: number;
  dataUrlLength: number;
  opaquePixels: number;
  sampledPixels: number;
  uniqueColorCount: number;
};

const collectConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !BENIGN_BROWSER_ERRORS.has(text)) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (!BENIGN_BROWSER_ERRORS.has(error.message)) {
      errors.push(error.message);
    }
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

const readCanvasPaintSample = async (canvas: Locator): Promise<CanvasPaintSample> =>
  canvas.evaluate((element) => {
    const battleCanvas = element as HTMLCanvasElement;

    if (battleCanvas.width === 0 || battleCanvas.height === 0) {
      return {
        bitmapHeight: battleCanvas.height,
        bitmapWidth: battleCanvas.width,
        dataUrlLength: battleCanvas.toDataURL("image/png").length,
        opaquePixels: 0,
        sampledPixels: 0,
        uniqueColorCount: 0,
      };
    }

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = Math.min(96, battleCanvas.width);
    sampleCanvas.height = Math.min(96, battleCanvas.height);
    const context = sampleCanvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return {
        bitmapHeight: battleCanvas.height,
        bitmapWidth: battleCanvas.width,
        dataUrlLength: battleCanvas.toDataURL("image/png").length,
        opaquePixels: 0,
        sampledPixels: sampleCanvas.width * sampleCanvas.height,
        uniqueColorCount: 0,
      };
    }

    context.drawImage(
      battleCanvas,
      0,
      0,
      battleCanvas.width,
      battleCanvas.height,
      0,
      0,
      sampleCanvas.width,
      sampleCanvas.height,
    );

    const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    const colors = new Set<string>();
    let opaquePixels = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;

      if (alpha > 0) {
        opaquePixels += 1;
      }

      colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}-${alpha >> 6}`);
    }

    return {
      bitmapHeight: battleCanvas.height,
      bitmapWidth: battleCanvas.width,
      dataUrlLength: battleCanvas.toDataURL("image/png").length,
      opaquePixels,
      sampledPixels: sampleCanvas.width * sampleCanvas.height,
      uniqueColorCount: colors.size,
    };
  });

const expectBattleCanvasToBePainted = async (page: Page) => {
  const canvas = page.getByLabel("3D battle playback");
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
  expect(box?.height ?? 0).toBeGreaterThan(260);

  await expect
    .poll(async () => (await readCanvasPaintSample(canvas)).uniqueColorCount, {
      message: "battle WebGL canvas should contain varied rendered pixels",
      timeout: 20_000,
    })
    .toBeGreaterThan(8);

  const sample = await readCanvasPaintSample(canvas);
  expect(sample.bitmapWidth).toBeGreaterThan(300);
  expect(sample.bitmapHeight).toBeGreaterThan(260);
  expect(sample.opaquePixels).toBe(sample.sampledPixels);
  expect(sample.dataUrlLength).toBeGreaterThan(5_000);
};

test.describe("Impossible Battlegrounds battle visual stress", () => {
  test("keeps playback rendered and controllable through stress interactions", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await startDefaultBattle(page);

    await expectBattleCanvasToBePainted(page);
    await expect(page.getByLabel("Army A combined health")).toBeVisible();
    await expect(page.getByLabel("Army B combined health")).toBeVisible();

    const playToggle = page.getByRole("button", { name: /Pause playback|Play playback/ });
    const timeline = page.getByLabel("Timeline");
    for (const speed of ["0.25x", "4x", "1x", "2x", "0.25x", "4x"]) {
      await page.getByRole("button", { name: speed }).click();
      await playToggle.click();
    }
    await timeline.focus();
    for (const key of ["ArrowRight", "ArrowRight", "PageUp", "ArrowLeft", "Home"]) {
      await timeline.press(key);
    }
    await page.getByTitle("Reset camera").click();
    await page.getByRole("button", { name: "Replay" }).click();
    await page.getByLabel("Developer mode").check();
    await expect(page.getByText(`Hash ${DEFAULT_RESULT_HASH}`)).toBeVisible();

    await expectBattleCanvasToBePainted(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTitle("Capture screenshot").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(DEFAULT_RESULT_HASH);
    const screenshotPath = await download.path();
    expect(screenshotPath).toBeTruthy();
    expect((await stat(screenshotPath!)).size).toBeGreaterThan(5_000);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const mobileCanvas = page.getByLabel("3D battle playback");
    await expect(mobileCanvas).toBeInViewport({ ratio: 0.5 });
    await expectBattleCanvasToBePainted(page);

    await page.getByRole("button", { name: /Return to setup/i }).click();
    await expect(page.getByRole("heading", { name: "Battle setup" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
