-- 1) دالة المحفّز يجب ألّا تُستدعى مباشرة عبر REST من أي دور
REVOKE ALL ON FUNCTION public.ensure_pickup_code_on_ready() FROM PUBLIC, anon, authenticated;

-- 2) التحقق من أن حساب التاجر ما زال نشطًا وغير موقوف في الدوال التي أغفلته
CREATE OR REPLACE FUNCTION public.set_product_images(p_product_id uuid, p_image_urls jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
  v_primary text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS p
    JOIN public.merchant_profiles AS mp ON mp.id = p.merchant_id
    WHERE p.id = p_product_id AND mp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;
  IF p_image_urls IS NULL OR jsonb_typeof(p_image_urls) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_IMAGE_LIST';
  END IF;
  v_count := jsonb_array_length(p_image_urls);
  IF v_count > 10 THEN RAISE EXCEPTION 'TOO_MANY_IMAGES'; END IF;

  DELETE FROM public.product_images WHERE product_id = p_product_id;
  IF v_count > 0 THEN
    INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order)
    SELECT p_product_id, img.url, img.idx = 0, img.idx
    FROM (
      SELECT NULLIF(trim(e.value #>> '{}'), '') AS url, (e.ordinality - 1)::integer AS idx
      FROM jsonb_array_elements(p_image_urls) WITH ORDINALITY AS e(value, ordinality)
    ) AS img
    WHERE img.url IS NOT NULL;
  END IF;

  v_primary := NULLIF(trim(COALESCE(p_image_urls ->> 0, '')), '');
  UPDATE public.products SET og_image_url = v_primary WHERE id = p_product_id;

  RETURN jsonb_build_object('id', p_product_id, 'images', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_product_images(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_images(uuid, jsonb) TO authenticated;

-- التقرير: يقرأ بيانات مالية، فيجب أن يتوقف إن كان الحساب موقوفًا
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;

  SELECT mp.id INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.user_id = v_user;
  IF v_merchant IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_NOT_FOUND'; END IF;

  v_chart_start := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_current_cut := now() - make_interval(days => v_days);
  v_prev_start  := now() - make_interval(days => v_days * 2);

  SELECT COALESCE(jsonb_agg(t.day_total ORDER BY t.day_idx), '[]'::jsonb)
  INTO v_chart
  FROM (
    SELECT gs.day_idx,
           COALESCE(SUM(o.total_amount), 0) AS day_total
    FROM generate_series(0, v_days - 1) AS gs(day_idx)
    LEFT JOIN public.orders AS o
      ON o.merchant_id = v_merchant
     AND o.status = 'delivered'
     AND COALESCE(o.delivered_at, o.settled_at, o.created_at) >= v_chart_start + make_interval(days => gs.day_idx)
     AND COALESCE(o.delivered_at, o.settled_at, o.created_at) <  v_chart_start + make_interval(days => gs.day_idx + 1)
    GROUP BY gs.day_idx
  ) AS t;

  SELECT jsonb_build_object(
    'current_revenue', COALESCE((
      SELECT SUM(o.total_amount) FROM public.orders AS o
      WHERE o.merchant_id = v_merchant AND o.status = 'delivered'
        AND COALESCE(o.delivered_at, o.settled_at, o.created_at) >= v_current_cut), 0),
    'previous_revenue', COALESCE((
      SELECT SUM(o.total_amount) FROM public.orders AS o
      WHERE o.merchant_id = v_merchant AND o.status = 'delivered'
        AND COALESCE(o.delivered_at, o.settled_at, o.created_at) >= v_prev_start
        AND COALESCE(o.delivered_at, o.settled_at, o.created_at) <  v_current_cut), 0),
    'current_orders',    COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut),
    'previous_orders',   COUNT(*) FILTER (WHERE o2.created_at <  v_current_cut),
    'delivered_count',   COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut AND o2.status = 'delivered'),
    'cancelled_count',   COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut AND o2.status = 'cancelled'),
    'in_progress_count', COUNT(*) FILTER (WHERE o2.created_at >= v_current_cut AND o2.status NOT IN ('delivered', 'cancelled'))
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
           COALESCE(SUM(oi.total_price), 0) AS revenue,
           MAX(p.og_image_url) AS og_image_url
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    LEFT JOIN public.products AS p ON p.id = oi.product_id
    WHERE o.merchant_id = v_merchant
      AND o.status = 'delivered'
      AND COALESCE(o.delivered_at, o.settled_at, o.created_at) >= v_current_cut
    GROUP BY COALESCE(oi.product_id::text, oi.product_name, 'unknown')
    ORDER BY revenue DESC
    LIMIT 5
  ) AS t;

  RETURN jsonb_build_object('chart', v_chart, 'stats', v_stats, 'top_products', v_top);
END;
$function$;

REVOKE ALL ON FUNCTION public.merchant_sales_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_sales_report(integer) TO authenticated;
