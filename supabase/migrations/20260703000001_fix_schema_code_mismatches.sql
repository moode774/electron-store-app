-- =============================================================
-- مطابقة السكيما مع الأعمدة التي يستخدمها الكود فعلياً
-- (مُطبَّق على المشروع البعيد بتاريخ 2026-07-03)
--
-- نتيجة فحص شامل لكل استدعاءات .select() في packages/shared-hooks/src/api.ts
-- مقابل information_schema: هذه الأعمدة/الجداول مستخدمة في الكود وغير موجودة،
-- وكانت تُفشل الاستعلام كاملاً (42703) فتظهر الشاشات فارغة:
--   users.is_blocked            → شاشة AdminUsersScreen (حظر المستخدمين)
--   merchant_profiles.is_open   → إعدادات متجر التاجر
--   app_banners.link_url/...    → شاشة AdminBannersScreen
--   coupons.max_uses/used_count → شاشة AdminCouponsScreen
--   delivery_zones.city/...     → مناطق التوصيل
--   product_variants.name_ar/price_modifier → خيارات المنتج
--   support_tickets.message     → الدعم الفني
--   withdrawal_requests (الجدول كله) → المحفظة وطلبات السحب
-- =============================================================

ALTER TABLE public.users             ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.merchant_profiles ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;
ALTER TABLE public.app_banners       ADD COLUMN IF NOT EXISTS link_url text;
ALTER TABLE public.app_banners       ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE public.app_banners       ADD COLUMN IF NOT EXISTS target_id text;
ALTER TABLE public.coupons           ADD COLUMN IF NOT EXISTS max_uses integer;
ALTER TABLE public.coupons           ADD COLUMN IF NOT EXISTS used_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.delivery_zones    ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.delivery_zones    ADD COLUMN IF NOT EXISTS delivery_available boolean NOT NULL DEFAULT true;
ALTER TABLE public.product_variants  ADD COLUMN IF NOT EXISTS name_ar text;
ALTER TABLE public.product_variants  ADD COLUMN IF NOT EXISTS price_modifier numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.support_tickets   ADD COLUMN IF NOT EXISTS message text;

-- جدول طلبات السحب المفقود (تستخدمه شاشة المحفظة للأدمن والتاجر والمندوب)
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_full_access ON public.withdrawal_requests;
CREATE POLICY admin_full_access ON public.withdrawal_requests
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS withdrawal_own_select ON public.withdrawal_requests;
CREATE POLICY withdrawal_own_select ON public.withdrawal_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS withdrawal_own_insert ON public.withdrawal_requests;
CREATE POLICY withdrawal_own_insert ON public.withdrawal_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
