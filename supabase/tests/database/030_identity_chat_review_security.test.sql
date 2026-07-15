begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Identity-derived RPC contracts.
select ok(to_regprocedure('public.create_address(text,text,text,numeric,numeric,boolean)') is not null, 'secure address creation RPC exists');
select ok(to_regprocedure('public.get_my_merchant_profile()') is not null, 'private merchant profile RPC exists');
select ok(to_regprocedure('public.get_my_delivery_profile()') is not null, 'private delivery profile RPC exists');
select ok(to_regprocedure('public.admin_list_merchants(text)') is not null, 'admin merchant list RPC exists');
select ok(to_regprocedure('public.admin_list_drivers(text)') is not null, 'admin delivery list RPC exists');
select ok(to_regprocedure('public.can_view_user_contact(uuid)') is not null, 'relationship-scoped contact helper exists');
select ok(to_regprocedure('public.create_order_review(uuid,text,uuid,integer,text)') is not null, 'verified order review RPC exists');
select ok(to_regprocedure('public.has_reviewed_order(uuid,text,uuid)') is not null, 'review idempotency lookup exists');
select ok(to_regprocedure('public.is_current_user_operational(text)') is not null, 'current-user operational guard exists');
select ok(to_regprocedure('public.is_merchant_publicly_available(uuid)') is not null, 'merchant-scoped public availability guard exists');
select ok(to_regprocedure('public.create_my_merchant_profile(jsonb)') is not null, 'identity-derived merchant onboarding RPC exists');
select ok(to_regprocedure('public.update_my_merchant_profile(jsonb)') is not null, 'identity-derived merchant profile update RPC exists');
select ok(to_regprocedure('public.create_my_delivery_profile(jsonb)') is not null, 'identity-derived delivery onboarding RPC exists');
select ok(to_regprocedure('public.update_my_delivery_profile(jsonb)') is not null, 'identity-derived delivery profile update RPC exists');
select ok(to_regprocedure('public.get_my_merchant_coupons()') is not null, 'private merchant coupon list RPC exists');
select ok(to_regprocedure('public.admin_list_coupons()') is not null, 'private admin coupon list RPC exists');

select ok(
  pg_get_functiondef(to_regprocedure('public.is_admin()')) ilike '%is_active is true%'
  and pg_get_functiondef(to_regprocedure('public.is_admin()')) ilike '%is_user_blocked%',
  'canonical is_admin checks active and temporary/permanent blocks'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.is_merchant_publicly_available(uuid)')) ilike '%u.role = ''merchant''%',
  'public merchant availability requires a merchant-role owner'
);
select ok(
  pg_get_functiondef(to_regprocedure('public.handle_new_user()')) ilike '%customer%merchant%delivery%'
  and position('''admin''' in pg_get_functiondef(to_regprocedure('public.handle_new_user()'))) = 0,
  'signup trigger accepts application roles but never self-assigns admin'
);

-- Clean-replay normalization contracts for complaints and legacy identities.
select has_column('public', 'complaints', 'complainant_id', 'complaints have the canonical complainant');
select has_column('public', 'complaints', 'against_id', 'complaints have an optional counterparty');
select has_column('public', 'complaints', 'against_type', 'complaints identify the counterparty role');
select has_column('public', 'complaints', 'category', 'complaints have a canonical category');
select has_column('public', 'complaints', 'title', 'complaints have a canonical title');
select has_column('public', 'complaints', 'description', 'complaints have a canonical description');
select has_column('public', 'complaints', 'evidence_images', 'complaints preserve evidence as JSON');
select has_column('public', 'complaints', 'priority', 'complaints have a priority');
select has_column('public', 'complaints', 'resolution', 'complaints preserve the resolution');
select has_column('public', 'complaints', 'resolved_by', 'complaints record the resolver');

