begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Stable identities. The fixture uses matching user/profile UUIDs so it is
-- valid against both the clean historical FK shape and the live profile FK
-- shape. Every write is rolled back at the end of the test.
alter table public.users disable trigger all;
insert into public.users (
  id, email, phone, full_name, role, is_active, is_verified, is_blocked
) values
  ('a4000000-0000-4000-8000-000000000001', 'returns-admin@test.invalid', '740000001', 'Returns Admin', 'admin', true, true, false),
  ('a4000000-0000-4000-8000-000000000002', 'blocked-admin@test.invalid', '740000002', 'Blocked Admin', 'admin', true, true, false),
  ('c4000000-0000-4000-8000-000000000001', 'returns-customer@test.invalid', '740000003', 'Returns Customer', 'customer', true, true, false),
  ('74000000-0000-4000-8000-000000000001', 'blocked-customer@test.invalid', '740000004', 'Blocked Customer', 'customer', true, true, false),
  ('f4000000-0000-4000-8000-000000000001', 'other-customer@test.invalid', '740000005', 'Other Customer', 'customer', true, true, false),
  ('94000000-0000-4000-8000-000000000001', 'returns-merchant@test.invalid', '740000006', 'Returns Merchant', 'merchant', true, true, false),
  ('95000000-0000-4000-8000-000000000001', 'other-merchant@test.invalid', '740000007', 'Other Merchant', 'merchant', true, true, false),
  ('d4000000-0000-4000-8000-000000000001', 'returns-driver@test.invalid', '740000008', 'Returns Driver', 'delivery', true, true, false),
  ('d5000000-0000-4000-8000-000000000001', 'other-driver@test.invalid', '740000009', 'Other Driver', 'delivery', true, true, false)
on conflict (id) do nothing;
update public.users
set is_blocked = false, blocked_until = now() + interval '1 day'
where id in (
  'a4000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000001'
);
alter table public.users enable trigger all;

