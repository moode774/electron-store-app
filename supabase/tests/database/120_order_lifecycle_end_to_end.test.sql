begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- End-to-end order lifecycle driven only through the RPCs the apps call, each
-- step executed as the real actor (customer -> merchant -> courier -> admin).
-- This is the integration contract between the three apps: an order placed by
-- a customer must reach the store, be handed to a courier with the pickup
-- code, be delivered with proof, and settle money to every party exactly once.

-- ---------------------------------------------------------------------------
-- Fixtures: one of each actor, an approved open store with one product, a
-- delivery zone for the customer's city, and an online approved courier.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('e2e00000-0000-4000-8000-00000000000a', 'e2e-admin@test.invalid'),
  ('e2e00000-0000-4000-8000-00000000000c', 'e2e-customer@test.invalid'),
  ('e2e00000-0000-4000-8000-00000000000e', 'e2e-merchant@test.invalid'),
  ('e2e00000-0000-4000-8000-00000000000d', 'e2e-courier@test.invalid')
on conflict (id) do nothing;

insert into public.users (id, email, full_name, role, is_active, is_verified, is_blocked)
values
  ('e2e00000-0000-4000-8000-00000000000a', 'e2e-admin@test.invalid', 'E2E Admin', 'admin', true, true, false),
  ('e2e00000-0000-4000-8000-00000000000c', 'e2e-customer@test.invalid', 'E2E Customer', 'customer', true, true, false),
  ('e2e00000-0000-4000-8000-00000000000e', 'e2e-merchant@test.invalid', 'E2E Merchant', 'merchant', true, true, false),
  ('e2e00000-0000-4000-8000-00000000000d', 'e2e-courier@test.invalid', 'E2E Courier', 'delivery', true, true, false)
on conflict (id) do update set
  role = excluded.role, full_name = excluded.full_name, is_active = true,
  is_verified = true, is_blocked = false;

insert into public.merchant_profiles (
  id, user_id, store_name, store_slug, address, city,
  is_approved, is_active, is_open, wallet_balance, commission_rate,
  bank_name, bank_account, bank_account_name
) values (
  'e2e00000-0000-4000-8000-00000000000e', 'e2e00000-0000-4000-8000-00000000000e',
  'E2E Store', 'e2e-store', 'Store street', 'E2E City', true, true, true, 0, 10,
  'E2E Bank', 'E2E-ACCOUNT-001', 'E2E Merchant'
);

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values (
  'e2e00000-0000-4000-8000-00000000000d', 'e2e00000-0000-4000-8000-00000000000d',
  'E2E-COURIER', 'motorcycle', 'E2E-1', true, true, 0
);

insert into public.addresses (id, user_id, label, full_address, city, area, is_default)
values (
  'e2e00000-0000-4000-8000-0000000000ad', 'e2e00000-0000-4000-8000-00000000000c',
  'home', 'Customer street 1', 'E2E City', 'Center', true
);

insert into public.delivery_zones (name, merchant_id, city, delivery_fee, min_order_amount, is_active, delivery_available)
values ('E2E Zone', null, 'E2E City', 15, 0, true, true);

insert into public.products (
  id, merchant_id, name, base_price, is_active, is_approved, approval_status,
  stock_quantity, total_sold
) values (
  'e2e00000-0000-4000-8000-0000000000f1', 'e2e00000-0000-4000-8000-00000000000e',
  'E2E Product', 100, true, true, 'approved', 10, 0
);

create temp table e2e (name text primary key, value text) on commit drop;
grant all on e2e to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Customer places a cash order.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000c', true);
insert into e2e(name, value)
select 'order', (public.place_order(
  'e2e00000-0000-4000-8000-00000000000e',
  'e2e00000-0000-4000-8000-0000000000ad',
  'cash',
  '[{"product_id":"e2e00000-0000-4000-8000-0000000000f1","quantity":2}]'::jsonb,
  null, 'ring the bell',
  'e2e00000-0000-4000-8000-0000000000b1'
) ->> 'id');
reset role;

