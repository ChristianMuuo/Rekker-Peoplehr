# Rekker Trade — Risk Register & Mitigation Strategy

**Date:** 18 November 2026  
**Status:** Active  

---

| # | Risk Description | Severity | Likelihood | Impact Area | Mitigation Strategy |
|---|---|---|---|---|---|
| **R-01** | **Inventory Overselling Under Concurrency**<br>Multiple wholesalers checking out the same fast-moving carton inventory simultaneously. | High | Medium | Fulfilment & Customer Trust | Transactional stock reservations with 15-minute lease timeouts and database row-level locking during checkout. |
| **R-02** | **Unauthorized Pricing Discounts**<br>Field sales representatives offering unapproved or negative-margin discounts to close deals. | High | High | Gross Margin & Profitability | Hard-coded gross margin floors in `pricingEngine`. Automated Maker-Checker approval workflow for discounts exceeding standard thresholds. |
| **R-03** | **Credit Default & Bad Debt**<br>B2B buyers accumulating large orders on Net-30 credit without settling past-due invoices. | High | Medium | Working Capital & Finance | Dynamic credit accounts enforcing strict credit limits. Automated credit hold blocks new orders when invoices are 7+ days past due. |
| **R-04** | **Cross-Tenant Data Exposure**<br>One retail chain viewing the negotiated volume pricing or purchase history of a competing wholesaler. | Critical | Low | Legal & Commercial Privacy | Tenant isolation strictly enforced in repository queries by business ID. Automated matrix regression tests verifying 403 access denial. |
| **R-05** | **AI Agent Hallucinated Prices or Commitments**<br>LLM Trade Assistant inventing unapproved discounts or promising non-existent inventory delivery dates. | High | Medium | Customer Contracts | AI agents run in advisory mode only. All pricing, inventory availability, and order commitments are computed by deterministic backend services. |
| **R-06** | **Payment Replay or Callback Forgery**<br>Malicious actors attempting to trigger order confirmation with fake M-Pesa transaction IDs. | High | Low | Financial Integrity | Cryptographic webhook signature verification, Daraja transaction status query re-validation, and unique receipt constraints. |
