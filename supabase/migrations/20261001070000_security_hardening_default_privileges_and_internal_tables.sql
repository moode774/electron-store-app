-- Defense-in-depth hardening for authorization boundaries.
-- Existing public catalog browsing intentionally depends on
-- is_merchant_publicly_available(uuid), so that specific anon RPC grant is preserved.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- These tables are internal-only. RLS is enabled, but no client policies are
-- intentionally defined; remove direct Data API privileges as an additional
-- barrier against future policy mistakes.
REVOKE ALL ON TABLE
  public.delivery_offer_rejections,
  public.inventory_logs,
  public.marketplace_ledger_entries,
  public.order_operation_audit,
  public.order_pickup_codes,
  public.order_settlements
FROM anon, authenticated;

-- Reassert the intended internal API contracts.
REVOKE ALL ON FUNCTION public.verify_api_key(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.api_get_role_stats(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_get_role_stats(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.api_transition_order_status(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_transition_order_status(uuid, uuid, text, text)
  TO service_role;
