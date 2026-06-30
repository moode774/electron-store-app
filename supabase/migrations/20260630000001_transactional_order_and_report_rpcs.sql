-- ============================================================
-- (1) إنشاء الطلب + عناصره + خصم المخزون (واعٍ بالـ variants) في
--     معاملة واحدة تُلغى بالكامل عند أي نقص مخزون.
-- (2) أعلى المنتجات مبيعاً بإيراد فعلي من order_items (سعر لحظة البيع)
--     لا من السعر الحالي في الكتالوج.
-- ============================================================

-- ---- 1) إنشاء طلب معاملاتي واعٍ بالـ variants -----------------------
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_id uuid,
  p_merchant_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_payment_method text,
  p_notes text,
  p_items jsonb
) RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text := 'ORD-' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Aden', 'YYMMDDHH24MISS')
                                 || lpad((floor(random()*1000))::int::text, 3, '0');
  it jsonb;
  v_qty int;
  v_avail int;
BEGIN
  -- لا يُنشئ الطلب إلا صاحبه
  IF p_customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'غير مصرّح بإنشاء طلب لعميل آخر';
  END IF;

  INSERT INTO public.orders(order_number, customer_id, merchant_id, address_id,
    subtotal, delivery_fee, discount_amount, tax_amount, total_amount,
    payment_method, notes, status, payment_status)
  VALUES (v_order_number, p_customer_id, p_merchant_id, p_address_id,
    p_subtotal, p_delivery_fee, p_discount_amount, p_tax_amount, p_total_amount,
    p_payment_method, p_notes, 'pending', 'pending')
  RETURNING orders.id INTO v_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((it->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'كمية غير صالحة في الطلب';
    END IF;

    -- خصم مخزون المتغيّر (إن وُجد) مع التحقّق من توفّره
    IF NULLIF(it->>'variant_id','') IS NOT NULL THEN
      SELECT stock_qty INTO v_avail FROM public.product_variants
        WHERE id = (it->>'variant_id')::uuid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN
        RAISE EXCEPTION 'المخزون غير كافٍ للمتغيّر %', (it->>'variant_id');
      END IF;
      UPDATE public.product_variants
        SET stock_qty = stock_qty - v_qty
        WHERE id = (it->>'variant_id')::uuid;
    ELSE
      SELECT stock_quantity INTO v_avail FROM public.products
        WHERE id = (it->>'product_id')::uuid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN
        RAISE EXCEPTION 'المخزون غير كافٍ للمنتج %', (it->>'product_id');
      END IF;
    END IF;

    -- خصم مخزون المنتج وزيادة عداد المبيعات
    UPDATE public.products
      SET stock_quantity = GREATEST(0, stock_quantity - v_qty),
          total_sold = COALESCE(total_sold,0) + v_qty
      WHERE id = (it->>'product_id')::uuid;

    INSERT INTO public.order_items(order_id, product_id, variant_id, product_name,
      quantity, unit_price, total_price)
    VALUES (v_order_id, (it->>'product_id')::uuid, NULLIF(it->>'variant_id','')::uuid,
      COALESCE(it->>'product_name',''), v_qty,
      (it->>'unit_price')::numeric, (it->>'total_price')::numeric);
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_order_number;
END; $$;

REVOKE ALL ON FUNCTION public.create_order_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) TO authenticated;

-- ---- 2) أعلى المنتجات بإيراد فعلي من عناصر الطلبات للفترة ----------
CREATE OR REPLACE FUNCTION public.merchant_top_products(
  p_merchant uuid, p_days int DEFAULT 7, p_limit int DEFAULT 5
) RETURNS TABLE(id uuid, name text, total_sold bigint, revenue numeric, og_image_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT p.id, p.name,
    COALESCE(SUM(oi.quantity), 0)::bigint AS total_sold,
    COALESCE(SUM(oi.total_price), 0) AS revenue,
    p.og_image_url
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  WHERE o.merchant_id = p_merchant
    AND o.status <> 'cancelled'
    AND o.created_at >= now() - make_interval(days => GREATEST(p_days, 0))
  GROUP BY p.id, p.name, p.og_image_url
  ORDER BY revenue DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.merchant_top_products(uuid,int,int) FROM public;
GRANT EXECUTE ON FUNCTION public.merchant_top_products(uuid,int,int) TO authenticated;