insert into public.customer_profiles (id, user_id, wallet_balance)
values
  ('c4100000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 0),
  ('f4100000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 0)
on conflict (user_id) where user_id is not null
do update set wallet_balance = excluded.wallet_balance;

insert into public.merchant_profiles (
  id, user_id, store_name, store_slug, is_approved, is_active, is_open,
  wallet_balance, bank_name, bank_account, bank_account_name,
  address, city, store_phone
) values
  ('94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
   'Returns Merchant', 'returns-merchant', true, true, true, 160, 'Test Bank', 'RET-ACC', 'Returns Merchant',
   'Returns warehouse', 'Sanaa', '779400001'),
  ('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
   'Other Merchant', 'other-returns-merchant', true, true, true, 0, 'Test Bank', 'OTHER-ACC', 'Other Merchant',
   'Other warehouse', 'Aden', '779500001')
on conflict (id) do nothing;

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values
  ('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
   'RET-D-1', 'motorcycle', 'RET-1', true, true, 30),
  ('d5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
   'RET-D-2', 'motorcycle', 'RET-2', true, true, 0)
on conflict (id) do nothing;

insert into public.addresses (
  id, user_id, label, full_address, city, area, is_default
) values (
  'aa400000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'home', 'Physical return fixture address', 'Sanaa', 'Test area', true
)
on conflict (id) do nothing;

insert into public.products (
  id, merchant_id, name, base_price, is_active, is_approved,
  stock_quantity, total_sold
) values
  ('44000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
   'Returnable product', 100, true, true, 8, 2),
  ('44000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000001',
   'Legacy return product', 50, true, true, 9, 1)
on conflict (id) do update
set stock_quantity = excluded.stock_quantity, total_sold = excluded.total_sold;

alter table public.orders disable trigger user;
insert into public.orders (
  id, order_number, customer_id, merchant_id, delivery_id, address_id, status,
  subtotal, delivery_fee, discount_amount, platform_commission, tax_amount,
  total_amount, payment_method, payment_status, delivered_at, created_at, updated_at
) values
  ('04000000-0000-4000-8000-000000000001', 'TEST-RETURN-001',
   'c4000000-0000-4000-8000-000000000001',
   '94000000-0000-4000-8000-000000000001',
   'd4000000-0000-4000-8000-000000000001',
   'aa400000-0000-4000-8000-000000000001',
   'delivered', 200, 30, 20, 20, 0, 210, 'cash', 'paid', now(), now(), now()),
  ('04000000-0000-4000-8000-000000000002', 'TEST-RETURN-LEGACY-001',
   'c4000000-0000-4000-8000-000000000001',
   '94000000-0000-4000-8000-000000000001',
   'd4000000-0000-4000-8000-000000000001',
   'aa400000-0000-4000-8000-000000000001',
   'delivered', 50, 10, 0, 5, 0, 60, 'cash', 'paid', now(), now(), now()),
  ('04000000-0000-4000-8000-000000000003', 'TEST-RETURN-DECISION-001',
   'c4000000-0000-4000-8000-000000000001',
   '94000000-0000-4000-8000-000000000001',
   'd4000000-0000-4000-8000-000000000001',
   'aa400000-0000-4000-8000-000000000001',
   'delivered', 50, 10, 0, 5, 0, 60, 'cash', 'paid', now(), now(), now());
alter table public.orders enable trigger user;

alter table public.order_items disable trigger user;
insert into public.order_items (
  id, order_id, product_id, variant_id, quantity, unit_price, total_price
) values
  ('04100000-0000-4000-8000-000000000001', '04000000-0000-4000-8000-000000000001',
   '44000000-0000-4000-8000-000000000001', NULL, 2, 100, 200),
  ('04100000-0000-4000-8000-000000000002', '04000000-0000-4000-8000-000000000002',
   '44000000-0000-4000-8000-000000000002', NULL, 1, 50, 50),
  ('04100000-0000-4000-8000-000000000003', '04000000-0000-4000-8000-000000000003',
   '44000000-0000-4000-8000-000000000002', NULL, 1, 50, 50);
alter table public.order_items enable trigger user;

insert into storage.objects (id, bucket_id, name, owner, metadata)
values
  (
    '47000000-0000-4000-8000-000000000002', 'return-evidence',
    'c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46400000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000002.jpg',
    'c4000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":2048}'::jsonb
  ),
  (
    '47000000-0000-4000-8000-000000000003', 'return-evidence',
    'c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000002/46500000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000003.jpg',
    'c4000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":2048}'::jsonb
  )
on conflict (id) do nothing;

insert into public.order_settlements (
  id, order_id, merchant_id, delivery_id, payment_method, gross_amount,
  merchant_proceeds, delivery_earning, platform_commission, tax_amount,
  platform_amount, settlement_key, status, reversed_amount, settled_by
) values (
  '45100000-0000-4000-8000-000000000001',
  '04000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'cash', 210, 160, 30, 20, 0, 20,
  '45200000-0000-4000-8000-000000000001', 'settled', 0,
  'd4000000-0000-4000-8000-000000000001'
);

insert into public.marketplace_ledger_entries (
  id, operation_key, order_id, entry_type, debit_account, debit_owner_id,
  credit_account, credit_owner_id, amount, created_by
) values
  ('45300000-0000-4000-8000-000000000001',
   'settlement:04000000-0000-4000-8000-000000000001:merchant_proceeds',
   '04000000-0000-4000-8000-000000000001', 'merchant_proceeds',
   'order_clearing', NULL, 'merchant_wallet', '94000000-0000-4000-8000-000000000001',
   160, 'd4000000-0000-4000-8000-000000000001'),
  ('45300000-0000-4000-8000-000000000002',
   'settlement:04000000-0000-4000-8000-000000000001:delivery_earning',
   '04000000-0000-4000-8000-000000000001', 'delivery_earning',
   'order_clearing', NULL, 'delivery_wallet', 'd4000000-0000-4000-8000-000000000001',
   30, 'd4000000-0000-4000-8000-000000000001'),
  ('45300000-0000-4000-8000-000000000003',
   'settlement:04000000-0000-4000-8000-000000000001:platform_revenue',
   '04000000-0000-4000-8000-000000000001', 'platform_revenue',
   'order_clearing', NULL, 'platform_revenue', NULL,
   20, 'd4000000-0000-4000-8000-000000000001');

create temporary table physical_return_test_ids (
  name text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update, delete on physical_return_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, owner, metadata)
    values (
      '47000000-0000-4000-8000-000000000001',
      'return-evidence',
      'c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000003/47000000-0000-4000-8000-000000000001.jpg',
      'c4000000-0000-4000-8000-000000000001',
      '{"mimetype":"image/jpeg","size":2048}'::jsonb
    )$$,
  'customer can upload deterministic private return evidence through storage RLS'
);
select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, owner, metadata)
    values
      (
        '47000000-0000-4000-8000-000000000010',
        'return-evidence',
        'c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46800000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000010.jpg',
        'c4000000-0000-4000-8000-000000000001',
        '{"mimetype":"image/jpeg","size":1024}'::jsonb
      ),
      (
        '47000000-0000-4000-8000-000000000011',
        'return-evidence',
        'c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46800000-0000-4000-8000-000000000002/47000000-0000-4000-8000-000000000011.jpg',
        'c4000000-0000-4000-8000-000000000001',
        '{"mimetype":"image/jpeg","size":1024}'::jsonb
      )$$,
  'customer can stage private evidence before submitting a return'
);
reset role;

-- A future blocked_until is a real block even when is_blocked is false.
set local role authenticated;
select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_return_request(
    '04000000-0000-4000-8000-000000000001',
    '[{"order_item_id":"04100000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    'damaged', 'Blocked customers cannot create this physical return.',
    '[]'::jsonb, 'courier_pickup', 'wallet',
    '46000000-0000-4000-8000-000000000001'
  )$$,
  '42501', 'account is not allowed to create a physical return',
  'temporary customer block denies return creation'
);
reset role;

-- Purchased quantities are authoritative.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_return_request(
    '04000000-0000-4000-8000-000000000003',
    '[{"order_item_id":"04100000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
    'damaged', 'Damaged merchandise requires a customer-owned evidence object. ',
    '[]'::jsonb, 'customer_dropoff', 'wallet',
    '46000000-0000-4000-8000-000000000006'
  )$$,
  '22023', 'physical return evidence is required for this reason',
  'physical damage return requires at least one evidence object'
);
select throws_ok(
  $$select public.create_return_request(
    '04000000-0000-4000-8000-000000000001',
    '[{"order_item_id":"04100000-0000-4000-8000-000000000001","quantity":3}]'::jsonb,
    'damaged', 'The requested quantity is larger than the purchased quantity.',
    '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000002/47000000-0000-4000-8000-000000000099.jpg"]'::jsonb,
    'courier_pickup', 'wallet',
    '46000000-0000-4000-8000-000000000002'
  )$$,
  '22023', 'return quantity exceeds purchased quantity',
  'return cannot exceed purchased quantity'
);

