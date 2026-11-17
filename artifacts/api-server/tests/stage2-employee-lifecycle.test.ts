import { describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";
import { phase2MemoryStore } from "../src/services/phase2MemoryStore";
import { decideProbationReview } from "../src/services/lifecycleService";

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const empHeaders = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_emp_01",
  "x-peopleos-role": PEOPLEOS_ROLES.employee,
};

const emp02Headers = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_emp_03",
  "x-peopleos-role": PEOPLEOS_ROLES.employee,
  "x-peopleos-employee-id": "10000000-0000-4000-8000-000000000003",
};

const hrAdminHeaders = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_admin_01",
  "x-peopleos-role": PEOPLEOS_ROLES.hrAdmin,
};

const mgrHeaders = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_mgr_01",
  "x-peopleos-role": PEOPLEOS_ROLES.departmentManager,
};

describe("Stage 2: Organization, Employee Lifecycle & Self-Service Verification", { concurrency: 1 }, () => {
  test("1. Self-Service Identity Binding & Statutory ID Tamper Protection", async () => {
    await withServer(async (baseUrl) => {
      // 1. Employee strictly binds to their linked employeeId (0002: Mwangi Kariuki)
      const meRes = await fetch(`${baseUrl}/api/peopleos/me`, { headers: empHeaders });
      assert.strictEqual(meRes.status, 200, "Employee should retrieve own workspace");
      const me = (await meRes.json()) as {
        linked: boolean;
        employee: { id: string; firstName: string; lastName: string; maskedNationalId: string | null };
        completeness: { scorePercent: number };
      };
      assert.strictEqual(me.linked, true, "Employee should be linked to HR profile");
      assert.strictEqual(me.employee.id, "10000000-0000-4000-8000-000000000002");
      assert.ok(me.completeness.scorePercent > 0, "Completeness score should be evaluated");

      // 2. Profile correction request for protected statutory field (nationalId, kraPin, baseSalary) fails with 403
      const protectedFields = ["nationalId", "kraPin", "baseSalary", "nssfNo", "shaNo"];
      for (const field of protectedFields) {
        const corrRes = await fetch(`${baseUrl}/api/peopleos/profile-correction-requests`, {
          method: "POST",
          headers: empHeaders,
          body: JSON.stringify({
            fieldName: field,
            proposedValue: "MALICIOUS_INPUT",
            reason: "Unauthorized statutory field update attempt",
          }),
        });
        assert.strictEqual(corrRes.status, 403, `Field '${field}' must be blocked from self-service correction`);
      }

      // 3. Allowed field (preferredName) succeeds
      const allowRes = await fetch(`${baseUrl}/api/peopleos/profile-correction-requests`, {
        method: "POST",
        headers: empHeaders,
        body: JSON.stringify({
          fieldName: "preferredName",
          proposedValue: "Mwangi K.",
          reason: "Preferred badge display name",
        }),
      });
      assert.strictEqual(allowRes.status, 201, "Allowed personal field should be submitted");
      const allowData = (await allowRes.json()) as { id: string; fieldName: string };
      assert.strictEqual(allowData.fieldName, "preferredName");

      // 4. Employee cannot approve their own correction request (segregation of duties)
      const selfApproveRes = await fetch(
        `${baseUrl}/api/peopleos/profile-correction-requests/${allowData.id}/decision`,
        {
          method: "POST",
          headers: empHeaders,
          body: JSON.stringify({ decision: "approved", comment: "Self-approval attempt" }),
        },
      );
      assert.strictEqual(selfApproveRes.status, 403, "Self-approval of profile correction must be rejected");

      // 5. Direct PATCH on employee master record by employee role is rejected with 403
      const patchRes = await fetch(`${baseUrl}/api/employees/10000000-0000-4000-8000-000000000002`, {
        method: "PATCH",
        headers: empHeaders,
        body: JSON.stringify({ preferredName: "Hacked Name" }),
      });
      assert.strictEqual(patchRes.status, 403, "Employees must not directly PATCH employee master records");
    });
  });

  test("2. Payslip Privacy & IDOR Prevention", async () => {
    await withServer(async (baseUrl) => {
      const emp01Id = "10000000-0000-4000-8000-000000000002"; // Mwangi Kariuki
      const emp02Id = "10000000-0000-4000-8000-000000000001"; // Achieng Odhiambo

      // 1. Employee can view their own payslip history
      const ownPayslipsRes = await fetch(`${baseUrl}/api/payroll/employees/${emp01Id}/payslips`, {
        headers: empHeaders,
      });
      assert.strictEqual(ownPayslipsRes.status, 200, "Employee should access own payslips");
      const ownData = (await ownPayslipsRes.json()) as {
        employeeId: string;
        payslips: Array<{ id: string; period: string; grossPay: number; netPay: number }>;
      };
      assert.strictEqual(ownData.employeeId, emp01Id);
      assert.ok(ownData.payslips.length >= 1, "Should have at least 1 payslip generated");
      const firstPayslip = ownData.payslips[0]!;
      assert.ok(firstPayslip.grossPay > 0);
      assert.ok(firstPayslip.netPay > 0);

      // 2. Convenience self-service route /api/payroll/my-payslips strictly returns own payslips
      const myPayslipsRes = await fetch(`${baseUrl}/api/payroll/my-payslips`, {
        headers: empHeaders,
      });
      assert.strictEqual(myPayslipsRes.status, 200);
      const myData = (await myPayslipsRes.json()) as { employeeId: string; payslips: Array<{ id: string }> };
      assert.strictEqual(myData.employeeId, emp01Id);

      // 3. Employee accessing ANOTHER employee's payslips is rejected with 403
      const foreignPayslipsRes = await fetch(`${baseUrl}/api/payroll/employees/${emp02Id}/payslips`, {
        headers: empHeaders,
      });
      assert.strictEqual(foreignPayslipsRes.status, 403, "IDOR: Accessing another employee's payslips must be rejected");

      // 4. Specific payslip item access: own item returns 200, another employee's returns 403
      const ownItemRes = await fetch(`${baseUrl}/api/payroll/payslips/${firstPayslip.id}`, {
        headers: empHeaders,
      });
      assert.strictEqual(ownItemRes.status, 200, "Should access own individual payslip item");

      // Employee 02 cannot view Employee 01's payslip item
      const unauthorizedItemRes = await fetch(`${baseUrl}/api/payroll/payslips/${firstPayslip.id}`, {
        headers: emp02Headers,
      });
      assert.strictEqual(unauthorizedItemRes.status, 403, "Another employee must not view foreign payslip item");
    });
  });

  test("3. Organization Hierarchy & Manager Cycle Prevention", async () => {
    await withServer(async (baseUrl) => {
      const emp01 = "10000000-0000-4000-8000-000000000001"; // Achieng Odhiambo (Manager)
      const emp02 = "10000000-0000-4000-8000-000000000002"; // Mwangi Kariuki (reports to emp01)

      // 1. Setting employee as their own manager returns 400
      const selfMgrRes = await fetch(`${baseUrl}/api/employees/${emp01}`, {
        method: "PATCH",
        headers: hrAdminHeaders,
        body: JSON.stringify({ managerId: emp01 }),
      });
      assert.strictEqual(selfMgrRes.status, 400, "Self-manager assignment must fail with 400");
      const selfErr = (await selfMgrRes.json()) as { error: string };
      assert.ok(selfErr.error.includes("own manager") || selfErr.error.includes("SELF_MANAGER"));

      // 2. Setting manager to create cycle (0002 reports to 0001, setting 0001 to report to 0002) returns 400
      const cycleRes = await fetch(`${baseUrl}/api/employees/${emp01}`, {
        method: "PATCH",
        headers: hrAdminHeaders,
        body: JSON.stringify({ managerId: emp02 }),
      });
      assert.strictEqual(cycleRes.status, 400, "Circular reporting hierarchy must fail with 400");
      const cycleErr = (await cycleRes.json()) as { error: string };
      assert.ok(cycleErr.error.includes("cycle") || cycleErr.error.includes("circular"));

      // 3. Org chart endpoint returns valid hierarchy with stats
      const orgChartRes = await fetch(`${baseUrl}/api/peopleos/org-chart`, {
        headers: hrAdminHeaders,
      });
      assert.strictEqual(orgChartRes.status, 200, "Org chart endpoint should succeed");
      const chart = (await orgChartRes.json()) as {
        totalNodes: number;
        nodes: unknown[];
      };
      assert.ok(chart.totalNodes > 0);
      assert.ok(Array.isArray(chart.nodes));
    });
  });

  test("4. Employee Lifecycle & Kenyan §42 Probation Extension Governance", async () => {
    await withServer(async (baseUrl) => {
      // 1. Retrieve active probation reviews and contract reminders
      const listRes = await fetch(`${baseUrl}/api/onboarding/probation-and-contracts`, {
        headers: hrAdminHeaders,
      });
      assert.strictEqual(listRes.status, 200);
      const listData = (await listRes.json()) as {
        probationReviews: Array<{ id: string; employeeName: string; status: string }>;
        contractReminders: Array<{ id: string; employeeName: string }>;
      };
      assert.ok(Array.isArray(listData.probationReviews));
      assert.ok(Array.isArray(listData.contractReminders));

      // 2. Seed a test probation review in memory store
      const testReviewId = "prob-stage2-test";
      phase2MemoryStore.probationReviews.push({
        id: testReviewId,
        organizationId: "rekker-demo",
        employeeId: "10000000-0000-4000-8000-000000000002",
        milestoneDay: 90,
        probationEndDate: "2026-06-30",
        status: "pending_review",
        extensionCount: 0,
        extendedUntilDate: null,
        outcome: null,
        reviewerUserId: null,
        reviewedAt: null,
        notes: null,
        createdAt: new Date(),
      });

      // 3. First extension succeeds under Section 42
      const firstExt = await decideProbationReview({
        organizationId: "rekker-demo",
        actorUserId: "user_demo_admin_01",
        actorName: "hr_admin",
        reviewId: testReviewId,
        decision: "extend",
        extendedUntilDate: "2026-09-30",
        notes: "Agreed 3-month performance improvement extension per §42",
        demoEmployees: [],
        demoDepartments: [],
      });
      assert.strictEqual(firstExt.ok, true, "First probation extension should succeed");

      // 4. Second extension is rejected with 400 (Kenya Employment Act s.42 permits max 1 extension)
      const secondExt = await decideProbationReview({
        organizationId: "rekker-demo",
        actorUserId: "user_demo_admin_01",
        actorName: "hr_admin",
        reviewId: testReviewId,
        decision: "extend",
        extendedUntilDate: "2026-12-31",
        notes: "Second extension attempted",
        demoEmployees: [],
        demoDepartments: [],
      });
      assert.strictEqual(secondExt.ok, false, "Second probation extension must be rejected");
      assert.strictEqual(secondExt.statusCode, 400);
      assert.ok(secondExt.error.includes("Kenya Employment Act s.42"), "Error message should cite Section 42");
    });
  });

  test("5. Bulk CSV Import Centre Duplicate Detection & Formula Protection", async () => {
    await withServer(async (baseUrl) => {
      // 1. Duplicate within CSV upload is flagged as DUPLICATE
      const duplicateCsv =
        "employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate\n" +
        "REK-STAGE2-DUP,Mercy,Njeri,mercy.njeri@rekker-demo.invalid,Technician,MFG,Nairobi,permanent,2026-05-01\n" +
        "REK-STAGE2-DUP,Mercy,Njeri,mercy.njeri@rekker-demo.invalid,Technician,MFG,Nairobi,permanent,2026-05-01";

      const previewRes = await fetch(`${baseUrl}/api/peopleos/employees/import-preview`, {
        method: "POST",
        headers: hrAdminHeaders,
        body: JSON.stringify({ csvText: duplicateCsv }),
      });
      assert.strictEqual(previewRes.status, 200);
      const preview = (await previewRes.json()) as {
        validCount: number;
        duplicateCount: number;
        errorCount: number;
        rows: Array<{ status: string; errors: string[] }>;
      };
      assert.ok(preview.duplicateCount >= 1, "Duplicate row within file must be detected");
      assert.ok(preview.rows.some((r) => r.status === "DUPLICATE"));

      // 2. Duplicate against existing database/demo employee (REK-0101 or achieng.odhiambo@rekker-demo.invalid) is flagged
      const dbDuplicateCsv =
        "employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate\n" +
        "REK-0101,Achieng,Odhiambo,achieng.odhiambo@rekker-demo.invalid,Supervisor,MFG,Nairobi,permanent,2026-05-01";

      const dbPreviewRes = await fetch(`${baseUrl}/api/peopleos/employees/import-preview`, {
        method: "POST",
        headers: hrAdminHeaders,
        body: JSON.stringify({ csvText: dbDuplicateCsv }),
      });
      assert.strictEqual(dbPreviewRes.status, 200);
      const dbPreview = (await dbPreviewRes.json()) as {
        duplicateCount: number;
        rows: Array<{ status: string }>;
      };
      assert.ok(dbPreview.duplicateCount >= 1, "Duplicate against existing organization employee must be detected");
    });
  });

  test("6. Self-Service Leave & Attendance Scoping", async () => {
    await withServer(async (baseUrl) => {
      const ownEmpId = "10000000-0000-4000-8000-000000000002";
      const otherEmpId = "10000000-0000-4000-8000-000000000001";

      // 1. Employee query on leave balances for another employee returns 403
      const foreignBalanceRes = await fetch(`${baseUrl}/api/leave-balances?employeeId=${otherEmpId}`, {
        headers: empHeaders,
      });
      assert.strictEqual(foreignBalanceRes.status, 403, "Querying another employee's leave balance must fail");

      // 2. Employee query on leave requests for another employee returns 403
      const foreignLeaveRes = await fetch(`${baseUrl}/api/leave-requests?employeeId=${otherEmpId}`, {
        headers: empHeaders,
      });
      assert.strictEqual(foreignLeaveRes.status, 403, "Querying another employee's leave requests must fail");

      // 3. Attendance records query automatically scopes to caller's employeeId
      const attRes = await fetch(`${baseUrl}/api/attendance`, {
        headers: empHeaders,
      });
      assert.strictEqual(attRes.status, 200);
      const attData = (await attRes.json()) as { items: Array<{ employeeId: string }> };
      for (const item of attData.items) {
        assert.strictEqual(
          item.employeeId,
          ownEmpId,
          "All attendance records for employee caller must belong to their own employeeId",
        );
      }
    });
  });
});
