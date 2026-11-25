# ADR-0002: Database and persistence

- **Status:** Proposed, pending owner approval
- **Date:** 25 November 2026

## Context

The repository already uses PostgreSQL, Drizzle ORM, a shared schema package and SQL migrations. Leave policies and requests are persisted, but the current balance is derived from requests and there is no append-only leave ledger.

## Decision

Retain PostgreSQL + Drizzle. Implement the leave slice through additive SQL migrations and typed Drizzle schema changes. Use transactions and row locks for approval, unique idempotency constraints for ledger postings, organisation-scoped foreign keys/queries, and append-only ledger entries. Compute balances as ledger sums. Keep audit records append-only through database permissions/triggers and a verifiable hash chain.

## Alternatives

- **Replace Drizzle or PostgreSQL:** rejected; unnecessary migration risk.
- **Store a mutable balance column:** rejected; it creates drift and double-deduction risk.
- **Use in-memory or browser storage:** rejected for live HR records.

## Consequences

- Requires a provisioned Postgres test database in CI.
- Migrations must be reversible or have a documented forward-recovery strategy.
- Existing requests need a controlled opening-balance/backfill strategy before balances become ledger-derived.
