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
  'delivered', 900, 100, 0, 100, 0, 1000, 'cash', 'paid', now(), now() - interval '30 days', now()
);
alter table public.orders enable trigger user;


-- One product exists on a delivered and a pending order; only delivered units rank.
insert into public.products (id, merchant_id, name, base_price, is_active)
values ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Report Product', 900, true);
alter table public.orders disable trigger user;
insert into public.orders (id, order_number, customer_id, merchant_id, address_id, status, total_amount)
values ('01000000-0000-4000-8000-000000000002', 'TEST-REPORT-PENDING',
  'c0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001', 'pending', 9999);
alter table public.orders enable trigger user;
insert into public.order_items (order_id, product_id, quantity, unit_price, total_price, product_name)
values ('01000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 1, 900, 900, 'Report Product'),
       ('01000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 99, 101, 9999, 'Report Product');

-- Completed partial refund reduces net sales; a pending request must not.
alter table public.refund_requests disable trigger all;
insert into public.refund_requests (order_id, customer_id, reason, refund_amount, status)
values ('01000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'test', 200, 'completed'),
       ('01000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'test', 500, 'pending');
alter table public.refund_requests enable trigger all;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select is((public.merchant_sales_report(7)->'dashboard'->>'today_revenue')::numeric, 800::numeric,
  'today sales use delivery date and subtract only completed refunds');
select is((public.merchant_sales_report(7)->'dashboard'->>'today_orders')::integer, 1,
  'today order count remains based on order creation');
select is((public.merchant_sales_report(7)->'top_products'->0->>'total_sold')::integer, 1,
  'top products exclude pending order quantities');
select is((public.merchant_sales_report(7)->'top_products'->0->>'revenue')::numeric, 720::numeric,
  'product sales allocate completed order refunds proportionally');
select is((public.merchant_sales_report(7)->'dashboard'->>'pending_orders')::integer, 1,
  'pending dashboard count is computed on server');
select is((public.merchant_sales_report(7)->'stats'->>'current_revenue')::numeric, 800::numeric,
  'period revenue includes an old order delivered today');
select is((public.merchant_sales_report(1)->'chart'->>0)::numeric, 800::numeric,
  'one-day Aden chart agrees with dashboard revenue');
select is(jsonb_array_length(public.merchant_sales_report(0)->'chart'), 1,
  'invalid chart days clamp to one');
select is(jsonb_array_length(public.merchant_sales_report(999)->'chart'), 365,
  'chart days clamp to 365');
select is((public.merchant_sales_report(7)->>'merchant_id'), '90000000-0000-4000-8000-000000000001',
  'report identifies the authenticated merchant');
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
select is((public.merchant_sales_report(7)->'stats'->>'current_revenue')::numeric, 0::numeric,
  'another merchant cannot see fixture sales');
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select throws_ok('select public.merchant_sales_report(7)', '42501', 'merchant account is not operational',
  'customer cannot invoke merchant report');
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
update public.users set is_blocked = true where id = '90000000-0000-4000-8000-000000000001';
select throws_ok('select public.merchant_sales_report(7)', '42501', 'merchant account is not operational',
  'blocked merchant cannot access financial report');
update public.users set is_blocked = false where id = '90000000-0000-4000-8000-000000000001';
update public.merchant_profiles set is_approved = false where id = '90000000-0000-4000-8000-000000000001';
select throws_ok('select public.merchant_sales_report(7)', '42501', 'merchant account is not operational',
  'unapproved merchant cannot access financial report');
select ok(not has_function_privilege('anon', 'public.merchant_sales_report(integer)', 'execute'),
  'anonymous role has no report access');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok('select public.merchant_sales_report(7)', 'P0001', 'AUTH_REQUIRED',
  'missing session cannot access merchant report');
select * from finish();
rollback;
