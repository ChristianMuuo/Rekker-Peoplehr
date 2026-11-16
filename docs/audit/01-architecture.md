# Rekker PeopleOS — Architecture & Topology Audit

## 1. System Topology Overview

```mermaid
flowchart TD
    subgraph Client Tier ["Client Tier (Browser / Mobile)"]
        Browser["React 19 Vite SPA<br/>(Hosted on Vercel CDN)"]
    end

    subgraph Edge Layer ["Edge Routing & Proxy"]
        VercelCDN["Vercel Global Edge Network<br/>rewrites: /api/(.*) -> index.html (Sandbox)<br/>or Reverse Proxy -> API Server"]
    end

    subgraph Application Tier ["Application Tier (Container / VPS)"]
        ExpressServer["Express 5 API Server (Node 22)<br/>artifacts/api-server<br/>Port 5000"]
        MLService["Python 3.12 ML Engine (FastAPI)<br/>services/ml-engine<br/>Port 8001"]
    end

    subgraph Data & Persistence Tier ["Data & Security Tier"]
        PostgresDB[("PostgreSQL 15+<br/>Drizzle ORM<br/>RLS / Tenant Isolation")]
        AuditStore[("Immutable Audit Trail<br/>AES-256-GCM Encrypted PII")]
    end

    subgraph External Services ["External Enterprise Ecosystem"]
        ClerkAuth["Clerk Identity Provider<br/>(OIDC / Session Cookies)"]
        DarajaMpesa["Safaricom Daraja B2C<br/>(Payroll Disbursement API)"]
        OpenAIAPI["OpenAI API<br/>(LLM Reasoning & Orchestration)"]
    end

    Browser -->|HTTPS Static Assets| VercelCDN
    Browser -->|REST API / Bearer Auth| ExpressServer
    ExpressServer -->|Session Verification| ClerkAuth
    ExpressServer -->|Inference RPC| MLService
    ExpressServer -->|SQL Queries & Migrations| PostgresDB
    ExpressServer -->|Security Logs| AuditStore
    ExpressServer -->|B2C Disbursements| DarajaMpesa
    ExpressServer -->|Zero-PII Prompts| OpenAIAPI
```

---

## 2. Core Package Responsibilities

| Package Path | Package Name | Role & Architecture Boundary |
|---|---|---|
| `artifacts/peopleos` | `@workspace/peopleos` | React 19 SPA, Tailwind v4, Lucide icons, TanStack React Query v5. Communicates strictly with OpenAPI client. |
| `artifacts/api-server` | `@workspace/api-server` | Express 5 HTTP REST API. Encapsulates business logic, statutory calculations, audit logging, and RBAC. |
| `lib/api-client-react` | `@workspace/api-client-react` | Orval-generated React Query hooks, custom fetch wrapper, and fallback sandbox store. |
| `lib/api-zod` | `@workspace/api-zod` | TypeScript type declarations and Zod request/response validation contracts generated from OpenAPI 3.0. |
| `lib/db` | `@workspace/db` | Drizzle ORM schema definitions, relationship maps, and SQL migration files. |
| `services/ml-engine` | N/A (Python Service) | Standalone FastAPI microservice providing XGBoost & scikit-learn models for workforce demand and attrition forecasting. |
| `artifacts/mockup-sandbox` | `@workspace/mockup-sandbox` | Isolated development environment for rapid component styling and visual regression testing. |
