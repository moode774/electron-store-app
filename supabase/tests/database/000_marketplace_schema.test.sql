begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Order idempotency, reversals, tracking, and settlement contracts.
select has_column('public', 'orders', 'idempotency_key', 'orders has an idempotency key');
select has_column('public', 'orders', 'request_hash', 'orders records the canonical request hash');
select has_column('public', 'orders', 'inventory_released_at', 'orders records one-time inventory release');
select has_column('public', 'orders', 'settled_at', 'orders records one-time settlement');
select has_column('public', 'order_tracking', 'created_by', 'tracking records the actor');
select has_column('public', 'order_tracking', 'actor_role', 'tracking records the actor role');
select has_column('public', 'order_tracking', 'event_key', 'tracking events are idempotent');
select has_column('public', 'order_tracking', 'metadata', 'tracking supports structured metadata');
select has_table('public', 'order_settlements', 'order settlements exist');
select has_table('public', 'delivery_cod_collections', 'COD custody is tracked separately');
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_settlements')), false),
  'order settlements have RLS enabled'
);
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.delivery_cod_collections')), false),
  'COD collections have RLS enabled'
);

-- Financial reservation and audit fields.
select has_column('public', 'withdrawal_requests', 'idempotency_key', 'withdrawals are idempotent');
select has_column('public', 'withdrawal_requests', 'reserved_at', 'withdrawals reserve funds');
select has_column('public', 'withdrawal_requests', 'processed_at', 'withdrawals record processing time');
select has_column('public', 'withdrawal_requests', 'processed_by', 'withdrawals record the admin actor');
select has_column('public', 'withdrawal_requests', 'requester_notes', 'withdrawals preserve requester notes');
select has_column('public', 'withdrawal_requests', 'admin_notes', 'withdrawals preserve admin notes separately');
select has_column('public', 'withdrawal_requests', 'payout_destination', 'withdrawals snapshot the payout destination');
select has_column('public', 'withdrawal_requests', 'external_reference', 'withdrawals record the external transfer reference');
select has_column('public', 'withdrawal_requests', 'paid_at', 'withdrawals distinguish payment from approval');
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'delivery_earnings'
      and indexdef ilike 'create unique index%order_id%'
  ),
  'delivery earnings are unique per order'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'wallet_transactions'
      and indexdef ilike 'create unique index%reference_id%'
  ),
  'wallet ledger entries have a unique business reference'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='refund_requests'
      and indexdef ilike 'create unique index%order_id%where%pending%'
  ),
  'only one active refund request exists per order'
);
select ok(
  (select count(*) from pg_indexes
   where schemaname='public' and tablename in ('customer_profiles','merchant_profiles','delivery_profiles')
     and indexdef ilike 'create unique index%user_id%') = 3,
  'each user has at most one profile per role table'
);

