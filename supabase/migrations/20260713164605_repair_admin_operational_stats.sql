-- Server-owned admin KPIs. Gross delivered-order sums in the client overstated
-- revenue after refunds and used the device timezone. This RPC reports net
-- settled GMV and consistent seven-day windows in the marketplace timezone.

CREATE OR REPLACE FUNCTION public.admin_get_operational_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_current_start timestamptz := v_now - interval '7 days';
  v_previous_start timestamptz := v_now - interval '14 days';
  v_total_users bigint := 0;
  v_total_orders bigint := 0;
  v_active_orders bigint := 0;
  v_online_drivers bigint := 0;
  v_pending_merchants bigint := 0;
  v_completed_orders bigint := 0;
  v_settlement_count bigint := 0;
  v_net_settled_gmv numeric := 0;
  v_current_net numeric := 0;
  v_previous_net numeric := 0;
  v_current_users bigint := 0;
  v_previous_users bigint := 0;
  v_current_orders bigint := 0;
  v_previous_orders bigint := 0;
  v_chart jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;

  SELECT count(*) INTO v_total_users FROM public.users;
  SELECT count(*),
         count(*) FILTER (WHERE o.status::text NOT IN (
           'delivered','cancelled','returned','failed_delivery'
         )),
         count(*) FILTER (WHERE o.status::text IN ('delivered','returned'))
  INTO v_total_orders, v_active_orders, v_completed_orders
  FROM public.orders o;

  SELECT count(*) INTO v_online_drivers
  FROM public.delivery_profiles dp
  JOIN public.users delivery_user ON delivery_user.id = dp.user_id
  WHERE dp.is_approved IS TRUE
    AND dp.is_online IS TRUE
    AND delivery_user.role::text = 'delivery'
    AND COALESCE(delivery_user.is_active, true)
    AND NOT public.is_user_blocked(delivery_user.id);

  SELECT count(*) INTO v_pending_merchants
  FROM public.merchant_profiles mp
  JOIN public.users merchant_user ON merchant_user.id = mp.user_id
  WHERE mp.is_approved IS NOT TRUE
    AND merchant_user.role::text = 'merchant'
    AND COALESCE(merchant_user.is_active, true)
    AND NOT public.is_user_blocked(merchant_user.id);

  SELECT
    count(*),
    COALESCE(sum(GREATEST(s.gross_amount - s.reversed_amount, 0)), 0),
    COALESCE(sum(GREATEST(s.gross_amount - s.reversed_amount, 0))
      FILTER (WHERE s.settled_at >= v_current_start), 0),
    COALESCE(sum(GREATEST(s.gross_amount - s.reversed_amount, 0))
      FILTER (WHERE s.settled_at >= v_previous_start
                AND s.settled_at < v_current_start), 0)
  INTO v_settlement_count, v_net_settled_gmv, v_current_net, v_previous_net
  FROM public.order_settlements s;

  SELECT
    count(*) FILTER (WHERE u.created_at >= v_current_start),
    count(*) FILTER (WHERE u.created_at >= v_previous_start
                       AND u.created_at < v_current_start)
  INTO v_current_users, v_previous_users
  FROM public.users u;

  SELECT
    count(*) FILTER (WHERE o.created_at >= v_current_start),
    count(*) FILTER (WHERE o.created_at >= v_previous_start
                       AND o.created_at < v_current_start)
  INTO v_current_orders, v_previous_orders
  FROM public.orders o;

  WITH days AS (
    SELECT generate_series(
      (v_now AT TIME ZONE 'Asia/Aden')::date - 6,
      (v_now AT TIME ZONE 'Asia/Aden')::date,
      interval '1 day'
    )::date AS day
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'count', COALESCE(x.order_count, 0)
    ) ORDER BY d.day
  ), '[]'::jsonb)
  INTO v_chart
  FROM days d
  LEFT JOIN LATERAL (
    SELECT count(*) AS order_count
    FROM public.orders o
    WHERE (o.created_at AT TIME ZONE 'Asia/Aden')::date = d.day
  ) x ON true;

  RETURN jsonb_build_object(
    'net_settled_gmv', round(v_net_settled_gmv, 2),
    'total_users', v_total_users,
    'total_orders', v_total_orders,
    'active_orders', v_active_orders,
    'online_drivers', v_online_drivers,
    'pending_merchants', v_pending_merchants,
    'average_order_value', CASE
      WHEN v_settlement_count = 0 THEN 0
      ELSE round(v_net_settled_gmv / v_settlement_count, 2)
    END,
    'completion_rate', CASE
      WHEN v_total_orders = 0 THEN 0
      ELSE round(v_completed_orders::numeric * 100 / v_total_orders, 2)
    END,
    'trends', jsonb_build_object(
      'net_settled_gmv', CASE
        WHEN v_previous_net > 0
          THEN round((v_current_net - v_previous_net) * 100 / v_previous_net, 2)
        WHEN v_current_net > 0 THEN 100 ELSE 0
      END,
      'users', CASE
        WHEN v_previous_users > 0
          THEN round((v_current_users - v_previous_users)::numeric * 100 / v_previous_users, 2)
        WHEN v_current_users > 0 THEN 100 ELSE 0
      END,
      'orders', CASE
        WHEN v_previous_orders > 0
          THEN round((v_current_orders - v_previous_orders)::numeric * 100 / v_previous_orders, 2)
        WHEN v_current_orders > 0 THEN 100 ELSE 0
      END
    ),
    'chart_data', v_chart,
    'timezone', 'Asia/Aden',
    'window_days', 7,
    'generated_at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_operational_stats()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_operational_stats()
  TO authenticated;