insert into physical_return_test_ids(name, id)
select 'main_return', (public.create_return_request(
  '04000000-0000-4000-8000-000000000001',
  '[{"order_item_id":"04100000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  'damaged', 'Both units arrived damaged and require merchant inspection before refund.',
  '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000003/47000000-0000-4000-8000-000000000001.jpg"]'::jsonb,
  'courier_pickup', 'wallet',
  '46000000-0000-4000-8000-000000000003'
)->>'id')::uuid;

select is(
  (public.create_return_request(
    '04000000-0000-4000-8000-000000000001',
    '[{"quantity":2,"order_item_id":"04100000-0000-4000-8000-000000000001"}]'::jsonb,
    'damaged', 'Both units arrived damaged and require merchant inspection before refund.',
    '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000003/47000000-0000-4000-8000-000000000001.jpg"]'::jsonb,
    'courier_pickup', 'wallet',
    '46000000-0000-4000-8000-000000000003'
  )->>'id')::uuid,
  (select id from physical_return_test_ids where name = 'main_return'),
  'same return idempotency key and canonical item payload returns the existing request'
);
select throws_ok(
  $$select public.create_return_request(
    '04000000-0000-4000-8000-000000000001',
    '[{"order_item_id":"04100000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    'damaged', 'Both units arrived damaged and require merchant inspection before refund.',
    '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46000000-0000-4000-8000-000000000003/47000000-0000-4000-8000-000000000001.jpg"]'::jsonb,
    'courier_pickup', 'wallet',
    '46000000-0000-4000-8000-000000000003'
  )$$,
  '23505', 'return idempotency key was already used with another request',
  'return idempotency key cannot be reused with a different quantity'
);
reset role;

insert into physical_return_test_ids(name, id)
select 'main_item', id from public.return_items
where return_request_id = (select id from physical_return_test_ids where name = 'main_return');

select is(
  (select count(*) from public.return_requests where order_id = '04000000-0000-4000-8000-000000000001'),
  1::bigint,
  'return retry creates only one request'
);

-- Physical reasons are routed away from the ordinary refund RPC, and an
-- active physical return excludes every other active financial request.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_refund_request(
    '04000000-0000-4000-8000-000000000001', 'damaged',
    'A physical item issue must use the physical return workflow.',
    'wallet', '[]'::jsonb
  )$$,
  '22023', 'physical return is required for this refund reason',
  'ordinary refund RPC rejects physical return reasons'
);
select throws_ok(
  $$select public.create_refund_request(
    '04000000-0000-4000-8000-000000000001', 'other',
    'A separate financial request cannot overlap the active physical return.',
    'wallet', '[]'::jsonb
  )$$,
  '23505', 'an active physical return already exists for this order',
  'active return excludes a concurrent financial refund'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(id) from public.return_requests),
  0::bigint,
  'unrelated customer cannot read another customer return through RLS'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(id) from public.return_requests),
  1::bigint,
  'requesting customer can read its return through RLS'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select is(
  (select count(id) from public.return_requests),
  0::bigint,
  'temporarily blocked admin receives no administrative return rows through RLS'
);
select throws_ok(
  format(
    'select public.admin_review_return_request(%L::uuid,%L,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'approved',
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'main_item'),
      'approved_quantity', 2
    ))::text,
    'Blocked admin review'
  ),
  '42501', 'admin authorization required',
  'temporarily blocked admin cannot review a return'
);
reset role;

-- Only the order merchant may recommend a decision.
set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.respond_return_request(%L::uuid,%L,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'approve', 'Not this merchant order'
  ),
  '42501', 'only the order merchant can respond to this return',
  'unrelated merchant cannot respond to return'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.respond_return_request(%L::uuid,%L,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'approve', 'Merchant recommends accepting the damaged unit.'
  ),
  'order merchant can record a return recommendation'
);
select lives_ok(
  format(
    'select public.respond_return_request(%L::uuid,%L,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'approve', 'Merchant recommends accepting the damaged unit.'
  ),
  'merchant recommendation retry is idempotent'
);
reset role;

-- Admin approves exact quantities and cannot be bypassed by customer cancel.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_review_return_request(%L::uuid,%L,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'approved',
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'main_item'),
      'approved_quantity', 2
    ))::text,
    'Evidence and purchased quantity verified.'
  ),
  'admin approves the requested return quantity'
);
select lives_ok(
  format(
    'select public.admin_review_return_request(%L::uuid,%L,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'approved',
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'main_item'),
      'approved_quantity', 2
    ))::text,
    'Evidence and purchased quantity verified.'
  ),
  'admin review retry is idempotent after state advancement'
);
reset role;

