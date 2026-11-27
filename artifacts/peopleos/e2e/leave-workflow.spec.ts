import { expect, test } from "@playwright/test";

test.describe("Rekker PeopleOS End-to-End Acceptance", () => {
  test("Leave policies are configured (paternity = 14 days), balances render, and full leave flow works", async ({
    page,
  }) => {
    await page.goto("/leave");
    await expect(page.getByTestId("section-leave-balances")).toBeVisible();
    await expect(page.getByTestId("table-leave-balances")).toBeVisible();
    await expect(page.getByText("Leave policies are not configured")).toHaveCount(0);

    // Paternity leave must show 14 days (2 weeks under Employment Act 2007 s.29(8))
    const policiesSection = page.getByTestId("section-leave-policies");
    await expect(policiesSection).toBeVisible();
    const paternityCard = policiesSection.getByTestId("card-leave-policy-policy-paternity");
    await expect(paternityCard).toBeVisible();
    await expect(paternityCard.getByText("Paternity Leave")).toBeVisible();
    await expect(paternityCard.getByText("14 days per year")).toBeVisible();

    // Recommend check on an existing pending request
    const recommendBtn = page.getByTestId("button-recommend-leave-leave-002");
    await recommendBtn.click();
    await expect(page.getByTestId("box-leave-recommendation-leave-002")).toBeVisible();
  });

  test("Settings and Diagnostics render distinct pages", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Workspace Settings" })).toBeVisible();
    await expect(page.getByTestId("section-org-settings")).toBeVisible();
    await expect(page.getByTestId("section-system-diagnostics")).toHaveCount(0);

    await page.goto("/diagnostics");
    await expect(page.getByRole("heading", { name: "System Diagnostics", exact: true })).toBeVisible();
    await expect(page.getByTestId("section-system-diagnostics")).toBeVisible();
  });

  test("HR Cases UI never exposes raw HR_CASE_OFFICER_FULL identifier", async ({ page }) => {
    await page.goto("/hr-cases");
    await expect(page.getByRole("heading", { name: "Confidential HR Case Management" })).toBeVisible();
    await expect(page.getByText("HR_CASE_OFFICER_FULL")).toHaveCount(0);
    await expect(page.getByText("HR Case Officer (Full Confidential Access)")).toBeVisible();
  });
});
