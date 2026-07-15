begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

-- -----------------------------------------------------------------------------
-- Schema, RPC, security and storage contracts.
-- -----------------------------------------------------------------------------

select has_table(
  'public', 'cod_remittance_submissions',
  'courier COD remittance submissions have a dedicated table'
);
select has_column(
  'public', 'delivery_cod_collections', 'amount_remitted',
  'COD collections retain the cumulative remitted amount'
);
select has_column(
  'public', 'delivery_cod_collections', 'dispute_reason',
  'COD collection disputes preserve their reason'
);
select has_column(
  'public', 'cod_remittance_submissions', 'idempotency_key',
  'COD submissions have caller idempotency keys'
);
select has_column(
  'public', 'cod_remittance_submissions', 'request_hash',
  'COD submissions bind idempotency to canonical request details'
);
select has_column(
  'public', 'cod_remittance_submissions', 'proof_path',
  'COD submissions require private storage evidence'
);
select has_column(
  'public', 'cod_remittance_submissions', 'processor_id',
  'COD submissions record the reviewing admin'
);
select has_column(
  'public', 'cod_remittance_submissions', 'ledger_entry_id',
  'approved COD submissions link to their once-only custody ledger entry'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.delivery_cod_collections')
      and conname = 'delivery_cod_collections_status_check'
      and pg_get_constraintdef(oid) ilike '%partially_remitted%'
      and pg_get_constraintdef(oid) ilike '%disputed%'
  ),
  'COD collection status includes collected, partial, remitted and disputed states'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.cod_remittance_submissions')
      and conname = 'cod_remittance_no_self_review_check'
  ),
  'database constraints prevent self-review of courier remittance evidence'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'cod_remittance_delivery_idempotency_uq'
      and indexdef ilike 'create unique index%'
  ),
  'courier remittance idempotency is unique'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.withdrawal_requests')
      and tgname = 'trg_enforce_cod_withdrawal_hold'
      and not tgisinternal
  ),
  'withdrawal inserts are guarded by COD custody availability'
);
select ok(
  pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%v_physical_cash_account := ''delivery_cash_custody''%'
  and pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%v_allocation_source := ''cod_settlement_receivable''%'
  and pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%held_in_delivery_cash_custody%',
  'COD settlement separates physical custody from held economic receivable allocation'
);

select ok(
  to_regprocedure('public.list_my_cod_collections()') is not null,
  'courier COD collection listing RPC exists'
);
select ok(
  to_regprocedure('public.submit_cod_remittance(uuid,numeric,text,text,uuid)') is not null,
  'courier COD remittance submission RPC exists'
);
select ok(
  to_regprocedure('public.admin_review_cod_remittance(uuid,text,text)') is not null,
  'admin COD remittance review RPC exists'
);
select ok(
  to_regprocedure('public.admin_set_cod_collection_dispute(uuid,boolean,text)') is not null,
  'admin COD collection dispute RPC exists'
);
select ok(
  to_regprocedure('public.admin_list_cod_collections()') is not null,
  'admin COD reconciliation listing RPC exists'
);
select results_eq(
  $$ select proargnames::text[]
     from pg_proc
     where oid = to_regprocedure('public.submit_cod_remittance(uuid,numeric,text,text,uuid)') $$,
  $$ values (array[
       'p_collection_id','p_amount','p_reference','p_proof_path','p_idempotency_key'
     ]::text[]) $$,
  'COD submission named arguments match the PostgREST contract'
);
select results_eq(
  $$ select proargnames::text[]
     from pg_proc
     where oid = to_regprocedure('public.admin_review_cod_remittance(uuid,text,text)') $$,
  $$ values (array['p_submission_id','p_decision','p_note']::text[]) $$,
  'COD review named arguments match the PostgREST contract'
);
select results_eq(
  $$ select proargnames::text[]
     from pg_proc
     where oid = to_regprocedure('public.admin_set_cod_collection_dispute(uuid,boolean,text)') $$,
  $$ values (array['p_collection_id','p_disputed','p_reason']::text[]) $$,
  'COD dispute named arguments match the PostgREST contract'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'list_my_cod_collections','submit_cod_remittance',
        'admin_review_cod_remittance','admin_set_cod_collection_dispute',
        'admin_list_cod_collections','marketplace_validate_cod_remittance_proof',
        'marketplace_cod_held_balance','marketplace_enforce_cod_withdrawal_hold',
        'marketplace_normalize_cod_collection'
      )
      and (
        not p.prosecdef
        or not exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) as config(value)
          where replace(config.value, '"', '') = 'search_path='
        )
      )
  ),
  'every COD entry point and helper is security-definer with an empty search_path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_cod_remittance(uuid,numeric,text,text,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.submit_cod_remittance(uuid,numeric,text,text,uuid)',
    'execute'
  ),
  'only authenticated callers reach the courier submission RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_review_cod_remittance(uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_review_cod_remittance(uuid,text,text)',
    'execute'
  ),
  'admin review is exposed only to authenticated callers and authorizes internally'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.marketplace_cod_held_balance(uuid)', 'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.marketplace_validate_cod_remittance_proof(text,uuid,uuid,uuid)',
    'execute'
  ),
  'COD hold and raw object validators remain internal'
);
select ok(
  has_table_privilege('authenticated', 'public.delivery_cod_collections', 'select')
  and not has_table_privilege(
    'authenticated', 'public.delivery_cod_collections', 'insert,update,delete'
  )
  and has_table_privilege('authenticated', 'public.cod_remittance_submissions', 'select')
  and not has_table_privilege(
    'authenticated', 'public.cod_remittance_submissions', 'insert,update,delete'
  ),
  'COD tables are participant-readable but RPC-only for mutation'
);
select ok(
  coalesce((
    select relrowsecurity
    from pg_class
    where oid = to_regclass('public.cod_remittance_submissions')
  ), false),
  'COD submissions have RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_cod_collections'
      and policyname = 'delivery_cod_collections_participant_select'
      and qual ilike '%is_current_merchant_profile_owner%'
      and qual not ilike '%mp.user_id%'
  ),
  'COD collection RLS uses the protected merchant ownership helper without exposing merchant user UUIDs'
);