select is(
  (select approved_quantity from public.return_items where id = (select id from physical_return_test_ids where name = 'main_item')),
  2,
  'approved quantity is persisted on the return item'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.cancel_return_request(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'Trying to cancel after approval'
  ),
  '22023', 'customer can cancel only before return approval',
  'customer cannot cancel after approval'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_schedule_return_pickup(%L::uuid,%L::uuid,date_trunc(''second'',now()) + interval ''1 hour'',%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'd4000000-0000-4000-8000-000000000001',
    'Courier assigned for physical pickup.',
    '46100000-0000-4000-8000-000000000001'
  ),
  'admin assigns an approved online courier'
);
select lives_ok(
  format(
    'select public.admin_schedule_return_pickup(%L::uuid,%L::uuid,%L::timestamptz,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'd4000000-0000-4000-8000-000000000001',
    (select pickup_scheduled_at::text from public.return_requests
     where id = (select id from physical_return_test_ids where name = 'main_return')),
    'Courier assigned for physical pickup.',
    '46100000-0000-4000-8000-000000000001'
  ),
  'pickup scheduling retry is idempotent for the full payload'
);
select throws_ok(
  format(
    'select public.admin_schedule_return_pickup(%L::uuid,%L::uuid,%L::timestamptz,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'd4000000-0000-4000-8000-000000000001',
    (select pickup_scheduled_at::text from public.return_requests
     where id = (select id from physical_return_test_ids where name = 'main_return')),
    'Different notes must not reuse the same scheduling key.',
    '46100000-0000-4000-8000-000000000001'
  ),
  '23505', 'pickup scheduling idempotency key was reused with different details',
  'pickup scheduling idempotency key binds notes as well as courier and time'
);
reset role;

-- Only the assigned courier can see and move custody, with proof and location.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_my_delivery_returns()), 0::bigint, 'other courier has no assigned returns');
select throws_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.35,44.20,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'picked_up',
    'd5000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000001.jpg',
    '46200000-0000-4000-8000-000000000001'
  ),
  '42501', 'only the assigned courier can update this return',
  'courier mismatch cannot move return custody'
);
reset role;

-- A stopped store is hidden from the courier-facing public catalogue, but it
-- remains the required destination for merchandise already in return custody.
update public.merchant_profiles
set is_active = false, is_open = false
where id = '94000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.merchant_profiles where id = '94000000-0000-4000-8000-000000000001'),
  0::bigint,
  'stopped merchant is hidden from the courier public profile policy'
);
select is(
  (select count(*) from public.addresses where id = 'aa400000-0000-4000-8000-000000000001'),
  0::bigint,
  'customer address remains hidden from unrelated direct courier reads'
);
select is(
  (select payload -> 'merchant' ->> 'store_name'
   from public.list_my_delivery_returns() as jobs(payload)),
  'Returns Merchant',
  'assigned return RPC still supplies the stopped merchant safe destination context'
);
select is(
  (select concat_ws('|',
     payload -> 'merchant' ->> 'address',
     payload -> 'merchant' ->> 'city',
     payload -> 'merchant' ->> 'store_phone'
   ) from public.list_my_delivery_returns() as jobs(payload)),
  'Returns warehouse|Sanaa|779400001',
  'assigned return RPC supplies only the safe stopped-merchant address, city, and phone fields'
);
select is(
  (select payload -> 'address' ->> 'full_address'
   from public.list_my_delivery_returns() as jobs(payload)),
  'Physical return fixture address',
  'assigned return RPC supplies the customer pickup address only inside the custody boundary'
);
reset role;
update public.merchant_profiles
set is_active = true, is_open = true
where id = '94000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_my_delivery_returns()), 1::bigint, 'assigned courier lists its return');
select throws_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,NULL,15.35,44.20,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'picked_up', '46200000-0000-4000-8000-000000000002'
  ),
  '22023', 'valid deterministic courier proof path is required',
  'courier pickup requires proof path'
);
select throws_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.35,44.20,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'picked_up',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000005.jpg',
    '46200000-0000-4000-8000-000000000005'
  ),
  '22023', 'return proof object was not found or is not owned by courier',
  'courier state cannot advance from a path without a stored owned proof object'
);
select lives_ok(
  format(
    'insert into storage.objects(id,bucket_id,name,owner,metadata) values (%L::uuid,%L,%L,%L::uuid,%L::jsonb)',
    '47100000-0000-4000-8000-000000000001',
    'return-proofs',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000003.jpg',
    'd4000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":4096}'
  ),
  'assigned courier can upload deterministic private pickup proof through storage RLS'
);
select lives_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.350001,44.200001,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'picked_up',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000003.jpg',
    '46200000-0000-4000-8000-000000000003'
  ),
  'assigned courier records pickup with proof and coordinates'
);
select lives_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.350001,44.200001,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'picked_up',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000003.jpg',
    '46200000-0000-4000-8000-000000000003'
  ),
  'courier pickup retry is idempotent'
);
select lives_ok(
  format(
    'insert into storage.objects(id,bucket_id,name,owner,metadata) values (%L::uuid,%L,%L,%L::uuid,%L::jsonb)',
    '47100000-0000-4000-8000-000000000002',
    'return-proofs',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000004.png',
    'd4000000-0000-4000-8000-000000000001',
    '{"mimetype":"image/png","size":4096}'
  ),
  'assigned courier can upload deterministic merchant-delivery proof through storage RLS'
);
select lives_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.360001,44.210001,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'received',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'main_return') ||
      '/46200000-0000-4000-8000-000000000004.png',
    '46200000-0000-4000-8000-000000000004'
  ),
  'assigned courier delivers the return to merchant with a second proof'
);
reset role;

