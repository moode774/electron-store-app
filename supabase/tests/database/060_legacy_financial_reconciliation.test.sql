begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local "request.jwt.claim.role" = '';
select no_plan();

select has_table(
  'public', 'legacy_order_reconciliations',
  'historical financial reconciliation has a dedicated audit table'
);
select has_column(
  'public', 'legacy_order_reconciliations', 'evidence_reference',
  'reconciliation preserves the external evidence reference'
);
select has_column(
  'public', 'legacy_order_reconciliations', 'stats_state',
  'reconciliation records the explicit counter decision'
);
select has_column(
  'public', 'legacy_order_reconciliations', 'cod_custody_requires_review',
  'reconciliation identifies COD custody that still needs the remittance flow'
);
select ok(
  to_regprocedure('public.admin_list_legacy_financial_reconciliation()') is not null,
  'admin reconciliation queue RPC exists'
);
select ok(
  to_regprocedure(
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'
  ) is not null,
  'evidence-backed reconciliation RPC exists'
);
select results_eq(
  $$ select proargnames::text[]
     from pg_proc
     where oid = to_regprocedure(
       'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'
     ) $$,
  $$ values (array[
       'p_order_id','p_confirm_order_number','p_confirmed_delivered_at',
       'p_gross_amount','p_merchant_proceeds','p_delivery_earning',
       'p_platform_commission','p_tax_amount','p_stats_state',
       'p_acknowledge_cod_custody','p_evidence_reference','p_reason',
       'p_idempotency_key'
     ]::text[]) $$,
  'reconciliation named arguments match the PostgREST contract'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_list_legacy_financial_reconciliation()',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)',
    'execute'
  ),
  'only authenticated callers reach admin-authorized reconciliation RPCs'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.legacy_order_reconciliations', 'insert,update,delete'
  )
  and has_table_privilege(
    'authenticated', 'public.legacy_order_reconciliations', 'select'
  ),
  'audit rows are RPC-only for mutation and admin-readable through RLS'
);
select ok(
  coalesce((
    select relrowsecurity
    from pg_class
    where oid = to_regclass('public.legacy_order_reconciliations')
  ), false),
  'reconciliation audit table has RLS enabled'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'legacy_order_reconciliations'
      and policyname = 'legacy_order_reconciliations_admin_select'
      and cmd = 'SELECT'
      and qual ilike '%is_admin%'
  ),
  'only admins can read reconciliation evidence and rationale'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_list_legacy_financial_reconciliation',
        'admin_reconcile_legacy_delivered_order'
      )
      and (
        not p.prosecdef
        or not exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) config(value)
          where replace(config.value, '"', '') = 'search_path='
        )
      )
  ),
  'reconciliation RPCs are security-definer with an empty search path'
);
select ok(
  pg_get_functiondef(
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'::regprocedure
  ) ilike '%partial financial artifacts exist%'
  and pg_get_functiondef(
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'::regprocedure
  ) ilike '%confirmed amounts do not match the immutable order components%'
  and pg_get_functiondef(
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'::regprocedure
  ) ilike '%COD reconciliation requires explicit custody acknowledgement%'
  and pg_get_functiondef(
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'::regprocedure
  ) ilike '%refunded or financially reversed order cannot be settled again%'
  and pg_get_functiondef(
    'public.admin_reconcile_legacy_delivered_order(uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,text,boolean,text,text,uuid)'::regprocedure
  ) ilike '%customer, merchant or delivery role relationship is invalid%',
  'reconciliation fails closed on partial writes, refunds, role drift, amount drift and COD custody'
);
select ok(
  pg_get_functiondef(
    'public.admin_list_legacy_financial_reconciliation()'::regprocedure
  ) ilike '%has_active_refund%has_active_physical_return%completed_refund_or_reversal_exists%',
  'admin queue exposes refund and physical-return context before reconciliation'
);
select ok(
  pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%IF NOT COALESCE(v_order.stats_counted, false) THEN%'
  and pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%CASE WHEN COALESCE(v_order.stats_counted, false) THEN 0 ELSE 1 END%'
  and pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%ORDER_HAS_COMPLETED_REFUND_OR_REVERSAL%'
  and pg_get_functiondef(
    'public.marketplace_settle_order_once(uuid,uuid,uuid)'::regprocedure
  ) ilike '%CUSTOMER_ROLE_RELATIONSHIP_INVALID%',
  'settlement preserves historical counters and rejects reversed or role-invalid orders'
);
select ok(
  pg_get_functiondef(
    'public.complete_delivery_with_proof(uuid,text,numeric,numeric,uuid,text)'::regprocedure
  ) not ilike '%SET status = ''delivered''%stats_counted = true%marketplace_settle_order_once%',
  'normal proof completion leaves counter ownership to the atomic settlement'
);

select * from finish();
rollback;
