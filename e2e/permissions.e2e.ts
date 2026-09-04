import { expect, test, type Page } from "@playwright/test";

type Profile = "admin" | "all" | "platoon" | "tzelem" | "readonly";

async function openAs(page: Page, profile: Profile) {
  await page.goto(`/?spid=e2e-sheet&profile=${profile}`);
  await expect(page.getByRole("heading", { name: "תמונת מצב" })).toBeVisible();
}

test.describe("application permissions", () => {
  test("admin can open settings and permission management", async ({ page }) => {
    await openAs(page, "admin");

    await expect(page.getByText("מנהלת בדיקות", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "הגדרות" }).click();
    await expect(page.getByRole("heading", { name: "הגדרות" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "הרשאות משתמשים" })).toBeVisible();
    await expect(page.getByText("admin@example.com", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "הוספת משתמש" })).toBeVisible();

    await page.getByRole("button", { name: "חיילים" }).click();
    await expect(page.getByText("דוד כהן", { exact: true })).toBeVisible();
    await expect(page.getByText("מאיר לוי", { exact: true })).toBeVisible();
  });

  test("user without a permission row gets the agreed unrestricted non-admin access", async ({ page }) => {
    await openAs(page, "all");

    await expect(page.getByText("משתמש ללא הגדרה", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "הגדרות" })).toHaveCount(0);
    await page.getByRole("button", { name: "חיילים" }).click();
    await expect(page.getByText("דוד כהן", { exact: true })).toBeVisible();
    await expect(page.getByText("מאיר לוי", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "מלאי" }).click();
    await expect(page.getByRole("button", { name: "סוג ציוד חדש" })).toBeVisible();
    await expect(page.getByRole("button", { name: "פריט צל״מ חדש" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ערכות ציוד" })).toBeVisible();
  });

  test("platoon-limited user sees only their soldiers and cannot manage inventory definitions", async ({ page }) => {
    await openAs(page, "platoon");

    await page.getByRole("button", { name: "חיילים" }).click();
    await expect(page.getByText("דוד כהן", { exact: true })).toBeVisible();
    await expect(page.getByText("מאיר לוי", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "2", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "מלאי" }).click();
    await expect(page.getByRole("button", { name: "סוג ציוד חדש" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ערכות ציוד" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "פריט צל״מ חדש" })).toBeVisible();
    await expect(page.getByText("צ-100", { exact: false })).toBeVisible();
    await expect(page.getByText("צ-200", { exact: false })).toHaveCount(0);
  });

  test("equipment scope hides quantity-managed data and controls", async ({ page }) => {
    await openAs(page, "tzelem");

    await page.getByRole("button", { name: "מלאי" }).click();
    await expect(page.getByText("אפוד · קרמי", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("חולצה · מ", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ערכות ציוד" })).toHaveCount(0);
    const methodFilter = page.locator("select").filter({ has: page.locator("option", { hasText: "כל שיטות הניהול" }) });
    await expect(methodFilter.getByRole("option", { name: "צל״מ", exact: true })).toHaveCount(1);
    await expect(methodFilter.getByRole("option", { name: "כמותי", exact: true })).toHaveCount(0);
  });

  test("read-only user can browse but cannot write", async ({ page }) => {
    await openAs(page, "readonly");

    await expect(page.getByText("הגיליון פתוח לקריאה בלבד. פעולות עריכה אינן זמינות.")).toBeVisible();
    await expect(page.getByRole("button", { name: "הוספת חייל" })).toHaveCount(0);
    await page.getByRole("button", { name: "מלאי" }).click();
    await expect(page.getByRole("button", { name: "סוג ציוד חדש" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "פריט צל״מ חדש" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "החתמה", exact: true })).toHaveCount(0);
  });
});
