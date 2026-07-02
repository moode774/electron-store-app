-- ============================================================
-- FKs مطلوبة لضمّات PostgREST (embed) التي يعتمد عليها api.ts:
--   orders   → merchant_profiles  (merchant_profiles(store_name...) من الطلبات)
--   products → merchant_profiles  (merchant_profiles(store_name)   من المنتجات)
-- PostgREST لا يستطيع ضم جدول بدون مفتاح خارجي مباشر بينهما.
-- آمنة تماماً:
--   * تُنشأ فقط إن لم توجد علاقة FK مماثلة (idempotent، لا تُكرَّر إن كانت
--     القاعدة الحية تملكها باسم آخر).
--   * NOT VALID: لا تفحص الصفوف القائمة — صفر خطر على البيانات الحالية.
--     (merchant_profiles.id = user_id علاقة 1:1، والتاجر يُنشئ ملفه قبل
--      أي منتج أو طلب، فالصفوف الجديدة ستمرّ طبيعياً.)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid  = 'public.orders'::regclass
      AND confrelid = 'public.merchant_profiles'::regclass
      AND contype   = 'f'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_merchant_profiles_fkey
      FOREIGN KEY (merchant_id) REFERENCES public.merchant_profiles(id) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid  = 'public.products'::regclass
      AND confrelid = 'public.merchant_profiles'::regclass
      AND contype   = 'f'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_merchant_profiles_fkey
      FOREIGN KEY (merchant_id) REFERENCES public.merchant_profiles(id) NOT VALID;
  END IF;
END $$;
