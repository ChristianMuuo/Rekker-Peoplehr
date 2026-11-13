# Rekker PeopleOS — Phase 5 Documentation Suite
## Advanced AI Agents, Python ML Intelligence, Predictive Analytics & Responsible AI Governance

### Documentation Navigation

- [01: Multi-Agent Architecture & Specialist Orchestration](01-ai-architecture-and-multi-agent-orchestration.md)
  Supervisor classification, 10 domain specialist agents, cross-domain collaboration, negative authorization, and human-in-the-loop approval gating.
- [02: Python ML Engine & Model Governance](02-python-ml-engine-and-model-governance.md)
  8 supported ML tasks, Scikit-learn & XGBoost engine, model registry tables, versioning, evaluation metrics, and administrative approvals.
- [03: Feature Assembly & Tenant Data Lineage](03-feature-assembly-and-tenant-data-lineage.md)
  Elimination of synthetic demo payloads in production, server-side tenant feature assembly, PII stripping, and `INSUFFICIENT_DATA` threshold handling.
- [04: Dynamic Policy RAG & Adversarial Defense](04-rag-policy-retrieval-and-security.md)
  Verifiable statutory citations under Kenya Employment Act 2007 and Data Protection Act 2019, prompt injection defense, and tenant policy indexing.
- [05: Responsible AI Governance & DPIA](05-responsible-ai-dpia-and-human-oversight.md)
  ODPC privacy compliance, right to explanation, calibrated confidence intervals, risk tiering, and ethical human oversight.

---

### Verification and Execution Commands

```bash
# Run all backend unit and integration tests (including Phase 5 AI governance suite)
pnpm --filter @workspace/api-server run test

# Run Python ML engine test suite
services/ml-engine/.venv/Scripts/python.exe -m unittest discover -s services/ml-engine/tests

# Run monorepo typecheck across all workspaces and packages
pnpm run typecheck

# Run production build (esbuild API server + Vite frontend)
pnpm run build
```
