# Verification gates

## Before editing

- Record `git status`; preserve unrelated edits.
- Compare local migration files with live migration history and inspect live function/policy/table definitions.
- Identify all callers and opposing-role consumers with `rg`.
- Write down legal states, ownership predicates, financial effects, and retry behavior.

## Database verification

- Test RPC success and every rejection with customer, merchant, delivery, admin, unrelated authenticated user, and anon where relevant.
- Verify direct table writes cannot bypass business RPCs.
- Run two concurrent claims/transitions/refunds/withdrawals and confirm one legal outcome.
- Retry the same idempotency key and confirm no duplicate rows or financial effects.
- Assert order totals, stock, tracking, proof, payment, wallets, earnings, commission, and ledger balances after success and reversal.
- Assert physical-return item quantities/status/evidence independently from refund amount/status/
  transfer/ledger; completing either one must not fabricate completion of the other.
- Inspect a return with every accepted quantity set explicitly to zero; assert a terminal
  `closed_without_refund` result with no refund row, stock change, transfer reference, or order change.
- Assert COD collected, submitted, accepted, disputed, outstanding, withdrawal hold, and ledger
  values under partial and full remittance; the submitting courier cannot review their own proof.
- For historical reconciliation, test exact retry, changed-payload retry, partial-artifact refusal,
  refund/reversal refusal, invalid-role refusal, aggregate counter preservation, and explicit
  COD-liability creation.
- Attempt delivery settlement after a refunded payment and after a completed refund/reversal;
  both must fail without changing payment, wallets, earnings, ledger, or aggregates.
- Verify courier approval through direct RPC calls, not only the UI. Missing required profile fields,
  missing documents, and inadequate external-verification notes must be rejected by the database.
- Change an application after an admin reads it, then submit the stale revision; approval must fail.
  Confirm document overwrite is denied and approved identity changes force a new review.
- Verify presence and location are atomic, assignment-scoped, coordinate-valid, and unavailable by
  direct table write.
- Retry one location sample ID after simulated response loss and assert one immutable row; reuse it
  with different coordinates and assert rejection. Race location with completion to check lock order.
- Check RLS advisors, privileged function grants, duplicate permissive policies, function search paths, and Realtime publication membership.
- Explicitly grant only required Data API privileges for new tables; RLS and grants are separate controls.
- Verify personal-key hashes and quota columns have no authenticated column privilege. Race calls
  from multiple Edge isolates against one key and assert one database-global 120/minute window.
- Revoke the key and block/deactivate its owner; the next call must fail before route execution.
- Assert service-role Edge reads use explicit columns and statistics come from one SQL aggregate,
  not client-side sums that can be truncated by PostgREST limits.
- Invoke the same Push webhook concurrently with different claim tokens and assert one winner, one
  database-authorized attempt, and one committed external boundary. Refresh the same token without
  incrementing attempts, recover a stale pre-dispatch claim, and prove a committed success or failure
  cannot be claimed again.
- Verify ordinary roles cannot select Push claims, attempt counters, dispatch timestamps, or failure
  details. Realtime listeners must request the exact safe column list and still receive authorized
  notification inserts without wildcard table privileges.
- Assert order events and courier offers stay Push-eligible after every migration. Toggle global,
  order, and promotional preferences independently; provider dispatch must stop for the matching
  category while the durable in-app row remains. Preference RPCs must have no actor-id parameter,
  and ordinary roles must have no direct `user_settings` table privileges.

## Application verification

- Before browser role testing, query `public.users` and confirm the documented test phone exists with the intended role. The current development login silently creates a missing phone as a customer.
- Do not submit orders, approvals, refunds, withdrawals, support messages, or other live writes during UI smoke tests unless the test fixture and cleanup are explicitly authorized.
- Run TypeScript type-check, lint, unit/integration tests, and production export/build.
- Run `npm run check:rpc-contract`, `npm run check:sql-migrations`,
  `npm run check:edge-contract`, and `git diff --check`.
- In CI, start a clean PostgreSQL instance on the production major version, replay every migration,
  and run all pgTAP suites before build/deployment is allowed to continue.
- Run pgTAP against a disposable local database or explicitly authorized preview branch before
  applying migrations. Static SQL inspection is useful but is not runtime database validation.
- Exercise 320px mobile, common mobile, tablet, and web desktop layouts.
- Verify loading, empty, error, retry, offline, background/resume, and reconnect states.
- Verify Realtime cleanup prevents duplicate subscriptions.
- Verify web dialogs are not React Native `Alert` no-ops.
- Verify accessibility labels/roles/states and disabled/in-flight guards on critical actions.

## Release gate

Do not call the flow complete while any of these remain:

- Client-authoritative money, inventory, role, approval, rating, aggregate, or state transition.
- Missing ownership/relationship validation.
- Status-only financial action.
- Delivery or refund without proof and audit.
- Production schema/function drift not captured in version control.
- No negative authorization test or no concurrency/idempotency test.
- UI success that can precede server success.

Authentication redesign is an explicit temporary exception for this project until the user restores it to scope; do not let that exception weaken authorization on business operations.

## Deployment and evidence boundary

- Read-only live inspection does not authorize migrations, data repair, document upload, order
  transitions, approvals, refunds, remittances, or support messages.
- Label every result as local code, disposable test environment, or production state.
- Before production application, take a backup, capture current migration history/advisors, rehearse
  on a disposable branch, review reconciliation rows, and prepare rollback/forward-fix steps.
- Never include customer phone numbers, document paths, UUIDs, or private evidence in handoff reports.