select is(
  (select public from storage.buckets where id = 'cod-remittance-proofs'),
  false,
  'COD proof bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'cod-remittance-proofs'),
  10485760::bigint,
  'COD proof bucket enforces the 10 MB ceiling'
);
select ok(
  (select allowed_mime_types @> array[
     'image/jpeg','image/png','application/pdf'
   ]::text[] from storage.buckets where id = 'cod-remittance-proofs'),
  'COD proof bucket permits only reviewed image/PDF evidence types'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Assigned courier uploads COD remittance proof'
      and cmd = 'INSERT'
      and with_check ilike '%cod-remittances%'
      and with_check ilike '%delivery_profiles%'
      and with_check ilike '%partially_remitted%'
      and with_check ilike '%is_current_user_blocked%'
      and with_check ilike '%10485760%'
  ),
  'proof uploads bind owner, assignment, open custody, block state, MIME and size'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Courier or admin reads COD remittance proof'
      and cmd = 'SELECT'
      and qual ilike '%is_admin%'
  ),
  'private remittance evidence is readable only by its courier or an admin'
);
select ok(
  (select relreplident = 'f'
   from pg_class where oid = to_regclass('public.cod_remittance_submissions'))
  and (
    not exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    )
    or exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'cod_remittance_submissions'
    )
  ),
  'COD submission changes carry full realtime row identity when realtime is installed'
);

-- -----------------------------------------------------------------------------
-- Transaction fixtures: one normal COD collection, one review/retry collection
-- with zero wallet components, and one zero-total collection.
-- -----------------------------------------------------------------------------

alter table public.users disable trigger all;
insert into public.users(
  id, email, full_name, role, is_active, is_verified, is_blocked, blocked_until
) values
  ('a5000000-0000-4000-8000-000000000001', 'cod-admin@test.invalid', 'COD Admin', 'admin', true, true, false, null),
  ('c5000000-0000-4000-8000-000000000001', 'cod-customer@test.invalid', 'COD Customer', 'customer', true, true, false, null),
  ('e5000000-0000-4000-8000-000000000001', 'cod-merchant@test.invalid', 'COD Merchant', 'merchant', true, true, false, null),
  ('d5000000-0000-4000-8000-000000000001', 'cod-courier@test.invalid', 'COD Courier', 'delivery', true, true, false, null),
  ('d6000000-0000-4000-8000-000000000001', 'other-courier@test.invalid', 'Other Courier', 'delivery', true, true, false, null),
  ('d7000000-0000-4000-8000-000000000001', 'blocked-courier@test.invalid', 'Blocked Courier', 'delivery', true, true, false, now() + interval '1 hour');
alter table public.users enable trigger all;

insert into public.merchant_profiles(
  id, user_id, store_name, store_slug, address, city,
  is_approved, is_active, is_open, wallet_balance,
  bank_name, bank_account, bank_account_name
) values (
  'e5100000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'COD Test Merchant', 'cod-test-merchant', 'COD pickup address', 'Sanaa',
  true, true, true, 70, 'Test Bank', 'COD-ACCOUNT-001', 'COD Merchant'
);

