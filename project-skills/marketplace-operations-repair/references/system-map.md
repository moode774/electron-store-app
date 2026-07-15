# System map

## Actors and ownership

- Customer owns cart intent, address selection, order placement, permitted cancellation, delivery confirmation, reviews, refunds, support tickets, and participant chat.
- Merchant owns catalog availability, preparation, readiness, merchant-side cancellation policy, handoff confirmation, fulfillment visibility, proceeds, and refund response.
- Delivery owns online availability, atomic claim, pickup proof, transport status, live location, delivery proof, COD handoff, earnings, and withdrawal requests.
- Admin owns approvals, disputes, exceptional transitions, refund decisions, withdrawals, support replies, moderation, and immutable audit visibility.
- Database owns authorization, totals, inventory, state transitions, assignments, proof validation, settlement, reversals, idempotency, and audit trails.

## Order state machine

Preferred delivery flow:

`pending -> preparing -> ready -> assigned -> picked_up -> on_the_way -> delivered`

Allowed exceptional exits must be explicit and reasoned:

- Customer cancellation: `pending|preparing -> cancelled`, subject to business rules.
- Merchant cancellation: only an explicit server-authorized transition with reason and inventory reversal.
- Admin exception: explicit RPC, reason, audit log, notification, and idempotent reversal/settlement.
- Failed delivery, reschedule, dispute, return, and refund are separate workflows; do not overload ordinary status updates.
- Merchant self-delivery, when enabled, follows an explicit self-delivery branch and still requires proof and settlement.

Every accepted transition writes `order_tracking` with order, new state, actor, timestamp, reason/notes, and available location. Clients never update `orders.status` directly.

## Order placement transaction

One server operation must:

1. Bind customer to `auth.uid()`.
2. Verify owned address and serviceability.
3. Verify active/approved/open merchant.
4. Verify every product belongs to that merchant and is orderable.
5. Verify every variant belongs to its product.
6. Lock inventory rows and reject insufficient stock.
7. Calculate authoritative unit prices, subtotal, coupon, delivery fee, tax, and total.
8. Insert order and items, decrement stock, record coupon use, tracking, and notifications atomically.
9. Accept an idempotency key and return the existing result on retry.

For multiple merchants, use an order group and one atomic server operation or clearly present independent confirmations without clearing failed cart groups.

## Claim and delivery transaction

- Only approved, active, online couriers within the supported service area can see/claim offers.
- Claim locks the order and guarantees one winning courier.
- Limit active workload according to configured capacity.
- Hide exact customer address before assignment; expose only the minimum offer area.
- Pickup requires merchant confirmation or one-time pickup code.
- Delivery requires customer confirmation or one-time drop-off code plus configured proof.
- Persist location while active with retention/privacy limits.

## Settlement transaction

On first valid delivery only:

- Mark delivered timestamp and payment outcome.
- Validate/record COD or existing electronic payment.
- Calculate platform commission from immutable order values.
- Credit merchant proceeds and courier earnings.
- Create balanced, referenced ledger entries with before/after values.
- Update aggregates such as completed deliveries.
- Prevent duplicate settlement by unique operation/reference constraints.
- Refuse settlement when payment is already refunded, any completed refund/reversal exists, or
  the order's customer, merchant, or courier no longer has the required role relationship.

Withdrawal submission reserves available balance. Approval/rejection releases or finalizes the reservation atomically and is idempotent.

## Cancellation, physical return, and financial refund

- Cancellation records actor/reason/time and restores stock once.
- A physical return is a logistics workflow:
  `requested -> approved|rejected|cancelled -> pickup_scheduled -> picked_up -> received -> inspected -> completed`.
- Physical-return pickup and receipt require the assigned actor, fresh evidence, location where
  applicable, actor/time audit, and an idempotency key for every transition.
- A financial refund is a money workflow that binds to a delivered customer order, enforces the
  window, requested item quantities, evidence rules, and maximum remaining refundable value.
- Prevent duplicate active physical-return quantities and duplicate refundable quantities for
  the same order items. Never derive one workflow's completion from the other.
- Merchant response and admin decisions use controlled transitions. Inspection records stock
  disposition; refund completion records transfer reference, ledger reversal, and notifications.
- An inspection may accept zero items. Completion then closes the logistics workflow with an
  explicit `closed_without_refund` outcome and must not create a refund, stock movement, payment
  reference, or order-payment change.

## COD custody and remittance

