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
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'D-TEST-1', 'motorcycle', 'TEST-1', false, true, 100),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'D-TEST-2', 'motorcycle', 'TEST-2', false, false, 0)
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

insert into public.order_settlements (
  id, order_id, merchant_id, delivery_id, payment_method, gross_amount,
  merchant_proceeds, delivery_earning, platform_commission, tax_amount,
  platform_amount, settlement_key, status, reversed_amount, settled_by
) values (
  '51000000-0000-4000-8000-000000000001',
  '01000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'cash', 1000, 800, 100, 100, 0, 100,
  '52000000-0000-4000-8000-000000000001', 'settled', 0,
  'd0000000-0000-4000-8000-000000000001'
);

insert into public.marketplace_ledger_entries (
  id, operation_key, order_id, entry_type, debit_account, debit_owner_id,
  credit_account, credit_owner_id, amount, created_by
) values
  ('53000000-0000-4000-8000-000000000001', 'settlement:01000000-0000-4000-8000-000000000001:merchant_proceeds',
   '01000000-0000-4000-8000-000000000001', 'merchant_proceeds', 'order_clearing', NULL,
   'merchant_wallet', '90000000-0000-4000-8000-000000000001', 800, 'd0000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', 'settlement:01000000-0000-4000-8000-000000000001:delivery_earning',
   '01000000-0000-4000-8000-000000000001', 'delivery_earning', 'order_clearing', NULL,
   'delivery_wallet', 'd0000000-0000-4000-8000-000000000001', 100, 'd0000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000003', 'settlement:01000000-0000-4000-8000-000000000001:platform_revenue',
   '01000000-0000-4000-8000-000000000001', 'platform_revenue', 'order_clearing', NULL,
   'platform_revenue', NULL, 100, 'd0000000-0000-4000-8000-000000000001');

create temporary table finance_support_test_ids (
  name text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update, delete on finance_support_test_ids to authenticated;

-- Customer refund creation is server-priced and idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
insert into finance_support_test_ids(name, id)
select 'refund', public.create_refund_request(
  '01000000-0000-4000-8000-000000000001',
  'damaged',
  'The item arrived damaged and cannot be used.',
  'wallet',
  '["https://example.invalid/evidence.jpg"]'::jsonb
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_support_ticket('Blocked attempt', 'other', 'This operation must not be accepted.', NULL)$$,
  '42501', 'account is not allowed to create support tickets',
  'future blocked_until blocks an actor even while is_blocked is false'
);
reset role;

select is(
  (select refund_amount from public.refund_requests where id = (select id from finance_support_test_ids where name = 'refund')),
  1000::numeric,
  'refund amount is derived from the verified settlement remainder'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select is(
  public.create_refund_request(
    '01000000-0000-4000-8000-000000000001', 'damaged',
    'The item arrived damaged and cannot be used.', 'wallet',
    '["https://example.invalid/evidence.jpg"]'::jsonb
  ),
  (select id from finance_support_test_ids where name = 'refund'),
  'retrying the same refund returns the existing request'
);
reset role;

select is(
  (select count(*) from public.refund_requests where order_id = '01000000-0000-4000-8000-000000000001'),
  1::bigint,
  'refund retry does not duplicate the request'
);

-- Only the order merchant can respond; the same response retry is a no-op.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.respond_refund_request(%L::uuid, %L)',
    (select id from finance_support_test_ids where name = 'refund'),
    'Not my order'
  ),
  '42501',
  'only the order merchant can respond to this refund',
  'unrelated user cannot respond to a refund'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select lives_ok(
  format(
    'select public.respond_refund_request(%L::uuid, %L)',
    (select id from finance_support_test_ids where name = 'refund'),
    'Merchant verified the reported damage.'
  ),
  'merchant can respond to its refund request'
);
select lives_ok(
  format(
    'select public.respond_refund_request(%L::uuid, %L)',
    (select id from finance_support_test_ids where name = 'refund'),
    'Merchant verified the reported damage.'
  ),
  'merchant response retry is idempotent'
);
select lives_ok(
  format(
    'select public.respond_refund_request(%L::uuid, %L)',
    (select id from finance_support_test_ids where name = 'refund'),
    'Merchant verified the damage and attached its internal inspection result.'
  ),
  'merchant can correct its response while the refund remains pending'
);
reset role;

select is(
  (select merchant_response from public.refund_requests where id = (select id from finance_support_test_ids where name = 'refund')),
  'Merchant verified the damage and attached its internal inspection result.',
  'corrected merchant response is the current participant-visible response'
);

-- Admin refund state machine and one-time financial reversal.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.process_refund_request(%L::uuid, %L, NULL, NULL)',
    (select id from finance_support_test_ids where name = 'refund'),
    'completed'
  ),
  '22023',
  'illegal refund transition: pending -> completed',
  'refund cannot skip financial stages'
);
select lives_ok(format(
  'select public.process_refund_request(%L::uuid, %L, %L, NULL)',
  (select id from finance_support_test_ids where name = 'refund'), 'approved', 'Approved after evidence review'
), 'admin approves refund for financial processing');
select lives_ok(format(
  'select public.process_refund_request(%L::uuid, %L, NULL, NULL)',
  (select id from finance_support_test_ids where name = 'refund'), 'processing'
), 'admin starts refund processing');
select lives_ok(format(
  'select public.process_refund_request(%L::uuid, %L, %L, NULL)',
  (select id from finance_support_test_ids where name = 'refund'), 'completed', 'Wallet refund completed'
), 'admin completes balanced wallet refund reversal');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select throws_ok(
  'select * from public.admin_list_refund_requests()',
  '42501', 'admin authorization required',
  'temporarily blocked admin cannot use an administrative finance RPC'
);
select is(
  (select count(*) from public.refund_requests),
  0::bigint,
  'temporarily blocked admin is also denied administrative RLS reads'
);
reset role;

