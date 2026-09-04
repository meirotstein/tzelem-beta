import { expect, test } from "@playwright/test";
import { openApp } from "./testHelpers";

test("admin can navigate through every application page", async ({ page }) => {
  await openApp(page, "admin");

  const pages = [
    ["החתמות", "החתמות"],
    ["חיילים", "חיילים"],
    ["מלאי", "מלאי ציוד"],
    ["תנועות", "תנועות"],
    ["הגדרות", "הגדרות"],
    ["בית", "תמונת מצב"],
  ] as const;

  for (const [navigationLabel, heading] of pages) {
    await page.getByRole("button", { name: navigationLabel, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});
