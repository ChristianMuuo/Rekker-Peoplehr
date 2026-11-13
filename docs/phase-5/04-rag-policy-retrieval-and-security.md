# Rekker PeopleOS — Phase 5: Dynamic Policy RAG & Adversarial Defense

## 1. Statutory Grounding Architecture

Rekker PeopleOS replaces brittle static policy mockups with a dynamic, document-backed **Retrieval-Augmented Generation (RAG)** architecture.

Policies are queried against:
1. **Statutory Baseline Documents**:
   - *Kenya Employment Act 2007 (Cap 226) §28*: Statutory annual leave floors (minimum 21 working days per 12 months continuous service).
   - *Kenya Employment Act 2007 §29*: Fully paid 90-day maternity leave and 14-day paternity leave protections.
   - *Kenya Employment Act 2007 §42*: Probation period boundaries and termination notice guidelines.
   - *Kenya Data Protection Act 2019 (ODPC)*: Safeguards regarding processing of sensitive personal employee data.
   - *Rekker AI Governance Charter v2.0*: Ethical constraints, prohibition of algorithmic terminations, and human signoff requirements.
2. **Tenant Custom Policy Documents**:
   - Persisted in table `peopleos_rag_policy_documents` with columns `organizationId`, `title`, `category`, `content`, `sourceDocument`, `effectiveDate`, `version`, and `accessRolesJson`.

---

## 2. Prompt-Injection Defense

Adversarial text in employee submissions, performance comments, or external policy uploads poses an indirect prompt injection risk.

Phase 5 introduces active input sanitization via `sanitizeRagText`:
- Patterns matching `ignore previous instructions`, `disregard all rules/rbac`, and `you are now in debug mode` are intercepted and replaced with `[REDACTED_INSTRUCTION]`.
- System instruction tags (`system:`, `<|im_start|>`, `<|im_end|>`) are stripped.
- Documents are fed into the LLM system prompt as **untrusted external evidence** rather than system-level executable commands.

---

## 3. Verifiable Citation Schema

Every RAG policy retrieved by the engine exposes structured citation metadata:
```json
{
  "title": "Organization Leave Policy & Statutory Floor Governance",
  "source": "Kenya Employment Act 2007 §28 & Rekker PeopleOS Workforce Operations Policy §4.1",
  "effectiveDate": "2026-01-01",
  "excerpt": "Under Section 28 of the Kenya Employment Act 2007, statutory minimum annual leave floors must be respected..."
}
```

This guarantees complete traceability and legal accountability for all advice provided by the AI Copilot and Compliance specialist agents.
