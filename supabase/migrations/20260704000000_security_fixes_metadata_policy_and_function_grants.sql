-- =============================================================
-- إصلاحات أمنية (نتيجة فحص Supabase Security Advisor)
-- (مُطبَّقة على المشروع البعيد بتاريخ 2026-07-04)
-- =============================================================

-- (1) حذف السياسة الخطيرة: كانت تعتمد على auth.jwt()->user_metadata->>'role'
-- و user_metadata قابل للتعديل من المستخدم النهائي نفسه — أي مستخدم كان
-- يستطيع ترقية نفسه "أدمن" وتعديل بيانات كل التجار.
-- البديل الآمن موجود: admin_full_access + merchants_admin_upd (كلاهما عبر is_admin())
DROP POLICY IF EXISTS "Allow admin to update merchant_profiles" ON public.merchant_profiles;
DROP POLICY IF EXISTS "Allow admin to select merchant_profiles" ON public.merchant_profiles;

-- (2) دوال الـ triggers لا يجوز استدعاؤها عبر REST API إطلاقاً
REVOKE ALL ON FUNCTION public.log_user_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_user_block_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_user_sensitive_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_order_item_price() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_order_totals() FROM PUBLIC, anon, authenticated;

-- (3) دوال الأدمن والمساعدة: ممنوعة على الزوار (anon)، مسموحة للمسجلين فقط
--     (admin_get_user_details تتحقق داخلياً من is_admin قبل إرجاع أي شيء)
REVOKE ALL ON FUNCTION public.admin_get_user_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_user_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_blocked(uuid) TO authenticated;
