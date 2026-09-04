import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./testHelpers";

async function openInventory(page: Page) {
  await page.getByRole("button", { name: "מלאי" }).click();
  await expect(page.getByRole("heading", { name: "מלאי ציוד" })).toBeVisible();
}

test("new equipment type defaults to quantity management", async ({ page }) => {
  await openApp(page);
  await openInventory(page);
  await page.getByRole("button", { name: "סוג ציוד חדש" }).click();

  const dialog = page.getByRole("dialog", { name: "סוג ציוד חדש" });
  await expect(dialog.getByLabel("שיטת ניהול")).toHaveValue("כמותי");
  await expect(dialog.getByLabel("מלאי התחלתי")).toBeVisible();
});

test("new numbered item lists only numbered equipment types", async ({ page }) => {
  await openApp(page);
  await openInventory(page);
  await page.getByRole("button", { name: "פריט צל״מ חדש" }).click();

  const dialog = page.getByRole("dialog", { name: "פריט צל״מ חדש" });
  const typeSelect = dialog.getByLabel("סוג צל״מ ופרט נוסף");
  await expect(typeSelect.getByRole("option", { name: /אפוד/ })).toHaveCount(1);
  await expect(typeSelect.getByRole("option", { name: /חולצה/ })).toHaveCount(0);
});

test("inventory signing carries the selected item into the signing cart", async ({ page }) => {
  await openApp(page);
  await openInventory(page);
  const itemCard = page.locator("article.list-card").filter({ hasText: "צ-100" });
  await itemCard.getByRole("button", { name: "החתמה", exact: true }).click();

  await expect(page.getByText("ציוד שנבחר להחתמה", { exact: true })).toBeVisible();
  await expect(page.getByText(/צ-100/).first()).toBeVisible();
  await page.getByLabel("חיפוש חייל").fill("דוד");
  await page.getByRole("button", { name: /דוד כהן/ }).click();
  await expect(page.getByText("טרם נשמר", { exact: true })).toBeVisible();
  await expect(page.getByText(/צ-100/).first()).toBeVisible();
});

test("inventory removal uses the application confirmation dialog", async ({ page }) => {
  await openApp(page);
  await openInventory(page);
  const numberedCard = page.locator("article.list-card").filter({ hasText: "צ-100" });
  await numberedCard.getByRole("button", { name: "הסר", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "הסרת פריט צל״מ" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("הנתונים וההיסטוריה יישמרו");
  await expect(dialog.getByRole("button", { name: "הסרה" })).toBeVisible();
});
