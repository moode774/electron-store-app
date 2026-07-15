---
name: marketplace-operations-repair
description: Audit, repair, and verify the Yemen Marketplace Expo/Supabase application across customer, merchant, delivery, admin, orders, handoff, settlement, refunds, support, chat, notifications, RLS, migrations, and Realtime. Use for any change or regression involving the marketplace business lifecycle, cross-role relationships, database invariants, operational smoothness, or production-readiness. Authentication redesign is deferred unless the user explicitly brings it back into scope.
---

# Marketplace Operations Repair

Repair the marketplace as one connected transaction system, not as isolated screens.
Keep the order lifecycle, physical return, financial refund, COD custody/remittance,
and historical reconciliation as related but distinct state machines.

## Start every task

1. Read `references/system-map.md` for roles, ownership, state transitions, and financial invariants.
2. Read `references/agent-orchestration.md` and delegate independent role audits when more than one actor is affected.
3. Read the relevant section of `references/role-checklists.md` for every actor touched by the change.
4. Read `references/verification.md` before editing database functions, RLS, money, inventory, delivery, refunds, or support.
5. Inspect the live Supabase schema before assuming local migrations match production.
6. Preserve unrelated dirty-worktree changes and keep authentication redesign out of scope unless explicitly requested.

## Repair workflow

1. Trace the action from UI to shared API, RPC/policy/trigger, related tables, opposing actor UI, notification, and audit trail.
2. Define the legal state transition and all invariants before changing code.
3. Put authoritative calculations and transitions in one transactional server-side operation.
4. Restrict direct table writes when an RPC owns the business operation.
5. Make retries idempotent and concurrent calls safe.
6. Update every affected role and subscribe it to authoritative changes with cleanup.
7. Show recoverable errors; never turn a failure into an empty list or optimistic success.
8. Test authorization, success, rejection, retry, duplicate click, race, disconnect, and rollback.
9. Separate local repairs from live deployment. Never mutate production data or apply a
   migration without explicit authorization, a rollback plan, and reconciliation evidence.

## Non-negotiable invariants

- Recompute prices, fees, discounts, tax, totals, stock effects, commission, earnings, and wallet effects on the server.
- Verify customer/address, merchant/product, product/variant, order/actor, ticket/participant, and refund/order relationships.
- Allow only the state transitions in `system-map.md`; record actor, time, reason, and resulting state.
- Settle delivery, COD/payment, merchant proceeds, courier earnings, platform commission, and ledger entries atomically and once.
- Reverse inventory and financial effects atomically on cancellation or approved return where applicable.
- Never infer a financial refund from a physical-return status, or physical receipt from a
  payment refund. Link the workflows explicitly and complete each with its own evidence.
- Treat COD as cash custody until an independent admin accepts a remittance proof. Hold the
  outstanding amount from courier withdrawals; never count it as courier earnings.
- Reconcile historical delivered orders only from complete, independently confirmed facts.
  Refuse rows with partial ledger, wallet, earning, settlement, COD, refund, or reversal artifacts,
  and reject invalid customer/merchant/courier role relationships.
- Never settle an order whose payment is already refunded or that has a completed refund/reversal;
  validate every actor-role relationship again inside the settlement transaction.
- Permit a physical return inspection to accept zero items. Close that return explicitly without
  refund, inventory movement, or payment reference; never manufacture money from rejected goods.
- Make courier presence and active-order location writes atomic RPCs. Do not permit direct
  profile/location-history writes that can disagree. Bind retries to one immutable location sample
  ID and keep lock order consistent with delivery completion.
- Persist courier onboarding evidence privately and enforce required fields/evidence on the
  server before approval; UI validation alone is not an approval boundary. Bind an admin decision
  to the reviewed application revision and store identity evidence as insert-only objects.
- Treat personal API keys as credentials: expose neither hashes nor quota state, verify the current
  account on every call, enforce a database-global quota, and let the Edge service role return only
  explicit columns. Financial/statistical aggregates stay in SQL and never rely on paginated rows.
- Keep custom Edge authentication and gateway `verify_jwt` settings aligned. Disabling gateway JWT
  is permitted only when the function validates a separate high-entropy credential itself.
- Treat Push as an external side effect with a database-owned state machine. Claim one notification
  atomically, commit one irreversible dispatch boundary before the provider call, and finalize only
  with the same opaque claim. Never update delivery state directly from Edge or automatically replay
  an ambiguous post-dispatch outcome.
- Keep Push claim tokens, attempts, and failure details unavailable to app roles. When column-level
  privileges are used, Realtime subscriptions must explicitly select only safe columns with an SDK
  version that supports server-side column selection.
- Preserve the intended delivery channel when repairing notification producers. Device delivery
  must honor global, order, and promotional preferences loaded by the service role; users update
  those preferences through identity-bound RPCs, never broad settings-table grants.
- Keep profile identity/preferences separate from protected approval, balance, rating, and aggregate fields.
- Treat RLS policies as permissive OR rules; remove obsolete broad policies before adding narrow policies.
- Revoke default `PUBLIC` execution from privileged functions, grant only intended roles, check `auth.uid()`, and set a safe search path.
- Never simulate payment, push, proof, Realtime, refund, support response, or delivery completion in production UI.

## Handoff

Report changed files, database contracts, local-versus-live status, validation performed,
remaining blockers, and any intentionally deferred item. Update these references when the
system contract changes.