select ok(
  (select count(*) from pg_constraint
    where conrelid='public.chat_conversations'::regclass
      and conname in ('chat_conversations_customer_id_fkey', 'chat_conversations_merchant_id_fkey')
  ) = 2
  and exists (
    select 1 from pg_constraint
    where conrelid='public.reviews'::regclass and conname='reviews_reviewer_id_fkey'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid='public.complaints'::regclass and conname='complaints_complainant_id_fkey'
  ),
  'identity-bearing chat, review, and complaint columns have foreign keys'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.users'::regclass and conname='users_role_check')
  and
  exists (select 1 from pg_constraint where conrelid='public.chat_messages'::regclass and conname='chat_messages_message_type_check')
  and exists (select 1 from pg_constraint where conrelid='public.device_tokens'::regclass and conname='device_tokens_device_type_check')
  and exists (select 1 from pg_constraint where conrelid='public.delivery_profiles'::regclass and conname='delivery_profiles_vehicle_type_check')
  and exists (select 1 from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_target_contract_check')
  and exists (select 1 from pg_constraint where conrelid='public.complaints'::regclass and conname='complaints_contract_check'),
  'normalized role/text/JSON contracts are enforced for new writes'
);
select is(
  (select data_type from information_schema.columns
   where table_schema='public' and table_name='delivery_profiles' and column_name='vehicle_type'),
  'text',
  'delivery vehicle type is replay-safe text and can represent pickup vehicles'
);

select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.create_address(text,text,text,numeric,numeric,boolean)') $$,
  $$ values (array['p_label','p_full_address','p_city','p_latitude','p_longitude','p_is_default']::text[]) $$,
  'create_address exposes the PostgREST argument contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.create_order_review(uuid,text,uuid,integer,text)') $$,
  $$ values (array['p_order_id','p_target_type','p_target_id','p_rating','p_comment']::text[]) $$,
  'create_order_review exposes the PostgREST argument contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.create_my_merchant_profile(jsonb)') $$,
  $$ values (array['p_profile']::text[]) $$,
  'merchant onboarding exposes the PostgREST JSON contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.update_my_merchant_profile(jsonb)') $$,
  $$ values (array['p_updates']::text[]) $$,
  'merchant profile update exposes the PostgREST JSON contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.create_my_delivery_profile(jsonb)') $$,
  $$ values (array['p_profile']::text[]) $$,
  'delivery onboarding exposes the PostgREST JSON contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.update_my_delivery_profile(jsonb)') $$,
  $$ values (array['p_updates']::text[]) $$,
  'delivery profile update exposes the PostgREST JSON contract'
);

-- Concurrency/idempotency invariants.
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='addresses'
      and indexname='ux_addresses_one_default_per_user'
      and indexdef ilike '%unique%where (is_default is true)%'
  ),
  'a user can have only one default address'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='ux_chat_conversation_order_context'),
  'order chat context is unique'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='ux_chat_conversation_store_context'),
  'store chat context is unique'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='ux_reviews_one_per_order_target'),
  'one review exists per reviewer/order/target'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid=to_regclass('public.reviews') and tgname='trg_review_aggregate_change' and not tgisinternal
  ),
  'review aggregates are synchronized by the database'
);

create temporary table legacy_mapping_checks (
  check_name text primary key,
  passed boolean not null
) on commit drop;

insert into legacy_mapping_checks values (
  'order_chat',
  not exists (
    select 1
    from public.chat_conversations c
    join public.orders o on o.id = c.order_id
    left join public.merchant_profiles mp on mp.id = o.merchant_id
    where (c.customer_id is null and o.customer_id is not null)
       or (c.merchant_id is null and mp.user_id is not null)
  )
);

do $legacy_mapping_tests$
declare
  v_ok boolean := true;
  v_part boolean;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_conversations' and column_name='participant_ids'
  ) then
    execute $sql$
      select not exists (
        select 1
        from public.chat_conversations c
        where c.order_id is null
          and (c.customer_id is null or c.merchant_id is null)
          and exists (
            select 1 from unnest(c.participant_ids) p(user_id)
            join public.users u on u.id=p.user_id where u.role='customer'
          )
          and exists (
            select 1 from unnest(c.participant_ids) p(user_id)
            join public.users u on u.id=p.user_id where u.role='merchant'
          )
      )
    $sql$ into v_part;
    v_ok := v_ok and v_part;
  end if;
  insert into legacy_mapping_checks values ('participant_chat', v_ok);

  v_ok := true;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='product_id') then
    execute 'select not exists (select 1 from public.reviews where target_id is null and product_id is not null)' into v_part;
    v_ok := v_ok and v_part;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='merchant_id') then
    execute $sql$
      select not exists (
        select 1 from public.reviews r
        where r.target_id is null and r.merchant_id is not null
          and exists (select 1 from public.merchant_profiles mp where mp.user_id=r.merchant_id or mp.id=r.merchant_id)
      )
    $sql$ into v_part;
    v_ok := v_ok and v_part;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='delivery_id') then
    execute $sql$
      select not exists (
        select 1 from public.reviews r
        where r.target_id is null and r.delivery_id is not null
          and exists (select 1 from public.delivery_profiles dp where dp.user_id=r.delivery_id or dp.id=r.delivery_id)
      )
    $sql$ into v_part;
    v_ok := v_ok and v_part;
  end if;
  insert into legacy_mapping_checks values ('reviews', v_ok);

  v_ok := true;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='complaints' and column_name='user_id') then
    execute 'select not exists (select 1 from public.complaints where complainant_id is null and user_id is not null)' into v_part;
    v_ok := v_ok and v_part;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='complaints' and column_name='subject') then
    execute 'select not exists (select 1 from public.complaints where title is null and subject is not null)' into v_part;
    v_ok := v_ok and v_part;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='complaints' and column_name='body') then
    execute 'select not exists (select 1 from public.complaints where description is null and body is not null)' into v_part;
    v_ok := v_ok and v_part;
  end if;
  insert into legacy_mapping_checks values ('complaints', v_ok);
end;
$legacy_mapping_tests$;

