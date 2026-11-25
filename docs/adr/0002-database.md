# ADR 0002: Database Engine, ORM, Migrations & Ledger Integrity

**Date:** 2026-11-25  
**Status:** Proposed (Phase 0)

---

## Context

`lib/db` already defines PostgreSQL tables via Drizzle ORM (`drizzle-orm` + `pg` + `drizzle-kit`) and 7 sequential SQL migrations (`0001` through `0007`). However, in practice:

1. Virtually every service and route in `artifacts/api-server/src/` checks `if (!process.env.DATABASE_URL)` and silently branches into volatile in-memory arrays (`DEMO_LEAVE_STORE`, `DEMO_AUDIT_STORE`, `phase2MemoryStore`, `workforceErpMemoryStore`), while the client falls back to `fallback-store.ts`.
2. Leave policies (`peopleos_leave_policies`) start empty by design and lack effective dates, statutory rules metadata (`source_url`, `verified_on`, `needs_legal_review`), unit support (`days` / `weeks` / `months`), `leave_types`, `work_schedules`, `public_holidays`, `leave_ledger`, `leave_approvals`, and `leave_attachments`.
3. `peopleos_audit_events` currently lacks `before_json`, `after_json`, `reason`, `ip`, `user_agent`, `request_id`, `prev_hash`, `hash`, and DB-role restriction against `UPDATE`/`DELETE`.

---

## Options Considered

| Option | Description | Trade-offs |
|---|---|---|
| **A. Managed PostgreSQL (Neon or Supabase) + Drizzle ORM + SQL Migrations** *(Recommended)* | Provision a hosted PostgreSQL database (Neon serverless Postgres with standard pooled `pg` URL, or Supabase/Render Postgres). Enforce `DATABASE_URL` in deployed demo and production; use Drizzle schema + sequential SQL migrations (`lib/db/migrations/`); enforce least-privilege DB role with no `UPDATE`/`DELETE` on `audit_log`. | **Pros:** Zero ORM rewrite (Drizzle + `pg` already installed and wired); native ACID transactions (`SELECT ... FOR UPDATE`), optimistic concurrency, and append-only ledger/audit constraints work reliably; Neon offers instant branching for CI/test databases and low/zero cold cost. **Cons:** Requires `DATABASE_URL` secret in hosted API & CI test job. |
| **B. Embedded SQLite (`better-sqlite3` / LibSQL)** | Replace Postgres with a local SQLite file inside the API container. | **Pros:** No external DB host needed. **Cons:** Would require rewriting all `lib/db/src/schema/*.ts` (`pgTable`, `uuid`, `date`) and all 7 SQL migrations; poor fit for multi-instance scaling and `autoscale` containers without persistent volume locking. |
| **C. Keep Dual In-Memory Store for Hosted Demo** | Run the hosted API without `DATABASE_URL` using in-memory JS arrays. | **Pros:** Zero DB setup. **Cons:** Violates credibility goals — every container restart wipes submitted leave requests and audit logs, and cannot enforce DB-level transactions, concurrency locks, or immutable audit permissions. |

---

## Proposed Decision

Adopt **Option A (Managed PostgreSQL — Neon / Supabase / Render Postgres — with Drizzle ORM & Sequential SQL Migrations)**.

1. Keep PostgreSQL + Drizzle ORM (`lib/db`) and run migrations explicitly on deploy / CI (`0001`–`0008+`).
2. Add Workstream A relational tables via a new Drizzle migration: `leave_types`, `leave_policies` (effective-dated + legal citation metadata), `work_schedules`, `public_holidays`, `leave_ledger` (append-only; balances always computed as `SUM`), `leave_requests` (status machine + optimistic version), `leave_approvals`, `leave_attachments`, and tamper-evident `audit_log` (`prev_hash` / `hash` chain).
3. Enforce a restricted application PostgreSQL role (or trigger/privilege guardrail tested in CI) with `INSERT`/`SELECT` only on `audit_log` (no `UPDATE` or `DELETE`).
4. In deployed environments (including the hosted live demo), `DATABASE_URL` is **mandatory**; in-memory mocks are restricted strictly to unit tests or explicit offline test harnesses, never live deployed environments.
5. In CI (`.github/workflows/ci.yml`), run integration tests against a real PostgreSQL service container.

---

## Consequences

- Real persistence for leave applications, manager recommendations, HR approvals, ledger deductions, reversals, and audit logs across page reloads and restarts.
- Requires setting `DATABASE_URL` on the API container host and adding a `postgres:16` service container to GitHub Actions CI.
