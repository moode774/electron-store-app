-- ============================================================
-- اعتماد تلقائي مؤقت للتجار والمندوبين (لحين توفّر لوحة أدمن)
-- السبب: getStores يعرض المعتمدين فقط، وكان is_approved=false افتراضياً
-- فلا يظهر أي متجر للعملاء. هذا يجعل المنصّة قابلة للاستخدام فوراً.
-- لاحقاً: استبدله ببوابة موافقة فعلية من الأدمن.
-- ============================================================
ALTER TABLE public.merchant_profiles ALTER COLUMN is_approved SET DEFAULT true;
ALTER TABLE public.delivery_profiles ALTER COLUMN is_approved SET DEFAULT true;
UPDATE public.merchant_profiles SET is_approved = true WHERE is_approved = false;
UPDATE public.delivery_profiles SET is_approved = true WHERE is_approved = false;
