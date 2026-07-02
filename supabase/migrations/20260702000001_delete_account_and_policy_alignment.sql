-- ============================================================
-- 1) DELETE ACCOUNT RPC (متطلّب App Store / Google Play)
-- يسمح للمستخدم بحذف حسابه هو فقط. حذف auth.users يتسلسل إلى
-- public.users وكل الجداول التابعة عبر ON DELETE CASCADE.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ============================================================
-- 2) COUPONS: مواءمة السياسة مع ميزات التطبيق
-- سياسة deny-all القديمة كانت تمنع شاشة العروض والتحقق من الكوبون
-- (كلاهما يقرأ الجدول مباشرة من العميل). نسمح بقراءة الكوبونات
-- الفعّالة فقط للمستخدمين المسجّلين — الكتابة تبقى ممنوعة.
-- ============================================================
DROP POLICY IF EXISTS "Only service_role can access coupons" ON public.coupons;
DROP POLICY IF EXISTS coupons_read_active ON public.coupons;
CREATE POLICY coupons_read_active ON public.coupons
  FOR SELECT TO authenticated
  USING (is_active = true);

-- ============================================================
-- 3) ORDERS: سياسات إدراج/تحديث محدودة النطاق تطابق تدفّقات التطبيق
-- (إنشاء الطلب من العميل، تحديث الحالة من التاجر/المندوب، إلغاء العميل)
-- ملاحظة: تقييد الأعمدة (مثل منع تعديل total_amount) يتطلب trigger
-- إضافي — مسجَّل ضمن المتابعة.
-- ============================================================
DROP POLICY IF EXISTS orders_insert_customer ON public.orders;
CREATE POLICY orders_insert_customer ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND status = 'pending');

-- العميل: يلغي طلبه فقط وقبل التجهيز النهائي
DROP POLICY IF EXISTS orders_update_customer_cancel ON public.orders;
CREATE POLICY orders_update_customer_cancel ON public.orders
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() AND status IN ('pending', 'preparing'))
  WITH CHECK (customer_id = auth.uid() AND status = 'cancelled');

-- التاجر: انتقالات حالة التجهيز على طلبات متجره
DROP POLICY IF EXISTS orders_update_merchant ON public.orders;
CREATE POLICY orders_update_merchant ON public.orders
  FOR UPDATE TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (
    merchant_id = auth.uid()
    AND status IN ('confirmed', 'preparing', 'ready', 'cancelled')
  );

-- المندوب: انتقالات حالة التوصيل على الطلبات المُسندة له
DROP POLICY IF EXISTS orders_update_delivery ON public.orders;
CREATE POLICY orders_update_delivery ON public.orders
  FOR UPDATE TO authenticated
  USING (delivery_id = auth.uid())
  WITH CHECK (
    delivery_id = auth.uid()
    AND status IN ('picked_up', 'on_the_way', 'delivered', 'failed_delivery')
  );