insert into public.delivery_profiles(
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values
  ('d5100000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'COD-COURIER-1', 'motorcycle', 'COD-1', true, true, 20),
  ('d6100000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'COD-COURIER-2', 'motorcycle', 'COD-2', true, true, 0),
  ('d7100000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'COD-COURIER-3', 'motorcycle', 'COD-3', true, true, 0);

insert into public.addresses(
  id, user_id, label, full_address, city, area, is_default
) values (
  'a5100000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'home', 'COD delivery address', 'Sanaa', 'Test area', true
);

alter table public.orders disable trigger user;
insert into public.orders(
  id, order_number, customer_id, merchant_id, delivery_id, address_id,
  status, subtotal, delivery_fee, discount_amount, platform_commission,
  tax_amount, total_amount, payment_method, payment_status,
  delivered_at, settled_at
) values
  ('05000000-0000-4000-8000-000000000001', 'TEST-COD-001',
   'c5000000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001',
   'd5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001',
   'delivered', 90, 10, 0, 10, 0, 100, 'cash', 'paid', now(), now()),
  ('05000000-0000-4000-8000-000000000002', 'TEST-COD-002',
   'c5000000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001',
   'd5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001',
   'delivered', 50, 0, 0, 50, 0, 50, 'cash', 'paid', now(), now()),
  ('05000000-0000-4000-8000-000000000003', 'TEST-COD-ZERO',
   'c5000000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001',
   'd6100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000001',
   'delivered', 0, 0, 0, 0, 0, 0, 'cash', 'paid', now(), now());
alter table public.orders enable trigger user;

insert into public.order_settlements(
  id, order_id, merchant_id, delivery_id, payment_method, gross_amount,
  merchant_proceeds, delivery_earning, platform_commission, tax_amount,
  platform_amount, settlement_key, status, reversed_amount, settled_by
) values
  ('15000000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
   'e5100000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001',
   'cash', 100, 70, 20, 10, 0, 10, '25000000-0000-4000-8000-000000000001',
   'settled', 0, 'd5000000-0000-4000-8000-000000000001'),
  ('15000000-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000002',
   'e5100000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001',
   'cash', 50, 0, 0, 50, 0, 50, '25000000-0000-4000-8000-000000000002',
   'settled', 0, 'd5000000-0000-4000-8000-000000000001'),
  ('15000000-0000-4000-8000-000000000003', '05000000-0000-4000-8000-000000000003',
   'e5100000-0000-4000-8000-000000000001', 'd6100000-0000-4000-8000-000000000001',
   'cash', 0, 0, 0, 0, 0, 0, '25000000-0000-4000-8000-000000000003',
   'settled', 0, 'd6000000-0000-4000-8000-000000000001');

insert into public.marketplace_ledger_entries(
  id, operation_key, order_id, entry_type, debit_account, debit_owner_id,
  credit_account, credit_owner_id, amount, metadata, created_by
) values
  ('35000000-0000-4000-8000-000000000001', 'settlement:05000000-0000-4000-8000-000000000001:cod_collection',
   '05000000-0000-4000-8000-000000000001', 'cod_collection', 'customer_cash',
   'c5000000-0000-4000-8000-000000000001', 'delivery_cash_custody',
   'd5000000-0000-4000-8000-000000000001', 100,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000002', 'settlement:05000000-0000-4000-8000-000000000001:merchant_proceeds',
   '05000000-0000-4000-8000-000000000001', 'merchant_proceeds', 'cod_settlement_receivable',
   'd5000000-0000-4000-8000-000000000001', 'merchant_wallet',
   'e5000000-0000-4000-8000-000000000001', 70,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000003', 'settlement:05000000-0000-4000-8000-000000000001:delivery_earning',
   '05000000-0000-4000-8000-000000000001', 'delivery_earning', 'cod_settlement_receivable',
   'd5000000-0000-4000-8000-000000000001', 'delivery_wallet',
   'd5000000-0000-4000-8000-000000000001', 20,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000004', 'settlement:05000000-0000-4000-8000-000000000001:platform_revenue',
   '05000000-0000-4000-8000-000000000001', 'platform_revenue', 'cod_settlement_receivable',
   'd5000000-0000-4000-8000-000000000001', 'platform_revenue', null, 10,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),

  ('35000000-0000-4000-8000-000000000005', 'settlement:05000000-0000-4000-8000-000000000002:cod_collection',
   '05000000-0000-4000-8000-000000000002', 'cod_collection', 'customer_cash',
   'c5000000-0000-4000-8000-000000000001', 'delivery_cash_custody',
   'd5000000-0000-4000-8000-000000000001', 50,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000006', 'settlement:05000000-0000-4000-8000-000000000002:merchant_proceeds',
   '05000000-0000-4000-8000-000000000002', 'merchant_proceeds', 'cod_settlement_receivable',
   'd5000000-0000-4000-8000-000000000001', 'merchant_wallet',
   'e5000000-0000-4000-8000-000000000001', 0,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000007', 'settlement:05000000-0000-4000-8000-000000000002:delivery_earning',
   '05000000-0000-4000-8000-000000000002', 'delivery_earning', 'cod_settlement_receivable',
   'd5000000-0000-4000-8000-000000000001', 'delivery_wallet',
   'd5000000-0000-4000-8000-000000000001', 0,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000008', 'settlement:05000000-0000-4000-8000-000000000002:platform_revenue',
   '05000000-0000-4000-8000-000000000002', 'platform_revenue', 'cod_settlement_receivable',
   'd5000000-0000-4000-8000-000000000001', 'platform_revenue', null, 50,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd5000000-0000-4000-8000-000000000001'),

  ('35000000-0000-4000-8000-000000000009', 'settlement:05000000-0000-4000-8000-000000000003:cod_collection',
   '05000000-0000-4000-8000-000000000003', 'cod_collection', 'customer_cash',
   'c5000000-0000-4000-8000-000000000001', 'delivery_cash_custody',
   'd6000000-0000-4000-8000-000000000001', 0,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd6000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000010', 'settlement:05000000-0000-4000-8000-000000000003:merchant_proceeds',
   '05000000-0000-4000-8000-000000000003', 'merchant_proceeds', 'cod_settlement_receivable',
   'd6000000-0000-4000-8000-000000000001', 'merchant_wallet',
   'e5000000-0000-4000-8000-000000000001', 0,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd6000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000011', 'settlement:05000000-0000-4000-8000-000000000003:delivery_earning',
   '05000000-0000-4000-8000-000000000003', 'delivery_earning', 'cod_settlement_receivable',
   'd6000000-0000-4000-8000-000000000001', 'delivery_wallet',
   'd6000000-0000-4000-8000-000000000001', 0,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd6000000-0000-4000-8000-000000000001'),
  ('35000000-0000-4000-8000-000000000012', 'settlement:05000000-0000-4000-8000-000000000003:platform_revenue',
   '05000000-0000-4000-8000-000000000003', 'platform_revenue', 'cod_settlement_receivable',
   'd6000000-0000-4000-8000-000000000001', 'platform_revenue', null, 0,
   '{"funding_state":"held_in_delivery_cash_custody"}'::jsonb,
   'd6000000-0000-4000-8000-000000000001');

insert into public.delivery_cod_collections(
  id, order_id, delivery_id, collected_by, amount_collected,
  amount_remitted, status, collected_at
) values
  ('c5100000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001',
   'd5100000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
   100, 0, 'collected', now()),
  ('c5200000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000002',
   'd5100000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
   50, 0, 'collected', now()),
  ('c5300000-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000003',
   'd6100000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
   0, 0, 'collected', now());

insert into storage.objects(bucket_id, name, owner, owner_id, metadata)
values
  ('cod-remittance-proofs', 'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/11500000-0000-4000-8000-000000000001.pdf', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '{"mimetype":"application/pdf","size":"1024"}'::jsonb),
  ('cod-remittance-proofs', 'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/14500000-0000-4000-8000-000000000001.png', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '{"mimetype":"image/png","size":"2048"}'::jsonb),
  ('cod-remittance-proofs', 'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/21500000-0000-4000-8000-000000000001.jpg', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":"3072"}'::jsonb),
  ('cod-remittance-proofs', 'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/22500000-0000-4000-8000-000000000001.pdf', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '{"mimetype":"application/pdf","size":"4096"}'::jsonb),
  ('cod-remittance-proofs', 'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/23500000-0000-4000-8000-000000000001.pdf', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '{"mimetype":"application/pdf","size":"5120"}'::jsonb);

create temporary table cod_test_ids(
  name text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update, delete on cod_test_ids to authenticated;

select is(
  (select COALESCE(sum(
     case when credit_account = 'delivery_cash_custody' then amount else 0 end
     - case when debit_account = 'delivery_cash_custody' then amount else 0 end
   ), 0)
   from public.marketplace_ledger_entries
   where order_id = '05000000-0000-4000-8000-000000000001'),
  100::numeric,
  'settlement leaves the full physical cash amount in courier custody before remittance'
);
select ok(
  not exists (
    select 1
    from public.marketplace_ledger_entries
    where order_id = '05000000-0000-4000-8000-000000000001'
      and entry_type in ('merchant_proceeds','delivery_earning','platform_revenue')
      and debit_account = 'delivery_cash_custody'
  )
  and (
    select count(*) = 3
    from public.marketplace_ledger_entries
    where order_id = '05000000-0000-4000-8000-000000000001'
      and entry_type in ('merchant_proceeds','delivery_earning','platform_revenue')
      and debit_account = 'cod_settlement_receivable'
      and metadata ->> 'funding_state' = 'held_in_delivery_cash_custody'
  ),
  'economic allocation uses an explicit held receivable and never double-spends physical custody'
);

select is(
  (select status from public.delivery_cod_collections where id = 'c5300000-0000-4000-8000-000000000001'),
  'remitted',
  'a zero-total COD collection is normalized to remitted without fake cash movement'
);
select is(
  public.marketplace_cod_held_balance('d6000000-0000-4000-8000-000000000001'),
  0::numeric,
  'zero gross and zero collected amounts are division-safe in the hold calculation'
);
select is(
  public.marketplace_cod_held_balance('e5000000-0000-4000-8000-000000000001'),
  70::numeric,
  'unremitted COD holds the merchant proceeds attributable to outstanding cash'
);
select is(
  public.marketplace_cod_held_balance('d5000000-0000-4000-8000-000000000001'),
  20::numeric,
  'unremitted COD also holds the courier earning attributable to outstanding cash'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.request_withdrawal(50, 'Must wait for COD remittance') $$,
  '22023', 'COD_FUNDS_NOT_YET_REMITTED',
  'merchant cannot withdraw wallet proceeds while the COD cash is still in courier custody'
);
reset role;
select is(
  (select count(*) from public.withdrawal_requests where user_id = 'e5000000-0000-4000-8000-000000000001'),
  0::bigint,
  'a COD-held withdrawal fails before creating or reserving a request'
);
select is(
  (select wallet_balance from public.merchant_profiles where id = 'e5100000-0000-4000-8000-000000000001'),
  70::numeric,
  'a COD-held withdrawal leaves the wallet unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 40,
       'BANK-COD-001', null,
       '11500000-0000-4000-8000-000000000001'
     ) $$,
  '22023', 'remittance proof is required',
  'courier cannot submit a cash remittance without private proof'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 40,
       'OTHER-COURIER',
       'd6000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/12500000-0000-4000-8000-000000000001.pdf',
       '12500000-0000-4000-8000-000000000001'
     ) $$,
  '42501', 'COD collection is not assigned to this courier',
  'a different courier cannot submit proof against another courier custody record'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd7000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 40,
       'BLOCKED-COURIER',
       'd7000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/13500000-0000-4000-8000-000000000001.pdf',
       '13500000-0000-4000-8000-000000000001'
     ) $$,
  'P0001', 'ACTOR_NOT_ACTIVE',
  'temporary block state stops COD remittance submission before any mutation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
insert into cod_test_ids(name, id)
select 'partial_one', (public.submit_cod_remittance(
  'c5100000-0000-4000-8000-000000000001',
  40,
  'BANK-COD-001',
  'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/11500000-0000-4000-8000-000000000001.pdf',
  '11500000-0000-4000-8000-000000000001'
) ->> 'id')::uuid;
select is(
  (public.submit_cod_remittance(
    'c5100000-0000-4000-8000-000000000001',
    40,
    'BANK-COD-001',
    'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/11500000-0000-4000-8000-000000000001.pdf',
    '11500000-0000-4000-8000-000000000001'
  ) ->> 'id')::uuid,
  (select id from cod_test_ids where name = 'partial_one'),
  'exact courier retry returns the original remittance submission'
);
select is(
  (public.submit_cod_remittance(
    'c5100000-0000-4000-8000-000000000001',
    40,
    'BANK-COD-001',
    'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/11500000-0000-4000-8000-000000000001.pdf',
    '11500000-0000-4000-8000-000000000001'
  ) ->> 'idempotent_replay')::boolean,
  true,
  'exact courier retry is explicitly labelled idempotent'
);
reset role;
select is(
  (select count(*)
   from public.notifications
   where user_id = 'a5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-remittance-submitted:' ||
       (select id::text from cod_test_ids where name = 'partial_one')),
  1::bigint,
  'courier submission and its exact retry notify the active admin exactly once'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 41,
       'BANK-COD-001',
       'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/11500000-0000-4000-8000-000000000001.pdf',
       '11500000-0000-4000-8000-000000000001'
     ) $$,
  '23505', 'remittance idempotency key was reused with different details',
  'idempotency key cannot be reused for a different amount'
);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 10,
       'BANK-COD-001',
       'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/12500000-0000-4000-8000-000000000001.pdf',
       '12500000-0000-4000-8000-000000000001'
     ) $$,
  '23505', 'duplicate active remittance reference',
  'a second active submission cannot duplicate its bank reference'
);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 70,
       'BANK-COD-OVER',
       'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/13500000-0000-4000-8000-000000000001.pdf',
       '13500000-0000-4000-8000-000000000001'
     ) $$,
  '22023', 'remittance exceeds the unremitted amount available for review',
  'pending submissions reserve capacity so concurrent evidence cannot over-remit cash'
);
select throws_ok(
  format(
    'select public.admin_review_cod_remittance(%L::uuid, %L, %L)',
    (select id from cod_test_ids where name = 'partial_one'),
    'approved', null
  ),
  '42501', 'admin authorization required',
  'courier cannot approve their own or any other remittance submission'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'partial_one'),
    'approved', 'Cash received at reconciliation desk'
  ) ->> 'collection_status'),
  'partially_remitted',
  'admin approval records a partial remittance atomically'
);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'partial_one'),
    'approved', null
  ) ->> 'idempotent_replay')::boolean,
  true,
  'admin approval retry returns the terminal result without requiring transition-only notes'
);
reset role;
select is(
  (select count(*)
   from public.notifications
   where user_id = 'd5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-remittance-review:' ||
       (select id::text from cod_test_ids where name = 'partial_one') ||
       ':approved'),
  1::bigint,
  'approval and its exact retry notify the submitting courier exactly once'
);

