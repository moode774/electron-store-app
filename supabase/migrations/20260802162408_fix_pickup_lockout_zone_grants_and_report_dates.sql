-- ============================================================
-- 1) الحظر لم يكن يعمل: RAISE يُلغي تحديث العدّاد في نفس الاستدعاء.
--    الحل: إعادة نتيجة (jsonb) بدل رفع استثناء في حالة الكود الخاطئ،
--    فيُحفظ العدّاد فعلياً ويسري القفل.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_order_pickup(p_order_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_row public.order_pickup_codes%ROWTYPE;
  v_input text := NULLIF(trim(COALESCE(p_code, '')), '');
  v_attempts integer;
  v_locked timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_profiles AS dp
    WHERE dp.id = v_order.delivery_id AND dp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'NOT_ASSIGNED_DELIVERY';
  END IF;
  IF v_order.status = 'picked_up' THEN
    RETURN jsonb_build_object('ok', true, 'id', v_order.id, 'status', v_order.status, 'idempotent_replay', true);
  END IF;
  IF v_order.status <> 'assigned' THEN RAISE EXCEPTION 'ORDER_NOT_ASSIGNED'; END IF;

  SELECT c.* INTO v_row
  FROM public.order_pickup_codes AS c
  WHERE c.order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.order_pickup_codes (order_id, code)
    VALUES (p_order_id, public.generate_pickup_code())
    ON CONFLICT (order_id) DO NOTHING;
    RETURN jsonb_build_object('ok', false, 'error', 'PICKUP_CODE_NOT_ISSUED');
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PICKUP_CODE_LOCKED', 'locked_until', v_row.locked_until);
  END IF;

  -- القفل انتهى: صفّر العدّاد قبل احتساب محاولة جديدة
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until <= now() THEN
    UPDATE public.order_pickup_codes
    SET failed_attempts = 0, locked_until = NULL
    WHERE order_id = p_order_id;
    v_row.failed_attempts := 0;
  END IF;

  IF v_input IS NULL OR v_input IS DISTINCT FROM v_row.code THEN
    v_attempts := v_row.failed_attempts + 1;
    v_locked := CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;
    UPDATE public.order_pickup_codes
    SET failed_attempts = v_attempts, locked_until = COALESCE(v_locked, locked_until)
    WHERE order_id = p_order_id;
    -- لا RAISE هنا حتى لا يتراجع التحديث
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_locked IS NOT NULL THEN 'PICKUP_CODE_LOCKED' ELSE 'INVALID_PICKUP_CODE' END,
      'attempts_left', GREATEST(0, 5 - v_attempts),
      'locked_until', v_locked
    );
  END IF;

  UPDATE public.order_pickup_codes
  SET failed_attempts = 0, locked_until = NULL
  WHERE order_id = p_order_id;

  RETURN public.marketplace_transition_order_as(p_order_id, v_user, 'picked_up', NULL)
         || jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_order_pickup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_pickup(uuid, text) TO authenticated;

-- ============================================================
-- 2) رسوم التوصيل: السياسة موجودة لكن صلاحية الجدول غائبة، فالقراءة تفشل.
--    الرسوم بيانات عامة (يعرضها السيرفر في الطلب أصلاً).
-- ============================================================
GRANT SELECT ON public.delivery_zones TO anon, authenticated;

-- ============================================================
-- 3) صور المنتجات: إغلاق الكتابة المباشرة وإتاحة تحديث المعرض عبر RPC ذرّية
-- ============================================================
DROP POLICY IF EXISTS product_images_merchant_insert ON public.product_images;
DROP POLICY IF EXISTS product_images_merchant_update ON public.product_images;
DROP POLICY IF EXISTS product_images_merchant_delete ON public.product_images;
REVOKE INSERT, UPDATE, DELETE ON public.product_images FROM anon, authenticated;

CREATE FUNCTION public.set_product_images(p_product_id uuid, p_image_urls jsonb)
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

-- ============================================================
-- 4) تقرير المبيعات: الإيراد على تاريخ التسليم لا الإنشاء، وأفضل المنتجات
--    من الطلبات المسلَّمة فقط (لا طلبات قيد التنفيذ)
-- ============================================================
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

  SELECT mp.id INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.user_id = v_user;
  IF v_merchant IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_NOT_FOUND'; END IF;

  v_chart_start := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_current_cut := now() - make_interval(days => v_days);
  v_prev_start  := now() - make_interval(days => v_days * 2);

  -- المبيعات تُنسب إلى يوم التسليم (أو التسوية) لا يوم إنشاء الطلب
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

  -- أفضل المنتجات: من الطلبات المسلَّمة فقط وبتاريخ التسليم
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
