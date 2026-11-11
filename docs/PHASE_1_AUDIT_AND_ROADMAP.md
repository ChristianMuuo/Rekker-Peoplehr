# Rekker Digital Ecosystem — Phase 1 Technical Audit & S-Tier Phased Roadmap

**Audit Date:** 2026-11-11  
**Targets Inspected:**
1. Live Corporate Website (`https://rekker.co.ke/`) & Consumer Storefront (`https://shop.rekker.co.ke/`)
2. Enterprise HR & ERP Monorepo (`Rekker-Peoplehr` at `c:\Users\ADMIN\rekkerhr\Rekker-Peoplehr`, commit `7d4661e`)

---

## 1. Access Scope & Source Limitations (Transparent Disclosure)

| Asset | Accessibility | Notes |
|---|---|---|
| `Rekker-Peoplehr` monorepo | **Full local source access** | React 19 + Vite 7 frontend, Express 5 API server, Drizzle/PostgreSQL schema, Python Scikit-learn/XGBoost ML engine. |
| `https://rekker.co.ke/` | **Public HTTP & client bundle inspected** | Served via Cloudflare as a compiled React + Vite SPA (`index-EK9yzray.js`, `index-QZTHW2_Y.css`). Source repo (`rekker.co.ke`) is **not** inside this local workspace. |
| `https://shop.rekker.co.ke/` | **Public HTML/bundle metadata inspected** | Served via Cloudflare (`index-C4HU5LI7.js`). Source repository is **not** available locally. |
| `https://api.rekker.co.ke/` | **Closed / external API** | Direct test `GET /api/shop/products?limit=4` returned `HTTP 404 {"success":false,"message":"Route not found"}`. Backend repo is **not** available locally. |

Per Global Development Rule 15, external source files not present in this workspace (`rekker.co.ke`, `shop.rekker.co.ke`, and `api.rekker.co.ke` repositories) are explicitly noted as unavailable; all company copy, brands, and image URLs reused below are strictly verified from public HTTP inspection of `https://rekker.co.ke/`, without inventing SKUs, achievements, factory counts, or certifications.

---

## 2. Phase 1.1: Corporate Website Audit (`https://rekker.co.ke/`)

### Verified Live Architecture & Brand Facts
- **Company:** Rekker Limited, Nairobi, Kenya (`info@rekker.co.ke`).
- **Verified Routes:** `/`, `/about`, `/brands`, `/brands/:slug`, `/manufacturing`, `/distribution`, `/partnerships`, `/contact`, `/404`.
- **Verified Portfolio (4 Brands):**
  1. **Saffron Milan** — Home & Household Care (laundry detergents, fabric care, dishwashing, kitchen/surface/floor cleaners, bulk & retail packs).
  2. **Bio Saff** — Beauty & Personal Care (hair care, braid sprays, edge control & styling, shampoos, body care formulated for African hair & skin).
  3. **Cornells** — Fragrance by Starling Parfums (nationwide retail/wholesale distribution by Rekker; consumer checkout via `shop.rekker.co.ke`).
  4. **PetCare** — Premium Pet Care ("Little Paws, Lots of Love." Pet shampoo for dogs, cats, and horses).
- **Verified Capabilities:** End-to-end Formulation & R&D, Production & Filling, Batch Quality Control compliant with Kenyan consumer goods standards, Private Label/Contract Manufacturing, Nationwide Modern/General Trade + Wholesale + Regional Distribution logistics targeting 47 counties, and B2C online checkout on `https://shop.rekker.co.ke`.
- **Typography & Visual Tokens:** `Space Grotesk` (display headings), `DM Sans` (body), primary crimson accent `#C71D1D` (`rekker.co.ke` uses warm parchment/stone surfaces and dark charcoal ink headers `#191817` / `#0a0a0a`).
- **Verified Public Media:** `/Logo.jpg`, `/images/hero-rekker.jpg`, `/images/brand-saffron.jpg`, `/images/brand-biosaff.jpg`, `/images/brand-cornells.jpg`, `/images/petcare-logo.jpg`, `/images/petcare-banner.jpg`.

