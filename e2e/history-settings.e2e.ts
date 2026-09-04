import { expect, test } from "@playwright/test";
import {
  openApp,
  openSigningFor,
  saveNumberedSigning,
} from "./testHelpers";

test("saved signing is grouped in history and its signature loads on demand", async ({ page }) => {
  await openApp(page);
  await openSigningFor(page);
  await saveNumberedSigning(page);
  await page.getByRole("button", { name: "תנועות" }).click();

  const signingCard = page.locator("article.signing-history-card");
  await expect(signingCard).toContainText("פעולת החתמה · דוד כהן");
  await expect(signingCard).toContainText("החתמת צל״מ");
  await signingCard.getByRole("button", { name: "הצגת חתימה" }).click();

  const dialog = page.getByRole("dialog", { name: "פרטי החתימה" });
  await expect(dialog).toContainText("דוד כהן");
  await expect(dialog.getByRole("img", { name: "חתימת החייל" })).toBeVisible();
});

test("admin permission form exposes equipment and platoon scopes", async ({ page }) => {
  await openApp(page, "admin");
  await page.getByRole("button", { name: "הגדרות" }).click();
  await page.getByRole("button", { name: "הוספת משתמש" }).click();

  const dialog = page.getByRole("dialog", { name: "הוספת הרשאה" });
  await dialog.getByLabel("אימייל Google").fill("new-user@example.com");
  await dialog.getByLabel("היקף ציוד").selectOption("כמותי");
  await dialog.getByLabel("1", { exact: true }).check();
  await expect(dialog.getByLabel("היקף ציוד")).toHaveValue("כמותי");
  await expect(dialog.getByLabel("1", { exact: true })).toBeChecked();

  await dialog.getByLabel("מנהל", { exact: true }).check();
  await expect(dialog.getByLabel("היקף ציוד")).toBeDisabled();
  await expect(dialog.getByLabel("1", { exact: true })).toBeDisabled();
});
