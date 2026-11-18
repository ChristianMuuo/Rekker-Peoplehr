# Rekker Trade — System Architecture Specification

**System:** Rekker Trade (`trade.rekker.co.ke`)  
**Architecture Pattern:** Modular Monolith with Independent AI Services & Background Workers  
**Target Environment:** Node.js 22 + Express 5, React 19 + Vite, PostgreSQL 16 + Drizzle ORM, Python 3.12 FastAPI ML Engine

---

## 1. High-Level Architecture Topology

```mermaid
flowchart TD
    subgraph Clients["Clients & Frontend Ecosystem"]
        WebB2B["Trade Web Portal (React 19 / Vite)\ntrade.rekker.co.ke"]
        PWAField["Field Sales PWA\n(Mobile Offline Sync)"]
        AdminConsole["Enterprise Operations Console\n(Executive, Warehouse, Finance)"]
    end

    subgraph API_Gateway["Express 5 API Gateway (:5000)"]
        AuthMiddleware["Tenant & Identity Guard\n(RBAC, Permissions, Scope)"]
        AuditMiddleware["Append-Only Audit Pipeline\n(SHA-256 Hash Chain)"]
        RateLimiter["Adaptive Rate Limiting\n& Security Headers"]
    end

    subgraph Core_Domains["Rekker Trade Core Business Domains"]
        B2B_Auth["Identity & Account Management"]
        Catalogue["Product Catalogue & Packaging Engine"]
        PricingEngine["Commercial B2B Pricing Engine"]
        Inventory["Warehouse & Inventory Reservation"]
        Commerce["Bulk Cart, Orders & Quotations"]
        Finance["Payments, Invoicing & Credit Control"]
        Fulfilment["Warehouse Fulfilment & Logistics"]
        CRM["Sales CRM & Field Operations"]
    end

    subgraph AI_Ecosystem["Trade AI & Machine Learning"]
        Supervisor["Trade AI Agent Supervisor"]
        AgentRegistry["12 Domain Specialist Agents"]
        MLEngine["Python ML Engine (:8000)\n(Demand & Attrition Forecasting)"]
    end

    subgraph Persistence["Storage & Database"]
        PostgreSQL[("PostgreSQL 16\nDrizzle ORM (Integer Cents)")]
        RedisQueue[("Redis 7 / BullMQ\n(Background Workers & Cache)")]
    end

    subgraph External_Integrations["External Adapters"]
        MpesaDaraja["Safaricom Daraja B2B/C2B"]
        RekkerShop["Rekker Consumer Shop (Read-Only Adapter)"]
        ETIMS["KRA eTIMS Tax Compliance Adapter"]
    end

    WebB2B --> API_Gateway
    PWAField --> API_Gateway
    AdminConsole --> API_Gateway

    API_Gateway --> AuthMiddleware
    AuthMiddleware --> AuditMiddleware
    AuditMiddleware --> RateLimiter
    RateLimiter --> Core_Domains

    Core_Domains --> PostgreSQL
    Core_Domains --> RedisQueue
    Core_Domains --> AI_Ecosystem
    AI_Ecosystem --> MLEngine
    Core_Domains --> External_Integrations
```

---

## 2. Core Architectural Domains

### Domain 1: Identity, Business Accounts & Access Control
- **Tenant Scope:** Every business (retailer, wholesaler, distributor) is isolated by `businessId`.
- **RBAC Matrix:** Strict resource permissions (e.g., `trade.orders:create`, `trade.pricing:manage`, `trade.credit:approve`).
- **Multi-Branch Hierarchy:** One business customer can maintain multiple branch delivery locations with dedicated branch managers and purchasing spending caps.

### Domain 2: Product Catalogue & Packaging Engine
- **Brand Hierarchy:** Saffron Milan, Bio Saff, Cornells, PetCare.
- **Packaging Conversions:** Mathematical, validated conversions between Base Units (piece/bottle), Packs, Cartons, and Cases.
- **Stock Availability:** Live stock, low stock thresholds, and warehouse-specific availability.

### Domain 3: Commercial Pricing & Commercial Rules Engine
- **Precedence Hierarchy:**
  1. Customer-Specific Negotiated Contract Pricing (highest priority)
  2. Approved Quotation Pricing (time-bounded)
  3. Tier / Category Pricing (Distributor > Wholesaler > Retailer)
  4. Volume Quantity Breaks (e.g., 50+ cartons = 12% off, 100+ cartons = 18% off)
  5. Base Catalogue Price (fallback)
- **Margin Protection:** Hard stop floor to prevent sales reps from offering sub-margin prices without Executive approval.

### Domain 4: Smart Cart, Checkout & Orders
- **Server-Side Revalidation:** All cart totals, taxes (16% VAT), discounts, and unit conversions are recomputed on the server; client prices are never trusted.
- **Stock Allocation:** Transactional reservations ensure stock is reserved at checkout and released if payment or approval expires.
- **Order State Machine:**
  `draft` → `submitted` → `awaiting_approval` → `awaiting_payment` → `confirmed` → `processing` → `picking` → `packed` → `dispatched` → `delivered` → `completed`.

### Domain 5: Quotations, Negotiations & Purchase Orders (RFQs)
- Customers request custom quotes for large volume orders.
- Sales reps adjust pricing with real-time gross margin indicators.
- One-click conversion from accepted quotation to binding purchase order.

### Domain 6: B2B Payments, Finance & Credit Control
- **Payment Methods:** M-Pesa Daraja STK Push, Bank Wire Transfer instructions, and 7/14/30-day Trade Credit.
- **Credit Governance:** Credit limits and credit terms must be formally approved by Finance Officers; credit accounts with overdue balances automatically place new orders on credit hold.

### Domain 7: Warehouse Fulfilment & Logistics
- Warehouse pick lists, packing confirmation, barcode/SKU verification, dispatch manifests, and proof of delivery (POD) capture.

### Domain 8: S-Tier AI Agent Ecosystem
- 12 specialist AI agents operating under StateGraph supervision:
  1. **Trade Assistant**: Natural language ordering, SKU resolution, and cart assembly.
  2. **Sales Intelligence**: Customer order frequency, churn risk, and cross-sell recommendations.
  3. **Demand Forecasting**: Rolling-origin ARIMA/XGBoost weekly demand projections.
  4. **Inventory Intelligence**: Stockout alerts, excess inventory, and replenishment triggers.
  5. **Pricing Intelligence**: Volume break optimization and margin impact simulations.
  6. **Customer Success**: Churn intervention and reorder reminders.
  7. **Procurement**: Raw material reorder recommendations and supplier comparison.
  8. **Finance Intelligence**: Overdue invoice aging and cash flow reconciliation.
  9. **Management Intelligence**: Executive sales briefings and gross margin summaries.
  10. **Customer Support**: Ticket routing and order status resolution.
  11. **Sales Rep Copilot**: Daily client visit briefings and route optimization.
  12. **Fraud & Anomaly Monitor**: Unusual purchase volumes, repeated failed payments, and credit abuse alerts.
