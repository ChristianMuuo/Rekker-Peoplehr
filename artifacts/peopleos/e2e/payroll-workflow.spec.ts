import { expect, test } from "@playwright/test";

test.describe("Rekker Payroll & Statutory Engine E2E", () => {
  test("Payroll displays NEEDS_LEGAL_REVIEW disclosure, Sandbox M-Pesa mode, Year 4 simulator & GL journal", async ({
    page,
  }) => {
    await page.goto("/payroll");
    await expect(page.getByTestId("heading-payroll")).toBeVisible();
    await expect(page.getByTestId("banner-payroll-legal-review")).toContainText("NEEDS_LEGAL_REVIEW");
    await expect(page.getByTestId("badge-mpesa-mode")).toContainText("SANDBOX SIMULATION");

    // Verify Year 4 NSSF default calculation for KES 180,000 gross (KES 6,480)
    await expect(page.getByTestId("section-payroll-simulator")).toBeVisible();
    await expect(page.getByTestId("text-sim-nssf")).toContainText("KES 6,480");
    await expect(page.getByTestId("text-sim-shif")).toContainText("KES 4,950");
    await expect(page.getByTestId("text-sim-ahl")).toContainText("KES 2,700");

    // Expand PAYE graduated band breakdown
    await page.getByTestId("button-toggle-paye-bands").click();
    await expect(page.getByTestId("table-paye-bands")).toBeVisible();

    // Open double-entry GL journal and verify balanced debits/credits
    await page.getByTestId("button-payroll-journal").click();
    const journalModal = page.getByTestId("modal-payroll-journal");
    await expect(journalModal).toBeVisible();
    await expect(journalModal.getByText("BALANCED", { exact: true })).toBeVisible();
  });
});