select is(
  (select count(*) from public.return_proofs where return_request_id = (select id from physical_return_test_ids where name = 'main_return')),
  2::bigint,
  'courier retry does not duplicate either custody proof'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.merchant_receive_return(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'Not this merchant return'
  ),
  '42501', 'only the order merchant can confirm return receipt',
  'unrelated merchant cannot confirm physical receipt'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.merchant_receive_return(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'Merchant physically received the returned unit.'
  ),
  'order merchant confirms physical receipt'
);
select lives_ok(
  format(
    'select public.inspect_return_request(%L::uuid,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'main_return'),
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'main_item'),
      'accepted_quantity', 1,
      'disposition', 'restock',
      'notes', 'Packaging damaged; product itself is safe to restock.'
    ))::text,
    'Inspection accepted one approved unit.'
  ),
  'order merchant inspects accepted quantity and disposition'
);
reset role;

-- Completion uses the existing balanced refund state machine and restocks once.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_complete_return(%L::uuid,NULL,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'Completed after merchant inspection.',
    '46300000-0000-4000-8000-000000000001'
  ),
  'admin atomically completes wallet refund and restock'
);
reset role;

select is(
  (select status from public.return_requests where id = (select id from physical_return_test_ids where name = 'main_return')),
  'completed', 'physical return reaches completed'
);
select is(
  (select refund_amount from public.return_requests where id = (select id from physical_return_test_ids where name = 'main_return')),
  90::numeric,
  'partial refund is capped to accepted merchandise after proportional order discount and excludes delivery fee'
);
select is(
  (select status from public.refund_requests where return_request_id = (select id from physical_return_test_ids where name = 'main_return')),
  'completed', 'linked financial refund is completed atomically'
);
select is(
  (select wallet_balance from public.customer_profiles where user_id = 'c4000000-0000-4000-8000-000000000001'),
  90::numeric, 'customer wallet receives only the calculated partial merchandise refund'
);
select is(
  (select stock_quantity from public.products where id = '44000000-0000-4000-8000-000000000001'),
  9, 'accepted restock disposition increments product stock once'
);
select is(
  (select count(*) from public.inventory_logs where return_item_id = (select id from physical_return_test_ids where name = 'main_item')),
  1::bigint, 'restock writes one return-linked inventory operation'
);
select is(
  (select requested_quantity from public.return_items
   where id = (select id from physical_return_test_ids where name = 'main_item')),
  2, 'return preserves the two requested units'
);
select is(
  (select accepted_quantity from public.return_items
   where id = (select id from physical_return_test_ids where name = 'main_item')),
  1, 'inspection may accept only part of the approved quantity'
);
select is(
  (select status::text from public.orders where id = '04000000-0000-4000-8000-000000000001'),
  'delivered', 'partial accepted return does not mark the entire order returned'
);
select is(
  (select reversed_amount from public.order_settlements where order_id = '04000000-0000-4000-8000-000000000001'),
  90::numeric, 'partial physical refund never exceeds settlement remainder'
);
select is(
  (select count(*) from public.marketplace_ledger_entries
   where operation_key like 'refund:' ||
     (select refund_request_id::text from public.return_requests where id = (select id from physical_return_test_ids where name = 'main_return')) || ':%'),
  4::bigint, 'physical return completion writes the four balanced refund ledger components once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_complete_return(%L::uuid,NULL,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'main_return'),
    'Completed after merchant inspection.',
    '46300000-0000-4000-8000-000000000001'
  ),
  'return completion retry is idempotent'
);
reset role;
select is(
  (select stock_quantity from public.products where id = '44000000-0000-4000-8000-000000000001'),
  9, 'completion retry cannot restock twice'
);
select is(
  (select count(*) from public.inventory_logs where return_item_id = (select id from physical_return_test_ids where name = 'main_item')),
  1::bigint, 'completion retry cannot duplicate inventory audit'
);
select is(
  (select count(*) from public.notifications
   where data ->> 'return_request_id' =
     (select id::text from physical_return_test_ids where name = 'main_return')
     and type like 'physical_return_%'),
  18::bigint,
  'all main return actors receive one idempotent in-app event per relevant transition'
);

-- A later return consumes only accepted completed quantities, not rejected
-- portions of an earlier request. Once
-- every purchased unit is accepted, the order can become returned without
-- refunding the delivery fee.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_return_request(
    '04000000-0000-4000-8000-000000000003',
    '[{"order_item_id":"04100000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
    'changed_mind', 'Evidence references must resolve to private customer-owned objects.',
    '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000003/46600000-0000-4000-8000-000000000009/47000000-0000-4000-8000-000000000009.jpg"]'::jsonb,
    'customer_dropoff', 'wallet',
    '46600000-0000-4000-8000-000000000009'
  )$$,
  '22023', 'return evidence object was not found or is not owned by customer',
  'return request rejects evidence path without a stored owned object'
);
insert into physical_return_test_ids(name, id)
select 'full_return', (public.create_return_request(
  '04000000-0000-4000-8000-000000000001',
  '[{"order_item_id":"04100000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  'not_as_described', 'The remaining unit also differs materially from its product description.',
  '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000001/46400000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000002.jpg"]'::jsonb,
  'customer_dropoff', 'wallet',
  '46400000-0000-4000-8000-000000000001'
)->>'id')::uuid;
select throws_ok(
  $$select public.create_return_request(
    '04000000-0000-4000-8000-000000000001',
    '[{"order_item_id":"04100000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
    'not_as_described', 'Trying to return quantities already consumed by the completed return.',
    '[]'::jsonb, 'customer_dropoff', 'wallet',
    '46400000-0000-4000-8000-000000000002'
  )$$,
  '23505', 'an active physical return already exists for this order',
  'one-active-per-order wins before another cumulative quantity request'
);
reset role;

