import { expect, test, type Locator, type Page } from "@playwright/test";
import { drawValidSignature, openApp, selectMatchingOption } from "./testHelpers";

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

test("quantity transfer continues through signature and WhatsApp receipt", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "חיילים" }).click();
  await page.getByText("דוד כהן", { exact: true }).click();
  const soldierDialog = page.getByRole("dialog", { name: "דוד כהן" });
  const itemCard = soldierDialog
    .locator("article.list-card")
    .filter({ hasText: "חולצה" });
  await itemCard.getByRole("button", { name: "העברה" }).click();

  await expect(soldierDialog).toHaveCount(0);
  const transferDialog = page.getByRole("dialog", { name: "העברת ציוד" });
  await expect(transferDialog).toBeVisible();
  await expect(transferDialog).toContainText("חולצה · מידה מ");
  await expect(transferDialog).toContainText("העברה מ־דוד כהן");
  await expect(transferDialog).toContainText("1111111");
  await expect(transferDialog).toContainText("כמות נוכחית: 2 יח׳");
  await selectMatchingOption(transferDialog.getByLabel("העברה אל"), "מאיר לוי");
  await transferDialog.getByRole("button", { name: "אישור" }).click();

  await expect(page.getByRole("heading", { name: "החתמה — מאיר לוי" })).toBeVisible();
  const shirtCard = page.locator("article.list-card").filter({ hasText: "חולצה" });
  await expect(shirtCard).toContainText("טרם נשמר");
  await expect(shirtCard).toContainText("כמות לפני השינוי: 0");
  await page.getByRole("button", { name: "שמירת ההחתמה" }).click();
  await drawValidSignature(page);
  await page.getByRole("button", { name: "אישור ושמירת ההחתמה" }).click();
  const receipt = page.getByRole("dialog", { name: "ההחתמה נשמרה" });
  await expect(receipt).toContainText("העברה");
  await expect(receipt).toContainText("חולצה");
  await expect(receipt.getByRole("button", { name: "פתיחה ב-WhatsApp" })).toBeVisible();
});

test("numbered transfer continues through signature and WhatsApp receipt", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "חיילים" }).click();
  await page.getByText("מאיר לוי", { exact: true }).click();
  const soldierDialog = page.getByRole("dialog", { name: "מאיר לוי" });
  const itemCard = soldierDialog
    .locator("article.list-card")
    .filter({ hasText: "צ-200" });
  await itemCard.getByRole("button", { name: "העברה" }).click();

  await expect(soldierDialog).toHaveCount(0);
  const transferDialog = page.getByRole("dialog", { name: "העברת ציוד" });
  await expect(transferDialog).toBeVisible();
  await expect(transferDialog).toContainText("אפוד · קרמי · מספר צ צ-200");
  await expect(transferDialog).toContainText("העברה מ־מאיר לוי");
  await expect(transferDialog).toContainText("2222222");
  await selectMatchingOption(transferDialog.getByLabel("העברה אל"), "דוד כהן");
  await transferDialog.getByRole("button", { name: "אישור" }).click();

  await expect(page.getByRole("heading", { name: "החתמה — דוד כהן" })).toBeVisible();
  const vestCard = page.locator("article.list-card").filter({ hasText: "צ-200" });
  await expect(vestCard).toContainText("טרם נשמר");
  await page.getByRole("button", { name: "שמירת ההחתמה" }).click();
  await drawValidSignature(page);
  await page.getByRole("button", { name: "אישור ושמירת ההחתמה" }).click();
  const receipt = page.getByRole("dialog", { name: "ההחתמה נשמרה" });
  await expect(receipt).toContainText("העברה");
  await expect(receipt).toContainText("צ-200");
  await expect(receipt.getByRole("button", { name: "פתיחה ב-WhatsApp" })).toBeVisible();
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
