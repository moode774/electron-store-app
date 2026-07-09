-- =============================================================
-- صلاحيات الأدمن الكاملة + عمود is_active للتجار
-- (مُطبَّق على المشروع البعيد بتاريخ 2026-07-03)
--
-- المشكلة: دخول الأدمن أصبح جلسة Supabase حقيقية (انظر useAuthStore.signInAsAdmin)
-- لكن أغلب الجداول لم يكن فيها أي سياسة RLS للأدمن، فكانت الشاشات فارغة.
-- كذلك شاشة "التجار" تستعلم عن عمود is_active غير الموجود.
-- =============================================================

-- عمود is_active الذي تطلبه شاشة الأدمن ودالة toggleMerchantActive
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- منح الأدمن (جلسة حقيقية بدور admin) صلاحية كاملة على كل جداول public
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tablename AND policyname = 'admin_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY admin_full_access ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
        r.tablename
      );
    END IF;
  END LOOP;
END $$;
