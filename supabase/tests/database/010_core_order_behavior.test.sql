begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

-- PostgREST contracts and named arguments used by the application.
select ok(to_regprocedure('public.place_order(uuid,uuid,text,jsonb,text,text,uuid)') is not null, 'seven-argument place_order exists');
select ok(to_regprocedure('public.place_order_group(uuid,text,jsonb,text,text,uuid)') is not null, 'atomic place_order_group exists');
select ok(to_regprocedure('public.complete_delivery_with_proof(uuid,text,numeric,numeric,uuid,text)') is not null, 'proof completion RPC exists');
select ok(to_regprocedure('public.marketplace_settle_order_once(uuid,uuid,uuid)') is not null, 'once-only settlement function exists');
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid=to_regprocedure('public.place_order(uuid,uuid,text,jsonb,text,text,uuid)') $$,
  $$ values (array['p_merchant_id','p_address_id','p_payment_method','p_items','p_coupon_code','p_notes','p_idempotency_key']::text[]) $$,
  'place_order named arguments match the client contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid=to_regprocedure('public.place_order_group(uuid,text,jsonb,text,text,uuid)') $$,
  $$ values (array['p_address_id','p_payment_method','p_stores','p_coupon_code','p_notes','p_idempotency_key']::text[]) $$,
  'place_order_group named arguments match the client contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid=to_regprocedure('public.complete_delivery_with_proof(uuid,text,numeric,numeric,uuid,text)') $$,
  $$ values (array['p_order_id','p_photo_url','p_latitude','p_longitude','p_idempotency_key','p_signature_url']::text[]) $$,
  'delivery proof named arguments match the client contract'
);

-- Security-definer functions pin an empty search_path and expose only the
-- intended authenticated/service surfaces.
select ok(
  not exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'place_order','place_order_group','cancel_order','transition_order_status',
        'claim_delivery_order','list_available_delivery_orders',
        'complete_delivery_with_proof','marketplace_settle_order_once',
        'api_transition_order_status'
      )
      and (
        not p.prosecdef
        or not exists (
          select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as config(value)
          where replace(config.value, '"', '') = 'search_path='
        )
      )
  ),
  'all core order entry points are security-definer with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.place_order(uuid,uuid,text,jsonb,text,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.place_order(uuid,uuid,text,jsonb,text,text,uuid)', 'execute'),
  'only authenticated clients can place orders'
);
select ok(
  has_function_privilege('authenticated', 'public.complete_delivery_with_proof(uuid,text,numeric,numeric,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.complete_delivery_with_proof(uuid,text,numeric,numeric,uuid,text)', 'execute'),
  'only authenticated clients can submit delivery proof'
);
select ok(
  not has_function_privilege('authenticated', 'public.marketplace_settle_order_once(uuid,uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.marketplace_settle_order_once(uuid,uuid,uuid)', 'execute'),
  'settlement cannot be invoked by API users'
);
select ok(
  has_function_privilege('service_role', 'public.api_transition_order_status(uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.api_transition_order_status(uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.api_transition_order_status(uuid,uuid,text,text)', 'execute'),
  'API actor transition is service-role only'
);
select ok(
  has_function_privilege('authenticated', 'public.is_current_user_blocked()', 'execute')
  and not has_function_privilege('authenticated', 'public.is_user_blocked(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.is_current_user_blocked()', 'execute'),
  'clients can inspect only their own block state'
);

