-- ============================================================
-- SECURE RPCS + ADMIN ACCESS + PUSH  (applied live 2026-07-02)
-- يطابق ما طُبّق فعلياً على القاعدة الحيّة. أعمدة coupons/refunds
-- تتبع المخطط الحيّ (type/value/end_date/refund_amount...).
-- ============================================================

-- إنشاء الطلب في الخادم: العميل يرسل product_id/quantity فقط؛ الأسعار
-- والمخزون والخصم تُحسب/تُفرض في الخادم (والـ triggers تعيد حساب الإجماليات).
CREATE OR REPLACE FUNCTION public.place_order(
  p_merchant_id uuid, p_address_id uuid, p_payment_method text,
  p_items jsonb, p_coupon_code text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer uuid := auth.uid();
  v_order uuid; v_no text; v_delivery numeric := 0; v_coupon uuid := NULL;
  it jsonb; v_pid uuid; v_vid uuid; v_qty int; v_avail int; v_total numeric; v_disc numeric; c RECORD;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = p_address_id AND user_id = v_customer) THEN
    RAISE EXCEPTION 'INVALID_ADDRESS'; END IF;
  BEGIN
    SELECT COALESCE((value#>>'{}')::numeric,0) INTO v_delivery FROM public.platform_settings WHERE key='delivery_fee';
  EXCEPTION WHEN OTHERS THEN v_delivery := 0; END;
  v_delivery := COALESCE(v_delivery,0);
  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code))>0 THEN
    SELECT * INTO c FROM public.coupons WHERE code = upper(trim(p_coupon_code)) AND is_active = true;
    IF FOUND
       AND (c.start_date IS NULL OR c.start_date <= now()) AND (c.end_date IS NULL OR c.end_date >= now())
       AND (c.usage_limit IS NULL OR c.usage_count < c.usage_limit)
       AND (c.per_user_limit IS NULL OR (SELECT count(*) FROM public.coupon_usage WHERE coupon_id=c.id AND user_id=v_customer) < c.per_user_limit)
    THEN v_coupon := c.id; END IF;
  END IF;
  v_no := 'ORD-' || to_char(now(),'YYMMDD') || '-' || substr(md5(random()::text),1,6);
  INSERT INTO public.orders(order_number, customer_id, merchant_id, address_id,
    subtotal, delivery_fee, discount_amount, tax_amount, total_amount, payment_method, status, payment_status, coupon_id, notes)
  VALUES (v_no, v_customer, p_merchant_id, p_address_id, 0, v_delivery, 0, 0, 0, p_payment_method, 'pending', 'pending', v_coupon, p_notes)
  RETURNING id INTO v_order;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (it->>'product_id')::uuid; v_vid := NULLIF(it->>'variant_id','')::uuid;
    v_qty := GREATEST(1, COALESCE((it->>'quantity')::int,1));
    IF v_vid IS NOT NULL THEN
      SELECT stock_qty INTO v_avail FROM public.product_variants WHERE id=v_vid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN RAISE EXCEPTION 'OUT_OF_STOCK_VARIANT:%', v_vid; END IF;
      UPDATE public.product_variants SET stock_qty = stock_qty - v_qty WHERE id=v_vid;
    ELSE
      SELECT stock_quantity INTO v_avail FROM public.products WHERE id=v_pid FOR UPDATE;
      IF v_avail IS NULL OR v_avail < v_qty THEN RAISE EXCEPTION 'OUT_OF_STOCK:%', v_pid; END IF;
    END IF;
    UPDATE public.products SET stock_quantity = GREATEST(0, stock_quantity - v_qty),
           total_sold = COALESCE(total_sold,0)+v_qty WHERE id=v_pid;
    INSERT INTO public.order_items(order_id, product_id, variant_id, quantity, unit_price, total_price, product_name)
    VALUES (v_order, v_pid, v_vid, v_qty, 0, 0, COALESCE(it->>'product_name',''));
  END LOOP;
  SELECT total_amount, discount_amount INTO v_total, v_disc FROM public.orders WHERE id=v_order;
  IF v_coupon IS NOT NULL AND COALESCE(v_disc,0) > 0 THEN
    INSERT INTO public.coupon_usage(coupon_id, user_id, order_id) VALUES (v_coupon, v_customer, v_order);
    UPDATE public.coupons SET usage_count = COALESCE(usage_count,0)+1 WHERE id=v_coupon;
  END IF;
  RETURN jsonb_build_object('id', v_order, 'order_number', v_no, 'total', v_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.place_order(uuid,uuid,text,jsonb,text,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.place_order(uuid,uuid,text,jsonb,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_subtotal numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c RECORD; d numeric := 0;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE code = upper(trim(p_code)) AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'discount',0,'message','كود الخصم غير صحيح'); END IF;
  IF (c.start_date IS NOT NULL AND c.start_date > now()) OR (c.end_date IS NOT NULL AND c.end_date < now()) THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','الكوبون غير صالح حالياً'); END IF;
  IF c.min_order_amount IS NOT NULL AND p_subtotal < c.min_order_amount THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','لم يتحقق الحد الأدنى للطلب'); END IF;
  IF c.usage_limit IS NOT NULL AND c.usage_count >= c.usage_limit THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','انتهت الكمية المتاحة'); END IF;
  IF c.per_user_limit IS NOT NULL AND (SELECT count(*) FROM public.coupon_usage WHERE coupon_id=c.id AND user_id=auth.uid()) >= c.per_user_limit THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','استخدمت هذا الكود سابقاً'); END IF;
  d := CASE WHEN c.type='percentage' THEN round(p_subtotal*c.value/100) ELSE c.value END;
  IF c.max_discount_amount IS NOT NULL AND d > c.max_discount_amount THEN d := c.max_discount_amount; END IF;
  IF d > p_subtotal THEN d := p_subtotal; END IF;
  RETURN jsonb_build_object('valid',true,'discount',d,'message','تم تطبيق الخصم');
END $$;
REVOKE EXECUTE ON FUNCTION public.preview_coupon(text,numeric) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.preview_coupon(text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o RECORD; uid uuid := auth.uid(); is_m boolean; is_d boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  is_m := o.merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id=uid);
  is_d := o.delivery_id IN (SELECT id FROM public.delivery_profiles WHERE user_id=uid);
  IF is_m AND p_status IN ('confirmed','preparing','ready','cancelled') THEN NULL;
  ELSIF is_d AND p_status IN ('picked_up','on_the_way','delivered') THEN NULL;
  ELSIF uid = o.customer_id AND p_status='cancelled' AND o.status IN ('pending','confirmed') THEN NULL;
  ELSE RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.orders SET status=p_status,
    delivered_at = CASE WHEN p_status='delivered' THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_status='cancelled' THEN now() ELSE cancelled_at END
  WHERE id=p_order_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_order_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  DELETE FROM public.users WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ============ ADMIN ACCESS ============
CREATE OR REPLACE FUNCTION public._mk_admin_policy(p_name text, p_table text, p_cmd text, p_expr text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p_name, p_table);
  IF p_cmd='INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s);', p_name, p_table, p_expr);
  ELSIF p_cmd IN ('SELECT','DELETE') THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s);', p_name, p_table, p_cmd, p_expr);
  ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s);', p_name, p_table, p_cmd, p_expr, p_expr);
  END IF;
EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

SELECT public._mk_admin_policy('users_admin_sel','users','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('users_admin_upd','users','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('merchants_admin_upd','merchant_profiles','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('delivery_admin_sel','delivery_profiles','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('delivery_admin_upd','delivery_profiles','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('orders_admin_sel','orders','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('orders_admin_upd','orders','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('products_admin_all','products','ALL','public.is_admin()');
SELECT public._mk_admin_policy('refunds_admin_sel','refund_requests','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('refunds_admin_upd','refund_requests','UPDATE','public.is_admin()');
DROP FUNCTION IF EXISTS public._mk_admin_policy(text,text,text,text);

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT jsonb_build_object(
    'users',(SELECT count(*) FROM public.users),
    'merchants',(SELECT count(*) FROM public.merchant_profiles),
    'pending_merchants',(SELECT count(*) FROM public.merchant_profiles WHERE is_approved=false),
    'delivery',(SELECT count(*) FROM public.delivery_profiles),
    'orders',(SELECT count(*) FROM public.orders),
    'orders_today',(SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    'revenue',(SELECT COALESCE(sum(total_amount),0) FROM public.orders WHERE status='delivered'),
    'open_refunds',(SELECT count(*) FROM public.refund_requests WHERE status='pending')
  ) INTO v; RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_merchant_approval(p_merchant uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.merchant_profiles SET is_approved = p_approved WHERE id = p_merchant;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_merchant_approval(uuid,boolean) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_set_merchant_approval(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.users SET is_active = p_active WHERE id = p_user;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean) TO authenticated;

-- PUSH: سياسة ملكية على device_tokens
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS device_tokens_owner_all ON public.device_tokens';
  EXECUTE 'CREATE POLICY device_tokens_owner_all ON public.device_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
EXCEPTION WHEN undefined_table THEN NULL; END $$;