insert into physical_return_test_ids(name, id)
select 'full_item', id from public.return_items
where return_request_id = (select id from physical_return_test_ids where name = 'full_return');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_review_return_request(%L::uuid,%L,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'full_return'),
    'approved',
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'full_item'),
      'approved_quantity', 1
    ))::text,
    'Approved remaining purchased quantity.'
  ), 'admin approves the remaining purchased quantity'
);
select lives_ok(
  format(
    'select public.admin_schedule_return_pickup(%L::uuid,NULL,date_trunc(''second'',now()) + interval ''1 hour'',%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'full_return'),
    'Customer will drop the unit at the merchant.',
    '46400000-0000-4000-8000-000000000003'
  ), 'admin schedules customer dropoff without courier assignment'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.merchant_receive_return(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'full_return'),
    'Customer delivered the remaining unit directly.'
  ), 'merchant receipt advances customer dropoff through custody states'
);
select lives_ok(
  format(
    'select public.inspect_return_request(%L::uuid,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'full_return'),
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'full_item'),
      'accepted_quantity', 1, 'disposition', 'restock',
      'notes', 'Remaining unit accepted for restock.'
    ))::text,
    'Accepted remaining unit.'
  ), 'merchant inspects the customer dropoff'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_complete_return(%L::uuid,NULL,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'full_return'),
    'Completed cumulative full physical return.',
    '46400000-0000-4000-8000-000000000004'
  ), 'admin completes the cumulative full accepted return'
);
reset role;

select is(
  (select status::text from public.orders where id = '04000000-0000-4000-8000-000000000001'),
  'returned', 'all purchased quantities accepted across returns mark the order returned'
);
select is(
  (select stock_quantity from public.products where id = '44000000-0000-4000-8000-000000000001'),
  10, 'second accepted unit is restocked exactly once'
);
select is(
  (select reversed_amount from public.order_settlements where order_id = '04000000-0000-4000-8000-000000000001'),
  180::numeric,
  'two discounted merchandise refunds still exclude the thirty-unit delivery fee'
);
select is(
  (select wallet_balance from public.customer_profiles where user_id = 'c4000000-0000-4000-8000-000000000001'),
  180::numeric, 'customer receives the two net merchandise amounts only'
);

-- Legacy delivered orders may be physically reviewed, but completion refuses
-- to invent missing settlement history. The entire completion statement rolls
-- back, including refund creation and restock.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
insert into physical_return_test_ids(name, id)
select 'legacy_return', (public.create_return_request(
  '04000000-0000-4000-8000-000000000002',
  '[{"order_item_id":"04100000-0000-4000-8000-000000000002","quantity":1}]'::jsonb,
  'wrong_item', 'The legacy delivered order contains the wrong physical item.',
  '["c4000000-0000-4000-8000-000000000001/04000000-0000-4000-8000-000000000002/46500000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000003.jpg"]'::jsonb,
  'courier_pickup', 'wallet',
  '46500000-0000-4000-8000-000000000001'
)->>'id')::uuid;
reset role;

insert into physical_return_test_ids(name, id)
select 'legacy_item', id from public.return_items
where return_request_id = (select id from physical_return_test_ids where name = 'legacy_return');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_review_return_request(%L::uuid,%L,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'approved',
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'legacy_item'),
      'approved_quantity', 1
    ))::text,
    'Approved for physical inspection despite legacy finance history.'
  ), 'legacy return can be physically reviewed'
);
select lives_ok(
  format(
    'select public.admin_schedule_return_pickup(%L::uuid,%L::uuid,date_trunc(''second'',now()) + interval ''1 hour'',%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'd4000000-0000-4000-8000-000000000001',
    'Legacy return pickup.',
    '46500000-0000-4000-8000-000000000002'
  ), 'legacy return can be assigned for pickup'
);
reset role;

insert into storage.objects (id, bucket_id, name, owner, metadata)
select
  '47100000-0000-4000-8000-000000000003'::uuid,
  'return-proofs',
  'd4000000-0000-4000-8000-000000000001/return-proofs/' || id::text ||
    '/46500000-0000-4000-8000-000000000003.jpg',
  'd4000000-0000-4000-8000-000000000001'::uuid,
  '{"mimetype":"image/jpeg","size":4096}'::jsonb
from physical_return_test_ids where name = 'legacy_return'
union all
select
  '47100000-0000-4000-8000-000000000004'::uuid,
  'return-proofs',
  'd4000000-0000-4000-8000-000000000001/return-proofs/' || id::text ||
    '/46500000-0000-4000-8000-000000000004.jpg',
  'd4000000-0000-4000-8000-000000000001'::uuid,
  '{"mimetype":"image/jpeg","size":4096}'::jsonb
