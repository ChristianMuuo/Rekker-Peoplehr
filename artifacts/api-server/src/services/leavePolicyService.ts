import { and, eq } from "drizzle-orm";
import { db, leaveLedgerTable, leavePoliciesTable, type EmployeeRecord, type LeavePolicyRecord } from "@workspace/db";
import {
  KENYA_LEAVE_POLICY_DEFAULTS,
  monthlyAccrualQuarterDays,
} from "./leaveEngine";

export async function ensureKenyaDefaultLeavePolicies(
  organizationId: string,
  createdByUserId?: string | null,
): Promise<void> {
  const current = await db
    .select({ id: leavePoliciesTable.id })
    .from(leavePoliciesTable)
    .where(eq(leavePoliciesTable.organizationId, organizationId))
    .limit(1);
  if (current.length) return;

  await db.insert(leavePoliciesTable).values(
    KENYA_LEAVE_POLICY_DEFAULTS.map((policy) => ({
      organizationId,
      code: policy.code,
      name: policy.name,
      entitlementDays: policy.entitlementDays,
      entitlementWeeks: policy.entitlementWeeks,
      entitlementMonths: policy.entitlementMonths,
      sickFullPayDays: policy.sickFullPayDays,
      sickHalfPayDays: policy.sickHalfPayDays,
      accrualMethod: policy.accrualMethod,
      minimumServiceMonths: policy.minimumServiceMonths,
      certificateRequired: policy.certificateRequired,
      paidPercentage: policy.paidPercentage,
      jurisdiction: policy.jurisdiction,
      effectiveFrom: "2026-01-01",
      sourceUrl: policy.sourceUrl,
      verifiedOn: policy.verifiedOn,
      needsLegalReview: policy.needsLegalReview,
      createdByUserId: createdByUserId ?? null,
      active: true,
    })),
  ).onConflictDoNothing();
}

function addUtcMonths(iso: string, months: number): string {
  const [yearText, monthText, dayText] = iso.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  const desiredDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(desiredDay, lastDay));
  return date.toISOString().slice(0, 10);
}

export async function ensureMonthlyAnnualLeaveAccrual(
  organizationId: string,
  employee: Pick<EmployeeRecord, "id" | "startDate">,
  policy: Pick<LeavePolicyRecord, "code" | "entitlementDays" | "accrualMethod" | "effectiveFrom">,
  asOf = new Date(),
): Promise<void> {
  if (policy.code !== "annual" || policy.accrualMethod !== "monthly" || policy.entitlementDays <= 0) {
    return;
  }

  const year = asOf.getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const start = employee.startDate > yearStart ? employee.startDate : yearStart;
  const startMonth = new Date(`${start}T00:00:00.000Z`);
  const asOfIso = asOf.toISOString().slice(0, 10);
  const accruedQuarterDays = monthlyAccrualQuarterDays(policy.entitlementDays);
  const entries: Array<{
    organizationId: string;
    employeeId: string;
    leaveType: string;
    entryType: string;
    quantityQuarterDays: number;
    effectiveDate: string;
    idempotencyKey: string;
    note: string;
    isDemo: boolean;
  }> = [];

  for (let month = 1; month <= 12; month += 1) {
    const effectiveDate = addUtcMonths(start, month);
    if (effectiveDate > asOfIso) break;
    if (effectiveDate.slice(0, 4) !== String(year)) continue;
    if (effectiveDate < policy.effectiveFrom) continue;
    const idempotencyKey = `accrual:${employee.id}:${policy.code}:${effectiveDate.slice(0, 7)}`;
    entries.push({
      organizationId,
      employeeId: employee.id,
      leaveType: policy.code,
      entryType: "accrual",
      quantityQuarterDays: accruedQuarterDays,
      effectiveDate,
      idempotencyKey,
      note: `Monthly accrual: ${policy.entitlementDays}/12 annual working days.`,
      isDemo: false,
    });
  }

  if (entries.length) {
    await db.insert(leaveLedgerTable).values(entries).onConflictDoNothing();
  }
}

export async function listPolicyForOrganization(
  organizationId: string,
  code: string,
): Promise<LeavePolicyRecord | null> {
  const [policy] = await db
    .select()
    .from(leavePoliciesTable)
    .where(
      and(
        eq(leavePoliciesTable.organizationId, organizationId),
        eq(leavePoliciesTable.code, code),
      ),
    )
    .limit(1);
  return policy ?? null;
}
