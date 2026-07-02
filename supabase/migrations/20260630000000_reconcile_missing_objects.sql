-- ============================================================
-- RECONCILIATION: إنشاء الكائنات التي يستدعيها api.ts ولم تكن ضمن
-- migrations المستودع (كانت مطبّقة يدوياً على القاعدة الحية فقط).
-- كل العبارات idempotent وغير مُتلِفة (IF NOT EXISTS / CREATE OR REPLACE):
-- تشغيلها على قاعدة فيها هذه الكائنات لا يحذف أو يغيّر شيئاً.
-- الهدف: أن تُعيد الـ migrations بناء قاعدة بيانات مطابقة لما يتوقعه التطبيق.
-- ============================================================

-- ---- 0) أعمدة ناقصة على جداول قائمة ----------------------------
-- المخزون على مستوى المنتج (تستخدمه استعلامات المنتجات و decrement_product_stock)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;

-- حالة المتجر مفتوح/مغلق (مفتاح إعدادات المتجر)
ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

-- توسعة جداول الدردشة لتطابق نموذج api.ts (عميل↔تاجر + عدّادات غير المقروء)
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS customer_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS merchant_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_message     TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_unread  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_unread  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS message       TEXT,
  ADD COLUMN IF NOT EXISTS message_type  TEXT NOT NULL DEFAULT 'text';

-- ---- 1) الجداول الناقصة --------------------------------------
CREATE TABLE IF NOT EXISTS public.service_areas (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city               TEXT NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  delivery_available BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cancellation_reasons (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reason_text_ar TEXT,
  applicable_to  TEXT NOT NULL DEFAULT 'customer', -- customer | merchant | delivery | system
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.merchant_working_hours (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_working_hours_merchant ON public.merchant_working_hours(merchant_id);

CREATE TABLE IF NOT EXISTS public.saved_payment_methods (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  card_last4  TEXT,
  card_brand  TEXT,
  card_expiry TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON public.saved_payment_methods(user_id);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  points        INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON public.loyalty_transactions(user_id);

CREATE TABLE IF NOT EXISTS public.delivery_earnings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  base_earning  NUMERIC NOT NULL DEFAULT 0,
  bonus_earning NUMERIC NOT NULL DEFAULT 0,
  tip_amount    NUMERIC NOT NULL DEFAULT 0,
  total_earning NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_earnings_delivery ON public.delivery_earnings(delivery_id);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  category   TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  priority   TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id);

CREATE TABLE IF NOT EXISTS public.referrals (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- 2) تفعيل RLS + سياسات آمنة على الجداول الجديدة -----------
ALTER TABLE public.service_areas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_reasons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_payment_methods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_earnings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals              ENABLE ROW LEVEL SECURITY;

-- قراءة عامة لبيانات مرجعية غير حساسة
DROP POLICY IF EXISTS service_areas_public_read ON public.service_areas;
CREATE POLICY service_areas_public_read ON public.service_areas FOR SELECT USING (true);

DROP POLICY IF EXISTS cancellation_reasons_public_read ON public.cancellation_reasons;
CREATE POLICY cancellation_reasons_public_read ON public.cancellation_reasons FOR SELECT USING (true);

-- ساعات العمل: قراءة عامة، وإدارة من التاجر صاحبها فقط
DROP POLICY IF EXISTS working_hours_public_read ON public.merchant_working_hours;
CREATE POLICY working_hours_public_read ON public.merchant_working_hours FOR SELECT USING (true);
DROP POLICY IF EXISTS working_hours_owner_write ON public.merchant_working_hours;
CREATE POLICY working_hours_owner_write ON public.merchant_working_hours
  FOR ALL TO authenticated USING (merchant_id = auth.uid()) WITH CHECK (merchant_id = auth.uid());

-- طرق الدفع المحفوظة: مالكها فقط
DROP POLICY IF EXISTS payment_methods_owner ON public.saved_payment_methods;
CREATE POLICY payment_methods_owner ON public.saved_payment_methods
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- نقاط الولاء: قراءة المالك فقط (الكتابة عبر دوال SECURITY DEFINER)
DROP POLICY IF EXISTS loyalty_owner_read ON public.loyalty_transactions;
CREATE POLICY loyalty_owner_read ON public.loyalty_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- أرباح المندوب: قراءة المندوب صاحبها فقط
DROP POLICY IF EXISTS earnings_owner_read ON public.delivery_earnings;
CREATE POLICY earnings_owner_read ON public.delivery_earnings
  FOR SELECT TO authenticated USING (delivery_id = auth.uid());

-- تذاكر الدعم: مالكها فقط
DROP POLICY IF EXISTS tickets_owner ON public.support_tickets;
CREATE POLICY tickets_owner ON public.support_tickets
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ticket_messages_owner ON public.support_messages;
CREATE POLICY ticket_messages_owner ON public.support_messages
  FOR ALL TO authenticated
  USING (ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()))
  WITH CHECK (sender_id = auth.uid());

-- الإحالة: مالكها فقط (الإنشاء يتم عبر get_or_create_referral)
DROP POLICY IF EXISTS referrals_owner_read ON public.referrals;
CREATE POLICY referrals_owner_read ON public.referrals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---- 3) دوال RPC أساسية للتطبيق (SECURITY DEFINER) -----------
-- خصم المخزون + زيادة المبيعات
CREATE OR REPLACE FUNCTION public.decrement_product_stock(p_id UUID, p_qty INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.products
     SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - p_qty),
         total_sold     = COALESCE(total_sold, 0) + p_qty
   WHERE id = p_id;
END;
$$;

-- إسناد طلب جاهز لمندوب بشكل ذرّي (يمنع تسابق مندوبين على نفس الطلب)
CREATE OR REPLACE FUNCTION public.claim_delivery_order(p_order_id UUID, p_user_id UUID)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_updated INTEGER;
BEGIN
  UPDATE public.orders
     SET delivery_id = p_user_id, status = 'assigned'
   WHERE id = p_order_id AND status = 'ready' AND delivery_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- كود إحالة ثابت لكل مستخدم
CREATE OR REPLACE FUNCTION public.get_or_create_referral(p_user UUID)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_code TEXT;
BEGIN
  SELECT code INTO v_code FROM public.referrals WHERE user_id = p_user LIMIT 1;
  IF v_code IS NULL THEN
    v_code := upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 8));
    INSERT INTO public.referrals(user_id, code) VALUES (p_user, v_code)
      ON CONFLICT (user_id) DO UPDATE SET code = public.referrals.code
      RETURNING code INTO v_code;
  END IF;
  RETURN v_code;
