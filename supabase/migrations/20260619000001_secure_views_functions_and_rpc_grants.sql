-- ============================================================
-- Harden views, function search_path, and RPC execute grants
-- Applied to live DB 2026-06-19.
-- ============================================================

-- 1) Views: run with the querying user's permissions (respect RLS)
ALTER VIEW IF EXISTS public.v_order_summary      SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_developer_earnings SET (security_invoker = on);

-- 2) Pin search_path on all flagged functions (prevents schema hijacking).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'calculate_commission','update_updated_at','check_stock_alert',
        'handle_new_user','calculate_order_totals','generate_order_number',
        'auto_confirm_new_user','award_loyalty_on_delivery','claim_delivery_order',
        'decrement_product_stock','get_or_create_referral','notify_order_events',
        'on_chat_message'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', r.sig);
  END LOOP;
END $$;

-- 3) Trigger-only functions must NOT be callable as RPC by app roles.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user','auto_confirm_new_user','award_loyalty_on_delivery',
        'notify_order_events','on_chat_message','update_updated_at','check_stock_alert'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public;', r.sig);
  END LOOP;
END $$;

-- 4) Legit client RPCs: signed-in users only, drop anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('claim_delivery_order','decrement_product_stock','get_or_create_referral')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public;', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
  END LOOP;
END $$;
