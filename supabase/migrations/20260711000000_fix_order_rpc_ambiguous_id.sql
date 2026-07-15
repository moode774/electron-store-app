-- The `id` OUT parameter of the function conflicts with unqualified ids in
-- its SQL statements. Qualify every column reference so customer checkout can
-- create an order successfully.
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_id uuid, p_merchant_id uuid, p_address_id uuid,
  p_subtotal numeric, p_delivery_fee numeric, p_discount_amount numeric,
  p_tax_amount numeric, p_total_amount numeric, p_payment_method text,
  p_notes text, p_items jsonb
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text := 'ORD-' || to_char(clock_timestamp() AT TIME ZONE 'Asia/Aden', 'YYMMDDHH24MISS') || lpad((floor(random()*1000))::int::text, 3, '0');
  it jsonb;
  v_qty int;
  v_avail int;
BEGIN
  IF p_customer_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'غير مصرّح بإنشاء طلب لعميل آخر'; END IF;
  INSERT INTO public.orders(order_number, customer_id, merchant_id, address_id, subtotal, delivery_fee, discount_amount, tax_amount, total_amount, payment_method, notes, status, payment_status)
  VALUES (v_order_number, p_customer_id, p_merchant_id, p_address_id, p_subtotal, p_delivery_fee, p_discount_amount, p_tax_amount, p_total_amount, p_payment_method, p_notes, 'pending', 'pending')
  RETURNING orders.id INTO v_order_id;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((it->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة في الطلب'; END IF;
    IF NULLIF(it->>'variant_id','') IS NOT NULL THEN
      SELECT pv.stock_qty INTO v_avail FROM public.product_variants AS pv WHERE pv.id = (it->>'variant_id')::uuid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN RAISE EXCEPTION 'المخزون غير كافٍ للمتغيّر %', (it->>'variant_id'); END IF;
      UPDATE public.product_variants AS pv SET stock_qty = pv.stock_qty - v_qty WHERE pv.id = (it->>'variant_id')::uuid;
    ELSE
      SELECT p.stock_quantity INTO v_avail FROM public.products AS p WHERE p.id = (it->>'product_id')::uuid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN RAISE EXCEPTION 'المخزون غير كافٍ للمنتج %', (it->>'product_id'); END IF;
    END IF;
    UPDATE public.products AS p SET stock_quantity = GREATEST(0, p.stock_quantity - v_qty), total_sold = COALESCE(p.total_sold, 0) + v_qty WHERE p.id = (it->>'product_id')::uuid;
    INSERT INTO public.order_items(order_id, product_id, variant_id, product_name, quantity, unit_price, total_price)
    VALUES (v_order_id, (it->>'product_id')::uuid, NULLIF(it->>'variant_id','')::uuid, COALESCE(it->>'product_name',''), v_qty, (it->>'unit_price')::numeric, (it->>'total_price')::numeric);
  END LOOP;
  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$function$;