select is(
  (select amount_remitted from public.delivery_cod_collections where id = 'c5100000-0000-4000-8000-000000000001'),
  40::numeric,
  'partial approval increments cumulative remittance exactly once'
);
select is(
  (select status from public.delivery_cod_collections where id = 'c5100000-0000-4000-8000-000000000001'),
  'partially_remitted',
  'partial approval derives the partially_remitted collection state'
);
select is(
  (select count(*) from public.marketplace_ledger_entries
   where operation_key = 'cod-remittance:' ||
     (select id::text from cod_test_ids where name = 'partial_one') || ':approved'),
  1::bigint,
  'partial approval creates one custody-to-clearing ledger entry across retries'
);
select is(
  (select COALESCE(sum(
     case when credit_account = 'delivery_cash_custody' then amount else 0 end
     - case when debit_account = 'delivery_cash_custody' then amount else 0 end
   ), 0)
   from public.marketplace_ledger_entries
   where order_id = '05000000-0000-4000-8000-000000000001'),
  60::numeric,
  'partial remittance leaves exactly the outstanding physical cash in courier custody'
);
select ok(
  exists (
    select 1
    from public.marketplace_ledger_entries
    where operation_key = 'cod-remittance:' ||
      (select id::text from cod_test_ids where name = 'partial_one') || ':approved'
      and debit_account = 'delivery_cash_custody'
      and debit_owner_id = 'd5000000-0000-4000-8000-000000000001'
      and credit_account = 'platform_cash_clearing'
      and credit_owner_id is null
      and amount = 40
  ),
  'approved remittance moves custody from the submitting courier to platform clearing'
);
select is(
  public.marketplace_cod_held_balance('e5000000-0000-4000-8000-000000000001'),
  42::numeric,
  'partial remittance releases the same proportional share of the merchant COD hold'
);

