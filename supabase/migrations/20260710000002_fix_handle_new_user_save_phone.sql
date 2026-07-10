-- =============================================================
-- إصلاح: trigger handle_new_user كان لا يحفظ رقم الهاتف في public.users
-- فتبقى كل الحسابات المُسجَّلة من التطبيق برقم null (يكسر بحث الأدمن والعرض).
-- (مُطبَّق على المشروع البعيد بتاريخ 2026-07-10)
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  user_role  TEXT;
  user_name  TEXT;
  user_phone TEXT;
BEGIN
  user_role  := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
  user_name  := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'مستخدم');
  user_phone := NULLIF(NEW.raw_user_meta_data->>'phone', '');

  INSERT INTO public.users (id, email, phone, full_name, role, is_active, is_verified)
  VALUES (NEW.id, NEW.email, user_phone, user_name, user_role, true, false)
  ON CONFLICT (id) DO NOTHING;

  IF user_role = 'customer' THEN
    INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  ELSIF user_role = 'merchant' THEN
    INSERT INTO public.merchant_profiles (user_id, store_name, store_slug, commission_rate)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'store_name', 'متجر جديد'),
            'store-' || substring(NEW.id::text, 1, 8), 10.00)
    ON CONFLICT DO NOTHING;
  ELSIF user_role = 'delivery' THEN
    INSERT INTO public.delivery_profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- تعبئة الأرقام الناقصة للحسابات الحالية من البيانات الوصفية في auth.users
UPDATE public.users u
SET phone = NULLIF(au.raw_user_meta_data->>'phone', '')
FROM auth.users au
WHERE au.id = u.id
  AND u.phone IS NULL
  AND NULLIF(au.raw_user_meta_data->>'phone', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.users u2
    WHERE u2.phone = au.raw_user_meta_data->>'phone' AND u2.id <> u.id
  );
