# 14 — Dependency & Supply Chain Audit

## 1. Baseline `pnpm audit` Snapshot (Captured Pre-Phase 1 Edits)

Executed `pnpm audit --audit-level=moderate` on Windows workspace:
- **Summary:** `16` vulnerabilities reported (`0 critical | 6 high | 8 moderate | 2 low`) across transitive dependencies.
- **Affected Advisory Packages:**
  - `zod <4.6.6` (pinned in catalog at `^3.25.76` because `orval` codegen targets Zod v3; tracked for coordinated Phase 2 upgrade to Zod v4 when Orval template updates)
  - `body-parser <2.4.0` / `qs <=6.16.0` (Express 5 transitive HTTP body/query parsers)
  - `undici <7.30.1` (Node HTTP fetch library transitive pin)
  - `fast-uri <3.1.9` (OpenAPI/JSON Schema tooling transitive dependency)
  - `postcss-selector-parser <6.1.5` (Tailwind CSS build-time CSS AST tooling; dev/build only)

## 2. Supply Chain Governance & Policy

- **Frozen Lockfile in CI:** `.github/workflows/ci.yml` strictly enforces `pnpm install --frozen-lockfile`.
- **Single Package Manager Guard:** Root `package.json` `preinstall` hook removes accidental `package-lock.json` / `yarn.lock` files and enforces `pnpm`.
- **Deferral Rationale:** Upgrading Zod 3 -> 4 impacts all generated schemas (`lib/api-zod`, `orval.config.ts`) and Express/Vite transitive pins without security patches in `pnpm-lock.yaml` would risk destabilizing Phase 1 API stability; tracked cleanly for controlled patch-window lockfile updates (`pnpm up` + full CI verification).
- **Secrets & Credential Hygiene:** `.gitignore` excludes `.env*` files; `.env.example` contains placeholder templates only; Pino redaction protects runtime logs from secret emission.