update public.order_settlements
set reversed_amount = 20,
    status = 'partially_reversed',
    updated_at = now()
where id = '15000000-0000-4000-8000-000000000001';
update public.merchant_profiles
set wallet_balance = 56
where id = 'e5100000-0000-4000-8000-000000000001';
update public.delivery_profiles
set wallet_balance = 16
where id = 'd5100000-0000-4000-8000-000000000001';

select is(
  public.marketplace_cod_held_balance('e5000000-0000-4000-8000-000000000001'),
  33.60::numeric,
  'partial refund lowers the remaining merchant hold proportionally to reversed_amount'
);
select is(
  public.marketplace_cod_held_balance('d5000000-0000-4000-8000-000000000001'),
  9.60::numeric,
  'partial refund also lowers the courier hold proportionally without division drift'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
insert into cod_test_ids(name, id)
select 'full_two', (public.submit_cod_remittance(
  'c5100000-0000-4000-8000-000000000001',
  60,
  'BANK-COD-002',
  'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/14500000-0000-4000-8000-000000000001.png',
  '14500000-0000-4000-8000-000000000001'
) ->> 'id')::uuid;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'full_two'),
    'approved', 'Final cash amount received'
  ) ->> 'collection_status'),
  'remitted',
  'second admin approval completes the COD collection'
);
reset role;