from physical_return_test_ids where name = 'legacy_return';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.370001,44.220001,%L::uuid)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'picked_up',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'legacy_return') ||
      '/46500000-0000-4000-8000-000000000003.jpg',
    '46500000-0000-4000-8000-000000000003'
  ), 'courier records legacy return pickup proof'
);
select lives_ok(
  format(
    'select public.delivery_update_return_status(%L::uuid,%L,%L,15.380001,44.230001,%L::uuid)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'received',
    'd4000000-0000-4000-8000-000000000001/return-proofs/' ||
      (select id::text from physical_return_test_ids where name = 'legacy_return') ||
      '/46500000-0000-4000-8000-000000000004.jpg',
    '46500000-0000-4000-8000-000000000004'
  ), 'courier records legacy return delivery proof'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.merchant_receive_return(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'Merchant received legacy return.'
  ), 'merchant confirms legacy physical receipt'
);
select lives_ok(
  format(
    'select public.inspect_return_request(%L::uuid,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    jsonb_build_array(jsonb_build_object(
      'return_item_id', (select id from physical_return_test_ids where name = 'legacy_item'),
      'accepted_quantity', 1, 'disposition', 'restock',
      'notes', 'Accepted but finance settlement is unknown.'
    ))::text,
    'Legacy item physically accepted.'
  ), 'merchant can finish legacy physical inspection'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.admin_complete_return(%L::uuid,NULL,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'Must fail without verified settlement.',
    '46500000-0000-4000-8000-000000000005'
  ),
  '55000', 'verified order settlement is missing; legacy return requires reconciliation',
  'legacy return cannot complete without verified settlement'
);
reset role;

select is(
  (select status from public.return_requests where id = (select id from physical_return_test_ids where name = 'legacy_return')),
  'inspected', 'failed legacy completion leaves return inspected for reconciliation'
);
select is(
  (select count(*) from public.refund_requests where return_request_id = (select id from physical_return_test_ids where name = 'legacy_return')),
  0::bigint, 'failed legacy completion creates no financial refund'
);
select is(
  (select stock_quantity from public.products where id = '44000000-0000-4000-8000-000000000002'),
  9, 'failed legacy completion performs no restock'
);
select is(
  (select count(*) from public.inventory_logs where return_item_id = (select id from physical_return_test_ids where name = 'legacy_item')),
  0::bigint, 'failed legacy completion writes no inventory operation'
);

-- A valid inspection that accepts zero merchandise has a distinct terminal
-- outcome. It does not need a historical settlement because it moves no money
-- or stock and must not leave the workflow stuck forever.
update public.return_items
set accepted_quantity = 0, disposition = 'rejected', inspection_notes = 'Rejected after final condition review.'
where id = (select id from physical_return_test_ids where name = 'legacy_item');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_complete_return(%L::uuid,NULL,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'Closed without refund because every inspected quantity was rejected.',
    '46300000-0000-4000-8000-000000000002'
  ),
  'admin closes an all-rejected inspection without requiring settlement'
);
select lives_ok(
  format(
    'select public.admin_complete_return(%L::uuid,NULL,%L,%L::uuid)',
    (select id from physical_return_test_ids where name = 'legacy_return'),
    'Closed without refund because every inspected quantity was rejected.',
    '46300000-0000-4000-8000-000000000002'
  ),
  'all-rejected completion retry is idempotent'
);
reset role;

select is(
  (select status from public.return_requests where id = (select id from physical_return_test_ids where name = 'legacy_return')),
  'completed', 'all-rejected inspection reaches a terminal completed state'
);
select ok(
  (select refund_request_id is null and refund_amount = 0
   from public.return_requests where id = (select id from physical_return_test_ids where name = 'legacy_return')),
  'all-rejected completion creates no linked refund and records zero refund amount'
);
select is(
  (select count(*) from public.refund_requests where return_request_id = (select id from physical_return_test_ids where name = 'legacy_return')),
  0::bigint, 'all-rejected completion creates no financial refund artifact'
);
select is(
  (select count(*) from public.inventory_logs where return_item_id = (select id from physical_return_test_ids where name = 'legacy_item')),
  0::bigint, 'all-rejected completion creates no inventory movement'
);
select is(
  (select status::text from public.orders where id = '04000000-0000-4000-8000-000000000002'),
  'delivered', 'all-rejected completion leaves the original order state unchanged'
);
select is(
  (select operation from public.order_operation_audit
   where event_key = 'physical-return-completed:' ||
     (select id::text from physical_return_test_ids where name = 'legacy_return')),
  'complete_physical_return_without_refund',
  'all-rejected completion records its distinct no-refund audit operation'
);

-- Requested returns can terminate cleanly by customer cancellation or admin
-- rejection and then release the one-active-per-order slot.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
insert into physical_return_test_ids(name, id)
select 'cancelled_return', (public.create_return_request(
  '04000000-0000-4000-8000-000000000003',
  '[{"order_item_id":"04100000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
  'changed_mind', 'Customer requested cancellation before administrative review.',
  '[]'::jsonb, 'customer_dropoff', 'wallet',
  '46600000-0000-4000-8000-000000000001'
)->>'id')::uuid;
select lives_ok(
  format(
    'select public.cancel_return_request(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'cancelled_return'),
    'Customer withdrew the request before approval.'
  ), 'customer cancels a requested return'
);
select lives_ok(
  format(
    'select public.cancel_return_request(%L::uuid,%L)',
    (select id from physical_return_test_ids where name = 'cancelled_return'),
    'Customer withdrew the request before approval.'
  ), 'customer cancellation retry is idempotent'
);
insert into physical_return_test_ids(name, id)
select 'rejected_return', (public.create_return_request(
  '04000000-0000-4000-8000-000000000003',
  '[{"order_item_id":"04100000-0000-4000-8000-000000000003","quantity":1}]'::jsonb,
  'other', 'A new request is allowed after the cancelled request released the order.',
  '[]'::jsonb, 'customer_dropoff', 'wallet',
  '46600000-0000-4000-8000-000000000002'
)->>'id')::uuid;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.admin_review_return_request(%L::uuid,%L,%L::jsonb,%L)',
    (select id from physical_return_test_ids where name = 'rejected_return'),
    'rejected', '[]', 'Evidence does not support a physical return.'
  ), 'admin rejects a requested return with reason'
);
reset role;

