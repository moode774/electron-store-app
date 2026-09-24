-- GREATEST is SQL syntax, not a catalog function: `pg_catalog.greatest(...)`
-- raises "function pg_catalog.greatest(integer, integer) does not exist" at
-- run time (PL/pgSQL only resolves it when the line executes). Result:
--   * verify_api_key crashed instead of returning `rate_limited` (HTTP 429)
--     once a key exceeded 120 requests/minute;
--   * api_get_role_stats always crashed for merchant and admin keys.
-- Bodies are otherwise identical to 20260714205101. CREATE OR REPLACE keeps
-- the existing grants.

CREATE OR REPLACE FUNCTION public.verify_api_key(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.api_keys%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_start timestamptz;
  v_window_count integer;
  v_retry_after integer;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_key IS NULL OR p_key !~ '^lv_live_[0-9a-f]{48}$' THEN
    RETURN pg_catalog.jsonb_build_object('valid', false, 'error', 'invalid_key');
  END IF;

  -- One row lock makes the quota global across every Edge isolate and keeps
  -- the counter exact when several requests use the same key concurrently.
  SELECT k.* INTO v_row
  FROM public.api_keys AS k
  WHERE k.key_hash = pg_catalog.encode(extensions.digest(p_key, 'sha256'), 'hex')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('valid', false, 'error', 'invalid_key');
  END IF;
  IF NOT v_row.is_active THEN
    RETURN pg_catalog.jsonb_build_object('valid', false, 'error', 'key_revoked');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= v_now THEN
    RETURN pg_catalog.jsonb_build_object('valid', false, 'error', 'key_expired');
  END IF;

  SELECT u.* INTO v_user
  FROM public.users AS u
  WHERE u.id = v_row.user_id;
  IF NOT FOUND OR NOT COALESCE(v_user.is_active, true)
     OR public.is_user_blocked(v_row.user_id) THEN
    RETURN pg_catalog.jsonb_build_object('valid', false, 'error', 'account_blocked');
  END IF;
  IF v_user.role::text NOT IN ('customer', 'merchant', 'delivery', 'admin') THEN
    RETURN pg_catalog.jsonb_build_object('valid', false, 'error', 'unsupported_role');
  END IF;

  IF v_row.rate_window_started_at IS NULL
     OR v_row.rate_window_started_at <= v_now - pg_catalog.make_interval(secs => 60) THEN
    v_window_start := v_now;
    v_window_count := 1;
  ELSIF v_row.rate_window_count >= 120 THEN
    v_retry_after := GREATEST(
      1,
      pg_catalog.ceil(pg_catalog.date_part(
        'epoch',
        v_row.rate_window_started_at + pg_catalog.make_interval(secs => 60) - v_now
      ))::integer
    );
    RETURN pg_catalog.jsonb_build_object(
      'valid', false,
      'error', 'rate_limited',
      'retry_after_seconds', v_retry_after
    );
  ELSE
    v_window_start := v_row.rate_window_started_at;
    v_window_count := v_row.rate_window_count + 1;
  END IF;

  UPDATE public.api_keys
  SET last_used_at = v_now,
      rate_window_started_at = v_window_start,
      rate_window_count = v_window_count
  WHERE id = v_row.id;

  RETURN pg_catalog.jsonb_build_object(
    'valid', true,
    'key_id', v_row.id,
    'scopes', pg_catalog.to_jsonb(v_row.scopes),
    'user_id', v_user.id,
    'role', v_user.role,
    'full_name', v_user.full_name
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_get_role_stats(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user public.users%ROWTYPE;
  v_merchant_id uuid;
  v_delivery public.delivery_profiles%ROWTYPE;
  v_orders bigint := 0;
  v_products bigint := 0;
  v_settlements bigint := 0;
  v_users bigint := 0;
  v_merchants bigint := 0;
  v_net_gmv numeric := 0;
  v_gross_proceeds numeric := 0;
  v_reversals numeric := 0;
  v_platform_revenue numeric := 0;
  v_platform_reversals numeric := 0;
  v_loyalty_points integer := 0;
  v_wallet numeric := 0;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'actor is required';
  END IF;

  SELECT u.* INTO v_user
  FROM public.users AS u
  WHERE u.id = p_actor_id;
  IF NOT FOUND OR NOT COALESCE(v_user.is_active, true)
     OR public.is_user_blocked(p_actor_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;

  CASE v_user.role::text
    WHEN 'merchant' THEN
      SELECT mp.id INTO v_merchant_id
      FROM public.merchant_profiles AS mp
      WHERE mp.user_id = p_actor_id;
      IF v_merchant_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'merchant profile not found';
      END IF;

      SELECT pg_catalog.count(*) INTO v_orders
      FROM public.orders AS o
      WHERE o.merchant_id = v_merchant_id;
      SELECT pg_catalog.count(*) INTO v_products
      FROM public.products AS p
      WHERE p.merchant_id = v_merchant_id;
      SELECT
        pg_catalog.count(*),
        COALESCE(pg_catalog.sum(GREATEST(s.gross_amount - s.reversed_amount, 0)), 0),
        COALESCE(pg_catalog.sum(s.merchant_proceeds), 0)
      INTO v_settlements, v_net_gmv, v_gross_proceeds
      FROM public.order_settlements AS s
      WHERE s.merchant_id = v_merchant_id;
      SELECT COALESCE(pg_catalog.sum(le.amount), 0) INTO v_reversals
      FROM public.marketplace_ledger_entries AS le
      WHERE le.entry_type = 'refund_merchant_reversal'
        AND le.debit_owner_id = p_actor_id;

      RETURN pg_catalog.jsonb_build_object(
        'total_orders', v_orders,
        'settled_orders', v_settlements,
        'settled_gmv', pg_catalog.round(v_net_gmv, 2),
        'delivered_gmv', pg_catalog.round(v_net_gmv, 2),
        'net_sales', pg_catalog.round(GREATEST(v_gross_proceeds - v_reversals, 0), 2),
        'products', v_products
      );

    WHEN 'admin' THEN
      SELECT pg_catalog.count(*) INTO v_users FROM public.users;
      SELECT pg_catalog.count(*) INTO v_merchants FROM public.merchant_profiles;
      SELECT pg_catalog.count(*) INTO v_orders FROM public.orders;
      SELECT
        pg_catalog.count(*),
        COALESCE(pg_catalog.sum(GREATEST(s.gross_amount - s.reversed_amount, 0)), 0)
      INTO v_settlements, v_net_gmv
      FROM public.order_settlements AS s;
      SELECT
        COALESCE(pg_catalog.sum(le.amount) FILTER (WHERE le.entry_type = 'platform_revenue'), 0),
        COALESCE(pg_catalog.sum(le.amount) FILTER (WHERE le.entry_type = 'refund_platform_reversal'), 0)
      INTO v_platform_revenue, v_platform_reversals
      FROM public.marketplace_ledger_entries AS le
      WHERE le.entry_type IN ('platform_revenue', 'refund_platform_reversal');

      RETURN pg_catalog.jsonb_build_object(
        'users', v_users,
        'merchants', v_merchants,
        'orders', v_orders,
        'settled_orders', v_settlements,
        'net_settled_gmv', pg_catalog.round(v_net_gmv, 2),
        'delivered_gmv', pg_catalog.round(v_net_gmv, 2),
        'platform_revenue', pg_catalog.round(
          GREATEST(v_platform_revenue - v_platform_reversals, 0), 2
        )
      );

    WHEN 'customer' THEN
      SELECT pg_catalog.count(*) INTO v_orders
      FROM public.orders AS o
      WHERE o.customer_id = p_actor_id;
      SELECT COALESCE(cp.loyalty_points, 0), COALESCE(cp.wallet_balance, 0)
      INTO v_loyalty_points, v_wallet
      FROM public.customer_profiles AS cp
      WHERE cp.user_id = p_actor_id;

      RETURN pg_catalog.jsonb_build_object(
        'orders', v_orders,
        'loyalty_points', COALESCE(v_loyalty_points, 0),
        'wallet_balance', pg_catalog.round(COALESCE(v_wallet, 0), 2)
      );

    WHEN 'delivery' THEN
      SELECT dp.* INTO v_delivery
      FROM public.delivery_profiles AS dp
      WHERE dp.user_id = p_actor_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery profile not found';
      END IF;

      RETURN pg_catalog.jsonb_build_object(
        'total_deliveries', COALESCE(v_delivery.total_deliveries, 0),
        'rating', COALESCE(v_delivery.rating, 0),
        'wallet_balance', pg_catalog.round(COALESCE(v_delivery.wallet_balance, 0), 2),
        'is_online', COALESCE(v_delivery.is_online, false)
      );

    ELSE
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unsupported account role';
  END CASE;
END;
$function$;