select is(
  (select amount_remitted from public.delivery_cod_collections where id = 'c5100000-0000-4000-8000-000000000001'),
  100::numeric,
  'partial plus final approvals equal the exact amount collected'
);
select is(
  (select status from public.delivery_cod_collections where id = 'c5100000-0000-4000-8000-000000000001'),
  'remitted',
  'full cumulative remittance derives the remitted state'
);
select ok(
  (select remitted_at is not null
   from public.delivery_cod_collections
   where id = 'c5100000-0000-4000-8000-000000000001'),
  'full cumulative remittance records its completion time'
);
select is(
  (select count(*) from public.marketplace_ledger_entries
   where entry_type = 'cod_remittance'
     and order_id = '05000000-0000-4000-8000-000000000001'),
  2::bigint,
  'two approved partial remittances create exactly two custody movements'
);
select is(
  (select sum(amount) from public.marketplace_ledger_entries
   where entry_type = 'cod_remittance'
     and order_id = '05000000-0000-4000-8000-000000000001'),
  100::numeric,
  'COD custody ledger movements sum to cash collected without overpayment'
);
select is(
  (select COALESCE(sum(
     case when credit_account = 'delivery_cash_custody' then amount else 0 end
     - case when debit_account = 'delivery_cash_custody' then amount else 0 end
   ), 0)
   from public.marketplace_ledger_entries
   where order_id = '05000000-0000-4000-8000-000000000001'),
  0::numeric,
  'full remittance clears physical courier custody exactly once with no negative balance'
);
select is(
  public.marketplace_cod_held_balance('e5000000-0000-4000-8000-000000000001'),
  0::numeric,
  'full remittance automatically releases the remaining merchant COD hold'
);
select is(
  public.marketplace_cod_held_balance('d5000000-0000-4000-8000-000000000001'),
  0::numeric,
  'full remittance automatically releases the remaining courier COD hold'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5100000-0000-4000-8000-000000000001', 1,
       'BANK-COD-OVER-FINAL',
       'd5000000-0000-4000-8000-000000000001/cod-remittances/c5100000-0000-4000-8000-000000000001/15500000-0000-4000-8000-000000000001.pdf',
       '15500000-0000-4000-8000-000000000001'
     ) $$,
  '22023', 'COD collection is already remitted',
  'courier cannot submit beyond a fully remitted collection'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
insert into cod_test_ids(name, id)
select 'withdrawal_after_remittance', public.request_withdrawal(
  50, 'COD has been fully remitted'
);
reset role;
select is(
  (select status from public.withdrawal_requests
   where id = (select id from cod_test_ids where name = 'withdrawal_after_remittance')),
  'pending',
  'withdrawal becomes available immediately after COD is fully remitted'
);
select is(
  (select wallet_balance from public.merchant_profiles where id = 'e5100000-0000-4000-8000-000000000001'),
  6::numeric,
  'available post-refund wallet balance is reserved exactly once after remittance'
);