select isnt((select value from e2e where name = 'order'), null, 'customer places an order');
select results_eq(
  $$ select status::text, subtotal::numeric, delivery_fee::numeric, total_amount::numeric
     from public.orders where id = (select value::uuid from e2e where name = 'order') $$,
  $$ values ('pending'::text, 200::numeric, 15::numeric, 215::numeric) $$,
  'order is server-priced from catalogue price and the delivery zone fee'
);
select is(
  (select stock_quantity from public.products where id = 'e2e00000-0000-4000-8000-0000000000f1'),
  8, 'placing the order reserves stock'
);
select ok(
  exists (select 1 from public.notifications n
          where n.user_id = 'e2e00000-0000-4000-8000-00000000000e'),
  'merchant is notified about the new order'
);

-- Replaying the same idempotency key must not create a second order.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000c', true);
select is(
  (public.place_order(
    'e2e00000-0000-4000-8000-00000000000e',
    'e2e00000-0000-4000-8000-0000000000ad',
    'cash',
    '[{"product_id":"e2e00000-0000-4000-8000-0000000000f1","quantity":2}]'::jsonb,
    null, 'ring the bell',
    'e2e00000-0000-4000-8000-0000000000b1'
  ) ->> 'id'),
  (select value from e2e where name = 'order'),
  'retrying checkout with the same idempotency key returns the same order'
);
reset role;

-- The order is not offered to couriers before the store marks it ready.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000d', true);
select is(
  (select count(*) from public.list_available_delivery_orders() as offer(value)
   where offer.value ->> 'id' = (select value from e2e where name = 'order')),
  0::bigint,
  'pending orders are not offered to couriers'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Merchant accepts, prepares and marks the order ready.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000e', true);
select lives_ok(
  format($$ select public.transition_order_status(%L, 'confirmed') $$, (select value from e2e where name = 'order')),
  'merchant confirms the order'
);
select lives_ok(
  format($$ select public.transition_order_status(%L, 'preparing') $$, (select value from e2e where name = 'order')),
  'merchant starts preparing'
);
select lives_ok(
  format($$ select public.transition_order_status(%L, 'ready') $$, (select value from e2e where name = 'order')),
  'merchant marks the order ready'
);
insert into e2e(name, value)
select 'pickup_code', public.get_order_pickup_code((select value::uuid from e2e where name = 'order'));
reset role;

select matches((select value from e2e where name = 'pickup_code'), '^[0-9]{6}$', 'a 6-digit pickup code exists once the order is ready');

-- The courier cannot read the pickup code (only the store/admin can).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000d', true);
select throws_ok(
  format($$ select public.get_order_pickup_code(%L) $$, (select value from e2e where name = 'order')),
  'P0001', 'PICKUP_CODE_ACCESS_DENIED',
  'courier cannot read the pickup code'
);

-- ---------------------------------------------------------------------------
-- 3. Courier sees the offer and claims it.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.list_available_delivery_orders() as offer(value)
   where offer.value ->> 'id' = (select value from e2e where name = 'order')),
  1::bigint,
  'ready order is offered to the online approved courier'
);
select is(
  public.claim_delivery_order(
    (select value::uuid from e2e where name = 'order'),
    'e2e00000-0000-4000-8000-00000000000d'
  ),
  true,
  'courier claims the order'
);

