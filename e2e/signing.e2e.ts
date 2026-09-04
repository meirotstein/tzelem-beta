import { expect, test, type Page } from "@playwright/test";

async function selectMatchingOption(
  select: ReturnType<Page["locator"]>,
  text: string,
) {
  const value = await select
    .locator("option")
    .filter({ hasText: text })
    .getAttribute("value");
  if (!value) throw new Error(`No option containing ${text}`);
  await select.selectOption(value);
}

async function openSigning(page: Page) {
  await page.goto("/?spid=e2e-sheet&profile=all");
  await expect(page.getByRole("heading", { name: "תמונת מצב" })).toBeVisible();
  await page.getByRole("button", { name: "החתמות" }).click();
  await page.getByLabel("חיפוש חייל").fill("דוד");
  await page.getByRole("button", { name: /דוד כהן/ }).click();
  await expect(page.getByRole("heading", { name: /החתמה — דוד כהן/ })).toBeVisible();
}

test("saves a signing with an offline repository and a drawn signature", async ({ page }) => {
  await openSigning(page);

  const numberedSelect = page.getByLabel("פריט צל״מ זמין");
  await selectMatchingOption(numberedSelect, "צ-100");
  await numberedSelect.locator("..").locator("..").getByRole("button", { name: "הוספה להחתמה" }).click();

  await expect(page.getByText("טרם נשמר", { exact: true })).toBeVisible();
  await expect(page.getByText("1 שינויים ממתינים", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "שמירת ההחתמה" }).click();

  const canvas = page.getByLabel("אזור חתימה באצבע");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Signature canvas has no bounding box");
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  for (let index = 1; index <= 12; index += 1) {
    await page.mouse.move(
      box.x + 30 + index * 12,
      box.y + 40 + (index % 2 === 0 ? 35 : 0),
    );
  }
  await page.mouse.up();

  await expect(page.getByText("החתימה נקלטה", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "אישור ושמירת ההחתמה" }).click();
  const receipt = page.getByRole("dialog", { name: "ההחתמה נשמרה" });
  await expect(receipt).toBeVisible();
  await receipt.getByText("סגירה", { exact: true }).click();
  await expect(page.getByText("טרם נשמר", { exact: true })).toHaveCount(0);
  await expect(page.getByText("אין שינויים לשמירה", { exact: true })).toBeVisible();
});

test("warns before leaving a signing that has unsaved changes", async ({ page }) => {
  await openSigning(page);

  const quantitySelect = page.getByLabel("ציוד כמותי");
  await selectMatchingOption(quantitySelect, "חולצה");
  await quantitySelect.locator("..").locator("..").getByRole("button", { name: "הוספה להחתמה" }).click();
  await page.getByRole("button", { name: "מלאי" }).click();

  await expect(page.getByRole("heading", { name: "יציאה ללא שמירה" })).toBeVisible();
  await page.getByRole("button", { name: "ביטול" }).click();
  await expect(page.getByRole("heading", { name: /החתמה — דוד כהן/ })).toBeVisible();
});