-- Idempotency, audit, inventory release and financial once-only invariants.
select has_column('public','orders','idempotency_key','orders store the idempotency key');
select has_column('public','orders','request_hash','orders store the idempotency request hash');
select has_column('public','orders','inventory_released_at','orders record inventory release once');
select has_column('public','orders','settled_at','orders record settlement once');
select has_column('public','inventory_logs','order_id','inventory history links to its order');
select has_column('public','products','is_approved','products have a server-owned approval state');
select has_column('public','products','approved_by','product approval records its admin actor');
select has_column('public','products','approved_at','product approval records its decision time');
select has_column('public','products','approval_note','product approval records its decision note');
select ok(
  exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where n.nspname='public' and c.relname='products' and a.attname='is_approved'
      and a.attnotnull
      and pg_get_expr(d.adbin, d.adrelid) in ('false', 'false::boolean')
  ),
  'new products default to unapproved while legacy active rows were preserved during migration'
);
select has_table('public','order_operation_audit','immutable order operation audit exists');
select has_table('public','order_settlements','order settlement snapshots exist');
select has_table('public','delivery_cod_collections','COD custody records exist');
select has_table('public','marketplace_ledger_entries','balanced marketplace ledger exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='orders_customer_idempotency_uq' and indexdef ilike 'create unique index%'), 'order idempotency is unique per customer');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='order_settlements_order_uq' and indexdef ilike 'create unique index%'), 'one settlement exists per order');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='marketplace_ledger_operation_uq' and indexdef ilike 'create unique index%'), 'ledger operation keys are once-only');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='delivery_proofs_order_uq' and indexdef ilike 'create unique index%'), 'one delivery proof exists per order');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='coupon_usage_order_uq' and indexdef ilike 'create unique index%'), 'coupon usage is once-only per order');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='notifications_user_event_uq' and indexdef ilike 'create unique index%'), 'order notifications are once-only per recipient/event');
select ok(
  not exists (
    select 1
    from public.orders o
    where not exists (
      select 1 from public.order_tracking ot where ot.order_id = o.id
    )
  ),
  'legacy migration leaves no pre-existing order without a current-state tracking snapshot'
);
select ok(
  not exists (
    select 1
    from public.order_tracking ot
    where ot.event_key like 'legacy-snapshot:%'
      and not (
        ot.metadata @> '{"snapshot_only":true,"history_reconstructed":false}'::jsonb
        and ot.notes ilike '%snapshot only%'
      )
  ),
  'legacy tracking snapshots explicitly state that they are snapshots rather than reconstructed history'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid=to_regclass('public.order_settlements')
      and conname='order_settlements_balanced'
  ),
  'settlement snapshots enforce gross balancing'
);

-- Legacy and UI coupon fields remain one atomic contract.
select has_column('public','coupons','usage_limit','canonical coupon limit exists');
select has_column('public','coupons','usage_count','canonical coupon counter exists');
select has_column('public','coupons','max_uses','UI coupon limit exists');
select has_column('public','coupons','used_count','UI coupon counter exists');
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid=to_regclass('public.coupons')
      and tgname='trg_sync_coupon_limits_and_usage'
      and not tgisinternal
  ),
  'coupon limit pairs are synchronized and counters are protected'
);

-- Direct writes cannot bypass transactional RPCs. The later grants/RLS repair
-- owns table privileges; these assertions ensure it does not reopen mutation.
select ok(not has_table_privilege('authenticated','public.orders','insert'), 'clients cannot insert orders directly');
select ok(not has_table_privilege('authenticated','public.orders','update'), 'clients cannot update order core rows directly');
select ok(not has_table_privilege('authenticated','public.order_items','insert'), 'clients cannot inject order items');
select ok(not has_table_privilege('authenticated','public.delivery_proofs','insert'), 'clients cannot insert proof rows without verification');
select ok(not has_table_privilege('authenticated','public.wallet_transactions','insert'), 'clients cannot inject wallet transactions');
select ok(not has_table_privilege('authenticated','public.delivery_earnings','insert'), 'clients cannot inject delivery earnings');
select ok(not has_table_privilege('authenticated','public.inventory_logs','insert'), 'clients cannot inject inventory history');
select ok(not has_table_privilege('authenticated','public.merchant_daily_stats','insert'), 'clients cannot inject merchant aggregates');

-- The private bucket policy binds actor, assignment, state, deterministic path,
-- image type and file size. The former bucket-wide upload policy is gone.
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Auth users upload orders'
  ),
  'broad orders-bucket upload policy is removed'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Assigned courier uploads delivery proof'
      and cmd='INSERT'
      and with_check ilike '%delivery-proofs%'
      and with_check ilike '%on_the_way%'
      and with_check ilike '%delivery_profiles%'
      and with_check ilike '%is_current_user_blocked%'
      and with_check ilike '%10485760%'
  ),
  'proof upload policy requires the assigned courier and a bounded image'
);

