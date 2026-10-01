-- Configurable city coverage. Fees are evaluated per merchant order after coupons.
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS zone_name text,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric
    CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0);

CREATE UNIQUE INDEX delivery_zones_platform_city_uq
  ON public.delivery_zones (lower(btrim(city))) WHERE merchant_id IS NULL;

INSERT INTO public.delivery_zones
  (name, zone_name, city, delivery_fee, min_order_amount, free_delivery_threshold, is_active, delivery_available)
SELECT city, city, city, 1500, 0, 14000, true, true
FROM (VALUES ('تعز'), ('صنعاء'), ('عدن')) AS configured(city)
WHERE NOT EXISTS (
  SELECT 1 FROM public.delivery_zones z
  WHERE z.merchant_id IS NULL AND lower(btrim(z.city)) = lower(btrim(configured.city))
);

-- All pricing/coverage edits go through the audited admin operation.
REVOKE INSERT, UPDATE, DELETE ON public.delivery_zones FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_delivery_zones()
RETURNS TABLE(id uuid, city text, zone_name text, delivery_fee numeric,
  free_delivery_threshold numeric, min_order_amount numeric, is_active boolean,
  delivery_available boolean, merchant_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.marketplace_actor_role(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  RETURN QUERY SELECT z.id, z.city, COALESCE(z.zone_name, z.name, z.city),
    z.delivery_fee, z.free_delivery_threshold, z.min_order_amount,
    z.is_active, z.delivery_available, z.merchant_id
  FROM public.delivery_zones z WHERE z.merchant_id IS NULL ORDER BY z.city, z.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_delivery_zone(
  p_id uuid, p_city text, p_delivery_fee numeric, p_free_delivery_threshold numeric,
  p_min_order_amount numeric, p_is_active boolean, p_delivery_available boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_city text := btrim(p_city);
  v_before public.delivery_zones%ROWTYPE;
  v_after public.delivery_zones%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR public.marketplace_actor_role(v_actor) <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  IF v_city IS NULL OR length(v_city) < 2 OR length(v_city) > 80
     OR p_delivery_fee IS NULL OR p_delivery_fee < 0 OR p_delivery_fee > 1000000
     OR p_min_order_amount IS NULL OR p_min_order_amount < 0 OR p_min_order_amount > 100000000
     OR (p_free_delivery_threshold IS NOT NULL AND (p_free_delivery_threshold < 0 OR p_free_delivery_threshold > 100000000))
     OR p_is_active IS NULL OR p_delivery_available IS NULL THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_ZONE';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.delivery_zones (name, zone_name, city, delivery_fee,
      free_delivery_threshold, min_order_amount, is_active, delivery_available)
    VALUES (v_city, v_city, v_city, p_delivery_fee, p_free_delivery_threshold,
      p_min_order_amount, p_is_active, p_delivery_available) RETURNING * INTO v_after;
  ELSE
    SELECT * INTO v_before FROM public.delivery_zones z
      WHERE z.id = p_id AND z.merchant_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_ZONE_NOT_FOUND'; END IF;
    UPDATE public.delivery_zones SET name=v_city, zone_name=v_city, city=v_city,
      delivery_fee=p_delivery_fee, free_delivery_threshold=p_free_delivery_threshold,
      min_order_amount=p_min_order_amount, is_active=p_is_active,
      delivery_available=p_delivery_available WHERE id=p_id RETURNING * INTO v_after;
  END IF;
  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (v_actor, 'delivery_zone_saved', 'delivery_zone', v_after.id,
    jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after)));
  RETURN to_jsonb(v_after);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_delivery_zones() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_delivery_zone(uuid,text,numeric,numeric,numeric,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_delivery_zones() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_delivery_zone(uuid,text,numeric,numeric,numeric,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_order(
  p_merchant_id uuid,
  p_address_id uuid,
  p_payment_method text,
  p_items jsonb,
  p_coupon_code text,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer uuid := auth.uid();
  v_actor_role text;
  v_request_hash text;
  v_existing public.orders%ROWTYPE;
  v_address public.addresses%ROWTYPE;
  v_merchant public.merchant_profiles%ROWTYPE;
  v_merchant_user public.users%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_zone record;
  v_item jsonb;
  v_validated_items jsonb := '[]'::jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_variant_price numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_minimum numeric := 0;
  v_discount numeric := 0;
  v_tax_rate numeric := 0;
  v_commission_rate numeric := 0;
  v_tax numeric := 0;
  v_commission numeric := 0;
  v_total numeric := 0;
  v_coupon_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_actor_role := public.marketplace_actor_role(v_customer);
  IF v_actor_role <> 'customer' THEN RAISE EXCEPTION 'CUSTOMER_ROLE_REQUIRED'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF lower(trim(COALESCE(p_payment_method, ''))) <> 'cash' THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_UNAVAILABLE';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'TOO_MANY_ITEMS'; END IF;
  IF length(COALESCE(p_notes, '')) > 2000 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(value)
    GROUP BY e.value ->> 'product_id', COALESCE(e.value ->> 'variant_id', '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ITEM';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'merchant_id', p_merchant_id,
    'address_id', p_address_id,
    'payment_method', lower(trim(p_payment_method)),
    'items', p_items,
    'coupon_code', upper(NULLIF(trim(COALESCE(p_coupon_code, '')), '')),
    'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
  )::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_customer::text || ':' || p_idempotency_key::text, 0)
  );

  SELECT o.* INTO v_existing
  FROM public.orders AS o
  WHERE o.customer_id = v_customer AND o.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    PERFORM public.marketplace_notify_order_event(
      v_existing.id, 'order-created:' || p_idempotency_key::text, 'pending'
    );
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'total', v_existing.total_amount,
      'idempotent_replay', true
    );
  END IF;

  SELECT a.* INTO v_address
  FROM public.addresses AS a
  WHERE a.id = p_address_id AND a.user_id = v_customer
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ADDRESS'; END IF;

  SELECT mp.* INTO v_merchant
  FROM public.merchant_profiles AS mp
  WHERE mp.id = p_merchant_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;

  SELECT u.* INTO v_merchant_user
  FROM public.users AS u
  WHERE u.id = v_merchant.user_id
  FOR SHARE;
  IF NOT FOUND
     OR NOT COALESCE(v_merchant_user.is_active, true)
     OR public.is_user_blocked(v_merchant_user.id)
     OR NOT COALESCE(v_merchant.is_approved, false)
     OR NOT COALESCE(v_merchant.is_active, true) THEN
    RAISE EXCEPTION 'MERCHANT_UNAVAILABLE';
  END IF;
  IF NOT COALESCE(v_merchant.is_open, true) THEN RAISE EXCEPTION 'MERCHANT_CLOSED'; END IF;

  v_delivery_fee := GREATEST(0, public.marketplace_setting_numeric('delivery_fee', 0));
  v_minimum := GREATEST(0, public.marketplace_setting_numeric('min_order_amount', 0));
  SELECT dz.* INTO v_zone
  FROM public.delivery_zones AS dz
  WHERE (dz.merchant_id = p_merchant_id OR dz.merchant_id IS NULL)
    AND lower(COALESCE(dz.city, '')) = lower(COALESCE(v_address.city, ''))
  ORDER BY (dz.merchant_id IS NOT NULL) DESC, dz.id
  LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_AVAILABLE'; END IF;
  IF FOUND THEN
    IF NOT COALESCE(v_zone.is_active, false)
       OR NOT COALESCE(v_zone.delivery_available, false) THEN
      RAISE EXCEPTION 'DELIVERY_NOT_AVAILABLE';
    END IF;
    v_delivery_fee := GREATEST(0, COALESCE(v_zone.delivery_fee, v_delivery_fee));
    v_minimum := GREATEST(v_minimum, COALESCE(v_zone.min_order_amount, 0));
  END IF;

  -- Lock inventory in deterministic product/variant order to avoid deadlocks
  -- between two large concurrent carts.
  FOR v_item IN
    SELECT e.value
    FROM jsonb_array_elements(p_items) AS e(value)
    ORDER BY e.value ->> 'product_id', COALESCE(e.value ->> 'variant_id', '')
  LOOP
    BEGIN
      v_product_id := NULLIF(trim(v_item ->> 'product_id'), '')::uuid;
      v_variant_id := NULLIF(trim(COALESCE(v_item ->> 'variant_id', '')), '')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 100 THEN
      RAISE EXCEPTION 'INVALID_ITEM';
    END IF;

    SELECT p.* INTO v_product
    FROM public.products AS p
    WHERE p.id = v_product_id
      AND p.merchant_id = p_merchant_id
      AND COALESCE(p.is_active, false)
      AND COALESCE(p.is_approved, false)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', v_product_id; END IF;

    v_variant_price := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT pv.* INTO v_variant
      FROM public.product_variants AS pv
      WHERE pv.id = v_variant_id
        AND pv.product_id = v_product_id
        AND COALESCE(pv.is_active, false)
      FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_VARIANT:%', v_variant_id; END IF;
      IF COALESCE(v_variant.stock_qty, 0) < v_quantity THEN
        RAISE EXCEPTION 'OUT_OF_STOCK_VARIANT:%', v_variant_id;
      END IF;
      v_variant_price := COALESCE(NULLIF(v_variant.price_modifier, 0), v_variant.additional_price, 0);
      UPDATE public.product_variants
      SET stock_qty = stock_qty - v_quantity
      WHERE id = v_variant_id;
      UPDATE public.products
      SET total_sold = COALESCE(total_sold, 0) + v_quantity
      WHERE id = v_product_id;
    ELSE
      IF COALESCE(v_product.stock_quantity, 0) < v_quantity THEN
        RAISE EXCEPTION 'OUT_OF_STOCK:%', v_product_id;
      END IF;
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_quantity,
          total_sold = COALESCE(total_sold, 0) + v_quantity
      WHERE id = v_product_id;
    END IF;

    v_unit_price := GREATEST(
      0,
      COALESCE(v_product.sale_price, v_product.base_price, 0) + v_variant_price
    );
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);
    v_validated_items := v_validated_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'variant_id', v_variant_id,
      'quantity', v_quantity,
      'quantity_before', CASE
        WHEN v_variant_id IS NOT NULL THEN COALESCE(v_variant.stock_qty, 0)
        ELSE COALESCE(v_product.stock_quantity, 0)
      END,
      'quantity_after', CASE
        WHEN v_variant_id IS NOT NULL THEN COALESCE(v_variant.stock_qty, 0) - v_quantity
        ELSE COALESCE(v_product.stock_quantity, 0) - v_quantity
      END
    ));
  END LOOP;
  v_subtotal := round(v_subtotal, 2);
  IF v_subtotal < v_minimum THEN
    RAISE EXCEPTION 'MINIMUM_ORDER_NOT_MET:%', v_minimum;
  END IF;

  IF NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT c.* INTO v_coupon
    FROM public.coupons AS c
    WHERE upper(c.code) = upper(trim(p_coupon_code))
    FOR UPDATE;
    IF NOT FOUND OR NOT COALESCE(v_coupon.is_active, false) THEN
      RAISE EXCEPTION 'COUPON_INVALID';
    END IF;
    IF v_coupon.type NOT IN ('percentage', 'fixed') OR COALESCE(v_coupon.value, 0) <= 0 THEN
      RAISE EXCEPTION 'COUPON_TYPE_UNSUPPORTED';
    END IF;
    IF v_coupon.merchant_id IS NOT NULL AND v_coupon.merchant_id <> p_merchant_id THEN
      RAISE EXCEPTION 'COUPON_WRONG_MERCHANT';
    END IF;
    IF v_coupon.start_date IS NOT NULL AND v_coupon.start_date > now() THEN
      RAISE EXCEPTION 'COUPON_NOT_STARTED';
    END IF;
    IF v_coupon.end_date IS NOT NULL AND v_coupon.end_date < now() THEN
      RAISE EXCEPTION 'COUPON_EXPIRED';
    END IF;
    IF v_coupon.usage_limit IS NOT NULL
       AND COALESCE(v_coupon.usage_count, 0) >= v_coupon.usage_limit THEN
      RAISE EXCEPTION 'COUPON_EXHAUSTED';
    END IF;
    IF v_coupon.per_user_limit IS NOT NULL
       AND (
         SELECT count(*) FROM public.coupon_usage AS cu
         WHERE cu.coupon_id = v_coupon.id AND cu.user_id = v_customer
       ) >= v_coupon.per_user_limit THEN
      RAISE EXCEPTION 'COUPON_USER_LIMIT';
    END IF;
    IF v_coupon.min_order_amount IS NOT NULL AND v_subtotal < v_coupon.min_order_amount THEN
      RAISE EXCEPTION 'COUPON_MINIMUM_NOT_MET:%', v_coupon.min_order_amount;
    END IF;
    v_discount := CASE v_coupon.type
      WHEN 'percentage' THEN round(v_subtotal * v_coupon.value / 100, 2)
      ELSE v_coupon.value
    END;
    IF v_coupon.max_discount_amount IS NOT NULL THEN
      v_discount := LEAST(v_discount, v_coupon.max_discount_amount);
    END IF;
    v_discount := round(LEAST(v_subtotal, GREATEST(0, v_discount)), 2);
    v_coupon_id := v_coupon.id;
  END IF;

  IF v_zone.free_delivery_threshold IS NOT NULL
     AND v_subtotal - v_discount > v_zone.free_delivery_threshold THEN
    v_delivery_fee := 0;
  END IF;

  v_tax_rate := LEAST(100, GREATEST(0, public.marketplace_setting_numeric('tax_percent', 0)));
  v_commission_rate := LEAST(100, GREATEST(
    0,
    COALESCE(v_merchant.commission_rate, public.marketplace_setting_numeric('app_commission_percent', 10))
  ));
  v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_commission := round((v_subtotal - v_discount) * v_commission_rate / 100, 2);
  v_total := round(v_subtotal + v_delivery_fee - v_discount + v_tax, 2);
  v_order_number := 'ORD-' || upper(substr(md5(v_customer::text || ':' || p_idempotency_key::text), 1, 16));

  INSERT INTO public.orders(
    id, order_number, customer_id, merchant_id, address_id, status,
    subtotal, delivery_fee, discount_amount, platform_commission, tax_amount,
    total_amount, payment_method, payment_status, coupon_id, notes,
    idempotency_key, request_hash
  )
  VALUES (
    v_order_id, v_order_number, v_customer, p_merchant_id, p_address_id, 'pending',
    v_subtotal, v_delivery_fee, v_discount, v_commission, v_tax,
    v_total, 'cash', 'pending', v_coupon_id,
    NULLIF(trim(COALESCE(p_notes, '')), ''), p_idempotency_key, v_request_hash
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items(
      order_id, product_id, variant_id, quantity, unit_price, total_price
    )
    VALUES (
      v_order_id,
      (v_item ->> 'product_id')::uuid,
      NULLIF(v_item ->> 'variant_id', '')::uuid,
      (v_item ->> 'quantity')::integer,
      0,
      0
    );
    INSERT INTO public.inventory_logs(
      product_id, variant_id, order_id, change_amount, change_type,
      quantity_before, quantity_after, reason, created_by
    )
    VALUES (
      (v_item ->> 'product_id')::uuid,
      NULLIF(v_item ->> 'variant_id', '')::uuid,
      v_order_id,
      -(v_item ->> 'quantity')::integer,
      'reservation',
      (v_item ->> 'quantity_before')::integer,
      (v_item ->> 'quantity_after')::integer,
      'order_reservation',
      v_customer
    );
  END LOOP;

  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_usage(coupon_id, user_id, order_id)
    VALUES (v_coupon_id, v_customer, v_order_id);
    UPDATE public.coupons
    SET usage_count = COALESCE(usage_count, 0) + 1,
        used_count = COALESCE(used_count, 0) + 1
    WHERE id = v_coupon_id;
  END IF;

  PERFORM public.marketplace_record_order_event(
    v_order_id,
    'order-created:' || p_idempotency_key::text,
    'place_order',
    v_customer,
    v_actor_role,
    NULL,
    'pending',
    NULL,
    jsonb_build_object('idempotency_key', p_idempotency_key)
  );
  PERFORM public.marketplace_notify_order_event(
    v_order_id, 'order-created:' || p_idempotency_key::text, 'pending'
  );

  SELECT o.total_amount, o.platform_commission, o.tax_amount
  INTO v_total, v_commission, v_tax
  FROM public.orders AS o WHERE o.id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_delivery_fee,
    'tax', v_tax,
    'total', v_total,
    'idempotent_replay', false
  );
END;
$function$;
