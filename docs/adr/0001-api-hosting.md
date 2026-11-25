# ADR-0001: API hosting and Vercel routing

- **Status:** Proposed, pending owner approval
- **Date:** 25 November 2026

## Context

The project has a separately built Express 5 API in `artifacts/api-server`. The deployment guide describes hosting it on Render, Railway, Cloud Run or Fly.io. The current root `vercel.json` rewrites `/api/*` to the SPA `/index.html`, so same-origin API requests do not reach Express.

## Decision

For the first reliable leave slice, retain Express as a separately hosted Node service. After verifying its deployed HTTPS origin, change Vercel routing so `/api/:path*` proxies to that origin, with the API rule before the SPA catch-all. Configure exact allowed origins, health probes, request timeouts and non-cacheable responses for authenticated HR endpoints.

## Alternatives

- **Move Express into Vercel Functions:** viable, but requires verifying monorepo build/runtime packaging and database connection behaviour. More deployment refactoring than necessary for the first slice.
- **Vercel multi-service deployment:** viable if the project adopts Vercel services and the required build configuration. It changes deployment architecture and should be separately evaluated.
- **Keep current static-only deployment:** rejected for live leave processing because it cannot persist or authorize requests through the Express API.

## Consequences

- Requires the verified API host and environment variables from the owner.
- Provides a single browser-facing origin and avoids broad CORS exposure.
- API health/readiness must be checked against the real service, not a static fallback.
- Never commit a guessed API hostname.
