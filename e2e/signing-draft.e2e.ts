import { expect, test } from "@playwright/test";
import {
  addAvailableNumberedItem,
  openApp,
  openSigningFor,
} from "./testHelpers";

test("quantity editing preserves the row, original value, and changed-only filter", async ({ page }) => {
  await openApp(page);
  await openSigningFor(page);
  const quantityInput = page.getByLabel(/כמות חולצה/);
  await expect(quantityInput).toHaveValue("2");

  await quantityInput.fill("");
  await expect(quantityInput).toBeVisible();
  await expect(page.getByText("כמות לפני השינוי: 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("יש להזין כמות תקינה");

  await quantityInput.fill("5");
  await page.getByLabel("שינויים בלבד").check();
  await expect(page.getByText(/חולצה/).first()).toBeVisible();
  await expect(page.getByText("כמות לפני השינוי: 2", { exact: true })).toBeVisible();
});

test("removing an item from a signing draft requires confirmation", async ({ page }) => {
  await openApp(page);
  await openSigningFor(page);
  const quantityInput = page.getByLabel(/כמות חולצה/);
  const itemCard = page.locator("article.list-card").filter({ has: quantityInput });
  await itemCard.getByRole("button", { name: "הסרה", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "הסרת ציוד מההחתמה" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(quantityInput).toHaveValue("2");
});

test("cancelling the signature does not save the signing draft", async ({ page }) => {
  await openApp(page);
  await openSigningFor(page);
  await addAvailableNumberedItem(page);
  await page.getByRole("button", { name: "שמירת ההחתמה" }).click();

  const dialog = page.getByRole("dialog", { name: "חתימת החייל" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("טרם נשמר", { exact: true })).toBeVisible();
  await expect(page.getByText("1 שינויים ממתינים", { exact: true })).toBeVisible();
});
