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
-- (3) دوال الأدمن والمساعدة: ممنوعة على الزوار (anon)، مسموحة للمسجلين فقط
--     (admin_get_user_details تتحقق داخلياً من is_admin قبل إرجاع أي شيء)
-- بعض هذه الدوال أُنشئت على المشروع البعيد قبل تتبّعها في migrations، أو تُعرَّف
-- في migrations لاحقة (والتي تعيد تطبيق نفس الصلاحيات). لذا تُطبَّق الصلاحيات
-- فقط على الدوال الموجودة حتى يعمل إعادة بناء قاعدة جديدة من الصفر.
DO $grants$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.log_user_activity()',
    'public.log_user_block_changes()',
    'public.protect_user_sensitive_fields()',
    'public.enforce_order_item_price()',
    'public.recalc_order_totals()'
  ] LOOP
    IF to_regprocedure(v_fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.admin_get_user_details(uuid)',
    'public.is_user_blocked(uuid)'
  ] LOOP
    IF to_regprocedure(v_fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
    END IF;
  END LOOP;
END;
$grants$;
