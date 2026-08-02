begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

select ok(
  to_regprocedure('public.set_my_delivery_presence(boolean,numeric,numeric)') is not null,
  'courier presence RPC exists'
);
select ok(
  to_regprocedure('public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)') is not null,
  'atomic courier location RPC exists'
);
select has_column('public', 'delivery_location_history', 'sample_id', 'location samples persist their retry key');
select has_index(
  'public', 'delivery_location_history', 'delivery_location_history_delivery_sample_uq',
  'courier location retry keys are unique per courier'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc
     where oid = to_regprocedure('public.set_my_delivery_presence(boolean,numeric,numeric)') $$,
  $$ values (array['p_online','p_latitude','p_longitude']::text[]) $$,
  'presence RPC named arguments match the client contract'
);
select results_eq(
  $$ select proargnames::text[] from pg_proc
     where oid = to_regprocedure('public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)') $$,
  $$ values (array['p_order_id','p_sample_id','p_latitude','p_longitude','p_speed']::text[]) $$,
  'location RPC named arguments match the client contract'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.set_my_delivery_presence(boolean,numeric,numeric)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)', 'execute'
  ),
  'presence mutation is authenticated-only and authorizes the courier internally'
);
select ok(
  not has_column_privilege('authenticated', 'public.delivery_profiles', 'is_online', 'update')
  and not has_column_privilege('authenticated', 'public.delivery_profiles', 'current_latitude', 'update')
  and not has_table_privilege('authenticated', 'public.delivery_location_history', 'insert'),
  'couriers cannot split presence/history writes into partial direct mutations'
);
select ok(
  has_column_privilege('authenticated', 'public.delivery_profiles', 'work_city', 'select')
  and not has_column_privilege('authenticated', 'public.delivery_profiles', 'national_id', 'select')
  and not has_column_privilege('authenticated', 'public.delivery_profiles', 'wallet_balance', 'select'),
  'couriers can read offer-ranking city without exposing protected identity or balance fields'
);
select ok(
  pg_get_functiondef(
    'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)'::regprocedure
  ) ilike '%INSERT INTO public.delivery_location_history%UPDATE public.delivery_profiles%'
  and pg_get_functiondef(
    'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)'::regprocedure
  ) ilike '%assigned%picked_up%on_the_way%',
  'location history and current profile coordinates commit together only for active assignments'
);
select ok(
  strpos(
    pg_get_functiondef(
      'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)'::regprocedure
    ),
    'SELECT o.* INTO v_order'
  ) < strpos(
    pg_get_functiondef(
      'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)'::regprocedure
    ),
    'SELECT dp.* INTO v_profile'
  )
  and pg_get_functiondef(
    'public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)'::regprocedure
  ) ilike '%delivery location sample payload conflict%idempotent_replay%',
  'location writes use order-before-profile locking and replay the same immutable sample'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_my_delivery_presence','record_my_delivery_location')
      and (
        not p.prosecdef
        or not exists (
          select 1 from unnest(coalesce(p.proconfig, array[]::text[])) config(value)
          where replace(config.value, '"', '') = 'search_path='
        )
      )
  ),
  'delivery presence RPCs are security-definer with an empty search path'
);

select * from finish();
rollback;
