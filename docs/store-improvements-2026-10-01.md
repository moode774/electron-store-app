# Store improvements — release review

Prepared in source only. Do not merge or deploy until the following gates pass.

## Delivery policy

- Platform cities: تعز، صنعاء، عدن.
- Fee: 1,500 YER per merchant order.
- Free delivery only when product subtotal **after coupons** is strictly greater than 14,000 YER.
- Exactly 14,000 remains charged. Each merchant order qualifies independently.
- Admin → Settings / More → Delivery zones manages city, fee, threshold, minimum and availability.
- Missing or disabled coverage rejects checkout on the server. Existing order amounts remain immutable.

## Required business decision

The current settlement credits couriers from the customer's delivery fee. Setting that fee to zero would also make courier earnings zero. The owner must choose whether the platform or merchant funds the 1,500 YER courier fee. The funding snapshot, settlement and reversal must be implemented and tested before this free-delivery migration is applied. This draft must not be treated as a deployable release.

## Verified locally

- TypeScript type check, production web export, RPC contract, SQL static migration check, Edge contract and whitespace check.
- Focused behavior checks: courier arrival survives polling; rejected offers stay visible on server failure; shipping strict boundary, coupon-adjusted subtotal, independent stores, merchant overrides, missing coverage and query errors.
- New pgTAP suites cover net merchant reporting and delivery-zone pricing/permissions. **Not executed:** this workstation has no Docker/PostgreSQL test runtime.

## Rollout gates

1. Resolve courier funding and add balanced settlement/reversal tests.
2. Run every migration and all pgTAP tests on disposable PostgreSQL 17. Do not use production for test fixtures.
3. Capture a database backup, live migration history and relevant definitions. Reconcile migration identities by reviewed names/content: live and repository timestamps differ; do not blindly push all historic migrations.
4. Obtain explicit production migration authorization. Apply database changes before publishing this client: the client requires the new zones RPCs/column and report fields.
5. Verify a customer → merchant → courier → admin order, cancellation, refund, remittance and cross-role permissions on authorized fixtures.
6. Resolve GitHub runner provisioning/billing. The latest Pages deployment ended before steps ran; no successful cloud deployment is claimed.

Rollback before taking new orders: revert the client, restore captured function definitions and disable new delivery offers. Preserve historical orders, audit rows, ledger and migration history; do not delete financial data or drop newly used columns.

Electronic payment integration remains pending and cash-on-delivery remains the supported method.
