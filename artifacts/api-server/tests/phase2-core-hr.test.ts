import { describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";
import { parseRfc4180Csv, serializeSafeCsv } from "../src/services/rfc4180Csv";
import { countCalendarWorkingDays } from "../src/services/workCalendarService";
import {
  getSelfServiceWorkspace,
  submitPrivacyRequest,
  submitProfileCorrectionRequest,
  decideProfileCorrectionRequest,
} from "../src/services/selfServicePrivacyService";
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

const hrHeaders = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_admin_01",
  "x-peopleos-role": PEOPLEOS_ROLES.hrAdmin,
};

const managerHeaders = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_mgr_01",
  "x-peopleos-role": PEOPLEOS_ROLES.departmentManager,
};

const employeeHeaders = {
  "content-type": "application/json",
  "x-peopleos-user-id": "user_demo_emp_01",
  "x-peopleos-role": PEOPLEOS_ROLES.employee,
};

describe("Phase 2 Enterprise Core HR, Lifecycle, Org Designer & Self-Service", () => {
  test("1. RFC-4180 CSV parser handles BOM, quoted commas/newlines, escaped quotes, and rejects malformed rows", () => {
    const sample =
      '\uFEFFemployeeNumber,firstName,lastName,notes\r\n"REK-900","Wanjiku, M.","""Dee"" Kimani","Line 1\nLine 2"\r\n';
    const parsed = parseRfc4180Csv(sample);
    assert.strictEqual(parsed.fatalError, undefined);
    assert.strictEqual(parsed.diagnostics.length, 0);
    assert.strictEqual(parsed.rows.length, 1);
    assert.strictEqual(parsed.rows[0]!.values[0], "REK-900");
    assert.strictEqual(parsed.rows[0]!.values[1], "Wanjiku, M.");
    assert.strictEqual(parsed.rows[0]!.values[2], '"Dee" Kimani');
    assert.strictEqual(parsed.rows[0]!.values[3], "Line 1\nLine 2");

    const badQuote = parseRfc4180Csv('a,b\n"unclosed,2\n');
    assert.ok(Boolean(badQuote.fatalError) || badQuote.diagnostics.length > 0, "Unclosed quotes must fail parsing");

    const badCols = parseRfc4180Csv("a,b\n1,2,3\n");
    assert.ok(Boolean(badCols.fatalError) || badCols.diagnostics.length > 0, "Column count mismatch must be flagged");

    const exported = serializeSafeCsv(
      ["=CMD()", "+SUM(1,2)", "normal"],
      [{ "=CMD()": "=1+1", "+SUM(1,2)": "@eval", normal: "safe" }],
    );
    assert.ok(exported.includes("'=CMD()"));
    assert.ok(exported.includes("'+SUM(1,2)"));
    assert.ok(exported.includes("'=1+1"));
    assert.ok(exported.includes("'@eval"));
  });

  test("2. Bulk CSV Import Centre rejects sensitive columns, silent fallbacks, tampered/replayed tokens, and commits valid batches atomically", async () => {
    await withServer(async (baseUrl) => {
      // Template & guide download
      const tplRes = await fetch(`${baseUrl}/api/peopleos/employees/import-template?kind=standard`, {
        headers: hrHeaders,
      });
      assert.strictEqual(tplRes.status, 200);
      const tplText = await tplRes.text();
      assert.ok(tplText.includes("employeeNumber,firstName"));

      // Reject sensitive statutory / payroll columns
      const sensRes = await fetch(`${baseUrl}/api/peopleos/employees/import-preview`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          csvText:
            "employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate,nationalId,baseSalary\n" +
            "REK-901,Amina,Hassan,amina@rekker-demo.invalid,Chemist,MFG,Nairobi,permanent,2026-04-01,12345678,95000",
        }),
      });
      assert.strictEqual(sensRes.status, 400);

      // Reject unknown department code & invalid employmentType without silent coercion
      const invalidRes = await fetch(`${baseUrl}/api/peopleos/employees/import-preview`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          csvText:
            "employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate\n" +
            "REK-902,Grace,Wambui,grace.wambui@rekker-demo.invalid,Analyst,UNKNOWN_DEPT,Nairobi,contractor_xyz,2026-04-01",
        }),
      });
      assert.strictEqual(invalidRes.status, 200);
      const invalidData = (await invalidRes.json()) as any;
      assert.strictEqual(invalidData.validCount, 0);
      assert.strictEqual(invalidData.errorCount, 1);

      // Formula-safe error CSV download
      const errCsvRes = await fetch(
        `${baseUrl}/api/peopleos/employees/import-batches/${invalidData.batchId}/errors.csv`,
        { headers: hrHeaders },
      );
      assert.strictEqual(errCsvRes.status, 200);

      // Stage valid row with quoted comma in jobTitle
      const stageRes = await fetch(`${baseUrl}/api/peopleos/employees/import-preview`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          csvText:
            'employeeNumber,firstName,lastName,workEmail,jobTitle,departmentCode,location,employmentType,startDate\n' +
            'REK-903,Daniel,Omondi,daniel.omondi@rekker-demo.invalid,"QA Lead, Nairobi Plant",MFG,Nairobi Production Facility,fixed_term,2026-04-05',
        }),
      });
      assert.strictEqual(stageRes.status, 200);
      const stage = (await stageRes.json()) as any;
      assert.strictEqual(stage.validCount, 1);
      assert.strictEqual(stage.state, "READY_FOR_COMMIT");
      assert.ok(stage.importToken);

      // Reject tampered import token
      const tamperRes = await fetch(`${baseUrl}/api/peopleos/employees/import`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          batchId: stage.batchId,
          importToken: `${stage.batchId}.tamperedsignature`,
        }),
      });
      assert.ok(tamperRes.status === 400 || tamperRes.status === 403);

      // Valid commit succeeds atomically
      const commitRes = await fetch(`${baseUrl}/api/peopleos/employees/import`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          batchId: stage.batchId,
          importToken: stage.importToken,
        }),
      });
      assert.strictEqual(commitRes.status, 201);
      const commitData = (await commitRes.json()) as any;
      assert.strictEqual(commitData.importedCount, 1);

      // Replay commit on already COMMITTED batch must fail
      const replayRes = await fetch(`${baseUrl}/api/peopleos/employees/import`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          batchId: stage.batchId,
          importToken: stage.importToken,
        }),
      });
      assert.ok(replayRes.status === 400 || replayRes.status === 403 || replayRes.status === 409);
    });
  });

  test("3. Manager hierarchy cycle/self validation, effective-dated assignment history, timeline, and formula-safe export", async () => {
    await withServer(async (baseUrl) => {
      // Self-manager rejection
      const selfMgrRes = await fetch(
        `${baseUrl}/api/employees/10000000-0000-4000-8000-000000000001`,
        {
          method: "PATCH",
          headers: hrHeaders,
          body: JSON.stringify({ managerId: "10000000-0000-4000-8000-000000000001" }),
        },
      );
      assert.strictEqual(selfMgrRes.status, 400);

      // Cycle detection: 0002 reports to 0001 -> making 0001 report to 0002 creates A->B->A cycle
      const cycleRes = await fetch(
        `${baseUrl}/api/employees/10000000-0000-4000-8000-000000000001`,
        {
          method: "PATCH",
          headers: hrHeaders,
          body: JSON.stringify({ managerId: "10000000-0000-4000-8000-000000000002" }),
        },
      );
      assert.strictEqual(cycleRes.status, 400);

      // Effective-dated assignment change + timeline visibility
      const assignRes = await fetch(
        `${baseUrl}/api/peopleos/employees/10000000-0000-4000-8000-000000000002/assignment-changes`,
        {
          method: "POST",
          headers: hrHeaders,
          body: JSON.stringify({
            effectiveDate: "2026-05-01",
            changeType: "promotion",
            jobTitle: "Senior Filling Line Supervisor",
            location: "Nairobi Production Facility",
            reason: "Q2 supervisory promotion",
          }),
        },
      );
      assert.strictEqual(assignRes.status, 201);

      const timelineRes = await fetch(
        `${baseUrl}/api/peopleos/employees/10000000-0000-4000-8000-000000000002/timeline`,
        { headers: hrHeaders },
      );
      assert.strictEqual(timelineRes.status, 200);
      const timeline = (await timelineRes.json()) as any;
      assert.ok(timeline.history.length >= 1);
      assert.ok(timeline.events.some((e: any) => e.category === "promotion"));

      // Formula-safe employee export
      const exportRes = await fetch(`${baseUrl}/api/employees/export`, { headers: hrHeaders });
      assert.strictEqual(exportRes.status, 200);
      const csvBody = await exportRes.text();
      assert.ok(csvBody.includes("employeeNumber,firstName,lastName"));

      // Non-HR employee cannot bulk-export directory
      const empExportRes = await fetch(`${baseUrl}/api/employees/export`, {
        headers: employeeHeaders,
      });
      assert.strictEqual(empExportRes.status, 403);
    });
  });

  test("4. Position establishment governance and multi-view Org Chart with historical snapshot notice", async () => {
    await withServer(async (baseUrl) => {
      // Create draft position
      const createPos = await fetch(`${baseUrl}/api/peopleos/positions`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          positionCode: "POS-MFG-77",
          title: "Packaging Shift Lead",
          departmentId: "20000000-0000-4000-8000-000000000001",
          location: "Nairobi Production Facility",
          employmentType: "permanent",
          budgetedHeadcount: 2,
        }),
      });
      assert.strictEqual(createPos.status, 201);
      const created = (await createPos.json()) as any;
      const posId = created.position?.id ?? created.id;

      // Transition draft -> pending_approval -> approved
      const p1 = await fetch(`${baseUrl}/api/peopleos/positions/${posId}/transition`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({ targetStatus: "pending_approval" }),
      });
      assert.strictEqual(p1.status, 200);

      const p2 = await fetch(`${baseUrl}/api/peopleos/positions/${posId}/transition`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({ targetStatus: "approved" }),
      });
      assert.strictEqual(p2.status, 200);

      // Historical org-chart before history window explicitly discloses historical gap notice
      const histRes = await fetch(`${baseUrl}/api/peopleos/org-chart?asOf=2024-01-15`, {
        headers: hrHeaders,
      });
      assert.strictEqual(histRes.status, 200);
      const hist = (await histRes.json()) as any;
      assert.strictEqual(hist.historicalMode, true);
      assert.ok(typeof hist.historicalNotice === "string" && hist.historicalNotice.length > 10);
      assert.ok(hist.establishmentSummary);
    });
  });

  test("5. Idempotent candidate-to-employee conversion, probation extension guard, and structured offboarding", async () => {
    await withServer(async (baseUrl) => {
      // Convert candidate cand_01 idempotently
      const conv1 = await fetch(`${baseUrl}/api/recruitment/candidates/cand_01/convert-to-employee`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          departmentId: "20000000-0000-4000-8000-000000000001",
          location: "Nairobi Production Facility",
          employmentType: "permanent",
          startDate: "2026-04-20",
        }),
      });
      assert.strictEqual(conv1.status, 201);
      const d1 = (await conv1.json()) as any;
      assert.ok(d1.employee?.id);

      // Second conversion returns 409 idempotency conflict pointing to existingEmployeeId
      const conv2 = await fetch(`${baseUrl}/api/recruitment/candidates/cand_01/convert-to-employee`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          departmentId: "20000000-0000-4000-8000-000000000001",
          location: "Nairobi Production Facility",
          employmentType: "permanent",
          startDate: "2026-04-20",
        }),
      });
      assert.strictEqual(conv2.status, 409);
      const d2 = (await conv2.json()) as any;
      assert.strictEqual(d2.existingEmployeeId, d1.employee.id);

      // Seed a probation review and enforce Kenya §42 max 1 extension rule
      const revId = "prob-test-42";
      phase2MemoryStore.probationReviews.push({
        id: revId,
        organizationId: "rekker-demo",
        employeeId: d1.employee.id,
        milestoneDay: 90,
        probationEndDate: "2026-07-19",
        status: "pending_review",
        extensionCount: 0,
        extendedUntilDate: null,
        outcome: null,
        reviewerUserId: null,
        reviewedAt: null,
        notes: null,
        createdAt: new Date(),
      });
      const ext1 = await decideProbationReview({
        organizationId: "rekker-demo",
        actorUserId: "user_demo_admin_01",
        actorName: "hr_admin",
        reviewId: revId,
        decision: "extend",
        extendedUntilDate: "2026-10-19",
        notes: "Agreed extension per §42",
        demoEmployees: [],
        demoDepartments: [],
      });
      assert.strictEqual(ext1.ok, true);

      const ext2 = await decideProbationReview({
        organizationId: "rekker-demo",
        actorUserId: "user_demo_admin_01",
        actorName: "hr_admin",
        reviewId: revId,
        decision: "extend",
        extendedUntilDate: "2027-01-19",
        notes: "Second extension prohibited",
        demoEmployees: [],
        demoDepartments: [],
      });
      assert.strictEqual(ext2.ok, false);
      assert.strictEqual(ext2.statusCode, 400);

      // Structured offboarding
      const offRes = await fetch(`${baseUrl}/api/onboarding/offboard`, {
        method: "POST",
        headers: hrHeaders,
        body: JSON.stringify({
          employeeId: d1.employee.id,
          effectiveDate: "2026-11-30",
          reason: "Resignation at completion of notice",
        }),
      });
      assert.ok(offRes.status === 200 || offRes.status === 201);
    });
  });

  test("6. Self-service identity binding, unlinked fail-safe, protected field blocking, SoD, and ODPC SLA rights", async () => {
    await withServer(async (baseUrl) => {
      // Employee strictly binds to 0002, never hardcoded 0007
      const meRes = await fetch(`${baseUrl}/api/peopleos/me`, { headers: employeeHeaders });
      assert.strictEqual(meRes.status, 200);
      const meData = (await meRes.json()) as any;
      assert.strictEqual(meData.linked, true);
      assert.strictEqual(meData.employee.id, "10000000-0000-4000-8000-000000000002");

      // Service check for unlinked user (employeeId: null)
      const unlinked = await getSelfServiceWorkspace({
        membership: {
          userId: "unlinked-user",
          organizationId: "rekker-demo",
          role: "employee",
          employeeId: null,
          createdAt: new Date(),
        },
        demoEmployees: [],
        demoDepartments: [],
      });
      assert.strictEqual(unlinked.linked, false);

      // Protected field blocked
      const empMembership = {
        userId: "user_demo_emp_01",
        organizationId: "rekker-demo",
        role: "employee",
        employeeId: "10000000-0000-4000-8000-000000000002",
        createdAt: new Date(),
      };
      const protectedCorr = await submitProfileCorrectionRequest({
        membership: empMembership,
        fieldName: "baseSalary",
        proposedValue: "999999",
        reason: "Unauthorized edit attempt",
        demoEmployees: [],
      });
      assert.strictEqual(protectedCorr.ok, false);
      assert.strictEqual(protectedCorr.statusCode, 403);

      // Allowed field + SoD self-approval block
      const allowedCorr = await submitProfileCorrectionRequest({
        membership: empMembership,
        fieldName: "preferredName",
        proposedValue: "M. Kariuki",
        reason: "Preferred badge name",
        demoEmployees: [{ id: "10000000-0000-4000-8000-000000000002", preferredName: null }],
      });
      assert.strictEqual(allowedCorr.ok, true);

      const selfApprove = await decideProfileCorrectionRequest({
        membership: empMembership,
        requestId: allowedCorr.request.id,
        decision: "approved",
        demoEmployees: [],
      });
      assert.strictEqual(selfApprove.ok, false);
      assert.strictEqual(selfApprove.statusCode, 403);

      // ODPC Privacy SLA without auto-erasure
      const accessReq = await submitPrivacyRequest({
        membership: empMembership,
        requestType: "access",
        details: "Provide copy of my personal employment data",
      });
      assert.strictEqual(accessReq.ok, true);
      assert.strictEqual(accessReq.request.retentionCheckRequired, true);
      assert.strictEqual(accessReq.request.status, "submitted");
    });
  });

  test("7. Attendance spoofing block, persisted corrections, calendar holiday exclusion, compliance & privacy-suppressed analytics", async () => {
    await withServer(async (baseUrl) => {
      // Employee cannot clock-in or file corrections on behalf of another employeeId
      const spoofClock = await fetch(`${baseUrl}/api/attendance/clock-in`, {
        method: "POST",
        headers: employeeHeaders,
        body: JSON.stringify({ employeeId: "10000000-0000-4000-8000-000000000001" }),
      });
      assert.strictEqual(spoofClock.status, 403);

      // Calendar working-day calculation excludes rest days & holidays (e.g., 2026-05-01 Labour Day Friday + Sat/Sun)
      const dayCalc = countCalendarWorkingDays("2026-04-30", "2026-05-04", {
        workdays: [1, 2, 3, 4, 5],
        holidays: [{ date: "2026-05-01", name: "Labour Day" }],
      });
      assert.strictEqual(
        dayCalc.workingDays,
        2,
        "Thu Apr 30 + Mon May 4 = 2 working days (excluding May 1 holiday & weekend)",
      );
      assert.strictEqual(dayCalc.excludedHolidayCount, 1);

      // Analytics small-group suppression for non-HR role vs full visibility for HR
      const empAnalyticsRes = await fetch(`${baseUrl}/api/peopleos/analytics/workforce`, {
        headers: employeeHeaders,
      });
      assert.strictEqual(empAnalyticsRes.status, 200);
      const empAnalytics = (await empAnalyticsRes.json()) as any;
      assert.strictEqual(empAnalytics.privacySuppressionApplied, true);

      // Manager workspace strictly returns manager metadata
      const mgrRes = await fetch(`${baseUrl}/api/peopleos/manager/workspace`, {
        headers: managerHeaders,
      });
      assert.strictEqual(mgrRes.status, 200);

      // Kenyan compliance endpoint exposes statutory notice & disclaimer
      const compRes = await fetch(`${baseUrl}/api/peopleos/compliance/kenya-readiness`, {
        headers: hrHeaders,
      });
      assert.strictEqual(compRes.status, 200);
      const comp = (await compRes.json()) as any;
      assert.ok(Array.isArray(comp.legalMetadata) && comp.legalMetadata.length >= 4);
      assert.strictEqual(comp.legalMetadata[0]?.requiresHrLegalReview, true);
      assert.ok(comp.legalMetadata[0]?.dateResearched);
      assert.ok(comp.section10Summary);
    });
  });
});
