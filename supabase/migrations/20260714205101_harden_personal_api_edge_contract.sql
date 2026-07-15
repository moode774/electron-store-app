-- Harden the personal Edge API boundary. The gateway intentionally accepts
-- personal `lv_` keys without a Supabase JWT, so key verification, account
-- state, global rate limiting, and column exposure must be database-owned.

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS rate_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS rate_window_count integer NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.api_keys'::regclass
      AND conname = 'api_keys_rate_window_count_check'
  ) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_rate_window_count_check
      CHECK (rate_window_count BETWEEN 0 AND 120);
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.api_keys.rate_window_started_at IS
  'Start of the current database-enforced personal API rate window.';
COMMENT ON COLUMN public.api_keys.rate_window_count IS
  'Accepted requests in the current one-minute personal API rate window.';

CREATE OR REPLACE FUNCTION public.create_api_key(
  p_name text,
  p_expires_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_user public.users%ROWTYPE;
  v_secret text;
  v_key text;
  v_id uuid;
  v_name text := pg_catalog.btrim(p_name);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authentication required';
  END IF;
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'key name must contain 1 to 100 characters';
  END IF;
  IF p_expires_days IS NOT NULL AND p_expires_days NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'expiry must be between 1 and 3650 days';
  END IF;

  -- The user row is the per-owner lock. Concurrent key creation cannot both
  -- observe fewer than ten active keys and exceed the limit.
  SELECT u.* INTO v_user
  FROM public.users AS u
  WHERE u.id = v_uid
  FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_user.is_active, true)
     OR public.is_user_blocked(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.api_keys AS k
    WHERE k.user_id = v_uid AND k.is_active
  ) >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'maximum active API keys reached';
  END IF;

  v_secret := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
  v_key := 'lv_live_' || v_secret;

  INSERT INTO public.api_keys (
    user_id, name, key_prefix, key_hash, expires_at,
    rate_window_started_at, rate_window_count
  ) VALUES (
    v_uid,
    v_name,
    pg_catalog.substring(v_key FROM 1 FOR 12) || '…',
    pg_catalog.encode(extensions.digest(v_key, 'sha256'), 'hex'),
    CASE WHEN p_expires_days IS NULL THEN NULL
      ELSE pg_catalog.now() + pg_catalog.make_interval(days => p_expires_days)
    END,
    NULL,
    0
  )
  RETURNING id INTO v_id;

  RETURN pg_catalog.jsonb_build_object('id', v_id, 'key', v_key);
END;
$function$;

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
    v_retry_after := pg_catalog.greatest(
      1,
      pg_catalog.ceil(pg_catalog.extract(epoch FROM (
        v_row.rate_window_started_at + pg_catalog.make_interval(secs => 60) - v_now
      )))::integer
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
        COALESCE(pg_catalog.sum(pg_catalog.greatest(s.gross_amount - s.reversed_amount, 0)), 0),
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
        'net_sales', pg_catalog.round(pg_catalog.greatest(v_gross_proceeds - v_reversals, 0), 2),
        'products', v_products
      );

    WHEN 'admin' THEN
      SELECT pg_catalog.count(*) INTO v_users FROM public.users;
      SELECT pg_catalog.count(*) INTO v_merchants FROM public.merchant_profiles;
      SELECT pg_catalog.count(*) INTO v_orders FROM public.orders;
      SELECT
        pg_catalog.count(*),
        COALESCE(pg_catalog.sum(pg_catalog.greatest(s.gross_amount - s.reversed_amount, 0)), 0)
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
          pg_catalog.greatest(v_platform_revenue - v_platform_reversals, 0), 2
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

REVOKE ALL ON FUNCTION public.create_api_key(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_api_key(text, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.verify_api_key(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.api_get_role_stats(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_get_role_stats(uuid)
  TO service_role;

-- The hash and quota counters are credentials/internal control state. RLS is
-- not a column-hiding mechanism, so expose only the metadata used by the app.
REVOKE ALL ON TABLE public.api_keys FROM anon, authenticated;
GRANT SELECT (
  id, user_id, name, key_prefix, scopes, is_active,
  last_used_at, expires_at, created_at
) ON public.api_keys TO authenticated;
GRANT UPDATE (is_active) ON public.api_keys TO authenticated;
GRANT DELETE ON public.api_keys TO authenticated;
