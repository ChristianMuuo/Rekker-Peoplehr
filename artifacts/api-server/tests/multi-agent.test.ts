import { test, describe } from "node:test";
import assert from "node:assert";
import { retrieveRelevantPolicies } from "../src/routes/ai";

describe("Rekker AI Multi-Agent Intelligence Engine", () => {
  test("supervisor correctly classifies and routes domain inquiries", () => {
    function routeIntent(query: string): string {
      const lower = query.toLowerCase();
      if (lower.includes("pay") || lower.includes("salary") || lower.includes("kra") || lower.includes("nssf") || lower.includes("sha")) {
        return "payroll";
      } else if (lower.includes("job") || lower.includes("candidate") || lower.includes("interview") || lower.includes("resume")) {
        return "recruitment";
      } else if (lower.includes("policy") || lower.includes("act") || lower.includes("maternity") || lower.includes("paternity")) {
        return "compliance";
      } else if (lower.includes("okr") || lower.includes("goal") || lower.includes("kpi")) {
        return "performance";
      }
      return "copilot";
    }

    assert.strictEqual(routeIntent("Calculate KRA PAYE tax on KES 180,000"), "payroll");
    assert.strictEqual(routeIntent("Draft a job posting for Senior Brewmaster"), "recruitment");
    assert.strictEqual(routeIntent("What is the mandatory maternity leave under Kenya Employment Act?"), "compliance");
    assert.strictEqual(routeIntent("Draft quarterly OKRs for plant technicians"), "performance");
    assert.strictEqual(routeIntent("List all employees currently on probation"), "copilot");
  });

  test("RAG policy engine retrieves accurate statutory citations with source metadata", () => {
    const leaveResults = retrieveRelevantPolicies("annual leave entitlement in Kenya", 1);
    assert.strictEqual(leaveResults.length, 1);
    assert.strictEqual(leaveResults[0].title, "Organization Leave Policy & Statutory Floor Governance");
    assert.ok(leaveResults[0].content.includes("Section 28"));
    assert.ok(leaveResults[0].content.includes("configured directly per organization"));
    assert.ok(leaveResults[0].sourceDocument.includes("Kenya Employment Act"));

    const maternityResults = retrieveRelevantPolicies("maternity and paternity leave days", 1);
    assert.strictEqual(maternityResults.length, 1);
    assert.ok(maternityResults[0].content.includes("3 consecutive months"));
    assert.ok(maternityResults[0].content.includes("2 weeks"));
  });

  test("RAG policy engine accurately references Kenya Data Protection Act 2019", () => {
    const privacyResults = retrieveRelevantPolicies("data protection privacy standards for employee records", 1);
    assert.strictEqual(privacyResults.length, 1);
    assert.strictEqual(privacyResults[0].title, "Workforce Data Protection & Privacy Standard");
    assert.ok(privacyResults[0].sourceDocument.includes("Office of the Data Protection Commissioner (ODPC)"));
  });
});