select is(
  (select status from public.return_requests where id = (select id from physical_return_test_ids where name = 'cancelled_return')),
  'cancelled', 'cancelled return remains terminal'
);
select is(
  (select status from public.return_requests where id = (select id from physical_return_test_ids where name = 'rejected_return')),
  'rejected', 'rejected return remains terminal'
);

-- Admin listing is protected and returns the complete nested operational view.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  'select * from public.admin_list_return_requests(NULL,100,0)',
  '42501', 'admin authorization required',
  'customer cannot call administrative return listing'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select ok(
  (select count(*) >= 3 from public.admin_list_return_requests(NULL,100,0)),
  'active admin receives completed and reconciliation-pending returns'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$delete from storage.objects
    where id in (
      '47000000-0000-4000-8000-000000000001',
      '47000000-0000-4000-8000-000000000011'
    )$$,
  'customer cleanup can target staged return evidence without mutating referenced evidence'
);
reset role;
select is(
  (select count(*) from storage.objects where id = '47000000-0000-4000-8000-000000000001'),
  1::bigint,
  'evidence referenced by a return is immutable to the customer'
);
select is(
  (select count(*) from storage.objects where id = '47000000-0000-4000-8000-000000000011'),
  0::bigint,
  'customer may delete an abandoned staged evidence object'
);

select is(
  (select count(*) from storage.buckets
   where id in ('return-evidence','return-proofs')
     and public is false and file_size_limit = 10485760),
  2::bigint,
  'physical return evidence buckets are private and size-limited'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'return_requests'
  ),
  'return request state changes are published for cross-role realtime refresh'
);
select is(
  (select count(*) from pg_catalog.pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in (
       'Customer uploads return evidence',
       'Customer deletes unreferenced return evidence',
       'Return participants read evidence',
       'Assigned courier uploads return proof',
       'Return participants read courier proof'
     )),
  5::bigint,
  'return storage has explicit staged cleanup, owner-upload, and participant-read policies'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  0::bigint,
  'unrelated customer cannot read private return objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  8::bigint,
  'return customer can read linked objects plus its own unreferenced staged evidence'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  7::bigint,
  'order merchant reads linked return evidence and proofs but not abandoned uploads'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  6::bigint,
  'assigned courier reads only evidence and proofs linked to its assigned returns'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  0::bigint,
  'unrelated merchant cannot read private return objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  0::bigint,
  'temporarily blocked admin cannot read private return objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from storage.objects where bucket_id in ('return-evidence','return-proofs')),
  7::bigint,
  'active admin reads linked return objects but not abandoned customer uploads'
);
reset role;

-- Deny-by-default table and function privileges.
select is(
  (select count(*)
   from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename in ('return_requests','return_items','return_tracking','return_proofs')
     and cmd <> 'SELECT'),
  0::bigint,
  'return tables have no direct mutation RLS policies'
);
select is(
  (select count(*)
   from unnest(array['return_requests','return_items','return_tracking','return_proofs']) t(table_name)
   cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p(privilege_name)
   where has_table_privilege('authenticated', 'public.' || t.table_name, p.privilege_name)),
  0::bigint,
  'authenticated role has no direct return table mutation grants'
);
select ok(
  has_table_privilege('service_role', 'public.return_requests', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role retains full operational access to return records'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_return_request(uuid,jsonb,text,text,jsonb,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated role can execute the customer return RPC'
);
select ok(
  NOT has_function_privilege(
    'anon',
    'public.create_return_request(uuid,jsonb,text,text,jsonb,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous role cannot execute return RPCs'
);
select ok(
  NOT has_function_privilege(
    'authenticated',
    'public.create_refund_request_financial_only(uuid,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'renamed financial-only refund implementation is private'
);
select ok(
  NOT has_function_privilege(
    'authenticated',
    'public.validate_return_proof_object(text,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'return storage validation helpers are private'
);
select ok(
  NOT has_function_privilege(
    'authenticated',
    'public.notify_return_event(uuid,text,text[],text,text,text,jsonb)',
    'EXECUTE'
  ),
  'return notification helper is private'
);
select ok(
  NOT has_column_privilege('authenticated', 'public.return_requests', 'admin_notes', 'SELECT'),
  'participant table grant excludes internal return admin notes'
);
select ok(
  NOT has_column_privilege('authenticated', 'public.merchant_profiles', 'user_id', 'SELECT'),
  'return participant policies do not require exposing merchant ownership identifiers'
);

select * from finish();
rollback;
