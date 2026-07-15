# Role checklists

## Customer

- Cart persists intentionally, is isolated per user, preserves variant identity, and clears only confirmed order groups.
- Checkout uses saved/validated addresses, server totals, supported payment methods, idempotency, and useful failure recovery.
- Orders refresh on focus and Realtime changes, translate every state, and show merchant/courier/ETA/tracking where authorized.
- Notification preferences save through the current-user RPC, preserve in-app history, and control
  global, order, and promotional device delivery without exposing internal dispatch state.
- Cancellation, review, refund, support, and chat bind to the correct order and enforce duplicate limits.
- Physical return has its own item quantities, evidence, pickup tracking, inspection result, and
  status timeline; financial refund has its own amount, decision, transfer reference, and ledger.
- Currency, return window, payment promises, and service claims agree everywhere.
- Critical touch targets have labels, roles, states, loading guards, and web-safe dialogs.

## Merchant

- Onboarding/approval state is visible; protected approval and financial fields are not self-editable.
- Catalog writes validate ownership, nonnegative stock/price, variants, images, availability, and approval/open state.
- Active orders remain visible through assignment, pickup, and transit.
- Buttons match the server state machine; failures revert cleanly and remain visible.
- Preparation, readiness, cancellation reason, pickup confirmation, self-delivery, and refund response are explicit workflows.
- Merchant sees physical returns independently from refunds, including customer items/evidence,
  assigned courier, pickup status, merchant receipt confirmation, and inspection disposition.
- Inspection starts with no implicit acceptance/restock defaults, requires explicit quantities and
  disposition, supports accepting zero items, and shows product variants plus signed custody evidence.
- Revenue and wallet views use delivered/settled records only and reconcile to ledger entries.
- Merchant can receive/respond to customer chat and support notifications.

## Delivery

- Online toggle reads/writes the server profile and survives restart.
- Only eligible nearby offers appear; rejection and expiry have server semantics where needed.
- Claim is atomic, single-winner, capacity-aware, and records attempts.
- Exact address appears only after assignment.
- Pickup/drop-off proof, status progression, live location, retry protection, and payment method display are authoritative.
- Presence/location use atomic RPCs; no direct profile or history write may leave contradictory state.
- A location retry reuses the same sample ID after response loss, while a newer reading waits; order
  and courier locks follow the same order as delivery completion.
- Physical-return pickup and merchant delivery are separate from normal order delivery and require
  new evidence/location/idempotency for each transition.
- COD cash is displayed as outstanding custody, with partial/full remittance history and disputes;
  it is not labeled income and blocks the corresponding withdrawable amount.
- Earnings appear only after atomic settlement and reconcile to ledger/withdrawals.
- Navigation, support category, error recovery, and accessibility work on mobile and web.

## Admin

- Approval screens show required verification evidence and record actor, reason, and notification.
- Courier approval is rejected by the database when required identity/profile evidence is missing;
  an external verification note is explicit, substantive, and audited.
- Courier approval is bound to the exact displayed `application_revision`; a stale decision reloads
  instead of approving changed evidence, and stored identity documents cannot be overwritten.
- Orders show all parties, payment, tracking, proof, financial settlement, exceptions, and audit history.
- Refunds show item/evidence/window/refundable balance and enforce controlled decisions.
- Physical returns show logistics evidence, quantities, schedule, assigned courier, receipt, and
  inspection separately from refund decisions and payment references.
- COD review prevents self-review, validates private proof, supports partial remittance/dispute,
  and never changes money through status alone.
- Legacy reconciliation requires exact confirmed financial facts and fails closed on partial artifacts.
- Support shows participant identity, full thread, reply controls, assignment, SLA state, and notifications.
- Wallet/withdrawal actions reserve or move money atomically; no status-only financial approval.
- Metrics use defined filters, pagination, real data, and explicit time zones; no synthetic trends.
- GMV is net settled value (excluding completed reversals/refunds), and online/pending actor metrics
  count only active, nonblocked users with the required role.
- Blocking checks apply to sensitive operations, not only at login.

## Cross-role acceptance scenario

Run at least one complete order from cart to settlement:

1. Customer places a valid cash order.
2. Merchant sees it live, starts preparation, marks ready, and confirms pickup.
3. Two couriers race to claim; one succeeds.
4. Courier completes pickup and delivery proof.
5. Customer, merchant, courier, and admin see consistent states live.
6. COD/payment, merchant proceeds, courier earnings, commission, and ledger reconcile.
7. Repeat clicks and network retries do not duplicate order, stock movement, claim, proof, or settlement.
8. Exercise cancellation before fulfillment and one return/refund after delivery.
9. Open a support ticket, reply as admin, and verify participant visibility and notification.
10. For COD, remit partially then fully with independent review; verify withdrawal hold and ledger.
11. For a physical return, schedule, pick up, receive, inspect, and only then complete any linked refund.
12. Exercise one read-only and one write personal API key, revoke it, block its owner, exceed the
    shared quota, and verify every role sees only its owned/authorized resources and net statistics.
13. Deliver one notification webhook twice concurrently and verify one Push attempt, one terminal
    database outcome, safe Realtime fields, and a durable in-app fallback.
