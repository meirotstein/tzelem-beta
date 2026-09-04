import { expect, type Locator, type Page } from "@playwright/test";

export type E2EProfile =
  | "admin"
  | "all"
  | "platoon"
  | "tzelem"
  | "readonly";

export async function openApp(
  page: Page,
  profile: E2EProfile = "all",
  extraQuery = "",
) {
  await page.goto(
    `/?spid=e2e-sheet&profile=${profile}${extraQuery ? `&${extraQuery}` : ""}`,
  );
  await expect(page.getByRole("heading", { name: "תמונת מצב" })).toBeVisible();
}

export async function selectMatchingOption(select: Locator, text: string) {
  const value = await select
    .locator("option")
    .filter({ hasText: text })
    .getAttribute("value");
  if (!value) throw new Error(`No option containing ${text}`);
  await select.selectOption(value);
}

export async function openSigningFor(page: Page, soldierName = "דוד") {
  await page.getByRole("button", { name: "החתמות" }).click();
  await page.getByLabel("חיפוש חייל").fill(soldierName);
  await page.getByRole("button", { name: new RegExp(soldierName) }).click();
  await expect(page.getByRole("heading", { name: /החתמה —/ })).toBeVisible();
}

export async function addAvailableNumberedItem(page: Page, number = "צ-100") {
  const select = page.getByLabel("פריט צל״מ זמין");
  await selectMatchingOption(select, number);
  await select
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "הוספה להחתמה" })
    .click();
}

export async function drawValidSignature(page: Page) {
  const canvas = page.getByLabel("אזור חתימה באצבע");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Signature canvas has no bounding box");
  await page.mouse.move(box.x + 24, box.y + 35);
  await page.mouse.down();
  for (let index = 1; index <= 12; index += 1) {
    await page.mouse.move(
      box.x + 24 + index * 12,
      box.y + 35 + (index % 2 === 0 ? 32 : 0),
    );
  }
  await page.mouse.up();
  await expect(page.getByText("החתימה נקלטה", { exact: true })).toBeVisible();
}

export async function saveNumberedSigning(page: Page) {
  await addAvailableNumberedItem(page);
  await page.getByRole("button", { name: "שמירת ההחתמה" }).click();
  await drawValidSignature(page);
  await page.getByRole("button", { name: "אישור ושמירת ההחתמה" }).click();
  const receipt = page.getByRole("dialog", { name: "ההחתמה נשמרה" });
  await expect(receipt).toBeVisible();
  await receipt.getByText("סגירה", { exact: true }).click();
}