select ok((select passed from legacy_mapping_checks where check_name='order_chat'), 'order chats use authoritative customer and merchant users');
select ok((select passed from legacy_mapping_checks where check_name='participant_chat'), 'resolvable legacy participant chats were mapped by role');
select ok((select passed from legacy_mapping_checks where check_name='reviews'), 'resolvable legacy review targets were mapped to canonical ids');
select ok((select passed from legacy_mapping_checks where check_name='complaints'), 'legacy complaint identity/title/body fields were preserved');

-- Session-bound notification tokens.
select has_column('public', 'device_tokens', 'session_id', 'device token records the auth session');
select has_column('public', 'device_tokens', 'last_seen_at', 'device token records last use');
select has_column('public', 'device_tokens', 'updated_at', 'device token records mutation time');
select ok(
  not coalesce(has_table_privilege('authenticated', 'public.device_tokens', 'select'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.device_tokens', 'insert'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.device_tokens', 'update'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.device_tokens', 'delete'), false),
  'device tokens are RPC-only for authenticated users'
);

-- Sensitive columns remain behind self/admin RPCs even when a storefront row is public.
select ok(
  not coalesce(has_column_privilege('anon', 'public.merchant_profiles', 'bank_account', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.merchant_profiles', 'bank_account', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.merchant_profiles', 'wallet_balance', 'select'), false),
  'merchant bank and wallet data are not table-readable'
);
select ok(
  not coalesce(has_column_privilege('anon', 'public.merchant_profiles', 'user_id', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.merchant_profiles', 'user_id', 'select'), false),
  'storefront merchant rows do not expose their authentication identity'
);
select ok(
  not coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'national_id', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'wallet_balance', 'select'), false),
  'delivery identity and wallet data are not table-readable'
);
select ok(
  not coalesce(has_column_privilege('authenticated', 'public.merchant_profiles', 'wallet_balance', 'update'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'wallet_balance', 'update'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.customer_profiles', 'wallet_balance', 'update'), false),
  'profile wallet balances cannot be edited directly'
);
select ok(
  not coalesce(has_table_privilege('authenticated', 'public.merchant_profiles', 'insert'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.merchant_profiles', 'store_name', 'update'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.delivery_profiles', 'insert'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'national_id', 'update'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'vehicle_type', 'update'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'vehicle_plate', 'update'), false),
  'merchant and courier onboarding/settings are RPC-only writes'
);
select ok(
  coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'is_online', 'update'), false)
  and coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'current_latitude', 'update'), false)
  and coalesce(has_column_privilege('authenticated', 'public.delivery_profiles', 'current_longitude', 'update'), false),
  'courier runtime retains only presence and coordinate table writes'
);
select ok(
  coalesce((
    select with_check ilike '%is_current_user_operational%merchant%'
       and with_check not ilike '%is_current_merchant_profile_operational%'
    from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Merchant uploads store media'
  ), false),
  'pending merchant onboarding may upload owned store media before the profile application exists'
);
select ok(
  coalesce((
    select qual ilike '%is_current_user_operational%merchant%'
       and qual ilike '%owner_id%auth.uid%'
    from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Merchant reads own store media' and cmd='SELECT'
  ), false),
  'owned store-media SELECT visibility supports safe storage upsert retries without public listing'
);
select ok(
  not coalesce(has_column_privilege('anon', 'public.products', 'approved_by', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.products', 'approved_by', 'select'), false)
  and not coalesce(has_column_privilege('anon', 'public.products', 'approval_note', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.products', 'approval_note', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.products', 'approved_at', 'select'), false),
  'product moderation actors, notes, and timestamps are not exposed by table reads'
);

-- Messages, reviews, counters, and notifications are business-RPC writes.
select ok(
  not coalesce(has_table_privilege('authenticated', 'public.chat_messages', 'insert'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.chat_conversations', 'insert'), false),
  'chat creation and sending are RPC-only'
);
select ok(
  not coalesce(has_table_privilege('authenticated', 'public.reviews', 'insert'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.reviews', 'update'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.reviews', 'delete'), false),
  'reviews are RPC-only writes'
);
select ok(
  not coalesce(has_column_privilege('anon', 'public.reviews', 'reviewer_id', 'select'), false)
  and coalesce(has_column_privilege('authenticated', 'public.reviews', 'reviewer_id', 'select'), false),
  'anonymous reviews hide reviewer identity while signed-in users retain their own-review lookup contract'
);
select ok(
  not coalesce(has_column_privilege('authenticated', 'public.coupons', 'usage_count', 'update'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'used_count', 'update'), false),
  'coupon usage counters are server-owned'
);
select ok(
  coalesce(has_column_privilege('anon', 'public.coupons', 'id', 'select'), false)
  and coalesce(has_column_privilege('authenticated', 'public.coupons', 'id', 'select'), false)
  and not coalesce(has_column_privilege('anon', 'public.coupons', 'usage_count', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'usage_count', 'select'), false)
  and not coalesce(has_column_privilege('anon', 'public.coupons', 'used_count', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'used_count', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'usage_limit', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'max_uses', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'per_user_limit', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'is_active', 'select'), false)
  and not coalesce(has_column_privilege('authenticated', 'public.coupons', 'created_at', 'select'), false),
  'storefront coupon reads expose offer fields but hide campaign counters and limits'
);
select ok(
  not coalesce(has_table_privilege('anon', 'public.notifications', 'insert'), false)
  and not coalesce(has_table_privilege('authenticated', 'public.notifications', 'insert'), false),
  'notifications cannot be injected by API clients'
);

-- API execution surface: authenticated callers get intended RPCs; anon and
-- inherited PUBLIC execution do not.
select ok(
  coalesce(has_function_privilege('authenticated', 'public.create_order_review(uuid,text,uuid,integer,text)', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.create_order_review(uuid,text,uuid,integer,text)', 'execute'), false),
  'only authenticated callers can submit a review'
);
select ok(
  coalesce(has_function_privilege('authenticated', 'public.get_my_merchant_profile()', 'execute'), false)
  and coalesce(has_function_privilege('authenticated', 'public.get_my_delivery_profile()', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.get_my_merchant_profile()', 'execute'), false),
  'private profile RPCs require authentication'
);
select ok(
  coalesce(has_function_privilege('authenticated', 'public.create_my_merchant_profile(jsonb)', 'execute'), false)
  and coalesce(has_function_privilege('authenticated', 'public.update_my_merchant_profile(jsonb)', 'execute'), false)
  and coalesce(has_function_privilege('authenticated', 'public.create_my_delivery_profile(jsonb)', 'execute'), false)
  and coalesce(has_function_privilege('authenticated', 'public.update_my_delivery_profile(jsonb)', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.create_my_merchant_profile(jsonb)', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.create_my_delivery_profile(jsonb)', 'execute'), false),
  'profile onboarding and settings RPCs require authentication'
);
select ok(
  coalesce(has_function_privilege('authenticated', 'public.get_my_merchant_coupons()', 'execute'), false)
  and coalesce(has_function_privilege('authenticated', 'public.admin_list_coupons()', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.get_my_merchant_coupons()', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.admin_list_coupons()', 'execute'), false),
  'merchant and admin coupon business views require authentication'
);
select ok(
  coalesce(has_function_privilege('authenticated', 'public.is_current_user_operational(text)', 'execute'), false)
  and not coalesce(has_function_privilege('anon', 'public.is_current_user_operational(text)', 'execute'), false)
  and coalesce(has_function_privilege('authenticated', 'public.is_merchant_publicly_available(uuid)', 'execute'), false)
  and coalesce(has_function_privilege('anon', 'public.is_merchant_publicly_available(uuid)', 'execute'), false),
  'operational guard is authenticated-only while merchant availability is storefront-readable'
);
select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='S'
      and (
        has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('anon', c.oid, 'SELECT')
        or has_sequence_privilege('anon', c.oid, 'UPDATE')
        or has_sequence_privilege('authenticated', c.oid, 'USAGE')
        or has_sequence_privilege('authenticated', c.oid, 'SELECT')
        or has_sequence_privilege('authenticated', c.oid, 'UPDATE')
        or exists (
          select 1
          from aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
          where a.grantee=0
        )
      )
  ),
  'public sequences grant nothing to PUBLIC, anon, or authenticated'
);
select ok(
  not exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where n.nspname='public' and d.defaclobjtype='S'
      and a.grantee in (0, (select oid from pg_roles where rolname='anon'), (select oid from pg_roles where rolname='authenticated'))
  ),
  'future public sequences default to no API-role privileges'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname='public' and a.grantee=0 and a.privilege_type='EXECUTE'
  ),
  'no public-schema function inherits EXECUTE for PUBLIC'
);

-- ---------------------------------------------------------------------------
-- Behavioral RLS/RPC checks for block, deactivation, automatic expiry, and
-- protected administrator accounts.
-- ---------------------------------------------------------------------------
alter table public.users disable trigger all;
insert into public.users (
  id, email, full_name, role, is_active, is_verified, is_blocked, blocked_until
) values
  ('aa300000-0000-4000-8000-000000000001', 'ops-admin@test.invalid', 'Operations Admin', 'admin', true, true, false, null),
  ('aa300000-0000-4000-8000-000000000002', 'protected-admin@test.invalid', 'Protected Admin', 'admin', true, true, false, null),
  ('bb300000-0000-4000-8000-000000000001', 'policy-merchant@test.invalid', 'Policy Merchant', 'merchant', true, true, false, null),
  ('cc300000-0000-4000-8000-000000000001', 'policy-delivery@test.invalid', 'Policy Delivery', 'delivery', true, true, false, null),
  ('dd300000-0000-4000-8000-000000000001', 'policy-customer@test.invalid', 'Policy Customer', 'customer', true, true, false, null),
  ('ee300000-0000-4000-8000-000000000001', 'promotion-target@test.invalid', 'Promotion Target', 'customer', true, true, false, null),
  ('f1300000-0000-4000-8000-000000000001', 'rpc-merchant@test.invalid', 'RPC Merchant', 'merchant', true, false, false, null),
  ('f2300000-0000-4000-8000-000000000001', 'rpc-delivery@test.invalid', 'RPC Delivery', 'delivery', true, false, false, null);
alter table public.users enable trigger all;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1300000-0000-4000-8000-000000000001', true);
select is(
  public.create_my_merchant_profile(
    '{"store_name":"RPC Merchant Draft","store_slug":"rpc-merchant-draft","city":"Sanaa","address":"RPC pickup"}'::jsonb
  ),
  'f1300000-0000-4000-8000-000000000001'::uuid,
  'merchant onboarding derives both ownership and clean-replay profile id from auth.uid()'
);
select is(
  public.create_my_merchant_profile(
    '{"store_name":"RPC Merchant Resubmitted","store_slug":"-client-generated-slug","city":"Sanaa","address":"Updated RPC pickup"}'::jsonb
  ),
  'f1300000-0000-4000-8000-000000000001'::uuid,
  'merchant onboarding is idempotent and safely refreshes an unapproved application'
);
select is(
  public.update_my_merchant_profile('{"store_name":"RPC Merchant Updated","is_open":false}'::jsonb),
  'f1300000-0000-4000-8000-000000000001'::uuid,
  'merchant settings update targets the caller profile without accepting a user id'
);
select throws_ok(
  $$select public.create_my_merchant_profile('{"store_name":"Unsafe","store_slug":"unsafe-store","user_id":"ee300000-0000-4000-8000-000000000001"}'::jsonb)$$,
  '22023', 'merchant profile contains unsupported fields',
  'merchant onboarding rejects caller-supplied ownership'
);
select throws_ok(
  $$select public.update_my_merchant_profile('{"is_approved":true}'::jsonb)$$,
  '22023', 'merchant updates contain protected fields',
  'merchant settings cannot self-approve or edit protected state'
);
reset role;
select is(
  (select count(*) from public.merchant_profiles where user_id='f1300000-0000-4000-8000-000000000001'),
  1::bigint,
  'repeated merchant onboarding creates exactly one profile'
);
select ok(
  (select store_name='RPC Merchant Updated'
          and store_slug='store-f1300000000040008000000000000001'
          and is_open is false
   from public.merchant_profiles where user_id='f1300000-0000-4000-8000-000000000001'),
  'merchant RPC persists accepted settings and repairs an unusable client-generated slug'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2300000-0000-4000-8000-000000000001', true);
select is(
  public.create_my_delivery_profile(
    '{"national_id":"RPC-DELIVERY-ID","vehicle_type":"pickup","vehicle_plate":"rpc-42"}'::jsonb
  ),
  'f2300000-0000-4000-8000-000000000001'::uuid,
  'delivery onboarding derives ownership and accepts the pickup contract used by the app'
);
select is(
  public.update_my_delivery_profile('{"vehicle_plate":"rpc-84"}'::jsonb),
  'f2300000-0000-4000-8000-000000000001'::uuid,
  'delivery settings update targets the caller profile without accepting a user id'
);
select throws_ok(
  $$select public.update_my_delivery_profile('{"is_approved":true}'::jsonb)$$,
  '22023', 'delivery updates contain protected fields',
  'delivery settings cannot self-approve or edit protected state'
);
reset role;
select is(
  (select count(*) from public.delivery_profiles where user_id='f2300000-0000-4000-8000-000000000001'),
  1::bigint,
  'repeated delivery workflows leave exactly one courier profile'
);
select ok(
  (select vehicle_type='pickup' and vehicle_plate='RPC-84'
   from public.delivery_profiles where user_id='f2300000-0000-4000-8000-000000000001'),
  'delivery profile RPCs preserve the normalized vehicle contract'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dd300000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_my_merchant_profile('{"store_name":"Wrong Role","store_slug":"wrong-role"}'::jsonb)$$,
  '42501', 'merchant account is not operational',
  'a customer cannot create a merchant profile through the onboarding RPC'
);
reset role;

insert into public.merchant_profiles (
  id, user_id, store_name, store_slug, address, city,
  is_approved, is_active, is_open, wallet_balance
) values (
  'bb300000-0000-4000-8000-000000000001',
  'bb300000-0000-4000-8000-000000000001',
  'Policy Merchant Store', 'policy-merchant-store', 'Test pickup', 'Sanaa',
  true, true, true, 0
);

insert into public.delivery_profiles (
  id, user_id, national_id, vehicle_type, vehicle_plate,
  is_online, is_approved, wallet_balance
) values (
  'cc300000-0000-4000-8000-000000000001',
  'cc300000-0000-4000-8000-000000000001',
  'POLICY-DELIVERY', 'motorcycle', 'POLICY-1', true, true, 0
);

insert into public.addresses (
  id, user_id, label, full_address, city, area, is_default
) values (
  'dd300000-0000-4000-8000-000000000010',
  'dd300000-0000-4000-8000-000000000001',
  'home', 'Policy delivery address', 'Sanaa', 'Test area', true
);

insert into public.products (
  id, merchant_id, name, base_price, is_active, is_approved,
  stock_quantity, total_sold
) values (
  'bb300000-0000-4000-8000-000000000010',
  'bb300000-0000-4000-8000-000000000001',
  'Policy Product', 25, true, true, 10, 0
);

insert into public.coupons (
  id, merchant_id, code, type, value, is_active, usage_limit, per_user_limit,
  start_date, end_date
) values
  (
    'bb300000-0000-4000-8000-000000000020',
    'bb300000-0000-4000-8000-000000000001',
    'POLICYBLOCK', 'fixed', 5, true, 10, 1, null, null
  ),
  (
    'aa300000-0000-4000-8000-000000000021',
    null, 'POLICYEXPIRED', 'fixed', 5, true, 10, 1,
    now() - interval '2 days', now() - interval '1 day'
  ),
  (
    'aa300000-0000-4000-8000-000000000022',
    null, 'POLICYFUTURE', 'fixed', 5, true, 10, 1,
    now() + interval '1 day', now() + interval '2 days'
  ),
  (
    'aa300000-0000-4000-8000-000000000023',
    null, 'POLICYGLOBAL', 'fixed', 5, true, 10, 1, null, null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.get_my_merchant_coupons() as coupon(payload)),
  1::bigint,
  'merchant coupon RPC returns only campaigns owned by the caller profile'
);
select is(
  (select payload ->> 'code' from public.get_my_merchant_coupons() as coupon(payload) limit 1),
  'POLICYBLOCK',
  'merchant coupon RPC exposes the owned campaign operational view'
);
select throws_ok(
  $$insert into public.coupons (merchant_id, code, type, value, is_active)
    values (null, 'MERCHANT-GLOBAL-BYPASS', 'fixed', 1, true)$$,
  '42501', 'new row violates row-level security policy for table "coupons"',
  'merchant cannot create a platform-global coupon by submitting a null merchant id'
);
select is(
  (with changed as (
    update public.coupons set code='MERCHANT-EDITED-GLOBAL'
    where id='aa300000-0000-4000-8000-000000000023' returning 1
  ) select count(*) from changed),
  0::bigint,
  'merchant cannot modify a platform-global coupon'
);
select is(
  (with removed as (
    delete from public.coupons
    where id='aa300000-0000-4000-8000-000000000023' returning 1
  ) select count(*) from removed),
  0::bigint,
  'merchant cannot delete a platform-global coupon'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dd300000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.get_my_merchant_coupons()$$,
  '42501', 'merchant account is not operational',
  'a customer cannot enumerate merchant campaign internals'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa300000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.admin_list_coupons() as coupon(payload)),
  4::bigint,
  'admin coupon RPC returns global and merchant campaigns through the protected view'
);
reset role;

insert into public.app_banners (
  id, title, image_url, is_active, sort_order
) values (
  'aa300000-0000-4000-8000-000000000010',
  'Admin-only inactive banner', 'https://example.invalid/banner.png', false, 999
);

alter table public.orders disable trigger user;
insert into public.orders (
  id, order_number, customer_id, merchant_id, delivery_id, address_id,
  status, subtotal, delivery_fee, discount_amount, platform_commission,
  tax_amount, total_amount, payment_method, payment_status
) values (
  'dd300000-0000-4000-8000-000000000020', 'TEST-POLICY-030',
  'dd300000-0000-4000-8000-000000000001',
  'bb300000-0000-4000-8000-000000000001',
  'cc300000-0000-4000-8000-000000000001',
  'dd300000-0000-4000-8000-000000000010',
  'assigned', 90, 10, 0, 9, 0, 100, 'cash', 'pending'
);
alter table public.orders enable trigger user;

insert into public.reviews (
  id, order_id, reviewer_id, target_type, target_id, rating, comment, is_verified
) values
  (
    'dd300000-0000-4000-8000-000000000030',
    'dd300000-0000-4000-8000-000000000020',
    'dd300000-0000-4000-8000-000000000001',
    'merchant', 'bb300000-0000-4000-8000-000000000001', 5,
    'Verified visibility fixture', true
  ),
  (
    'dd300000-0000-4000-8000-000000000031',
    'dd300000-0000-4000-8000-000000000020',
    'dd300000-0000-4000-8000-000000000001',
    'delivery', 'cc300000-0000-4000-8000-000000000001', 1,
    'Unverified visibility fixture', false
  );

select is(
  (select rating from public.merchant_profiles where id='bb300000-0000-4000-8000-000000000001'),
  5::numeric,
  'verified review contributes to the merchant aggregate'
);
select is(
  (select rating from public.delivery_profiles where id='cc300000-0000-4000-8000-000000000001'),
  0::numeric,
  'unverified review cannot poison a delivery aggregate'
);

set local role anon;
select is(
  (select count(*) from public.reviews
   where id in ('dd300000-0000-4000-8000-000000000030', 'dd300000-0000-4000-8000-000000000031')),
  1::bigint,
  'anonymous storefront reads expose verified reviews only'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dd300000-0000-4000-8000-000000000001', true);
select is(
  (select count(*) from public.reviews
   where id in ('dd300000-0000-4000-8000-000000000030', 'dd300000-0000-4000-8000-000000000031')),
  2::bigint,
  'a reviewer can still see their own pending/unverified review history'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa300000-0000-4000-8000-000000000001', true);
select ok(public.is_admin(), 'an active unblocked administrator passes the canonical predicate');
select is(
  (select count(*) from public.app_banners where id='aa300000-0000-4000-8000-000000000010'),
  1::bigint,
  'an active administrator receives admin_full_access to an otherwise hidden row'
);
select throws_ok(
  $$select public.admin_set_user_block('aa300000-0000-4000-8000-000000000002', true, null, 'must fail')$$,
  '42501', 'administrator accounts are protected',
  'admin_set_user_block cannot target an administrator'
);
select throws_ok(
  $$select public.admin_set_user_active('aa300000-0000-4000-8000-000000000002', false)$$,
  '42501', 'administrator accounts are protected',
  'admin_set_user_active cannot target an administrator'
);
select throws_ok(
  $$select public.admin_update_user_profile('aa300000-0000-4000-8000-000000000002', 'Changed', null, null)$$,
  '42501', 'administrator accounts are protected',
  'admin_update_user_profile cannot edit an administrator'
);
select throws_ok(
  $$select public.admin_update_user_profile('ee300000-0000-4000-8000-000000000001', null, null, 'admin')$$,
  '42501', 'administrator accounts are protected',
  'ordinary admin RPC cannot promote another account to administrator'
);
select throws_ok(
  $$select public.admin_update_user_profile('bb300000-0000-4000-8000-000000000001', null, null, 'customer')$$,
  '42501', 'role changes require a dedicated migration workflow',
  'generic profile editing cannot orphan an approved merchant profile by changing its role'
);
select lives_ok(
  $$select public.admin_set_user_block('bb300000-0000-4000-8000-000000000001', false, now() + interval '1 hour', 'temporary merchant block')$$,
  'administrator can temporarily block a merchant'
);
select lives_ok(
  $$select public.admin_set_user_block('cc300000-0000-4000-8000-000000000001', false, now() + interval '1 hour', 'temporary courier block')$$,
  'administrator can temporarily block a courier'
);
reset role;

select ok(
  (select is_active and is_open from public.merchant_profiles where id='bb300000-0000-4000-8000-000000000001'),
  'temporary blocking preserves merchant operational state for automatic expiry'
);
select ok(
  (select is_online from public.delivery_profiles where id='cc300000-0000-4000-8000-000000000001'),
  'temporary blocking preserves courier online state for automatic expiry'
);

set local role anon;
select is(
  (select count(*) from public.merchant_profiles where id='bb300000-0000-4000-8000-000000000001'),
  0::bigint,
  'a temporarily blocked merchant disappears from the public storefront'
);
select is(
  (select count(*) from public.products where id='bb300000-0000-4000-8000-000000000010'),
  0::bigint,
  'products of a temporarily blocked merchant disappear from the public storefront'
);
select is(
  (select count(*) from public.coupons where id='bb300000-0000-4000-8000-000000000020'),
  0::bigint,
  'coupons of a temporarily blocked merchant disappear from the public storefront'
);
select is(
  (select count(*) from public.coupons
   where id in ('aa300000-0000-4000-8000-000000000021', 'aa300000-0000-4000-8000-000000000022')),
  0::bigint,
  'expired and not-yet-active global coupons are hidden from the storefront'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000001', true);
select ok(not public.is_current_user_operational('merchant'), 'temporary merchant block fails the operational guard');
select throws_ok(
  $$select * from public.get_my_merchant_coupons()$$,
  '42501', 'merchant account is not operational',
  'blocked merchant cannot read private campaign counters through the RPC'
);
select throws_ok(
  $$select public.update_my_merchant_profile('{"store_name":"Blocked profile change"}'::jsonb)$$,
  '42501', 'merchant account is not operational',
  'blocked merchant cannot update the profile through its identity-derived RPC'
);
select is(
  (with changed as (
    update public.products set name='Blocked product change'
    where id='bb300000-0000-4000-8000-000000000010' returning 1
  ) select count(*) from changed),
  0::bigint,
  'blocked merchant cannot update a product directly'
);
select is(
  (with changed as (
    update public.coupons set code='POLICYBLOCKED'
    where id='bb300000-0000-4000-8000-000000000020' returning 1
  ) select count(*) from changed),
  0::bigint,
  'blocked merchant cannot update a coupon directly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cc300000-0000-4000-8000-000000000001', true);
select ok(not public.is_current_user_operational('delivery'), 'temporary courier block fails the operational guard');
select is(
  (with changed as (
    update public.delivery_profiles set is_online=false
    where id='cc300000-0000-4000-8000-000000000001' returning 1
  ) select count(*) from changed),
  0::bigint,
  'blocked courier cannot change online state directly'
);
select throws_ok(
  $$insert into public.delivery_location_history (delivery_id, order_id, latitude, longitude, speed)
    values ('cc300000-0000-4000-8000-000000000001', 'dd300000-0000-4000-8000-000000000020', 15.35, 44.20, 10)$$,
  '42501', 'new row violates row-level security policy for table "delivery_location_history"',
  'blocked courier cannot append location history'
);
reset role;

-- Simulate the passage of time: no unblock RPC and no profile restoration step.
update public.users
set blocked_until = now() - interval '1 second'
where id in ('bb300000-0000-4000-8000-000000000001', 'cc300000-0000-4000-8000-000000000001');

set local role anon;
select is(
  (select count(*) from public.merchant_profiles where id='bb300000-0000-4000-8000-000000000001'),
  1::bigint,
  'expired temporary block automatically restores public merchant visibility'
);
select is(
  (select count(*) from public.products where id='bb300000-0000-4000-8000-000000000010'),
  1::bigint,
  'expired temporary block automatically restores approved product visibility'
);
select is(
  (select count(*) from public.coupons where id='bb300000-0000-4000-8000-000000000020'),
  1::bigint,
  'expired temporary block automatically restores a currently valid merchant coupon'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000001', true);
select ok(public.is_current_user_operational('merchant'), 'expired merchant block restores the operational guard');
select is(
  (with changed as (
    update public.products set name='Product after expiry'
    where id='bb300000-0000-4000-8000-000000000010' returning 1
  ) select count(*) from changed),
  1::bigint,
  'merchant product mutation works again after block expiry'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cc300000-0000-4000-8000-000000000001', true);
select ok(public.is_current_user_operational('delivery'), 'expired courier block restores the operational guard');
select lives_ok(
  $$insert into public.delivery_location_history (delivery_id, order_id, latitude, longitude, speed)
    values ('cc300000-0000-4000-8000-000000000001', 'dd300000-0000-4000-8000-000000000020', 15.35, 44.20, 10)$$,
  'online approved courier can append location after block expiry'
);
reset role;

select ok(
  (select is_active and is_open from public.merchant_profiles where id='bb300000-0000-4000-8000-000000000001')
  and (select is_online from public.delivery_profiles where id='cc300000-0000-4000-8000-000000000001'),
  'automatic block expiry required no merchant/courier profile state repair'
);

-- Deactivation also relies on the user guard and preserves the store state.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa300000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.admin_set_user_active('bb300000-0000-4000-8000-000000000001', false)$$,
  'administrator can deactivate a non-admin account'
);
reset role;
select ok(
  (select is_active and is_open from public.merchant_profiles where id='bb300000-0000-4000-8000-000000000001'),
  'account deactivation does not destroy merchant operational state'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bb300000-0000-4000-8000-000000000001', true);
select ok(not public.is_current_user_operational('merchant'), 'inactive merchant fails the operational guard');
select is(
  (with changed as (
    update public.products set name='Inactive product change'
    where id='bb300000-0000-4000-8000-000000000010' returning 1
  ) select count(*) from changed),
  0::bigint,
  'inactive merchant cannot mutate products'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa300000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.admin_set_user_active('bb300000-0000-4000-8000-000000000001', true)$$,
  'administrator can reactivate a non-admin account without profile repair'
);
reset role;

-- A blocked or inactive admin loses both RPCs and the broad admin RLS policy.
update public.users
set blocked_until=now() + interval '1 hour', is_active=true
where id='aa300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa300000-0000-4000-8000-000000000001', true);
select ok(not public.is_admin(), 'temporarily blocked administrator fails the canonical predicate');
select throws_ok(
  $$select * from public.admin_list_users()$$,
  '42501', 'admin only',
  'temporarily blocked administrator cannot use a 164525 admin RPC'
);
select is(
  (select count(*) from public.app_banners where id='aa300000-0000-4000-8000-000000000010'),
  0::bigint,
  'temporarily blocked administrator loses admin_full_access'
);
reset role;

update public.users
set blocked_until=null, is_active=false
where id='aa300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa300000-0000-4000-8000-000000000001', true);
select ok(not public.is_admin(), 'inactive administrator fails the canonical predicate');
select throws_ok(
  $$select * from public.admin_list_users()$$,
  '42501', 'admin only',
  'inactive administrator cannot use a 164525 admin RPC'
);
select is(
  (select count(*) from public.app_banners where id='aa300000-0000-4000-8000-000000000010'),
  0::bigint,
  'inactive administrator loses admin_full_access'
);
reset role;

select * from finish();
rollback;
