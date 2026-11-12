# Rekker PeopleOS — Phase 1 Enterprise Foundation Documentation Index

Branch: `phase-1/enterprise-foundation` (branched safely from `main` at `e1f8baa`).

## Architectural & Engineering Guides

- [01 — Repository Discovery & Baseline Audit](./01-repository-discovery.md)
- [02 — System Architecture & Request Lifecycle](./02-system-architecture.md)
- [03 — Authentication & Session Architecture](./03-authentication-and-sessions.md)
- [04 — Role-Based Access Control (RBAC) & Object-Level Authorization (IDOR)](./04-rbac-and-permissions.md)
- [05 — Data Security, Cryptography & ODPC Privacy Engineering](./05-data-security-and-privacy.md)
- [06 — Database Architecture, Migrations & Transaction Safety](./06-database-and-migrations.md)
- [07 — API Contracts, Validation, CORS & Error Handling](./07-api-contracts-and-hardening.md)
- [08 — External Integrations & M-Pesa / AI Boundary Hardening](./08-external-integrations.md)
- [09 — Frontend Fail-Loud Error Integrity, Auth State & Diagnostics UI](./09-frontend-resilience-and-ux.md)
- [10 — System Diagnostics, Observability & Alerting Foundations](./10-observability-and-diagnostics.md)
- [11 — CI/CD Pipeline & Environment Governance](./11-ci-cd-and-environments.md)
- [12 — Security Threat Model & Mitigation Matrix](./12-security-threat-model.md)
- [13 — Automated Testing Strategy & Security Regression Coverage](./13-testing-and-qa-strategy.md)
- [14 — Dependency & Supply Chain Audit](./14-dependency-and-supply-chain.md)
- [15 — Phase 1 Final Implementation & Verification Report](./15-phase-1-implementation-report.md)

## Architecture Decision Records (ADRs)

- [ADR 001: Modular Monolith over Premature Microservices](./adr/001-modular-monolith.md)
- [ADR 002: Database Access and Connection Pool Standardization](./adr/002-database-access-standardization.md)
- [ADR 003: Dual-Mode Encryption Versioning & Key Ring Migration Strategy](./adr/003-dual-mode-encryption-and-migration.md)
- [ADR 004: Fail-Closed Authentication & Controlled Static Preview Fallback](./adr/004-fail-closed-auth-and-fallback.md)