-- A rejected submission releases its reference/proof reservation so the
-- courier can correct and resubmit with a new idempotency key. A disputed
-- submission remains reserved until an admin explicitly resolves it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
insert into cod_test_ids(name, id)
select 'rejected_one', (public.submit_cod_remittance(
  'c5200000-0000-4000-8000-000000000001',
  20,
  'BANK-RETRY-001',
  'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/21500000-0000-4000-8000-000000000001.jpg',
  '21500000-0000-4000-8000-000000000001'
) ->> 'id')::uuid;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'rejected_one'),
    'rejected', 'Bank reference could not be verified'
  ) ->> 'status'),
  'rejected',
  'admin can reject unverifiable COD proof without changing amount remitted'
);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'rejected_one'),
    'rejected', null
  ) ->> 'idempotent_replay')::boolean,
  true,
  'rejection retry is idempotent and does not require the transition reason again'
);
reset role;
select is(
  (select count(*)
   from public.notifications
   where user_id = 'd5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-remittance-review:' ||
       (select id::text from cod_test_ids where name = 'rejected_one') ||
       ':rejected'),
  1::bigint,
  'rejection and its exact retry notify the submitting courier exactly once'
);
select is(
  (select amount_remitted from public.delivery_cod_collections where id = 'c5200000-0000-4000-8000-000000000001'),
  0::numeric,
  'rejection never moves cash custody or increments remittance'
);
select is(
  (select count(*) from public.marketplace_ledger_entries
   where operation_key = 'cod-remittance:' ||
     (select id::text from cod_test_ids where name = 'rejected_one') || ':approved'),
  0::bigint,
  'rejection never creates an approval ledger entry'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select is(
  (public.submit_cod_remittance(
    'c5200000-0000-4000-8000-000000000001',
    20,
    'BANK-RETRY-001',
    'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/21500000-0000-4000-8000-000000000001.jpg',
    '21500000-0000-4000-8000-000000000001'
  ) ->> 'status'),
  'rejected',
  'exact courier retry returns the rejected terminal submission rather than duplicating it'
);
insert into cod_test_ids(name, id)
select 'retry_two', (public.submit_cod_remittance(
  'c5200000-0000-4000-8000-000000000001',
  20,
  'BANK-RETRY-001',
  'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/22500000-0000-4000-8000-000000000001.pdf',
  '22500000-0000-4000-8000-000000000001'
) ->> 'id')::uuid;
reset role;
select isnt(
  (select id from cod_test_ids where name = 'retry_two'),
  (select id from cod_test_ids where name = 'rejected_one'),
  'corrected evidence creates a distinct submission after rejection'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'retry_two'),
    'disputed', 'Cash receipt requires manual bank investigation'
  ) ->> 'status'),
  'disputed',
  'admin can dispute a remittance submission and its collection'
);
reset role;
select is(
  (select status from public.delivery_cod_collections where id = 'c5200000-0000-4000-8000-000000000001'),
  'disputed',
  'submission dispute marks the whole COD collection disputed'
);
select is(
  (select count(*)
   from public.notifications
   where user_id = 'd5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-remittance-review:' ||
       (select id::text from cod_test_ids where name = 'retry_two') ||
       ':disputed'),
  1::bigint,
  'submission dispute notifies the submitting courier exactly once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.submit_cod_remittance(
       'c5200000-0000-4000-8000-000000000001', 30,
       'BANK-WHILE-DISPUTED',
       'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/23500000-0000-4000-8000-000000000001.pdf',
       '23500000-0000-4000-8000-000000000001'
     ) $$,
  '22023', 'COD collection is disputed',
  'courier cannot add cash evidence while a collection dispute is open'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (public.admin_review_cod_remittance(
    (select id from cod_test_ids where name = 'retry_two'),
    'approved', 'Investigation confirmed the receipt'
  ) ->> 'collection_status'),
  'partially_remitted',
  'approving the sole disputed submission resolves the dispute and moves custody atomically'
);
reset role;
select is(
  (select amount_remitted from public.delivery_cod_collections where id = 'c5200000-0000-4000-8000-000000000001'),
  20::numeric,
  'resolved disputed approval increments amount remitted once'
);
select is(
  (select count(*) from public.marketplace_ledger_entries
   where operation_key = 'cod-remittance:' ||
     (select id::text from cod_test_ids where name = 'retry_two') || ':approved'),
  1::bigint,
  'resolved disputed approval has exactly one custody ledger entry'
);
select is(
  (select count(*)
   from public.notifications
   where user_id = 'd5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-remittance-review:' ||
       (select id::text from cod_test_ids where name = 'retry_two') ||
       ':approved'),
  1::bigint,
  'resolved disputed approval emits a distinct once-only courier notification'
);

