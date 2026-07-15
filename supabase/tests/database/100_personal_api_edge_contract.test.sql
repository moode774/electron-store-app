begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

select has_column('public', 'api_keys', 'rate_window_started_at', 'API keys persist the shared quota window');
select has_column('public', 'api_keys', 'rate_window_count', 'API keys persist the shared quota count');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.api_keys'::regclass
      and conname = 'api_keys_rate_window_count_check'
  ),
  'API quota counter has a database check constraint'
);
select has_function(
  'public', 'api_get_role_stats', array['uuid'],
  'personal API role statistics have a server aggregate RPC'
);
select function_privs_are(
  'public', 'create_api_key', array['text','integer'], 'authenticated', array['EXECUTE'],
  'signed-in users can create their own API keys'
);
select function_privs_are(
  'public', 'verify_api_key', array['text'], 'authenticated', array[]::text[],
  'personal key verification is not callable by ordinary users'
);
select function_privs_are(
  'public', 'verify_api_key', array['text'], 'service_role', array['EXECUTE'],
  'only the Edge service role can verify personal keys'
);
select function_privs_are(
  'public', 'api_get_role_stats', array['uuid'], 'service_role', array['EXECUTE'],
  'only the Edge service role can aggregate personal API statistics'
);
select ok(
  has_column_privilege('authenticated', 'public.api_keys', 'name', 'select')
  and has_column_privilege('authenticated', 'public.api_keys', 'key_prefix', 'select')
  and not has_column_privilege('authenticated', 'public.api_keys', 'key_hash', 'select')
  and not has_column_privilege('authenticated', 'public.api_keys', 'rate_window_count', 'select'),
  'Data API exposes key metadata without hashes or quota internals'
);
select ok(
  pg_get_functiondef('public.verify_api_key(text)'::regprocedure) ilike '%FOR UPDATE%'
  and pg_get_functiondef('public.verify_api_key(text)'::regprocedure) ilike '%rate_limited%'
  and pg_get_functiondef('public.verify_api_key(text)'::regprocedure) ilike '%service role required%',
  'key verification locks its quota row and enforces service-role access'
);
select ok(
  exists (
    select 1
    from pg_proc p
    where p.oid = 'public.verify_api_key(text)'::regprocedure
      and p.prosecdef
      and exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) config(value)
        where replace(config.value, '"', '') = 'search_path='
      )
  ),
  'key verification is security-definer with an empty search path'
);

alter table public.users disable trigger all;
insert into public.users (
  id, email, phone, full_name, role, is_active, is_verified, is_blocked
) values (
  'a1000000-0000-4000-8000-000000000001',
  'api-key-test@test.invalid', '709999991', 'API Key Test',
  'customer', true, true, false
)
on conflict (id) do update
set is_active = true, is_blocked = false, blocked_until = null, role = 'customer';
alter table public.users enable trigger all;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.create_api_key('Automated test key', 30)$$,
  'an operational user can create a bounded-expiry key'
);
select throws_ok(
  $$select public.create_api_key('Invalid expiry', 0)$$,
  '22023', 'expiry must be between 1 and 3650 days',
  'zero-day API key expiry is rejected'
);
reset role;

select is(
  (select count(*) from public.api_keys
   where user_id = 'a1000000-0000-4000-8000-000000000001'
     and name = 'Automated test key'),
  1::bigint,
  'API key creation stores one hashed credential row'
);

insert into public.api_keys (
  id, user_id, name, key_prefix, key_hash, scopes, is_active
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Known verification fixture', 'lv_live_aaaa…',
  encode(extensions.digest('lv_live_' || repeat('a', 48), 'sha256'), 'hex'),
  array['read','write']::text[], true
)
on conflict (id) do update
set is_active = true,
    rate_window_started_at = null,
    rate_window_count = 0;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.verify_api_key('lv_live_' || repeat('a', 48))->>'valid',
  'true',
  'service role verifies a valid personal key'
);
select is(
  public.api_get_role_stats('a1000000-0000-4000-8000-000000000001')->>'orders',
  '0',
  'role statistics are bound to the verified customer identity'
);
reset role;

select is(
  (select rate_window_count from public.api_keys
   where id = 'a2000000-0000-4000-8000-000000000001'),
  1,
  'successful verification increments the shared database quota'
);

update public.api_keys
set rate_window_started_at = clock_timestamp(), rate_window_count = 120
where id = 'a2000000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.verify_api_key('lv_live_' || repeat('a', 48))->>'error',
  'rate_limited',
  'the 121st request in one minute is rejected globally'
);
reset role;

select is(
  (select rate_window_count from public.api_keys
   where id = 'a2000000-0000-4000-8000-000000000001'),
  120,
  'rejected requests cannot overflow the bounded quota counter'
);

select * from finish();
rollback;
