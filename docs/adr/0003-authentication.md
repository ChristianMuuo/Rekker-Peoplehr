# ADR-0003: Authentication and authorization

- **Status:** Proposed, pending owner approval
- **Date:** 25 November 2026

## Context

The frontend and Express API already integrate Clerk. Runtime configuration supports explicit Clerk and demo modes, and production configuration rejects demo auth. The frontend also has a placeholder auth context for static/demo preview behaviour.

## Decision

Retain Clerk for identity, session verification and MFA. Require Clerk mode for every deployed environment that can contain real employee data. Enforce role and organisation membership on every API route; do not treat hidden navigation as authorization. Keep demo mode restricted to synthetic non-production tenants and visibly label every demo screen. Remove placeholder-auth fallback from production paths.

## Alternatives

- **Build password auth in-house:** rejected for this sprint because it adds password storage, reset, MFA and session-security obligations already covered by Clerk.
- **UI-only role checks:** rejected because they do not protect API data.
- **Public demo without a server-side gate:** rejected because noindex is not access control.

## Consequences

- Owner must confirm Clerk production keys, allowed origins, session settings and MFA policy.
- Admin MFA enforcement must be configured and tested, not merely described in marketing copy.
- Automated tests must cover cross-organisation access and role denial.