-- Data-free negative behavior checks: delivered cannot use the generic status
-- path, and even a database owner cannot impersonate the service API without a
-- service-role JWT claim.
select throws_ok(
  $$ select public.marketplace_transition_order_as(
       '00000000-0000-0000-0000-000000000001'::uuid,
       '00000000-0000-0000-0000-000000000002'::uuid,
       'delivered', null
     ) $$,
  'P0001', 'DELIVERY_PROOF_REQUIRED',
  'generic transitions reject delivered before touching an order'
);
select throws_ok(
  $$ select public.api_transition_order_status(
       '00000000-0000-0000-0000-000000000002'::uuid,
       '00000000-0000-0000-0000-000000000001'::uuid,
       'preparing', null
     ) $$,
  'P0001', 'SERVICE_ROLE_REQUIRED',
  'service API rejects calls without a service-role JWT claim'
);
select is(
  (public.preview_coupon('definitely-not-a-real-coupon', 100)->>'valid')::boolean,
  false,
  'unknown coupon previews fail closed'
);

-- Temporary blocks (blocked_until in the future with is_blocked=false) must
-- stop every business entry point before it reads or mutates marketplace data.
-- public.users references auth.users on a clean schema, so fixture-only FK
-- triggers are disabled exactly as in the other transactional database tests.
alter table public.users disable trigger all;
insert into public.users (
  id, email, full_name, role, is_active, is_verified, is_blocked, blocked_until
) values
  ('bc000000-0000-4000-8000-000000000001', 'blocked-customer@test.invalid', 'Blocked Customer', 'customer', true, true, false, now() + interval '1 hour'),
  ('bd000000-0000-4000-8000-000000000001', 'blocked-delivery@test.invalid', 'Blocked Delivery', 'delivery', true, true, false, now() + interval '1 hour'),
  ('be000000-0000-4000-8000-000000000001', 'blocked-merchant@test.invalid', 'Blocked Merchant', 'merchant', true, true, false, now() + interval '1 hour'),
  ('ba000000-0000-4000-8000-000000000001', 'reschedule-admin@test.invalid', 'Reschedule Admin', 'admin', true, true, false, null),
  ('b1000000-0000-4000-8000-000000000001', 'reschedule-customer@test.invalid', 'Reschedule Customer', 'customer', true, true, false, null),
  ('b2000000-0000-4000-8000-000000000001', 'reschedule-merchant@test.invalid', 'Reschedule Merchant', 'merchant', true, true, false, null),
  ('b3000000-0000-4000-8000-000000000001', 'old-courier@test.invalid', 'Old Courier', 'delivery', true, true, false, null),
  ('b4000000-0000-4000-8000-000000000001', 'new-courier@test.invalid', 'New Courier', 'delivery', true, true, false, null);
alter table public.users enable trigger all;

insert into public.merchant_profiles (
  id, user_id, store_name, store_slug, address, city,
  is_approved, is_active, is_open, wallet_balance
) values (
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'Reschedule Test Merchant', 'reschedule-test-merchant',
  'Test pickup address', 'Sanaa', true, true, true, 0
);

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values
  ('b3000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001',
   'RESCHEDULE-OLD', 'motorcycle', 'OLD-1', true, true, 0),
  ('b4000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
   'RESCHEDULE-NEW', 'motorcycle', 'NEW-1', true, true, 0);

insert into public.addresses (
  id, user_id, label, full_address, city, area, is_default
) values (
  'b6000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'home', 'Reschedule delivery address', 'Sanaa', 'Test area', true
);

insert into public.products (
  id, merchant_id, name, base_price, is_active, is_approved,
  stock_quantity, total_sold
) values (
  'b8000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'Unapproved Test Product', 25, true, false, 5, 0
);

