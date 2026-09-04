import { expect, test, type Locator, type Page } from "@playwright/test";
import { openApp } from "./testHelpers";

async function openNewSoldierForm(page: Page) {
  await page.getByRole("button", { name: "חיילים" }).click();
  await page.getByRole("button", { name: "הוספת חייל" }).click();
  return page.getByRole("dialog", { name: "הוספת חייל" });
}

async function fillSoldierForm(
  dialog: Locator,
  personalNumber: string,
  name = "ישראל ישראלי",
) {
  await dialog.getByLabel("שם מלא").fill(name);
  await dialog.getByLabel("מספר אישי").fill(personalNumber);
  await dialog.getByLabel("מחלקה").selectOption("1");
  await dialog.getByLabel("טלפון (אופציונלי)").fill("0503333333");
}

test("rejects an existing personal number before saving", async ({ page }) => {
  await openApp(page);
  const dialog = await openNewSoldierForm(page);
  await fillSoldierForm(dialog, "1111111");
  await dialog.getByRole("button", { name: "שמירה" }).click();

  await expect(dialog.getByRole("alert")).toContainText("כבר קיים");
  await expect(dialog).toBeVisible();
});

test("adds a soldier and refreshes the current page without Google", async ({ page }) => {
  await openApp(page);
  const dialog = await openNewSoldierForm(page);
  await fillSoldierForm(dialog, "3333333");
  await dialog.getByRole("button", { name: "שמירה" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("החייל נוסף");
  await expect(page.getByText("ישראל ישראלי", { exact: true })).toBeVisible();
});

test("opens signings with the selected soldier from soldier details", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "חיילים" }).click();
  await page.getByText("דוד כהן", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "דוד כהן" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "פתיחת החתמה" }).click();

  await expect(page.getByRole("heading", { name: "החתמה — דוד כהן" })).toBeVisible();
  await expect(page.getByText("1111111", { exact: true })).toBeVisible();
});

test("shows a repository failure as a toast and keeps the soldier form open", async ({ page }) => {
  await openApp(page, "all", "failure=add-soldier");
  const dialog = await openNewSoldierForm(page);
  await fillSoldierForm(dialog, "3333333");
  await dialog.getByRole("button", { name: "שמירה" }).click();

  await expect(page.getByRole("alert")).toContainText("כשל בדיקה בשמירת החייל");
  await expect(dialog).toBeVisible();
  await expect(page.getByText("ישראל ישראלי", { exact: true })).toHaveCount(0);
});
