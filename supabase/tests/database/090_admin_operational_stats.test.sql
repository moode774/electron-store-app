begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select plan(6);

select has_function(
  'public', 'admin_get_operational_stats', array[]::text[],
  'admin operational KPI RPC exists'
);
select function_privs_are(
  'public', 'admin_get_operational_stats', array[]::text[], 'anon', array[]::text[],
  'anonymous callers cannot read operational KPIs'
);
select function_privs_are(
  'public', 'admin_get_operational_stats', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated callers reach the internal admin authorization check'
);
select ok(
  pg_get_functiondef('public.admin_get_operational_stats()'::regprocedure)
    ilike '%public.order_settlements%reversed_amount%',
  'revenue KPI is based on net settlement value after reversals'
);
select ok(
  pg_get_functiondef('public.admin_get_operational_stats()'::regprocedure)
    ilike '%Asia/Aden%',
  'daily KPI buckets use the explicit marketplace timezone'
);
select ok(
  exists (
    select 1
    from pg_proc p
    where p.oid = 'public.admin_get_operational_stats()'::regprocedure
      and p.prosecdef
      and exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) config(value)
        where replace(config.value, '"', '') = 'search_path='
      )
  ),
  'admin KPI RPC is security-definer with an empty search path'
);

select * from finish();
rollback;