END;
$$;

-- تسجيل استخدام كوبون + زيادة العدّاد (يتجاوز RLS على coupon_usage/coupons)
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_coupon UUID, p_user UUID, p_order UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.coupon_usage(coupon_id, user_id, order_id) VALUES (p_coupon, p_user, p_order);
  UPDATE public.coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = p_coupon;
END;
$$;

-- صلاحيات التنفيذ: مستخدمون مسجّلون فقط
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('decrement_product_stock','claim_delivery_order','get_or_create_referral','redeem_coupon')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public;', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated;', r.sig);
  END LOOP;
END $$;

-- ---- 4) بيانات مرجعية أوّلية (idempotent) --------------------
INSERT INTO public.service_areas (city, is_active, delivery_available)
SELECT v.city, true, true
FROM (VALUES ('sanaa'), ('aden'), ('ibb'), ('taiz')) AS v(city)
WHERE NOT EXISTS (SELECT 1 FROM public.service_areas s WHERE s.city = v.city);

INSERT INTO public.cancellation_reasons (reason_text_ar, applicable_to, is_active)
SELECT v.txt, 'customer', true
FROM (VALUES
  ('تغيّرت رغبتي في الطلب'),
  ('تأخّر تأكيد المتجر'),
  ('أدخلت عنواناً خاطئاً'),
  ('وجدت سعراً أفضل'),
  ('سبب آخر')
) AS v(txt)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cancellation_reasons c
  WHERE c.reason_text_ar = v.txt AND c.applicable_to = 'customer'
);