### Gaps, Bugs, Security & Conversion Findings on `rekker.co.ke`
1. **Placeholder Phone Contact:** Footer & contact bundle expose `+254 700 000 000` — flagged for verification/replacement with Rekker's verified commercial desk number.
2. **Incomplete SEO Sitemap:** `https://rekker.co.ke/sitemap.xml` indexes only `https://rekker.co.ke/`, omitting `/about`, `/brands`, `/manufacturing`, `/distribution`, `/partnerships`, and `/contact`.
3. **Missing Browser Security Headers:** Live HTML responses lack `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, and `Content-Security-Policy` headers (only Cloudflare cache/content headers observed).
4. **Missing Functional Portals & Self-Service:** No `/portal` (Customer Quotation & Ticket Portal), `/distributor` (B2B Wholesale Ordering with MOQ enforcement), `/products` filterable public catalogue, `/careers` linked to live HR requisitions, `/privacy` (Kenya ODPC 2019), or `/terms`.
5. **External API Disconnection:** `api.rekker.co.ke/api/shop/products` returned `404` on direct fetch, leaving corporate product browsing coupled cleanly only inside the new unified monorepo API.

---

## 3. Phase 1.2: Existing Codebase Audit (`Rekker-Peoplehr`)

### Existing Architecture & Verified Working Functionality
- **Frontend (`artifacts/peopleos`):** React 19, Vite 7, Wouter routing, TanStack Query, Recharts, Lucide icons, Tailwind CSS, Clerk auth (with explicit local non-production demo mode).
- **Backend (`artifacts/api-server`):** Express 5 modular TypeScript server (`dist/index.mjs` via `esbuild`), RBAC (`peopleosAccess.ts`), AES-256-GCM field encryption (`security.ts`), rate limiting (`40 req/min` AI, `300 req/min` API), audit logging (`auditService.ts`), Kenyan Payroll Engine (`kenyaPayrollEngine.ts`), Safaricom Daraja M-Pesa B2C client (`mpesaService.ts`), and 11-node AI Multi-Agent Orchestrator (`src/ai/`).
- **ML Engine (`services/ml-engine`):** Python `scikit-learn 1.9.1` & `xgboost 3.4.1` microservice (`cli.py` + `server.py`) verified with 6 passing unit tests.
- **Database (`lib/db`):** PostgreSQL + Drizzle ORM schema (`peopleos.ts`) + `0001_enterprise_hrms.sql` migration.

### Identified Gaps & Fixes Needed Before Digital Ecosystem Expansion
1. **Brand / Domain Mismatch in Demo Data:** `peopleos.ts`, `recruitment.ts`, `documents.ts`, `performance.ts`, `learning.ts`, `peopleosAccess.ts`, and `fallback-store.ts` still referenced synthetic `"Rekker Breweries Kenya Ltd"` and `"Brewery"` terminology instead of Rekker Limited's verified **FMCG Manufacturing & Distribution** domain (`Formulation, Filling & Packaging`, `Saffron Milan`, `Bio Saff`, `Cornells`, `PetCare`).
2. **Public Website Route Hijack on Localhost:** `Home` in `App.tsx` was a minimal HR login splash and `AppHomeRedirect` automatically redirected signed-in demo sessions away from `/` to `/overview`, hiding public corporate navigation when developing/previewing locally.
3. **Stale SEO Metadata in `index.html`:** Contained `"Rekker PeopleOS — built on Replit. Update this description to reflect the app."` and lacked `robots.txt` / multi-URL `sitemap.xml` / JSON-LD `Organization` markup.
4. **Missing Ecosystem Modules (Phases 3–24):** Product Catalogue CMS, Quotation-to-CRM pipeline, Customer Portal, Distributor Wholesale Portal, Partner Approvals, Manufacturing/BOM/QMS, Inventory/Warehouses, Procurement, Logistics/Fleet, and Double-Entry Finance Ledger were not yet built.
5. **Upstream Dependency Advisories (`pnpm audit --prod --audit-level=high`):** 3 transitive advisories noted (`zod <4.6.6` in `drizzle-zod`, `body-parser <2.4.0` in `express` 5).

---

## 4. Top S-Tier Phased Transformation Roadmap & Checklist

We organize the 28 phases into **6 Production Sprints**, preserving strict API isolation (`Rule #10`: public routes never touch internal ERP tables), strict tenant/customer/distributor isolation, and zero fabricated statistics:

| Sprint | Covered Prompt Phases | Core Scope & S-Tier Capabilities | Current Status |
|---|---|---|---|
| **Sprint 1 (Non-Duplicated Core: B2B Portals, CRM & Careers)** | **Phases 1, 4, 5, 6, 19, 21, 22, 23** | Complete Audit of launched `rekker.co.ke` & `shop.rekker.co.ke`; De-duplicated ERP gateway (links externally to launched corporate website & consumer shop instead of repeating them); Isolated Customer B2B Quote/Ticket Portal (`/portal`); Distributor Wholesale & Approval Portal (`/distributor`, `/partner-approvals`) with MOQ enforcement; CRM Lead Kanban & Quotation Desk (`/crm`); Live HR-backed `/careers`; Schema migration `0002_digital_ecosystem.sql`; Automated tests. | **Complete & Tested** |
| **Sprint 2 (Supply Chain & Production ERP)** | **Phases 7, 8, 9, 10, 11** | Multi-warehouse Stock Ledger with transactional concurrency locks; Bills of Materials (BOM) & Production Work Orders; Quality Management (Batch IQC/IPQC/FQC & NCR); Requisition-to-PO-to-GRN Procurement; Logistics, Fleet, Routes & Proof of Delivery. | **Next Sprint** |
| **Sprint 3 (Double-Entry Finance & Kenya Localization)** | **Phases 12, 13** | Balanced Double-Entry GL, AR/AP Subledgers, Bank Reconciliation, Trial Balance/P&L/Balance Sheet, eTIMS/VAT rulesets, Historical Kenya Payroll reproducibility & Daraja M-Pesa B2C live reconciliation. | **Phase 13 Complete (Payroll/M-Pesa); Accounting Subledger Queued** |
| **Sprint 4 (PeopleOS HR Integration)** | **Phase 14** | Full PeopleOS HRMS (Employee 360°, Leave Policies, Payroll, Attendance, Performance, Recruitment, Learning, Expenses, Assets, Self-Service) — unified with CRM sales reps & public `/careers`. | **Complete & Tested (Linked to Ecosystem)** |
| **Sprint 5 (AI Agents, Predictive ML & Workflow Engine)** | **Phases 15, 16, 17, 18, 20** | Expand existing 11-node HR AI Supervisor + 8-model Python ML service across Sales, Inventory, Manufacturing, Procurement & Executive BI; Visual Event-Driven Workflow Automation Builder; Unified Omnichannel Notifications (Email/SMS/WhatsApp). | **HR AI & 8 ML Models Complete; Cross-ERP Expansion Queued** |
| **Sprint 6 (Integration Center & Production Release)** | **Phases 24, 26, 27, 28** | Central Integration Center (Daraja, eTIMS, Email/SMS/WhatsApp, Biometric, Maps); Load/Penetration E2E QA; Production Runbooks & Rollback Verification. | **Queued** |
