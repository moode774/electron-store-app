-- =============================================================
-- تصليب دالة place_order (دفاع في العمق مع trigger حراسة الطلبات)
-- (مُطبَّقة على المشروع البعيد بتاريخ 2026-07-10)
--
-- تضيف نفس فحوص توفّر المتجر (معتمد + مفعّل + مفتوح) داخل الدالة،
-- بالإضافة إلى التحقق أن كل منتج يخصّ هذا المتجر تحديداً ومفعّل —
-- يمنع حقن منتجات متجر آخر في طلب موجّه لمتجر مختلف.
-- =============================================================

CREATE OR REPLACE FUNCTION public.place_order(p_merchant_id uuid, p_address_id uuid, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_order uuid; v_no text; v_delivery numeric := 0; v_coupon uuid := NULL;
  it jsonb; v_pid uuid; v_vid uuid; v_qty int; v_avail int; v_total numeric; v_disc numeric;
  c RECORD; m RECORD;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = p_address_id AND user_id = v_customer) THEN
    RAISE EXCEPTION 'INVALID_ADDRESS'; END IF;

  SELECT is_approved, is_active, is_open INTO m FROM public.merchant_profiles WHERE id = p_merchant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;
  IF NOT COALESCE(m.is_approved, false) OR NOT COALESCE(m.is_active, true) THEN
    RAISE EXCEPTION 'MERCHANT_UNAVAILABLE'; END IF;
  IF NOT COALESCE(m.is_open, true) THEN RAISE EXCEPTION 'MERCHANT_CLOSED'; END IF;

  BEGIN
    SELECT COALESCE((value#>>'{}')::numeric,0) INTO v_delivery FROM public.platform_settings WHERE key='delivery_fee';
  EXCEPTION WHEN OTHERS THEN v_delivery := 0; END;
  v_delivery := COALESCE(v_delivery,0);

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code))>0 THEN
    SELECT * INTO c FROM public.coupons WHERE code = upper(trim(p_coupon_code)) AND is_active = true;
    IF FOUND
       AND (c.start_date IS NULL OR c.start_date <= now())
       AND (c.end_date  IS NULL OR c.end_date  >= now())
       AND (c.usage_limit IS NULL OR c.usage_count < c.usage_limit)
       AND (c.per_user_limit IS NULL OR
            (SELECT count(*) FROM public.coupon_usage WHERE coupon_id=c.id AND user_id=v_customer) < c.per_user_limit)
    THEN v_coupon := c.id; END IF;
  END IF;

  v_no := 'ORD-' || to_char(now(),'YYMMDD') || '-' || substr(md5(random()::text),1,6);
  INSERT INTO public.orders(order_number, customer_id, merchant_id, address_id,
    subtotal, delivery_fee, discount_amount, tax_amount, total_amount,
    payment_method, status, payment_status, coupon_id, notes)
  VALUES (v_no, v_customer, p_merchant_id, p_address_id,
    0, v_delivery, 0, 0, 0, p_payment_method, 'pending', 'pending', v_coupon, p_notes)
  RETURNING id INTO v_order;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (it->>'product_id')::uuid;
    v_vid := NULLIF(it->>'variant_id','')::uuid;
    v_qty := GREATEST(1, COALESCE((it->>'quantity')::int,1));

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=v_pid AND merchant_id=p_merchant_id AND is_active=true) THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', v_pid; END IF;

    IF v_vid IS NOT NULL THEN
      SELECT stock_qty INTO v_avail FROM public.product_variants WHERE id=v_vid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN RAISE EXCEPTION 'OUT_OF_STOCK_VARIANT:%', v_vid; END IF;
      UPDATE public.product_variants SET stock_qty = stock_qty - v_qty WHERE id=v_vid;
    ELSE
      SELECT stock_quantity INTO v_avail FROM public.products WHERE id=v_pid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN RAISE EXCEPTION 'OUT_OF_STOCK:%', v_pid; END IF;
    END IF;
    UPDATE public.products SET stock_quantity = GREATEST(0, stock_quantity - v_qty),
           total_sold = COALESCE(total_sold,0) + v_qty WHERE id=v_pid;
    INSERT INTO public.order_items(order_id, product_id, variant_id, quantity, unit_price, total_price, product_name)
    VALUES (v_order, v_pid, v_vid, v_qty, 0, 0, COALESCE(it->>'product_name',''));
  END LOOP;

  SELECT total_amount, discount_amount INTO v_total, v_disc FROM public.orders WHERE id=v_order;
  IF v_coupon IS NOT NULL AND COALESCE(v_disc,0) > 0 THEN
    INSERT INTO public.coupon_usage(coupon_id, user_id, order_id) VALUES (v_coupon, v_customer, v_order);
    UPDATE public.coupons SET usage_count = COALESCE(usage_count,0)+1 WHERE id=v_coupon;
  END IF;

  RETURN jsonb_build_object('id', v_order, 'order_number', v_no, 'total', v_total);
END $function$;