alter table public.orders disable trigger user;
insert into public.orders (
  id, order_number, customer_id, merchant_id, delivery_id, address_id,
  status, subtotal, delivery_fee, discount_amount, platform_commission,
  tax_amount, total_amount, payment_method, payment_status
) values (
  'b5000000-0000-4000-8000-000000000001', 'TEST-RESCHEDULE-001',
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  'rescheduled', 90, 10, 0, 9, 0, 100, 'cash', 'pending'
);
alter table public.orders enable trigger user;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.place_order(
       '10000000-0000-4000-8000-000000000001'::uuid,
       '20000000-0000-4000-8000-000000000001'::uuid,
       'cash',
       '[{"product_id":"30000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
       null, null,
       '40000000-0000-4000-8000-000000000001'::uuid
     ) $$,
  'P0001', 'ACTOR_NOT_ACTIVE',
  'a temporary customer block prevents order placement'
);

select set_config('request.jwt.claim.sub', 'bd000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.claim_delivery_order(
       '50000000-0000-4000-8000-000000000001'::uuid,
       'bd000000-0000-4000-8000-000000000001'::uuid
     ) $$,
  'P0001', 'ACTOR_NOT_ACTIVE',
  'a temporary courier block prevents claiming an order'
);

select set_config('request.jwt.claim.sub', 'be000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.transition_order_status(
       '60000000-0000-4000-8000-000000000001'::uuid,
       'preparing'
     ) $$,
  'P0001', 'ACTOR_NOT_ACTIVE',
  'a temporary merchant block prevents an order transition'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.place_order(
       'b2000000-0000-4000-8000-000000000001'::uuid,
       'b6000000-0000-4000-8000-000000000001'::uuid,
       'cash',
       '[{"product_id":"b8000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
       null, null,
       'bb000000-0000-4000-8000-000000000001'::uuid
     ) $$,
  'P0001', 'PRODUCT_UNAVAILABLE:b8000000-0000-4000-8000-000000000001',
  'an active but unapproved product cannot be ordered'
);

-- Only an admin can release a rescheduled order. The failed courier's route
-- history remains immutable audit history, while no earning exists before the
-- proof/settlement transaction.
select set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.transition_order_status(
       'b5000000-0000-4000-8000-000000000001'::uuid,
       'ready'
     ) $$,
  'P0001', 'STATUS_TRANSITION_NOT_ALLOWED',
  'a non-admin courier cannot release a rescheduled order'
);

select set_config('request.jwt.claim.sub', 'ba000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.transition_order_status(
       'b5000000-0000-4000-8000-000000000001'::uuid,
       'ready'
     ) $$,
  'an admin can release a rescheduled order back to ready'
);
reset role;

select is(
  (select status::text from public.orders where id='b5000000-0000-4000-8000-000000000001'),
  'ready',
  'released rescheduled order returns to ready'
);
select is(
  (select delivery_id from public.orders where id='b5000000-0000-4000-8000-000000000001'),
  null::uuid,
  'releasing a rescheduled order clears the failed courier assignment'
);
select ok(
  exists (
    select 1 from public.order_operation_audit
    where order_id='b5000000-0000-4000-8000-000000000001'
      and actor_id='ba000000-0000-4000-8000-000000000001'
      and old_status='rescheduled' and new_status='ready'
      and metadata @> '{"assignment_released":true}'::jsonb
  ) and exists (
    select 1 from public.order_tracking
    where order_id='b5000000-0000-4000-8000-000000000001'
      and status::text='ready'
      and created_by='ba000000-0000-4000-8000-000000000001'
  ),
  'reschedule release records consistent audit and tracking events'
);
select is(
  (select count(*) from public.delivery_earnings where order_id='b5000000-0000-4000-8000-000000000001'),
  0::bigint,
  'rescheduling does not create or reverse pre-delivery earnings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select offer.value ->> 'id'
     from public.list_available_delivery_orders() as offer(value)
     where offer.value ->> 'id' = 'b5000000-0000-4000-8000-000000000001' $$,
  $$ values ('b5000000-0000-4000-8000-000000000001'::text) $$,
  'the released order is visible to a different eligible courier'
);
select is(
  public.claim_delivery_order(
    'b5000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001'
  ),
  true,
  'a different courier can claim the released order'
);
reset role;

