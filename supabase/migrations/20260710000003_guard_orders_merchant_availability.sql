-- =============================================================
-- حراسة توفّر المتجر عند إنشاء الطلبات
-- (مُطبَّقة على المشروع البعيد بتاريخ 2026-07-10)
--
-- الثغرة: التطبيق ينشئ الطلب بإدراج مباشر في public.orders، وسياسة
-- الإدراج كانت تتحقق فقط أن customer_id = auth.uid() — دون أي فحص
-- لحالة المتجر. فكان العميل يقدر يطلب من متجر أوقفه الأدمن أو أغلقه
-- التاجر أو لم يُعتمد بعد، ملتفّاً حول ميزة "إيقاف المتجر".
--
-- الحل: trigger BEFORE INSERT على orders يحرس كل المسارات (الإدراج
-- المباشر + أي RPC). كما صُلّبت دالة place_order بنفس الفحوص
-- (ميغريشن harden_place_order_merchant_and_product_guards).
-- =============================================================

CREATE OR REPLACE FUNCTION public.guard_order_merchant_available()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE m RECORD;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  SELECT is_approved, is_active, is_open INTO m
  FROM public.merchant_profiles WHERE id = NEW.merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT COALESCE(m.is_approved, false) OR NOT COALESCE(m.is_active, true) THEN
    RAISE EXCEPTION 'MERCHANT_UNAVAILABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT COALESCE(m.is_open, true) THEN
    RAISE EXCEPTION 'MERCHANT_CLOSED' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_merchant ON public.orders;
CREATE TRIGGER trg_guard_order_merchant
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_merchant_available();
