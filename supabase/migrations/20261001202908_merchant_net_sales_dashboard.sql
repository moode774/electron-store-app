-- Net sales use delivery dates in Asia/Aden; completed refunds restate the sale.
-- Product refunds are allocated proportionally; sold quantities are gross delivered units.
CREATE OR REPLACE FUNCTION public.merchant_sales_report(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_merchant uuid;
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 7), 365));
  v_chart_start timestamptz;
  v_current_cut timestamptz;
  v_prev_start timestamptz;
  v_chart jsonb;
  v_stats jsonb;
  v_top jsonb;
  v_dashboard jsonb;
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Aden') AT TIME ZONE 'Asia/Aden';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_merchant_profile_operational() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;

  SELECT mp.id INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.user_id = v_user;
  IF v_merchant IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_NOT_FOUND'; END IF;

  v_chart_start := v_today - make_interval(days => v_days - 1);
  v_current_cut := now() - make_interval(days => v_days);
  v_prev_start  := now() - make_interval(days => v_days * 2);

  SELECT COALESCE(jsonb_agg(t.day_total ORDER BY t.day_idx), '[]'::jsonb)
  INTO v_chart
  FROM (
    SELECT gs.day_idx,
           COALESCE(SUM(GREATEST(COALESCE(o.total_amount, 0) - COALESCE((SELECT SUM(r.refund_amount) FROM public.refund_requests r WHERE r.order_id = o.id AND r.status = 'completed'), 0), 0)), 0) AS day_total
    FROM generate_series(0, v_days - 1) AS gs(day_idx)
    LEFT JOIN public.orders AS o
      ON o.merchant_id = v_merchant
     AND o.status IN ('delivered', 'returned')
     AND o.delivered_at >= v_chart_start + make_interval(days => gs.day_idx)
     AND o.delivered_at <  v_chart_start + make_interval(days => gs.day_idx + 1)
    GROUP BY gs.day_idx
  ) AS t;

  SELECT jsonb_build_object(
    'current_revenue', COALESCE((
      SELECT SUM(GREATEST(COALESCE(o.total_amount, 0) - COALESCE((SELECT SUM(r.refund_amount) FROM public.refund_requests r WHERE r.order_id = o.id AND r.status = 'completed'), 0), 0)) FROM public.orders AS o
      WHERE o.merchant_id = v_merchant AND o.status IN ('delivered', 'returned')
        AND o.delivered_at >= v_current_cut), 0),
    'previous_revenue', COALESCE((
      SELECT SUM(GREATEST(COALESCE(o.total_amount, 0) - COALESCE((SELECT SUM(r.refund_amount) FROM public.refund_requests r WHERE r.order_id = o.id AND r.status = 'completed'), 0), 0)) FROM public.orders AS o
      WHERE o.merchant_id = v_merchant AND o.status IN ('delivered', 'returned')
        AND o.delivered_at >= v_prev_start
        AND o.delivered_at <  v_current_cut), 0),
    'current_orders',    COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut),
    'previous_orders',   COUNT(*) FILTER (WHERE o2.created_at <  v_current_cut),
    'delivered_count',   COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut AND o2.status = 'delivered'),
    'cancelled_count',   COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut AND o2.status = 'cancelled'),
    'in_progress_count', COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut AND o2.status NOT IN ('delivered', 'cancelled', 'returned', 'failed_delivery'))
  )
  INTO v_stats
  FROM public.orders AS o2
  WHERE o2.merchant_id = v_merchant
    AND o2.created_at >= v_prev_start;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT COALESCE(oi.product_id::text, oi.product_name, 'unknown') AS id,
           COALESCE(MAX(oi.product_name), 'منتج') AS name,
           COALESCE(SUM(oi.quantity), 0)::integer AS total_sold,
           COALESCE(SUM(oi.total_price * CASE WHEN o.total_amount > 0 THEN (GREATEST(COALESCE(o.total_amount, 0) - COALESCE((SELECT SUM(r.refund_amount) FROM public.refund_requests r WHERE r.order_id = o.id AND r.status = 'completed'), 0), 0)) / o.total_amount ELSE 0 END), 0) AS revenue,
           MAX(p.og_image_url) AS og_image_url
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    LEFT JOIN public.products AS p ON p.id = oi.product_id
    WHERE o.merchant_id = v_merchant
      AND o.status = 'delivered'
      AND o.delivered_at >= v_current_cut
    GROUP BY COALESCE(oi.product_id::text, oi.product_name, 'unknown')
    ORDER BY revenue DESC
    LIMIT 5
  ) AS t;

  SELECT jsonb_build_object(
    'today_orders', COUNT(*) FILTER (WHERE o.created_at >= v_today),
    'today_revenue', COALESCE(SUM(GREATEST(COALESCE(o.total_amount, 0) - COALESCE((SELECT SUM(r.refund_amount) FROM public.refund_requests r WHERE r.order_id = o.id AND r.status = 'completed'), 0), 0)) FILTER (
      WHERE o.status IN ('delivered', 'returned') AND o.delivered_at >= v_today), 0),
    'pending_orders', COUNT(*) FILTER (WHERE o.status = 'pending'),
    'total_products', (SELECT COUNT(*) FROM public.products p
                       WHERE p.merchant_id = v_merchant AND p.is_active IS TRUE)
  ) INTO v_dashboard
  FROM public.orders o WHERE o.merchant_id = v_merchant;
  RETURN jsonb_build_object('merchant_id', v_merchant, 'timezone', 'Asia/Aden',
    'chart', v_chart, 'stats', v_stats, 'top_products', v_top, 'dashboard', v_dashboard);
END;
$function$;

REVOKE ALL ON FUNCTION public.merchant_sales_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_sales_report(integer) TO authenticated;
