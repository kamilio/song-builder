import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { emptyFixture } from "../fixtures/index";

test("home page loads with empty state seeded via storageService.import", async ({ page }) => {
  // Seed empty state through the real import code path (same as the Settings import UI)
  await seedFixture(page, emptyFixture);

  await page.goto("/");
  await expect(page.getByPlaceholder("What song do you want to make?")).toBeVisible();

  // Verify the import actually ran by confirming storage is empty
  const exported = await page.evaluate(() => window.storageService.export());
  expect(exported.settings).toBeNull();
  expect(exported.messages).toHaveLength(0);
  expect(exported.songs).toHaveLength(0);
});
