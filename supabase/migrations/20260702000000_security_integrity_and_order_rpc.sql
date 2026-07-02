-- ============================================================
-- SECURITY + PRICE INTEGRITY  (applied live 2026-07-02)
-- هذا الملف يطابق ما طُبّق فعلياً على القاعدة الحيّة عبر MCP.
--   C4  منع تصعيد الصلاحيات (trigger على users).
--   C6  منع التلاعب بالأسعار (triggers تُعيد حساب الأسعار/الإجماليات).
--   إغلاق دوال SECURITY DEFINER المكشوفة لـ anon.
-- (ملاحظة: RLS على القاعدة الحيّة كان مفعّلاً مسبقاً على كل الجداول
--  الحسّاسة — لذلك لا حاجة لتفعيله هنا.)
-- ============================================================

-- 1) is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'); $$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2) منع تصعيد الصلاحيات (C4)
CREATE OR REPLACE FUNCTION public.protect_user_sensitive_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  NEW.role := OLD.role; NEW.is_active := OLD.is_active;
  NEW.is_verified := OLD.is_verified; NEW.admin_role_id := OLD.admin_role_id; NEW.id := OLD.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_user_fields ON public.users;
CREATE TRIGGER trg_protect_user_fields BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_sensitive_fields();

-- 3) إغلاق دوال anon-callable
REVOKE EXECUTE ON FUNCTION public.bump_merchant_daily_stats() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_couriers_on_ready() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,text,text,jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merchant_top_products(uuid,integer,integer) FROM anon, public;

-- 4) فرض سعر الوحدة الرسمي (C6)
CREATE OR REPLACE FUNCTION public.enforce_order_item_price()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_unit numeric;
BEGIN
  SELECT COALESCE(sale_price, base_price) INTO v_unit FROM public.products WHERE id = NEW.product_id;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND: %', NEW.product_id; END IF;
  IF NEW.variant_id IS NOT NULL THEN
    v_unit := v_unit + COALESCE((SELECT additional_price FROM public.product_variants WHERE id = NEW.variant_id),0);
  END IF;
  NEW.quantity := GREATEST(1, COALESCE(NEW.quantity,1));
  NEW.unit_price := v_unit;
  NEW.total_price := v_unit * NEW.quantity;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_item_price ON public.order_items;
CREATE TRIGGER trg_enforce_item_price BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_price();

-- 5) إعادة حساب إجماليات الطلب والتحقق من الخصم (C6)
CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_order uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_subtotal numeric; v_delivery numeric; v_tax numeric; v_discount numeric; v_coupon uuid;
  v_allowed numeric := 0; c RECORD;
BEGIN
  SELECT COALESCE(sum(total_price),0) INTO v_subtotal FROM public.order_items WHERE order_id = v_order;
  SELECT delivery_fee, tax_amount, discount_amount, coupon_id
    INTO v_delivery, v_tax, v_discount, v_coupon FROM public.orders WHERE id = v_order;
  v_delivery := GREATEST(0, COALESCE(v_delivery,0));
  v_tax := GREATEST(0, COALESCE(v_tax,0));
  IF v_coupon IS NOT NULL THEN
    SELECT type, value, min_order_amount, max_discount_amount, is_active INTO c FROM public.coupons WHERE id = v_coupon;
    IF FOUND AND c.is_active AND (c.min_order_amount IS NULL OR v_subtotal >= c.min_order_amount) THEN
      v_allowed := CASE WHEN c.type='percentage' THEN round(v_subtotal*c.value/100) ELSE c.value END;
      IF c.max_discount_amount IS NOT NULL AND v_allowed > c.max_discount_amount THEN v_allowed := c.max_discount_amount; END IF;
    END IF;
  END IF;
  IF v_allowed > v_subtotal THEN v_allowed := v_subtotal; END IF;
  v_discount := LEAST(GREATEST(0, COALESCE(v_discount,0)), v_allowed);
  UPDATE public.orders SET subtotal = v_subtotal, discount_amount = v_discount,
    total_amount = v_subtotal + v_delivery - v_discount + v_tax WHERE id = v_order;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_recalc_order_totals ON public.order_items;
CREATE TRIGGER trg_recalc_order_totals AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();
