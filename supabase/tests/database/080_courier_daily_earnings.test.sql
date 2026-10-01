begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Stable fixture identities. public.users references auth.users in the oldest
-- clean schema, so constraint triggers are disabled only for fixture insertion;
-- the whole test runs in a transaction and rolls back.
alter table public.users disable trigger all;
insert into public.users (
  id, email, phone, full_name, role, is_active, is_verified, is_blocked
) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@test.invalid',   '700000001', 'Test Admin',     'admin',    true, true, false),
  ('c0000000-0000-4000-8000-000000000001', 'customer@test.invalid','700000002','Test Customer',  'customer', true, true, false),
  ('90000000-0000-4000-8000-000000000001', 'merchant@test.invalid','700000003','Test Merchant',  'merchant', true, true, false),
  ('d0000000-0000-4000-8000-000000000001', 'delivery@test.invalid','700000004','Test Delivery',  'delivery', true, true, false),
  ('e0000000-0000-4000-8000-000000000001', 'wallet@test.invalid',  '700000005', 'Wallet Merchant','merchant', true, true, false),
  ('f0000000-0000-4000-8000-000000000001', 'other@test.invalid',   '700000006', 'Other Customer', 'customer', true, true, false),
  ('b0000000-0000-4000-8000-000000000001', 'review@test.invalid',  '700000007', 'Review Merchant','merchant', true, true, false),
  ('b0000000-0000-4000-8000-000000000002', 'driver@test.invalid',  '700000008', 'Review Driver',  'delivery', true, true, false),
  ('70000000-0000-4000-8000-000000000001', 'tempblock@test.invalid','700000009','Temp Blocked',    'customer', true, true, false),
  ('a0000000-0000-4000-8000-000000000002', 'blockadmin@test.invalid','700000010','Blocked Admin', 'admin',    true, true, false)
on conflict (id) do nothing;
update public.users
set is_blocked = false,
    blocked_until = now() + interval '1 day'
where id in (
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002'
);
alter table public.users enable trigger all;

insert into public.customer_profiles (id, user_id, wallet_balance)
values
  ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 0),
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 0)
on conflict (user_id) where user_id is not null
do update set wallet_balance = excluded.wallet_balance;

insert into public.merchant_profiles (
  id, user_id, store_name, store_slug, is_approved, is_active, is_open,
  wallet_balance, bank_name, bank_account, bank_account_name
) values
  ('90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
   'Refund Merchant', 'test-refund-merchant', true, true, true, 800, 'Test Bank', 'ACC-REFUND', 'Refund Merchant'),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   'Wallet Merchant', 'test-wallet-merchant', true, true, true, 500, 'Test Bank', 'ACC-WALLET', 'Wallet Merchant'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Review Merchant', 'test-review-merchant', false, false, false, 0, NULL, NULL, NULL)
on conflict (id) do nothing;

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate, work_city,
  is_online, is_approved, wallet_balance
) values
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'D-TEST-1', 'motorcycle', 'TEST-1', 'Sanaa', false, true, 100),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'D-TEST-2', 'motorcycle', 'TEST-2', 'Sanaa', false, false, 0)
on conflict (id) do nothing;

insert into public.addresses (
  id, user_id, label, full_address, city, area, is_default
) values (
  'aa000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'home', 'Test delivery address', 'Sanaa', 'Test area', true
)
on conflict (id) do nothing;

alter table public.orders disable trigger user;
insert into public.orders (
  id, order_number, customer_id, merchant_id, delivery_id, address_id, status,
  subtotal, delivery_fee, discount_amount, platform_commission, tax_amount,
  total_amount, payment_method, payment_status, delivered_at, created_at, updated_at
) values (
  '01000000-0000-4000-8000-000000000001', 'TEST-REFUND-001',
  'c0000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'delivered', 900, 100, 0, 100, 0, 1000, 'cash', 'paid', now(), now(), now()
);
alter table public.orders enable trigger user;


alter table public.delivery_earnings disable trigger all;
insert into public.delivery_earnings (delivery_id, total_earning, created_at)
select 'd0000000-0000-4000-8000-000000000001', 2, now() from generate_series(1,75);
insert into public.delivery_earnings (delivery_id, total_earning, created_at)
values ('d0000000-0000-4000-8000-000000000001', 99,
  (date_trunc('day',now() at time zone 'Asia/Aden') at time zone 'Asia/Aden') - interval '1 second');
alter table public.delivery_earnings enable trigger all;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select is((public.get_delivery_wallet_summary()->>'today_deliveries')::integer, 75,
  'daily deliveries exceed latest fifty history rows');
select is((public.get_delivery_wallet_summary()->>'today_earnings')::numeric, 150::numeric,
  'daily earnings sum every row and exclude yesterday in Aden');
select is((public.get_delivery_wallet_summary()->>'recorded_count')::integer, 76,
  'history count includes all earning records');
select is(public.get_delivery_wallet_summary()->>'timezone', 'Asia/Aden',
  'courier day uses marketplace timezone');
select is((public.get_delivery_wallet_summary()->>'balance')::numeric, 100::numeric,
  'wallet balance comes from authoritative courier profile');
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select throws_ok('select public.get_delivery_wallet_summary()', '42501', 'delivery account is not operational',
  'merchant cannot read courier summary');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
update public.users set is_blocked = true where id = 'd0000000-0000-4000-8000-000000000001';
select throws_ok('select public.get_delivery_wallet_summary()', '42501', 'delivery account is not operational',
  'blocked courier cannot read summary');
update public.users set is_blocked = false where id = 'd0000000-0000-4000-8000-000000000001';
update public.delivery_profiles set is_approved = false where id = 'd0000000-0000-4000-8000-000000000001';
select throws_ok('select public.get_delivery_wallet_summary()', '42501', 'approved delivery profile required',
  'unapproved courier cannot read summary');
select ok(not has_function_privilege('anon', 'public.get_delivery_wallet_summary()', 'execute'),
  'anonymous role has no courier summary access');
select * from finish();
rollback;
