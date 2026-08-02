-- تقرير مبيعات التاجر في استدعاء واحد (رسم بياني + إحصاءات فترة + أفضل المنتجات)
-- إضافة جديدة فقط: لا تعدّل أي كائن موجود. التاجر يُستنتج من auth.uid() حصراً.
CREATE FUNCTION public.merchant_sales_report(p_days integer DEFAULT 7)
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT mp.id INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.user_id = v_user;
  IF v_merchant IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_NOT_FOUND'; END IF;

  v_chart_start := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_current_cut := now() - make_interval(days => v_days);
  v_prev_start  := now() - make_interval(days => v_days * 2);

  -- الرسم البياني اليومي: مبيعات الطلبات المسلّمة لكل يوم من الفترة
  SELECT COALESCE(jsonb_agg(t.day_total ORDER BY t.day_idx), '[]'::jsonb)
  INTO v_chart
  FROM (
    SELECT gs.day_idx,
           COALESCE(SUM(o.total_amount), 0) AS day_total
    FROM generate_series(0, v_days - 1) AS gs(day_idx)
    LEFT JOIN public.orders AS o
      ON o.merchant_id = v_merchant
     AND o.status = 'delivered'
     AND o.created_at >= v_chart_start + make_interval(days => gs.day_idx)
     AND o.created_at <  v_chart_start + make_interval(days => gs.day_idx + 1)
    GROUP BY gs.day_idx
  ) AS t;

  -- إحصاءات الفترة الحالية مقابل الفترة السابقة المساوية لها
  SELECT jsonb_build_object(
    'current_revenue',   COALESCE(SUM(o.total_amount) FILTER (WHERE o.created_at >= v_current_cut AND o.status = 'delivered'), 0),
    'previous_revenue',  COALESCE(SUM(o.total_amount) FILTER (WHERE o.created_at <  v_current_cut AND o.status = 'delivered'), 0),
    'current_orders',    COUNT(*) FILTER (WHERE o.created_at >= v_current_cut),
    'previous_orders',   COUNT(*) FILTER (WHERE o.created_at <  v_current_cut),
    'delivered_count',   COUNT(*) FILTER (WHERE o.created_at >= v_current_cut AND o.status = 'delivered'),
    'cancelled_count',   COUNT(*) FILTER (WHERE o.created_at >= v_current_cut AND o.status = 'cancelled'),
    'in_progress_count', COUNT(*) FILTER (WHERE o.created_at >= v_current_cut AND o.status NOT IN ('delivered', 'cancelled'))
  )
  INTO v_stats
  FROM public.orders AS o
  WHERE o.merchant_id = v_merchant
    AND o.created_at >= v_prev_start;

  -- أفضل المنتجات من عناصر الطلبات الفعلية للفترة (باستبعاد الملغي والمرتجع)
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT COALESCE(oi.product_id::text, oi.product_name, 'unknown') AS id,
           COALESCE(MAX(oi.product_name), 'منتج') AS name,
           COALESCE(SUM(oi.quantity), 0)::integer AS total_sold,
           COALESCE(SUM(oi.total_price), 0) AS revenue,
           MAX(p.og_image_url) AS og_image_url
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    LEFT JOIN public.products AS p ON p.id = oi.product_id
    WHERE o.merchant_id = v_merchant
      AND o.status NOT IN ('cancelled', 'returned')
      AND o.created_at >= v_current_cut
    GROUP BY COALESCE(oi.product_id::text, oi.product_name, 'unknown')
    ORDER BY revenue DESC
    LIMIT 5
  ) AS t;

  RETURN jsonb_build_object('chart', v_chart, 'stats', v_stats, 'top_products', v_top);
END;
$function$;

REVOKE ALL ON FUNCTION public.merchant_sales_report(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_sales_report(integer) TO authenticated;
