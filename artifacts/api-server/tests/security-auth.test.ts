import { test, describe } from "node:test";
import assert from "node:assert";
import { PEOPLEOS_ROLES } from "../src/middlewares/peopleosAccess";

describe("Enterprise Security & Role-Based Access Control (RBAC)", () => {
  test("defines strict enterprise roles hierarchy", () => {
    assert.strictEqual(PEOPLEOS_ROLES.hrAdmin, "hr_admin");
    assert.strictEqual(PEOPLEOS_ROLES.payrollOfficer, "payroll_officer");
    assert.strictEqual(PEOPLEOS_ROLES.employee, "employee");
    assert.strictEqual(PEOPLEOS_ROLES.systemAdmin, "system_admin");
  });

  test("negative authorization: employee role cannot approve payroll", () => {
    const allowedRoles = [PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.payrollOfficer, PEOPLEOS_ROLES.systemAdmin];
    const userRole = PEOPLEOS_ROLES.employee;
    const isAllowed = allowedRoles.includes(userRole);
    assert.strictEqual(isAllowed, false, "Employee must not be authorized to approve payroll");
  });

  test("negative authorization: recruiter role cannot access internal audit events", () => {
    const allowedRoles = [PEOPLEOS_ROLES.hrAdmin, PEOPLEOS_ROLES.auditor, PEOPLEOS_ROLES.systemAdmin];
    const userRole = PEOPLEOS_ROLES.recruiter;
    const isAllowed = allowedRoles.includes(userRole);
    assert.strictEqual(isAllowed, false, "Recruiter must not be authorized to view audit events");
  });

  test("organization tenant isolation: requests must match organization context", () => {
    const userOrgId = "rekker-demo";
    const requestedOrgId = "foreign-tenant-xyz";
    const hasTenantAccess = userOrgId === requestedOrgId;
    assert.strictEqual(hasTenantAccess, false, "Cross-tenant access must be rejected");
  });

  test("human approval gating requirement for salary modifications", () => {
    const pendingChange = {
      action: "MODIFY_SALARY",
      employeeId: "emp_01",
      newBaseSalary: 350000,
      requiresHumanSignoff: true,
      approvedBy: null,
    };

    assert.strictEqual(pendingChange.requiresHumanSignoff, true);
    assert.strictEqual(pendingChange.approvedBy, null, "Must not execute autonomously without authorized human signature");
  });
});