-- Public business RPCs expected by the application.
select ok(to_regprocedure('public.set_default_address(uuid)') is not null, 'owned default-address RPC exists');
select ok(to_regprocedure('public.place_order(uuid,uuid,text,jsonb,text,text,uuid)') is not null, 'secure place_order RPC exists');
select ok(to_regprocedure('public.place_order_group(uuid,text,jsonb,text,text,uuid)') is not null, 'atomic multi-store checkout RPC exists');
select ok(to_regprocedure('public.preview_coupon(text,numeric)') is not null, 'server-side coupon preview RPC exists');
select ok(to_regprocedure('public.cancel_order(uuid,text)') is not null, 'cancel_order RPC exists');
select ok(to_regprocedure('public.transition_order_status(uuid,text)') is not null, 'authorized order transition RPC exists');
select ok(to_regprocedure('public.claim_delivery_order(uuid,uuid)') is not null, 'claim_delivery_order RPC exists');
select ok(to_regprocedure('public.list_available_delivery_orders()') is not null, 'limited delivery offers RPC exists');
select ok(to_regprocedure('public.create_refund_request(uuid,text,text,text,jsonb)') is not null, 'refund creation RPC exists');
select ok(to_regprocedure('public.process_refund_request(uuid,text,text,text)') is not null, 'refund processing RPC accepts notes and external reference');
select ok(to_regprocedure('public.respond_refund_request(uuid,text)') is not null, 'merchant refund response RPC exists');
select ok(to_regprocedure('public.request_withdrawal(numeric,text)') is not null, 'withdrawal request RPC exists');
select ok(to_regprocedure('public.process_withdrawal_request(uuid,text,text,text)') is not null, 'withdrawal processing RPC accepts notes and external reference');
select ok(to_regprocedure('public.create_support_ticket(text,text,text,uuid)') is not null, 'atomic support creation RPC exists');
select ok(to_regprocedure('public.reply_support_ticket(uuid,text)') is not null, 'support reply RPC exists');
select ok(to_regprocedure('public.update_support_ticket_status(uuid,text)') is not null, 'support state RPC exists');
select ok(to_regprocedure('public.review_merchant_application(uuid,boolean,text)') is not null, 'merchant review RPC exists');
select ok(to_regprocedure('public.set_merchant_operational_status(uuid,boolean,text)') is not null, 'merchant operational status RPC exists');
select ok(to_regprocedure('public.review_delivery_application(uuid,boolean,text,bigint)') is not null, 'revision-bound delivery review RPC exists');
select ok(to_regprocedure('public.admin_set_delivery_online(uuid,boolean)') is not null, 'admin delivery availability RPC exists');
select ok(to_regprocedure('public.admin_get_user_details(uuid)') is not null, 'admin user detail RPC exists');
select ok(to_regprocedure('public.api_transition_order_status(uuid,uuid,text,text)') is not null, 'service-only API transition RPC exists');
select ok(to_regprocedure('public.get_or_create_conversation(uuid,uuid)') is not null, 'secure chat creation RPC exists');
select ok(to_regprocedure('public.send_chat_message(uuid,text)') is not null, 'secure chat send RPC exists');
select ok(to_regprocedure('public.mark_conversation_read(uuid)') is not null, 'secure chat read RPC exists');
select ok(to_regprocedure('public.get_or_create_referral(uuid)') is not null, 'referral lookup RPC exists');
select ok(to_regprocedure('public.create_api_key(text,integer)') is not null, 'personal API key creation RPC exists');
select ok(to_regprocedure('public.verify_api_key(text)') is not null, 'personal API key verification RPC exists');
select ok(to_regprocedure('public.delete_my_account()') is not null, 'account deletion RPC exists');
select ok(to_regprocedure('public.create_broadcast_campaign(text,text,text,text,uuid)') is not null, 'idempotent broadcast campaign RPC exists');
select ok(to_regprocedure('public.register_device_token(text,text)') is not null, 'secure device-token registration RPC exists');
select ok(to_regprocedure('public.deactivate_device_token(text)') is not null, 'secure device-token deactivation RPC exists');
select ok(to_regprocedure('public.deactivate_current_session_device_tokens()') is not null, 'current-session device-token cleanup RPC exists');

-- Named arguments are part of the PostgREST RPC contract, not documentation only.
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.set_default_address(uuid)') $$,
  $$ values (array['p_address_id']::text[]) $$,
  'set_default_address exposes the caller argument name'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.process_refund_request(uuid,text,text,text)') $$,
  $$ values (array['p_request_id','p_status','p_notes','p_external_reference']::text[]) $$,
  'process_refund_request exposes all four caller argument names'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.process_withdrawal_request(uuid,text,text,text)') $$,
  $$ values (array['p_request_id','p_status','p_notes','p_external_reference']::text[]) $$,
  'process_withdrawal_request exposes all four caller argument names'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.set_merchant_operational_status(uuid,boolean,text)') $$,
  $$ values (array['p_profile_id','p_active','p_reason']::text[]) $$,
  'set_merchant_operational_status exposes the caller argument names'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.admin_set_delivery_online(uuid,boolean)') $$,
  $$ values (array['p_profile_id','p_online']::text[]) $$,
  'admin_set_delivery_online exposes the caller argument names'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc where oid = to_regprocedure('public.create_broadcast_campaign(text,text,text,text,uuid)') $$,
  $$ values (array['p_title','p_body','p_role','p_channel','p_idempotency_key']::text[]) $$,
  'create_broadcast_campaign exposes the caller argument names'
);