select is(
  (select status from public.refund_requests where id = (select id from finance_support_test_ids where name = 'refund')),
  'completed',
  'refund reaches completed only after the reversal transaction'
);
select is((select wallet_balance from public.merchant_profiles where id = '90000000-0000-4000-8000-000000000001'), 0::numeric, 'merchant proceeds are reversed');
select is((select wallet_balance from public.delivery_profiles where id = 'd0000000-0000-4000-8000-000000000001'), 0::numeric, 'delivery earning is reversed');
select is((select wallet_balance from public.customer_profiles where user_id = 'c0000000-0000-4000-8000-000000000001'), 1000::numeric, 'customer wallet receives the refund');
select is((select reversed_amount from public.order_settlements where order_id = '01000000-0000-4000-8000-000000000001'), 1000::numeric, 'settlement records the reversed amount');
select is((select status from public.order_settlements where order_id = '01000000-0000-4000-8000-000000000001'), 'reversed', 'settlement reaches reversed');
select is((select payment_status::text from public.orders where id = '01000000-0000-4000-8000-000000000001'), 'refunded', 'fully reversed order records refunded payment status');
select is(
  (select count(*) from public.marketplace_ledger_entries where operation_key like 'refund:' || (select id::text from finance_support_test_ids where name = 'refund') || ':%'),
  4::bigint,
  'refund writes one balanced component entry per account exactly once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(format(
  'select public.process_refund_request(%L::uuid, %L, %L, NULL)',
  (select id from finance_support_test_ids where name = 'refund'), 'completed', 'Retry'
), 'completed refund retry is a no-op');
reset role;
select is(
  (select count(*) from public.marketplace_ledger_entries where operation_key like 'refund:' || (select id::text from finance_support_test_ids where name = 'refund') || ':%'),
  4::bigint,
  'refund retry does not duplicate ledger entries'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  'select * from public.admin_list_refund_requests()',
  '42501', 'admin authorization required',
  'customer cannot call the protected admin refund listing'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select ok(
  (select count(*) >= 1 from public.admin_list_refund_requests()),
  'admin refund listing returns the complete protected record set'
);
reset role;

-- Withdrawal reserves once, pays from the reservation, and rejection releases.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
insert into finance_support_test_ids(name, id)
select 'withdrawal_paid', public.request_withdrawal(100, 'Primary payout');
select is(
  public.request_withdrawal(100, 'Primary payout'),
  (select id from finance_support_test_ids where name = 'withdrawal_paid'),
  'withdrawal retry returns the active reserved request'
);
reset role;

select is((select wallet_balance from public.merchant_profiles where id = 'e0000000-0000-4000-8000-000000000001'), 400::numeric, 'withdrawal immediately reserves available balance');
select is(
  (select payout_destination ->> 'account_number' from public.withdrawal_requests where id = (select id from finance_support_test_ids where name = 'withdrawal_paid')),
  'ACC-WALLET',
  'withdrawal snapshots the payout destination'
);
select is(
  (select count(*) from public.wallet_transactions where source = 'withdrawal_reserve' and reference_id = (select id from finance_support_test_ids where name = 'withdrawal_paid')),
  1::bigint,
  'withdrawal retry does not reserve twice'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(format(
  'select public.process_withdrawal_request(%L::uuid, %L, NULL, NULL)',
  (select id from finance_support_test_ids where name = 'withdrawal_paid'), 'approved'
), 'admin approves a reserved withdrawal');
select lives_ok(format(
  'select public.process_withdrawal_request(%L::uuid, %L, NULL, NULL)',
  (select id from finance_support_test_ids where name = 'withdrawal_paid'), 'processing'
), 'admin starts withdrawal transfer');
select lives_ok(format(
  'select public.process_withdrawal_request(%L::uuid, %L, NULL, %L)',
  (select id from finance_support_test_ids where name = 'withdrawal_paid'), 'paid', 'WD-TEST-001'
), 'admin records paid withdrawal with external reference');
select lives_ok(format(
  'select public.process_withdrawal_request(%L::uuid, %L, NULL, NULL)',
  (select id from finance_support_test_ids where name = 'withdrawal_paid'), 'paid'
), 'paid withdrawal retry does not require transition-only fields again');
reset role;

select is((select status from public.withdrawal_requests where id = (select id from finance_support_test_ids where name = 'withdrawal_paid')), 'paid', 'paid withdrawal is terminal');
select is((select wallet_balance from public.merchant_profiles where id = 'e0000000-0000-4000-8000-000000000001'), 400::numeric, 'payment finalizes rather than debiting the wallet again');
select is(
  (select count(*) from public.marketplace_ledger_entries where operation_key = 'withdrawal:' || (select id::text from finance_support_test_ids where name = 'withdrawal_paid') || ':paid'),
  1::bigint,
  'withdrawal payment ledger entry is unique'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
insert into finance_support_test_ids(name, id)
select 'withdrawal_rejected', public.request_withdrawal(50, 'Second payout');
reset role;
select is((select wallet_balance from public.merchant_profiles where id = 'e0000000-0000-4000-8000-000000000001'), 350::numeric, 'second withdrawal is reserved');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(format(
  'select public.process_withdrawal_request(%L::uuid, %L, %L, NULL)',
  (select id from finance_support_test_ids where name = 'withdrawal_rejected'), 'rejected', 'Destination could not be verified'
), 'admin rejection releases a pending reservation');
select lives_ok(format(
  'select public.process_withdrawal_request(%L::uuid, %L, NULL, NULL)',
  (select id from finance_support_test_ids where name = 'withdrawal_rejected'), 'rejected'
), 'rejected withdrawal retry does not release or validate transition fields twice');
reset role;
select is((select wallet_balance from public.merchant_profiles where id = 'e0000000-0000-4000-8000-000000000001'), 400::numeric, 'rejected withdrawal returns the reserved amount');
select is(
  (select count(*) from public.wallet_transactions where source = 'withdrawal_release' and reference_id = (select id from finance_support_test_ids where name = 'withdrawal_rejected')),
  1::bigint,
  'withdrawal release is recorded exactly once'
);

-- Support ticket creation and reply state are atomic and retry-safe.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
insert into finance_support_test_ids(name, id)
select 'support', public.create_support_ticket(
  'Refund follow-up', 'order', 'Please explain the completed refund.',
  '01000000-0000-4000-8000-000000000001'
);
select is(
  public.create_support_ticket(
    'Refund follow-up', 'order', 'Please explain the completed refund.',
    '01000000-0000-4000-8000-000000000001'
  ),
  (select id from finance_support_test_ids where name = 'support'),
  'support ticket exact retry returns the recent atomic ticket'
);
reset role;
select is(
  (select count(*) from public.support_messages where ticket_id = (select id from finance_support_test_ids where name = 'support')),
  1::bigint,
  'support creation commits the ticket and first message together'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(format(
  'select public.reply_support_ticket(%L::uuid, %L)',
  (select id from finance_support_test_ids where name = 'support'), 'Your refund was credited to the wallet.'
), 'admin can reply to support ticket');
select lives_ok(format(
  'select public.reply_support_ticket(%L::uuid, %L)',
  (select id from finance_support_test_ids where name = 'support'), 'Your refund was credited to the wallet.'
), 'support reply retry returns the recent message');
reset role;
select is(
  (select count(*) from public.support_messages where ticket_id = (select id from finance_support_test_ids where name = 'support')),
  2::bigint,
  'support reply retry does not duplicate the message'
);
select is((select status from public.support_tickets where id = (select id from finance_support_test_ids where name = 'support')), 'waiting_user', 'admin reply moves ticket to waiting_user');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(format(
  'select public.update_support_ticket_status(%L::uuid, %L)',
  (select id from finance_support_test_ids where name = 'support'), 'resolved'
), 'admin resolves the support ticket');
reset role;
select ok(
  (select status = 'resolved' and resolved_at is not null from public.support_tickets where id = (select id from finance_support_test_ids where name = 'support')),
  'support resolution records status and timestamp atomically'
);

-- Review/operational controls require admin and record evidence.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.review_merchant_application('b0000000-0000-4000-8000-000000000001', true, NULL)$$,
  '42501', 'admin authorization required',
  'customer cannot review merchant application'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.review_merchant_application('b0000000-0000-4000-8000-000000000001', true, 'Documents verified')$$, 'admin approves merchant application');
select lives_ok($$select public.set_merchant_operational_status('b0000000-0000-4000-8000-000000000001', false, 'Temporary compliance pause')$$, 'admin pauses merchant with reason');
select lives_ok($$select public.review_delivery_application(
  'b0000000-0000-4000-8000-000000000002',
  true,
  'Identity verified',
  (select application_revision from public.delivery_profiles where id = 'b0000000-0000-4000-8000-000000000002')
)$$, 'admin approves delivery application at the reviewed revision');
select lives_ok($$select public.admin_set_delivery_online('b0000000-0000-4000-8000-000000000002', true)$$, 'admin enables approved delivery availability');
reset role;

select ok(
  (select is_approved and not is_active and pause_reason = 'Temporary compliance pause' and approval_reviewed_by = 'a0000000-0000-4000-8000-000000000001'
   from public.merchant_profiles where id = 'b0000000-0000-4000-8000-000000000001'),
  'merchant approval and operational pause retain their separate audited states'
);
select ok(
  (select is_approved and is_online and approval_reviewed_by = 'a0000000-0000-4000-8000-000000000001'
   from public.delivery_profiles where id = 'b0000000-0000-4000-8000-000000000002'),
  'delivery approval is required before admin online control'
);

-- Broadcast campaigns are all-or-nothing and idempotent by caller key.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
insert into finance_support_test_ids(name, id)
select 'broadcast', (public.create_broadcast_campaign(
  'Test campaign', 'One campaign per recipient.', 'customer', 'in_app',
  'ba000000-0000-4000-8000-000000000001'
)->>'campaign_id')::uuid;
reset role;

select is(
  (select count(*) from public.notifications where broadcast_id = (select id from finance_support_test_ids where name = 'broadcast')),
  (select created_count::bigint from public.broadcast_notifications where id = (select id from finance_support_test_ids where name = 'broadcast')),
  'broadcast campaign count matches committed notifications'
);
select is(
  (select count(*) from public.notifications
   where broadcast_id = (select id from finance_support_test_ids where name = 'broadcast')
     and user_id = '70000000-0000-4000-8000-000000000001'),
  0::bigint,
  'temporarily blocked users are excluded from broadcast recipients'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select is(
  (public.create_broadcast_campaign(
    'Test campaign', 'One campaign per recipient.', 'customer', 'in_app',
    'ba000000-0000-4000-8000-000000000001'
  )->>'campaign_id')::uuid,
  (select id from finance_support_test_ids where name = 'broadcast'),
  'broadcast retry returns the same campaign'
);
reset role;
select is(
  (select count(*) from public.notifications where broadcast_id = (select id from finance_support_test_ids where name = 'broadcast')),
  (select created_count::bigint from public.broadcast_notifications where id = (select id from finance_support_test_ids where name = 'broadcast')),
  'broadcast retry does not duplicate recipient notifications'
);

-- Privilege and direct-write boundaries.
select ok(
  not has_function_privilege('anon', 'public.process_refund_request(uuid,text,text,text)', 'execute')
  and has_function_privilege('authenticated', 'public.process_refund_request(uuid,text,text,text)', 'execute'),
  'refund processing RPC is authenticated-only'
);
select ok(
  not has_function_privilege('anon', 'public.process_withdrawal_request(uuid,text,text,text)', 'execute')
  and has_function_privilege('authenticated', 'public.process_withdrawal_request(uuid,text,text,text)', 'execute'),
  'withdrawal processing RPC is authenticated-only'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in (
        'refund_requests','withdrawal_requests','wallet_transactions','support_tickets',
        'support_messages','broadcast_notifications','admin_activity_logs'
      )
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
  ),
  'financial and support tables have no direct mutation policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.refund_requests', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.withdrawal_requests', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.support_tickets', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.support_messages', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.broadcast_notifications', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.admin_activity_logs', 'INSERT,UPDATE,DELETE'),
  'authenticated has no direct mutation table privileges'
);
select ok(
  not has_column_privilege('authenticated', 'public.refund_requests', 'external_reference', 'SELECT')
  and not has_column_privilege('authenticated', 'public.refund_requests', 'processed_by', 'SELECT'),
  'participant table grants do not expose protected refund processing evidence'
);

select * from finish();
rollback;
