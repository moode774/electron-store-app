# Role-agent orchestration

Use role agents as reviewers of one shared transaction system. They do not own
separate truths or independently invent statuses, money rules, or relationships.

## Operations lead

- Maps the complete lifecycle and identifies every affected actor before delegation.
- Owns shared contracts: state machine, RPC signatures, financial invariants, RLS,
  notifications, Realtime, migrations, and final integration.
- Gives agents disjoint file scopes when edits are parallel; shared API/database
  changes remain centrally coordinated.
- Re-runs cross-role verification after merging every agent result.

## Customer agent

- Owns cart, checkout, saved addresses, order history/tracking, cancellation,
  returns/refunds, reviews, chat, support, and customer notifications.
- Verifies that every promise shown in the UI is backed by an authoritative server
  operation and appears consistently to the merchant, courier, and admin.
- Must not change pricing, inventory, refund amounts, or fulfillment state directly.

## Merchant agent

- Owns approval visibility, store/catalog management, incoming/active/history
  orders, preparation and handoff, refund response, wallet, withdrawals, chat,
  support, and merchant notifications.
- Keeps active orders visible until fulfillment completes and treats server state as
  authoritative.
- Must not self-approve, alter protected balances/ratings, or bypass the shared order
  state machine.

## Delivery agent

- Owns eligibility/availability, offer list, atomic claim, pickup/drop-off proof,
  live delivery state/location, COD custody, earnings, withdrawals, support, and
  courier notifications.
- Verifies privacy: exact customer details appear only after a valid assignment.
- Must not calculate earnings locally or complete delivery outside the shared state
  transition and settlement operation.

## Admin agent

- Owns approval evidence/decisions, order oversight, refunds, physical returns,
  COD remittances, complaints, support, broadcasts, wallets/withdrawals, legacy
  reconciliation, audit history, and operational
  metrics.
- Requires reason, actor, time, evidence, and notification for sensitive decisions.
- Must not represent a financial action as completed when only a status changed.

## Backend and database guardian

- Audits live schema drift, migrations, constraints, grants, RLS, triggers, RPCs,
  Realtime publications, Edge Functions, idempotency, concurrency, and settlement.
- Defines one legal transition matrix and transaction boundary for all role agents.
- Rejects client-priced orders, broad profile updates, direct ledger writes, public
  privileged functions, and migrations that cannot replay from a clean database.
- Treats production anomalies as reconciliation work; never silently deletes or
  rewrites financial or order history.
- Guards the boundary between physical returns and financial refunds, and between
  COD cash custody and order settlement.
- Rejects settlement/reconciliation over refunded or reversed orders, tests the zero-accepted
  physical-return path, and validates actor-role relationships inside money operations.
- Enforces immutable retry keys and consistent lock order for courier locations, plus revision-bound
  courier approval and insert-only onboarding evidence.
- Audits personal API key hashing, grants, account rechecks, global quotas, gateway JWT alignment,
  service-role response minimization, and database-owned net aggregates.

## Required collaboration sequence

1. Agents audit their role read-only and report P0/P1 findings with file and data
   evidence.
2. The operations lead resolves shared contracts and assigns non-overlapping fixes.
3. Each role agent verifies both its action and the opposing actor's resulting view.
4. The database guardian verifies permissions, retries, races, and rollback.
5. The operations lead runs the full customer → merchant → courier → admin scenario,
   plus cancellation, refund, complaint/support, and financial reconciliation.

Authentication redesign stays deferred unless explicitly restored to scope. Agents
may still enforce current-session safety required by an operational feature, such as
clearing a cart on account switch or detaching a push token on logout.
