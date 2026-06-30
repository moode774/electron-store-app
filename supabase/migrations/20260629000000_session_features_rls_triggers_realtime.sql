-- ============================================================
-- جلسة التطوير: RLS + Triggers + Realtime لميزات هذه الجلسة
-- (مطبّقة على قاعدة البيانات الحيّة عبر Supabase؛ موثّقة هنا للريبو)
-- كل العبارات idempotent.
-- ============================================================

-- ---- 1) إصلاح عملة إشعارات الطلب (ر.س -> ر.ي) + حالات إضافية -------
CREATE OR REPLACE FUNCTION public.notify_order_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE merch_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO merch_user FROM merchant_profiles WHERE id = NEW.merchant_id;
    IF merch_user IS NOT NULL THEN
      INSERT INTO notifications(user_id, title, body, type)
      VALUES (merch_user, 'طلب جديد 🛎️',
        'لديك طلب جديد رقم ' || NEW.order_number || ' بقيمة ' || COALESCE(NEW.total_amount,0) || ' ر.ي', 'order');
    END IF;
    INSERT INTO notifications(user_id, title, body, type)
    VALUES (NEW.customer_id, 'تم استلام طلبك ✅',
      'طلبك ' || NEW.order_number || ' قيد المراجعة من المتجر', 'order');
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO notifications(user_id, title, body, type)
    VALUES (NEW.customer_id,
      CASE NEW.status
        WHEN 'preparing' THEN 'جاري تجهيز طلبك 📦'
        WHEN 'ready' THEN 'طلبك جاهز للتوصيل 🛍️'
        WHEN 'assigned' THEN 'تم إسناد مندوب لطلبك 🛵'
        WHEN 'picked_up' THEN 'استلم المندوب طلبك 🛵'
        WHEN 'on_the_way' THEN 'طلبك في الطريق إليك 🛵'
        WHEN 'delivered' THEN 'تم تسليم طلبك 🎉'
        WHEN 'cancelled' THEN 'تم إلغاء طلبك'
        ELSE 'تحديث على طلبك'
      END,
      'طلبك رقم ' || NEW.order_number, 'order');
    IF NEW.status = 'delivered' THEN
      SELECT user_id INTO merch_user FROM merchant_profiles WHERE id = NEW.merchant_id;
      IF merch_user IS NOT NULL THEN
        INSERT INTO notifications(user_id, title, body, type)
        VALUES (merch_user, 'تم تسليم الطلب ✅', 'الطلب ' || NEW.order_number || ' تم تسليمه بنجاح', 'order');
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

-- ---- 2) تتبّع موقع المندوب: RLS + Realtime -------------------------
DROP POLICY IF EXISTS dlh_delivery_insert ON public.delivery_location_history;
CREATE POLICY dlh_delivery_insert ON public.delivery_location_history
  FOR INSERT TO authenticated
  WITH CHECK (delivery_id IN (SELECT id FROM public.delivery_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS dlh_parties_read ON public.delivery_location_history;
CREATE POLICY dlh_parties_read ON public.delivery_location_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = delivery_location_history.order_id
    AND (o.customer_id = auth.uid()
      OR o.delivery_id IN (SELECT id FROM public.delivery_profiles WHERE user_id = auth.uid())
      OR o.merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()))));

-- ---- 3) كوبونات التاجر: RLS كاملة ---------------------------------
DROP POLICY IF EXISTS coupons_merchant_read ON public.coupons;
CREATE POLICY coupons_merchant_read ON public.coupons FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS coupons_merchant_insert ON public.coupons;
CREATE POLICY coupons_merchant_insert ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS coupons_merchant_update ON public.coupons;
CREATE POLICY coupons_merchant_update ON public.coupons FOR UPDATE TO authenticated
  USING (merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()))
  WITH CHECK (merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS coupons_merchant_delete ON public.coupons;
CREATE POLICY coupons_merchant_delete ON public.coupons FOR DELETE TO authenticated
  USING (merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()));

-- ---- 4) سحب المحفظة: RLS -----------------------------------------
DROP POLICY IF EXISTS merchant_payouts_insert ON public.merchant_payouts;
CREATE POLICY merchant_payouts_insert ON public.merchant_payouts FOR INSERT TO authenticated
  WITH CHECK (merchant_id IN (SELECT id FROM public.merchant_profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wallet_tx_own_debit_insert ON public.wallet_transactions;
CREATE POLICY wallet_tx_own_debit_insert ON public.wallet_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND type = 'debit');

-- ---- 5) تجميع إحصائيات التاجر اليومية ------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_mds_merchant_date ON public.merchant_daily_stats(merchant_id, date);
CREATE OR REPLACE FUNCTION public.bump_merchant_daily_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE d date := (NEW.created_at AT TIME ZONE 'Asia/Aden')::date; amt numeric := COALESCE(NEW.total_amount,0);
BEGIN
  BEGIN
    INSERT INTO public.merchant_daily_stats(merchant_id, date, orders_count, revenue, avg_order_value)
    VALUES (NEW.merchant_id, d, 1, amt, amt)
    ON CONFLICT (merchant_id, date) DO UPDATE
      SET orders_count = public.merchant_daily_stats.orders_count + 1,
          revenue = public.merchant_daily_stats.revenue + amt,
          avg_order_value = ROUND((public.merchant_daily_stats.revenue + amt)
                            / NULLIF(public.merchant_daily_stats.orders_count + 1, 0));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_bump_mds ON public.orders;
CREATE TRIGGER trg_bump_mds AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.bump_merchant_daily_stats();

-- ---- 6) إشعار المندوبين عند جاهزية الطلب ---------------------------
CREATE OR REPLACE FUNCTION public.notify_couriers_on_ready()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'ready'
     AND OLD.status IS DISTINCT FROM 'ready' AND NEW.delivery_id IS NULL THEN
    BEGIN
      INSERT INTO notifications(user_id, title, body, type)
      SELECT dp.user_id, 'طلب جاهز للتوصيل',
             'طلب رقم ' || NEW.order_number || ' متاح للقبول الآن', 'delivery_offer'
      FROM delivery_profiles dp WHERE dp.is_online = true AND dp.is_approved = true;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_couriers_ready ON public.orders;
CREATE TRIGGER trg_notify_couriers_ready AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_couriers_on_ready();

-- ---- 7) تفعيل Realtime للتتبّع والمحادثة ---------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_location_history;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
