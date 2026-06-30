-- ============================================================
-- تصحيحان من مراجعة الكود:
-- (1) احتساب إحصائيات التاجر اليومية عند تسليم الطلب فعلياً (مرّة واحدة
--     لكل طلب، بشكل idempotent) بدلاً من لحظة إنشائه، ودون ابتلاع الأخطاء.
-- (2) تقييد إدراج سجلّ موقع المندوب على الطلبات المُسندة إليه فقط.
-- ============================================================

-- علامة لمنع الاحتساب المزدوج إذا عادت حالة الطلب إلى delivered لاحقاً
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stats_counted boolean NOT NULL DEFAULT false;

-- ---- 1) إحصائيات التاجر: على التسليم لا على الإنشاء (idempotent) -----
CREATE OR REPLACE FUNCTION public.bump_merchant_daily_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE d date := (COALESCE(NEW.delivered_at, NEW.updated_at, now()) AT TIME ZONE 'Asia/Aden')::date;
        amt numeric := COALESCE(NEW.total_amount,0);
BEGIN
  -- يُحتسب مرّة واحدة فقط عند أول انتقال إلى "delivered"
  IF NEW.status = 'delivered' AND NOT COALESCE(OLD.stats_counted, false) THEN
    INSERT INTO public.merchant_daily_stats(merchant_id, date, orders_count, revenue, avg_order_value)
    VALUES (NEW.merchant_id, d, 1, amt, amt)
    ON CONFLICT (merchant_id, date) DO UPDATE
      SET orders_count = public.merchant_daily_stats.orders_count + 1,
          revenue = public.merchant_daily_stats.revenue + amt,
          avg_order_value = ROUND((public.merchant_daily_stats.revenue + amt)
                            / NULLIF(public.merchant_daily_stats.orders_count + 1, 0));
    NEW.stats_counted := true; -- يضمن عدم الاحتساب مجدداً
  END IF;
  RETURN NEW;
END; $$;

-- مُحفِّز BEFORE حتى نتمكّن من تعليم الصفّ (stats_counted) ذرّياً
DROP TRIGGER IF EXISTS trg_bump_mds ON public.orders;
CREATE TRIGGER trg_bump_mds BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.bump_merchant_daily_stats();

-- ---- 2) تقييد إدراج موقع المندوب على طلباته المُسندة فقط -----------
DROP POLICY IF EXISTS dlh_delivery_insert ON public.delivery_location_history;
CREATE POLICY dlh_delivery_insert ON public.delivery_location_history
  FOR INSERT TO authenticated
  WITH CHECK (
    delivery_id IN (SELECT id FROM public.delivery_profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = delivery_location_history.order_id
        AND o.delivery_id = delivery_location_history.delivery_id
    )
  );