-- Role-scoped listings and RLS do not expose reconciliation internals to the
-- customer or merchant. Merchants can see collection totals, while only the
-- assigned courier and admins can see submission references/proof paths.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c5000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.delivery_cod_collections),
  0::bigint,
  'customer cannot read internal COD custody collections'
);
select is(
  (select count(*) from public.cod_remittance_submissions),
  0::bigint,
  'customer cannot read COD remittance references or proof paths'
);
select throws_ok(
  $$ select * from public.list_my_cod_collections() $$,
  '42501', 'delivery role required',
  'customer cannot call the courier COD queue'
);
select throws_ok(
  $$ select * from public.admin_list_cod_collections() $$,
  '42501', 'admin authorization required',
  'customer cannot call the admin reconciliation queue'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.delivery_cod_collections),
  3::bigint,
  'owning merchant can reconcile collection totals for all three orders'
);
select is(
  (select count(*) from public.cod_remittance_submissions),
  0::bigint,
  'merchant cannot read courier bank references, proof paths, or review internals'
);
select throws_ok(
  $$ select public.admin_set_cod_collection_dispute(
       'c5200000-0000-4000-8000-000000000001', true, 'not authorized'
     ) $$,
  '42501', 'admin authorization required',
  'merchant cannot set a COD dispute state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.delivery_cod_collections),
  2::bigint,
  'courier RLS returns only collections assigned to that courier'
);
select is(
  (select count(*) from public.cod_remittance_submissions),
  4::bigint,
  'courier RLS returns every own submission including rejected evidence history'
);
select is(
  (select count(*) from public.list_my_cod_collections()),
  2::bigint,
  'courier queue returns exactly the courier assigned collections'
);
select is(
  (select item ->> 'order_number'
   from public.list_my_cod_collections() AS item
   where item ->> 'id' = 'c5200000-0000-4000-8000-000000000001'),
  'TEST-COD-002',
  'courier collection rows include the human-readable order number needed by the app'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd6000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.delivery_cod_collections),
  1::bigint,
  'other courier sees only the assigned zero-total collection'
);
select is(
  (select count(*) from public.cod_remittance_submissions),
  0::bigint,
  'other courier cannot read the first courier submissions'
);
select is(
  (select count(*) from public.list_my_cod_collections()),
  1::bigint,
  'other courier queue contains only its zero-total collection'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.delivery_cod_collections),
  3::bigint,
  'admin RLS sees every COD collection'
);
select is(
  (select count(*) from public.cod_remittance_submissions),
  4::bigint,
  'admin RLS sees every COD submission for reconciliation'
);
select is(
  (select count(*) from public.admin_list_cod_collections()),
  3::bigint,
  'admin reconciliation queue returns all collections with nested submissions'
);
select is(
  (public.admin_set_cod_collection_dispute(
    'c5200000-0000-4000-8000-000000000001',
    true,
    'Manual collection-level reconciliation check'
  ) ->> 'status'),
  'disputed',
  'admin can place a collection-level dispute with a reason'
);
select is(
  (public.admin_set_cod_collection_dispute(
    'c5200000-0000-4000-8000-000000000001',
    false,
    'Manual review completed'
  ) ->> 'status'),
  'partially_remitted',
  'clearing a collection dispute restores the amount-derived partial state'
);
reset role;
select is(
  (select count(*)
   from public.notifications
   where user_id = 'd5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-collection-dispute:c5200000-0000-4000-8000-000000000001:set'),
  1::bigint,
  'placing a collection dispute notifies its assigned courier exactly once'
);
select is(
  (select count(*)
   from public.notifications
   where user_id = 'd5000000-0000-4000-8000-000000000001'
     and event_key = 'cod-collection-dispute:c5200000-0000-4000-8000-000000000001:cleared'),
  1::bigint,
  'clearing a collection dispute emits its own once-only courier notification'
);

-- Explicitly prove the dual-control check even if a courier is later promoted
-- to an admin account: the original submitter still cannot confirm that row.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
insert into cod_test_ids(name, id)
select 'self_pending', (public.submit_cod_remittance(
  'c5200000-0000-4000-8000-000000000001',
  30,
  'BANK-SELF-CHECK',
  'd5000000-0000-4000-8000-000000000001/cod-remittances/c5200000-0000-4000-8000-000000000001/23500000-0000-4000-8000-000000000001.pdf',
  '23500000-0000-4000-8000-000000000001'
) ->> 'id')::uuid;
reset role;

update public.users
set role = 'admin'
where id = 'd5000000-0000-4000-8000-000000000001';
select is(
  (select role::text from public.users where id = 'd5000000-0000-4000-8000-000000000001'),
  'admin',
  'test setup simulates a later privileged role migration for the submitting courier'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd5000000-0000-4000-8000-000000000001', true);
select throws_ok(
  format(
    'select public.admin_review_cod_remittance(%L::uuid, %L, %L)',
    (select id from cod_test_ids where name = 'self_pending'),
    'approved', 'attempted self confirmation'
  ),
  '42501', 'courier cannot confirm their own remittance',
  'later admin promotion cannot bypass remittance dual control'
);
reset role;
select is(
  (select status from public.cod_remittance_submissions
   where id = (select id from cod_test_ids where name = 'self_pending')),
  'pending',
  'blocked self-review leaves the submission pending and unchanged'
);
select is(
  (select count(*) from public.marketplace_ledger_entries
   where operation_key = 'cod-remittance:' ||
     (select id::text from cod_test_ids where name = 'self_pending') || ':approved'),
  0::bigint,
  'blocked self-review cannot create a custody ledger movement'
);

select * from finish();
rollback;