-- ---------------------------------------------------------------------------
-- 4. Pickup requires the merchant's code.
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.transition_order_status(%L, 'picked_up') $$, (select value from e2e where name = 'order')),
  'P0001', 'PICKUP_CODE_REQUIRED',
  'courier cannot skip the pickup code through the generic status RPC'
);
select is(
  (public.confirm_order_pickup((select value::uuid from e2e where name = 'order'), '000000x') ->> 'error'),
  'INVALID_PICKUP_CODE',
  'a wrong pickup code is rejected'
);
select is(
  (public.confirm_order_pickup(
     (select value::uuid from e2e where name = 'order'),
     (select value from e2e where name = 'pickup_code')
   ) ->> 'status'),
  'picked_up',
  'the correct pickup code hands the order to the courier'
);
select lives_ok(
  format($$ select public.transition_order_status(%L, 'on_the_way') $$, (select value from e2e where name = 'order')),
  'courier heads to the customer'
);
reset role;

select is(
  (select status::text from public.orders where id = (select value::uuid from e2e where name = 'order')),
  'on_the_way', 'customer sees the order on the way'
);

-- ---------------------------------------------------------------------------
-- 5. Courier delivers with photo proof; the order settles once.
-- ---------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'orders',
       'e2e00000-0000-4000-8000-00000000000d/delivery-proofs/' || value || '/e2e00000-0000-4000-8000-0000000000b2.jpg',
       'e2e00000-0000-4000-8000-00000000000d',
       '{"mimetype":"image/jpeg","size":"2048"}'::jsonb
from e2e where name = 'order';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000d', true);
select lives_ok(
  format(
    $$ select public.complete_delivery_with_proof(%L, %L, 15.3694, 44.1910, %L, null) $$,
    (select value from e2e where name = 'order'),
    'e2e00000-0000-4000-8000-00000000000d/delivery-proofs/' || (select value from e2e where name = 'order') || '/e2e00000-0000-4000-8000-0000000000b2.jpg',
    'e2e00000-0000-4000-8000-0000000000b2'
  ),
  'courier completes the delivery with proof'
);
reset role;

select results_eq(
  $$ select status::text, delivered_at is not null, settled_at is not null
     from public.orders where id = (select value::uuid from e2e where name = 'order') $$,
  $$ values ('delivered'::text, true, true) $$,
  'order is delivered and settled'
);
select is(
  (select count(*) from public.order_settlements where order_id = (select value::uuid from e2e where name = 'order')),
  1::bigint, 'exactly one settlement exists'
);
select is(
  (select count(*) from public.delivery_cod_collections where order_id = (select value::uuid from e2e where name = 'order')),
  1::bigint, 'the cash collected by the courier is recorded for remittance'
);
select ok(
  (select wallet_balance from public.merchant_profiles where id = 'e2e00000-0000-4000-8000-00000000000e') > 0,
  'merchant wallet is credited after delivery'
);
select ok(
  exists (select 1 from public.delivery_earnings where order_id = (select value::uuid from e2e where name = 'order')),
  'courier earning is recorded'
);
select results_eq(
  $$ select gross_amount, merchant_proceeds, delivery_earning, platform_amount
     from public.order_settlements
     where order_id = (select value::uuid from e2e where name = 'order') $$,
  $$ values (215.00::numeric, 180.00::numeric, 15.00::numeric, 20.00::numeric) $$,
  'settlement splits 215 into store 180 (200 minus 10%), courier 15 (delivery fee) and platform 20'
);
select is(
  (select wallet_balance from public.merchant_profiles where id = 'e2e00000-0000-4000-8000-00000000000e'),
  180.00::numeric, 'merchant wallet holds exactly the store proceeds'
);
select is(
  (select wallet_balance from public.delivery_profiles where id = 'e2e00000-0000-4000-8000-00000000000d'),
  15.00::numeric, 'courier wallet holds exactly the delivery earning'
);
select is(
  (select coalesce(sum(case when credit_account = 'delivery_cash_custody' then amount else 0 end
                     - case when debit_account = 'delivery_cash_custody' then amount else 0 end), 0)
   from public.marketplace_ledger_entries
   where order_id = (select value::uuid from e2e where name = 'order')),
  215.00::numeric,
  'the full cash amount is in courier custody until remitted'
);