- Delivery creates one COD collection from immutable order values; the collected cash remains
  a courier liability and is excluded from withdrawable funds.
- Courier remittance uses a private owned proof, amount, external reference, and idempotency key.
- A different admin accepts, rejects, or disputes the remittance. Acceptance cannot exceed the
  outstanding collection and creates one referenced ledger operation.
- Partial remittances remain outstanding. Rejection does not silently release liability.
- COD custody is independent from delivery settlement: the order can be economically settled
  while physical cash still awaits an audited remittance.

## Historical financial reconciliation

- Never repair a legacy delivered order by guessing `delivered_at`, prices, commission, courier
  earnings, merchant proceeds, aggregate counters, or COD custody.
- Require evidence reference, reason, confirmed order number/time, gross amount, merchant amount,
  delivery amount, commission, tax, aggregate-count state, and explicit COD acknowledgement.
- Lock the order and refuse reconciliation when any partial wallet, earning, ledger, settlement,
  COD, refund, or reversal artifact already exists, when payment is refunded, or when actor-role
  relationships are invalid. Route that row to manual forensic review instead.
- Show active refund and physical-return context to the reviewer before any reconciliation action.
- Store the reconciliation attempt and operation key so retry returns the same outcome.

## Delivery identity, onboarding, and presence

- Courier approval requires protected server-side checks for required profile fields and either
  both private onboarding documents or a sufficiently detailed external-verification record.
- Onboarding documents use a private bucket, owner-scoped paths, MIME/size validation, and signed
  admin reads. Evidence objects are insert-only and rotated rather than overwritten. Never expose
  identity-document paths through a public profile.
- Every reviewed identity/profile/document change increments `application_revision`. Admin approval
  must provide the exact reviewed revision; stale decisions fail, and an approved courier cannot
  change protected identity evidence without returning to review.
- Presence changes and active-delivery locations are RPC-owned atomic writes. Location history is
  accepted only for the assigned courier while the order is active. Each immutable location sample
  has a client UUID so a response-loss retry returns the same row; writers lock order before courier
  profile to avoid deadlocks with completion.

## Support and chat

- Create ticket and initial message in one transaction.
- Only participants and assigned support/admin can read or write messages.
- Neither complainant nor accused party may self-resolve, reassign, or change priority.
- Admin replies must be visible to the user and notify them.
- Conversation lookup must respect order context where the product supports order-specific chats.

## Personal API and Edge boundary

- A personal `lv_` key is shown once and stored only as a high-entropy hash. Ordinary Data API
  roles can read key metadata but never the hash or internal quota counters.
- `verify_api_key` is service-role-only, locks one key row, rechecks expiry, revocation, current
  account role/block state, and enforces one global rate window across every Edge isolate.
- `api-v1` may set gateway `verify_jwt = false` only because it authenticates the separate personal
  key before any route. The deployed setting and repository config must match.
- A service-role Edge client must use explicit response columns, recheck ownership for every
  resource, and call guarded RPCs for transitions. It never returns `select(*)` rows.
- Money and KPI endpoints aggregate in database functions so PostgREST row limits cannot truncate
  totals and completed reversals/refunds are deducted authoritatively.

## Push delivery boundary

- Database Webhooks are replayable input. A service-role-only RPC locks the notification and gives
  one worker an opaque claim; another fresh claim must fail without contacting the provider.
- Commit `push_dispatched_at` before the Expo request. A crash after that boundary is an ambiguous
  at-most-once outcome and must not be retried automatically; the in-app notification remains the
  durable fallback. A stale claim that never crossed the boundary may be recovered.
- Finalization is claim-bound and distinguishes at least one accepted ticket from zero accepted
  tickets. Provider failures, missing tokens, and disabled Push remain auditable without pretending
  delivery succeeded.
- App roles see only notification display/routing/read fields. Internal Push state is hidden with
  column privileges, and Realtime uses an explicit safe-column projection rather than a full row.
- Order updates and courier offers remain Push-eligible. The worker checks global, order, and
  promotional preferences before the dispatch boundary; disabling device delivery never deletes or
  hides the durable in-app notification. Preference writes are bound to `auth.uid()` by RPC.

## Source locations

- App: `apps/customer/src`
- Shared API/state: `packages/shared-hooks/src`
- Shared types/constants: `packages/shared-types/src`, `packages/shared-utils/src`
- Database migrations: `supabase/migrations`
- Edge Functions: `supabase/functions`

Production migrations and deployed Edge Functions have historically drifted from the repository. Inspect both before every database repair.