select is(
  (select delivery_id from public.orders where id='b5000000-0000-4000-8000-000000000001'),
  'b4000000-0000-4000-8000-000000000001'::uuid,
  'the new courier becomes the sole assignment'
);
select is(
  (select stock_quantity from public.products where id='b8000000-0000-4000-8000-000000000001'),
  5,
  'rejecting an unapproved product leaves stock untouched'
);

insert into public.delivery_proofs(
  order_id, delivery_id, photo_url, signature_url, latitude, longitude,
  idempotency_key, proof_type, created_by, metadata
) values (
  'b5000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001/delivery-proofs/b5000000-0000-4000-8000-000000000001/b9100000-0000-4000-8000-000000000001.jpg',
  null, 15.00000001, 44.00000001,
  'b9100000-0000-4000-8000-000000000001',
  'delivery', 'b4000000-0000-4000-8000-000000000001', '{}'::jsonb
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b4000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.complete_delivery_with_proof(
       'b5000000-0000-4000-8000-000000000001',
       'b4000000-0000-4000-8000-000000000001/delivery-proofs/b5000000-0000-4000-8000-000000000001/b9100000-0000-4000-8000-000000000001.jpg',
       15.00000002, 44.00000001,
       'b9100000-0000-4000-8000-000000000001', null
     ) $$,
  'P0001', 'IDEMPOTENCY_CONFLICT',
  'delivery proof idempotency rejects reuse with different stored-precision coordinates'
);
reset role;

-- A fully funded promotion can legitimately reduce the payable total to zero;
-- settlement still records custody, audit, and all balanced ledger legs once.
alter table public.orders disable trigger user;
update public.orders
set status='delivered', delivered_at=now(), subtotal=90, delivery_fee=0,
    discount_amount=90, platform_commission=0, tax_amount=0, total_amount=0
where id='b5000000-0000-4000-8000-000000000001';
alter table public.orders enable trigger user;

alter table public.orders disable trigger user;
update public.orders set payment_status='refunded'
where id='b5000000-0000-4000-8000-000000000001';
alter table public.orders enable trigger user;
select throws_ok(
  $$select public.marketplace_settle_order_once(
      'b5000000-0000-4000-8000-000000000001',
      'ba000000-0000-4000-8000-000000000001',
      'b9000000-0000-4000-8000-000000000099'
    )$$,
  'P0001', 'ORDER_HAS_COMPLETED_REFUND_OR_REVERSAL',
  'a refunded delivered order cannot be credited by a new settlement'
);
select is(
  (select count(*) from public.order_settlements where order_id='b5000000-0000-4000-8000-000000000001'),
  0::bigint,
  'rejected refunded settlement creates no settlement snapshot'
);
alter table public.orders disable trigger user;
update public.orders set payment_status='paid'
where id='b5000000-0000-4000-8000-000000000001';
alter table public.orders enable trigger user;

select is(
  public.marketplace_settle_order_once(
    'b5000000-0000-4000-8000-000000000001',
    'ba000000-0000-4000-8000-000000000001',
    'b9000000-0000-4000-8000-000000000001'
  ) ->> 'status',
  'settled',
  'a zero-total delivered order settles successfully'
);
select is(
  (select gross_amount from public.order_settlements where order_id='b5000000-0000-4000-8000-000000000001'),
  0::numeric,
  'zero-total settlement snapshots the exact gross amount'
);
select is(
  (select status from public.delivery_cod_collections where order_id='b5000000-0000-4000-8000-000000000001'),
  'remitted',
  'zero-total COD collection is immediately remitted and never creates a cash hold'
);
select is(
  (select count(*) from public.marketplace_ledger_entries where order_id='b5000000-0000-4000-8000-000000000001'),
  4::bigint,
  'zero-total settlement still records all four once-only ledger legs'
);

select * from finish();
rollback;
