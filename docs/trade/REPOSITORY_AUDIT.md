# Rekker Trade — Repository Audit & Discovery Baseline

**Audit Date:** 18 November 2026  
**Auditor:** Principal Enterprise Software Architect & Engineering Review Board  
**Target Repository:** `github.com/ChristianMuuo/Rekker-Peoplehr`  
**Target Platform:** **Rekker Trade** (`trade.rekker.co.ke`) — Enterprise B2B Commerce, Wholesale Distribution, Procurement & AI Business Operations Platform

---

## 1. Executive Summary

This audit establishes an objective technical baseline for extending the Rekker enterprise ecosystem with **Rekker Trade**, operating alongside **Rekker PeopleOS** and external consumer storefronts (`rekker.co.ke`, `shop.rekker.co.ke`).

The codebase is organized as a production-grade, highly structured **pnpm monorepo**. It contains an Express 5 API server, React 19 SPA frontend, Drizzle ORM PostgreSQL integration, and an isolated Python 3.12 FastAPI ML engine. 

### Key Findings
1. **Repository Health:** The repository is exceptionally healthy. Monorepo typechecking passes cleanly across all workspaces (`@workspace/peopleos`, `@workspace/api-server`, `@workspace/db`, etc.), and 93 regression test suites pass with zero failures.
2. **Preservation Directive:** Existing PeopleOS modules (HRMS, Leave Calendar, Statutory Payroll, Maker-Checker Controls, Workforce ERP, and Multi-Agent AI) are preserved without modification.
3. **Architecture Match:** The existing stack (TypeScript, Node.js/Express 5, React 19/Vite, Tailwind, Drizzle ORM, PostgreSQL, Python ML) matches the requirements of Rekker Trade. We leverage this architecture to implement Rekker Trade as a modular monolith with clean domain separation.

---

## 2. Technology Stack Inventory

| Component | Technology | Version | Purpose / Status |
|---|---|---|---|
| **Package Manager** | `pnpm` | `10.4.1` (frozen lockfile) | Monorepo dependency management with catalog protocol |
| **API Server** | Node.js / Express | `5.0.1` | REST API, OpenAPI routing, RBAC, tenant isolation |
| **Frontend SPA** | React / Vite | React `19.0.0`, Vite `7.3.7` | High-performance SPA with Tailwind CSS & Lucide icons |
| **Database ORM** | Drizzle ORM / pg | Drizzle `0.38.3`, node-postgres `8.23.1` | PostgreSQL schemas, migrations, relation queries |
| **API Contracts** | OpenAPI 3.1 / Zod | Zod `3.24.1` | Contract-first schemas and validators |
| **Python ML Engine** | Python / FastAPI / Uvicorn | Python `3.12` | Scikit-learn, XGBoost, and statistical forecasting services |
| **Authentication** | Clerk / Fail-Closed Demo | Dynamic mode | Production requires Clerk; sandbox provides strict RBAC simulation |
| **Cryptography** | Node.js `crypto` | Built-in | AES-256-GCM field encryption, HMAC blind indexes |

---

## 3. Workspace Architecture

```
Rekker-Peoplehr/
├── artifacts/
│   ├── api-server/         # Express 5 backend server (Port 5000)
│   ├── peopleos/           # React 19 enterprise frontend (Port 5173)
│   └── mockup-sandbox/     # Component sandbox & UI preview
├── lib/
│   ├── api-client-react/   # Generated React Query hooks & mock store
│   ├── api-spec/           # OpenAPI 3.1 contract specifications
│   ├── api-zod/            # Zod validation schemas
│   └── db/                 # Drizzle schema, migrations, connection pool
├── services/
│   └── ml-engine/          # Python 3.12 FastAPI machine learning service
├── docs/                   # Architecture, audit, and operational documentation
│   ├── trade/              # Dedicated Rekker Trade specifications
│   └── audit/              # Historical PeopleOS baseline audits
└── .github/                # GitHub Actions CI workflow & PR templates
```

---

## 4. Capability Classification: Existing vs. Rekker Trade Additions

### Class A: Existing Capabilities (Preserve & Protect)
- **Rekker PeopleOS Enterprise HRMS**: Employee 360 directory, statutory payroll engine (PAYE, NSSF, SHIF, AHL, P9A), attendance timecards, leave management and team calendar, confidential HR cases, Maker-Checker dual control, and workforce ERP operations.
- **Enterprise Security & Tenant Isolation**: AES-256-GCM encryption, blind indexing, fail-closed RBAC, transaction-safe audit logging.
- **Python ML Engine & AI Supervisor**: Attrition, absence, and performance prediction services.

### Class B: Rekker Trade New Features (To Implement)
1. **Business Onboarding & Verification**: Self-service business registration (legal name, KRA PIN, CR12, certificates) with Admin verification workflow (`draft`, `submitted`, `under_review`, `approved`, `suspended`).
2. **Multi-Branch Organization**: Centralized business accounts with multiple branch delivery addresses, branch ordering limits, and branch managers.
3. **Trade Product Catalogue & Packaging Engine**: B2B product specifications, brand associations (Saffron Milan, Bio Saff, Cornells, PetCare), packaging conversions (units, packs, cartons, cases), and real-time stock levels.
4. **B2B Commercial Pricing Engine**: Customer category pricing (Retailer, Wholesaler, Distributor, Strategic), volume quantity breaks, minimum order quantities (MOQ), and customer-specific negotiated price lists.
5. **Smart B2B Cart & Bulk Ordering**: CSV/Excel order upload, quick reorder from past purchases, bulk SKU input, packaging auto-conversion, and server-side price re-validation.
6. **Quotations, Negotiations & RFQs**: Request for Quotation (RFQ) lifecycle, sales rep discount counter-offers, margin protection, formal PDF quotation generation, and one-click order conversion.
7. **B2B Payments & Credit Facility**: M-Pesa Daraja B2B/C2B STK push and callback verification, bank wire transfer instructions, 7/14/30-day trade credit accounts, credit limits, and accounts receivable aging.
8. **Order Management & Fulfilment**: Comprehensive order lifecycle (`draft` → `submitted` → `processing` → `picking` → `packed` → `dispatched` → `delivered`), warehouse pick/pack lists, and proof of delivery (POD).
9. **S-Tier Trade AI Agent Ecosystem**: 12 domain specialists (Trade Assistant, Sales Intelligence, Demand Forecasting, Inventory Intelligence, Pricing Intelligence, etc.) with strict tool authorization and human approval gates.

### Class C: External Systems (Connect via Safe Adapters Only)
- **Consumer E-Commerce (`shop.rekker.co.ke`)**: External consumer storefront. Connected via read-only product and order synchronization adapters; never share a direct database.
- **Corporate Portal (`rekker.co.ke`)**: Outbound links and brand catalog sync only.
- **Safaricom Daraja B2B/C2B**: Live M-Pesa API with sandbox simulation fallback.

---

## 5. Technical Debt & Immediate Remediation
1. **Trade Domain Isolation**: Rekker Trade endpoints must reside under `/api/v1/trade/*` to prevent naming collisions with PeopleOS `/api/*` endpoints.
2. **Integer Currency Consistency**: All trade transactions, prices, discounts, and credit limits must strictly use integer minor units (cents in KES) or decimals, avoiding IEEE 754 floating-point errors.
3. **Stock Reservation Concurrency**: High-concurrency checkout must use PostgreSQL row-level locks (`SELECT FOR UPDATE`) or transactional reservation balances to prevent stock overselling.
