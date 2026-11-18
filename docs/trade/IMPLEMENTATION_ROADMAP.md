# Rekker Trade — Phased Implementation Roadmap

**Platform:** Rekker Trade (`trade.rekker.co.ke`)  
**Implementation Strategy:** Modular, feature-first delivery preserving all existing PeopleOS operations while building complete enterprise B2B wholesale capabilities.

---

## 1. Phased Delivery Overview

| Phase | Domain / Focus | Key Deliverables | Status |
|---|---|---|---|
| **Phase 0** | **Architecture & Foundation** | Architecture discovery, database models, OpenAPI routes scaffolding | 🚀 **In Progress** |
| **Phase 1 & 2** | **B2B Onboarding & Accounts** | Multi-branch business accounts, KRA PIN verification, document uploads, account approval | ⏳ Next |
| **Phase 3 & 4** | **Catalogue & Warehouse Stock** | Brands (Saffron Milan, Bio Saff, Cornells, PetCare), packaging conversions (packs/cartons), stock reservations | ⏳ Next |
| **Phase 5 & 6** | **Pricing Engine & Marketplace** | Wholesaler/Distributor tier pricing, volume breaks, minimum order quantities (MOQ), B2B storefront | ⏳ Next |
| **Phase 7 & 8** | **Bulk Cart, Orders & RFQs** | Bulk CSV/Excel order upload, quick reorder, formal quotations, sales rep counter-offers | ⏳ Next |
| **Phase 9 & 10** | **Finance, Payments & Fulfilment** | Invoices, M-Pesa Daraja B2B STK push, 30-day trade credit, warehouse pick/pack/dispatch | ⏳ Next |
| **Phase 11 & 12** | **Field Sales PWA & CRM** | Sales rep customer visits, offline order capture, sales targets, Customer 360 profile | ⏳ Next |
| **Phase 13 & 14** | **Suppliers & Exec Analytics** | Supplier purchase orders, executive revenue dashboards, gross margin reports | ⏳ Next |
| **Phase 15** | **12-Agent Trade AI Ecosystem** | Trade Assistant, Demand Forecaster, Pricing Intelligence, Sales Intelligence | ⏳ Next |

---

## 2. Immediate Phase 0 & Phase 1 Execution Plan

1. **Database Schema Scaffolding (`lib/db/src/schema/rekkerTrade.ts`)**:
   - Establish Drizzle definitions for businesses, branches, products, pricing tiers, orders, quotations, invoices, payments, and shipments.
   - Re-export in `lib/db/src/schema/index.ts`.
2. **Trade API Service (`artifacts/api-server/src/routes/trade.ts`)**:
   - Register endpoints:
     - `GET /api/v1/trade/overview`: Executive B2B trade metrics.
     - `GET /api/v1/trade/businesses`: Business customer directory & verification status.
     - `POST /api/v1/trade/businesses`: Self-service business registration.
     - `POST /api/v1/trade/businesses/:id/verify`: Admin review & verification.
     - `GET /api/v1/trade/products`: Trade product catalogue with packaging conversions & live stock.
     - `POST /api/v1/trade/pricing/calculate`: Centralized pricing engine (evaluating customer tier + volume breaks).
     - `GET /api/v1/trade/orders`: Order lifecycle and status tracking.
     - `POST /api/v1/trade/orders`: Idempotent bulk order creation with stock reservation.
     - `GET /api/v1/trade/quotations`: RFQ and quotation management.
     - `POST /api/v1/trade/quotations`: RFQ generation and sales counter-offers.
     - `GET /api/v1/trade/invoices`: Tax invoices and accounts receivable aging.
     - `POST /api/v1/trade/payments/mpesa`: M-Pesa Daraja STK Push trigger & callback verification.
3. **Frontend Trade Hub View (`artifacts/peopleos/src/pages/TradePage.tsx`)**:
   - Enterprise B2B Trade management console:
     - **Marketplace & Products Tab**: Live catalogue with packaging unit selector (Packs vs. Master Cartons) and tier prices.
     - **Bulk Ordering & Cart Tab**: Rapid order entry, CSV upload, and instant server pricing re-validation.
     - **Orders & Fulfilment Tab**: Order status pipeline from submission to warehouse dispatch.
     - **Quotations & RFQs Tab**: Commercial price negotiation workspace.
     - **Customers & Credit Tab**: Business account verification, credit limits, and aging ledger.
     - **Trade AI Copilot Tab**: Conversational Trade Assistant and demand forecasting insights.
4. **Automated Regression Suite (`artifacts/api-server/tests/trade-b2b.test.ts`)**:
   - Tests covering business verification, pricing engine volume break calculations, stock reservation concurrency, and payment reconciliation.