-- ---------------------------------------------------------------------------
-- 6. COD cash gates the merchant payout until the courier remits it.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000e', true);
select throws_ok(
  $$ select public.request_withdrawal(100, 'early payout') $$,
  '22023', 'COD_FUNDS_NOT_YET_REMITTED',
  'merchant cannot withdraw while the cash is still with the courier'
);
reset role;

insert into e2e(name, value)
select 'collection', id::text from public.delivery_cod_collections
where order_id = (select value::uuid from e2e where name = 'order');
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
select 'cod-remittance-proofs',
       'e2e00000-0000-4000-8000-00000000000d/cod-remittances/' || value || '/e2e00000-0000-4000-8000-0000000000b3.pdf',
       'e2e00000-0000-4000-8000-00000000000d', 'e2e00000-0000-4000-8000-00000000000d',
       '{"mimetype":"application/pdf","size":"1024"}'::jsonb
from e2e where name = 'collection';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000d', true);
insert into e2e(name, value)
select 'remittance', (public.submit_cod_remittance(
  (select value::uuid from e2e where name = 'collection'),
  215,
  'BANK-E2E-001',
  'e2e00000-0000-4000-8000-00000000000d/cod-remittances/' || (select value from e2e where name = 'collection') || '/e2e00000-0000-4000-8000-0000000000b3.pdf',
  'e2e00000-0000-4000-8000-0000000000b3'
) ->> 'id');
reset role;
select isnt((select value from e2e where name = 'remittance'), null, 'courier submits the cash remittance with proof');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000a', true);
select lives_ok(
  format($$ select public.admin_review_cod_remittance(%L, 'approved', null) $$, (select value from e2e where name = 'remittance')),
  'admin confirms the remittance'
);
reset role;
select is(
  (select status from public.delivery_cod_collections where id = (select value::uuid from e2e where name = 'collection')),
  'remitted', 'collection is fully remitted'
);

-- ---------------------------------------------------------------------------
-- 7. Merchant withdraws; admin pays it out.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000e', true);
insert into e2e(name, value)
select 'withdrawal', public.request_withdrawal(180, 'weekly payout')::text;
reset role;
select is(
  (select wallet_balance from public.merchant_profiles where id = 'e2e00000-0000-4000-8000-00000000000e'),
  0.00::numeric, 'requested payout is reserved from the merchant wallet'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000a', true);
select lives_ok(format($$ select public.process_withdrawal_request(%L::uuid, 'approved', null, null) $$, (select value from e2e where name = 'withdrawal')), 'admin approves the payout');
select lives_ok(format($$ select public.process_withdrawal_request(%L::uuid, 'processing', null, null) $$, (select value from e2e where name = 'withdrawal')), 'admin starts the transfer');
select lives_ok(format($$ select public.process_withdrawal_request(%L::uuid, 'paid', null, 'TRX-E2E-001') $$, (select value from e2e where name = 'withdrawal')), 'admin records the transfer reference');
reset role;
select is(
  (select status from public.withdrawal_requests where id = (select value::uuid from e2e where name = 'withdrawal')),
  'paid', 'merchant payout is completed'
);

select ok(
  exists (select 1 from public.notifications n
          where n.user_id = 'e2e00000-0000-4000-8000-00000000000c'),
  'customer is notified about their order'
);

-- The customer can now review the store, once.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2e00000-0000-4000-8000-00000000000c', true);
select lives_ok(
  format($$ select public.create_order_review(%L, 'merchant', 'e2e00000-0000-4000-8000-00000000000e', 5, 'fast and well packed') $$,
         (select value from e2e where name = 'order')),
  'customer reviews the store after delivery'
);
select is(
  public.has_reviewed_order((select value::uuid from e2e where name = 'order'), 'merchant', 'e2e00000-0000-4000-8000-00000000000e'),
  true, 'the review is recorded against the order'
);
reset role;

select * from finish();
rollback;