-- Notification and token privacy boundaries.
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.notifications')), false),
  'notifications have RLS enabled'
);
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.device_tokens')), false),
  'device tokens have RLS enabled'
);
select ok(
  not coalesce(has_table_privilege('authenticated', to_regclass('public.notifications')::oid, 'insert'), false),
  'authenticated users cannot inject notifications directly'
);

-- Dangerous legacy paths are not callable from API roles.
select ok(
  (
    to_regprocedure('public.decrement_product_stock(uuid,integer)') is null
    or (
      not coalesce(has_function_privilege('anon', to_regprocedure('public.decrement_product_stock(uuid,integer)')::oid, 'execute'), false)
      and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.decrement_product_stock(uuid,integer)')::oid, 'execute'), false)
    )
  ),
  'direct stock mutation is not callable by API roles'
);
select ok(
  (
    to_regprocedure('public.create_order_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb)') is null
    or (
      not coalesce(has_function_privilege('anon', to_regprocedure('public.create_order_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb)')::oid, 'execute'), false)
      and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.create_order_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb)')::oid, 'execute'), false)
    )
  ),
  'legacy client-priced order RPC is not callable by API roles'
);
select ok(
  coalesce(has_function_privilege('authenticated', to_regprocedure('public.place_order(uuid,uuid,text,jsonb,text,text,uuid)')::oid, 'execute'), false)
  and not coalesce(has_function_privilege('anon', to_regprocedure('public.place_order(uuid,uuid,text,jsonb,text,text,uuid)')::oid, 'execute'), false),
  'only authenticated users can place orders'
);
select ok(
  not coalesce(has_function_privilege('authenticated', to_regprocedure('public.api_transition_order_status(uuid,uuid,text,text)')::oid, 'execute'), false),
  'personal API transition helper is service-only'
);

-- Obsolete permissive policies must be removed, not shadowed by newer policies.
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='orders' and policyname in ('orders_merchant_update','orders_delivery_update','orders_delivery_available_read')), 'broad order policies are removed');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='refund_requests' and policyname in ('refund_requests_customer','refund_requests_own','refund_requests_merchant_update')), 'broad refund policies are removed');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='support_tickets' and policyname='support_tickets_own'), 'users cannot mutate support tickets directly');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='support_messages' and policyname='support_messages_insert'), 'users cannot inject support messages by sender id only');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_messages_insert'), 'users cannot inject chat messages by sender id only');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='complaints' and policyname in ('complaints_own','complaints_against_party_update')), 'complaint participants cannot self-resolve');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='merchant_profiles' and policyname='merchant_profiles_public_read'), 'merchant sensitive rows are not exposed by a public table policy');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='wallet_transactions' and policyname='wallet_tx_own_debit_insert'), 'users cannot create wallet debits directly');

-- Protected aggregate/financial fields have database guards.
select ok(exists(select 1 from pg_trigger where tgrelid=to_regclass('public.merchant_profiles') and tgname='trg_protect_merchant_profile_fields' and not tgisinternal), 'merchant financial fields are guarded');
select ok(exists(select 1 from pg_trigger where tgrelid=to_regclass('public.delivery_profiles') and tgname='trg_protect_delivery_profile_fields' and not tgisinternal), 'delivery financial fields are guarded');
select ok(exists(select 1 from pg_trigger where tgrelid=to_regclass('public.customer_profiles') and tgname='trg_protect_customer_profile_fields' and not tgisinternal), 'customer financial fields are guarded');

-- Realtime tables required by the role feeds.
select results_eq(
  $$
    select tablename::text from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename in (
        'orders','order_tracking','notifications','chat_conversations','chat_messages',
        'support_tickets','support_messages','refund_requests','complaints',
        'complaint_messages','delivery_profiles','delivery_location_history'
      )
    order by tablename
  $$,
  $$ values
    ('chat_conversations'),('chat_messages'),('complaint_messages'),('complaints'),
    ('delivery_location_history'),('delivery_profiles'),('notifications'),('order_tracking'),
    ('orders'),('refund_requests'),('support_messages'),('support_tickets') $$,
  'all role feeds are present in the realtime publication'
);

select * from finish();
rollback;
