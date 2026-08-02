-- ============================================================
-- 1) إنشاء المنتج مع صوره في معاملة واحدة ذرّية
--    إمّا يُنشأ المنتج بكل صوره أو لا يُنشأ شيء — لا منتج ناقص الصور.
-- ============================================================
CREATE FUNCTION public.create_product_with_images(
  p_name text,
  p_base_price numeric,
  p_description text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_sale_price numeric DEFAULT NULL,
  p_stock_quantity integer DEFAULT 0,
  p_is_active boolean DEFAULT true,
  p_image_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_merchant uuid;
  v_product_id uuid;
  v_name text := NULLIF(trim(COALESCE(p_name, '')), '');
  v_stock integer := COALESCE(p_stock_quantity, 0);
  v_count integer;
  v_primary text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;

  SELECT mp.id INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.user_id = v_user;
  IF v_merchant IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_NOT_FOUND'; END IF;

  IF v_name IS NULL THEN RAISE EXCEPTION 'PRODUCT_NAME_REQUIRED'; END IF;
  IF p_base_price IS NULL OR p_base_price < 0 THEN RAISE EXCEPTION 'INVALID_BASE_PRICE'; END IF;
  IF p_sale_price IS NOT NULL AND (p_sale_price < 0 OR p_sale_price > p_base_price) THEN
    RAISE EXCEPTION 'INVALID_SALE_PRICE';
  END IF;
  IF v_stock < 0 THEN RAISE EXCEPTION 'INVALID_STOCK'; END IF;
  IF p_image_urls IS NULL OR jsonb_typeof(p_image_urls) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_IMAGE_LIST';
  END IF;
  v_count := jsonb_array_length(p_image_urls);
  IF v_count > 10 THEN RAISE EXCEPTION 'TOO_MANY_IMAGES'; END IF;
  IF p_category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.categories AS c WHERE c.id = p_category_id) THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND';
  END IF;

  v_primary := NULLIF(trim(COALESCE(p_image_urls ->> 0, '')), '');

  INSERT INTO public.products (
    merchant_id, name, description, base_price, sale_price,
    category_id, stock_quantity, is_active, og_image_url
  )
  VALUES (
    v_merchant, v_name, NULLIF(trim(COALESCE(p_description, '')), ''),
    p_base_price, p_sale_price, p_category_id, v_stock,
    COALESCE(p_is_active, true), v_primary
  )
  RETURNING id INTO v_product_id;

  -- الصور ضمن المعاملة نفسها: أي فشل هنا يُرجِع إنشاء المنتج بالكامل
  IF v_count > 0 THEN
    INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order)
    SELECT v_product_id, img.url, img.idx = 0, img.idx
    FROM (
      SELECT NULLIF(trim(e.value #>> '{}'), '') AS url, (e.ordinality - 1)::integer AS idx
      FROM jsonb_array_elements(p_image_urls) WITH ORDINALITY AS e(value, ordinality)
    ) AS img
    WHERE img.url IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('id', v_product_id, 'images', v_count);
END;
$function$;

-- ============================================================
-- 2) كوبونات التاجر عبر RPC مع تحقق من القيم ومنع الحقول غير المسموحة
-- ============================================================
CREATE FUNCTION public.merchant_create_coupon(
  p_code text,
  p_type text,
  p_value numeric,
  p_min_order_amount numeric DEFAULT NULL,
  p_max_discount_amount numeric DEFAULT NULL,
  p_max_uses integer DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_merchant uuid;
  v_code text := upper(NULLIF(trim(COALESCE(p_code, '')), ''));
  v_type text := lower(NULLIF(trim(COALESCE(p_type, '')), ''));
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  SELECT mp.id INTO v_merchant FROM public.merchant_profiles AS mp WHERE mp.user_id = v_user;
  IF v_merchant IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROFILE_NOT_FOUND'; END IF;

  IF v_code IS NULL OR length(v_code) < 3 OR length(v_code) > 32 THEN RAISE EXCEPTION 'INVALID_COUPON_CODE'; END IF;
  IF v_code !~ '^[A-Z0-9_-]+$' THEN RAISE EXCEPTION 'INVALID_COUPON_CODE_FORMAT'; END IF;
  IF v_type NOT IN ('percentage', 'fixed') THEN RAISE EXCEPTION 'INVALID_COUPON_TYPE'; END IF;
  IF p_value IS NULL OR p_value <= 0 THEN RAISE EXCEPTION 'INVALID_COUPON_VALUE'; END IF;
  IF v_type = 'percentage' AND p_value > 100 THEN RAISE EXCEPTION 'PERCENTAGE_ABOVE_100'; END IF;
  IF p_min_order_amount IS NOT NULL AND p_min_order_amount < 0 THEN RAISE EXCEPTION 'INVALID_MIN_ORDER'; END IF;
  IF p_max_discount_amount IS NOT NULL AND p_max_discount_amount <= 0 THEN RAISE EXCEPTION 'INVALID_MAX_DISCOUNT'; END IF;
  IF p_max_uses IS NOT NULL AND p_max_uses <= 0 THEN RAISE EXCEPTION 'INVALID_MAX_USES'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date <= now() THEN RAISE EXCEPTION 'END_DATE_IN_PAST'; END IF;
  IF EXISTS (SELECT 1 FROM public.coupons AS c WHERE upper(c.code) = v_code) THEN
    RAISE EXCEPTION 'COUPON_CODE_TAKEN';
  END IF;

  INSERT INTO public.coupons (
    merchant_id, code, type, value, min_order_amount,
    max_discount_amount, max_uses, end_date, is_active
  )
  VALUES (
    v_merchant, v_code, v_type, p_value, p_min_order_amount,
    p_max_discount_amount, p_max_uses, p_end_date, true
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END;
$function$;

-- التعديل: الحقول المسموحة فقط (لا تغيير للكود أو المتجر أو عدّادات الاستخدام)
CREATE FUNCTION public.merchant_update_coupon(
  p_id uuid,
  p_is_active boolean DEFAULT NULL,
  p_min_order_amount numeric DEFAULT NULL,
  p_max_discount_amount numeric DEFAULT NULL,
  p_max_uses integer DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owned boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.coupons AS c
    JOIN public.merchant_profiles AS mp ON mp.id = c.merchant_id
    WHERE c.id = p_id AND mp.user_id = v_user
  ) INTO v_owned;
  IF NOT v_owned THEN RAISE EXCEPTION 'COUPON_NOT_FOUND'; END IF;

  IF p_min_order_amount IS NOT NULL AND p_min_order_amount < 0 THEN RAISE EXCEPTION 'INVALID_MIN_ORDER'; END IF;
  IF p_max_discount_amount IS NOT NULL AND p_max_discount_amount <= 0 THEN RAISE EXCEPTION 'INVALID_MAX_DISCOUNT'; END IF;
  IF p_max_uses IS NOT NULL AND p_max_uses <= 0 THEN RAISE EXCEPTION 'INVALID_MAX_USES'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date <= now() THEN RAISE EXCEPTION 'END_DATE_IN_PAST'; END IF;

  UPDATE public.coupons AS c
  SET is_active           = COALESCE(p_is_active, c.is_active),
      min_order_amount    = COALESCE(p_min_order_amount, c.min_order_amount),
      max_discount_amount = COALESCE(p_max_discount_amount, c.max_discount_amount),
      max_uses            = COALESCE(p_max_uses, c.max_uses),
      end_date            = COALESCE(p_end_date, c.end_date)
  WHERE c.id = p_id;
END;
$function$;

CREATE FUNCTION public.merchant_delete_coupon(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owned boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.coupons AS c
    JOIN public.merchant_profiles AS mp ON mp.id = c.merchant_id
    WHERE c.id = p_id AND mp.user_id = v_user
  ) INTO v_owned;
  IF NOT v_owned THEN RAISE EXCEPTION 'COUPON_NOT_FOUND'; END IF;

  -- كوبون استُخدم في طلبات سابقة يُعطَّل بدل حذفه حفاظًا على سلامة السجلات
  IF EXISTS (SELECT 1 FROM public.orders AS o WHERE o.coupon_id = p_id) THEN
    UPDATE public.coupons SET is_active = false WHERE id = p_id;
    RETURN;
  END IF;

  DELETE FROM public.coupons WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_product_with_images(text, numeric, text, uuid, numeric, integer, boolean, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merchant_create_coupon(text, text, numeric, numeric, numeric, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merchant_update_coupon(uuid, boolean, numeric, numeric, integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merchant_delete_coupon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_images(text, numeric, text, uuid, numeric, integer, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_create_coupon(text, text, numeric, numeric, numeric, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_update_coupon(uuid, boolean, numeric, numeric, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_delete_coupon(uuid) TO authenticated;
