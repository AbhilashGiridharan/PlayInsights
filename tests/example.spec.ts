import { test, expect } from "@playwright/test";

// ── Suite: Navigation ──────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("homepage has correct title", async ({ page }) => {
    await page.goto("https://example.com");
    await expect(page).toHaveTitle(/Example Domain/i);
  });

  test("homepage contains a heading", async ({ page }) => {
    await page.goto("https://example.com");
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(/Example Domain/i);
  });

  test("clicking 'More information' link navigates away", async ({ page }) => {
    await page.goto("https://example.com");
    const link = page.locator("a", { hasText: "More information" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).not.toHaveURL("https://example.com");
  });
});

// ── Suite: Content ─────────────────────────────────────────────────────────────

test.describe("Content", () => {
  test("page contains a paragraph", async ({ page }) => {
    await page.goto("https://example.com");
    const paragraph = page.locator("p").first();
    await expect(paragraph).toBeVisible();
  });

  test.skip("future: verify footer links", () => {
    // Placeholder – will be implemented once footer is added
  });
});
