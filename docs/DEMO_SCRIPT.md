# Rekker PeopleOS — Five-Minute Leave Demonstration

**Environment:** demo tenant with fictional employee records only  
**Purpose:** show the leave workflow and its human controls. Do not present a preview response as a real AI decision.

## 0:00–0:40 — Confirm the environment

1. Sign in using the non-production demo identity.
2. Confirm the “Demo workspace” / fictional data banner.
3. Open Leave and show the Kenya default policy pack, including annual leave, sick leave, maternity, paternity and pre-adoptive leave.
4. Point out the paternity unit is **2 weeks** and the policy is flagged for legal review.

## 0:40–1:30 — Employee submits a request

1. Open the employee's Leave page.
2. Choose Annual Leave and dates in the future.
3. Show the working-day preview, half-day option and reason field.
4. Submit the request.
5. Explain that the server validates organisation membership, overlap, service eligibility, working calendar and available balance.

## 1:30–2:20 — Rule-based advisory

1. Open the pending request as a permitted manager/reviewer.
2. Run the Rule-based advisory.
3. Show the suggestion, reasons and rules fired.
4. Explain that this advisory does not approve or reject the request.

## 2:20–3:10 — Human recommendation

1. Record “Recommend” or “Do not recommend” with a human comment.
2. Show that the recommendation is stored separately from the model advisory.
3. Point out the requester/recommender cannot perform the final approval.

## 3:10–4:10 — HR approval and balance

1. Sign in as a different HR approver.
2. Approve the recommended request.
3. Refresh the Leave balance and show the deduction.
4. Explain that database approval, ledger posting and audit record are in one transaction; duplicate approval is rejected.

## 4:10–5:00 — Audit and cancellation

1. Open Audit trail and filter the relevant leave events.
2. Export the audit CSV.
3. Return to the leave request and cancel it as the requester or authorised HR user.
4. Refresh the balance and show the reversal restores the balance.
5. Close by noting that the browser-level and real-Postgres acceptance run must pass before describing the feature as production-ready.
