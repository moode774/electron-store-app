-- =============================================================
-- بيانات الاختبار الرسمية (أُنشئت على المشروع البعيد بتاريخ 2026-07-03)
--
-- 7 حسابات: تاجران، عميلان، مندوبان، أدمن واحد + متجران كاملان
-- و4 تصنيفات و12 منتجاً بصورها وساعات عمل المتجرين.
--
-- الدخول في التطبيق برقم الجوال فقط (بدون OTP):
--   تاجر 1: 0501111111  (متجر النخبة للإلكترونيات)
--   تاجر 2: 0502222222  (بوتيك لمسة)
--   عميل 1: 0503333333
--   عميل 2: 0504444444
--   مندوب 1: 0505555555
--   مندوب 2: 0506666666
--   أدمن  : 535353535  (رقم التجاوز في LoginScreen → يسجّل دخولاً حقيقياً بحساب 0509999999)
--
-- صيغة المصادقة (packages/shared-hooks/src/useAuthStore.ts):
--   email    = u<الرقم بدون +>@levi-phone.app
--   password = Levi-<الرقم بدون +>-auth
--
-- تحذير: القسم (0) يمسح كل المستخدمين والبيانات الحالية!
-- =============================================================

-- (0) مسح البيانات الحالية
BEGIN;
TRUNCATE public.users CASCADE;
TRUNCATE public.categories CASCADE;
TRUNCATE public.notifications, public.referral_codes, public.otp_codes,
         public.login_sessions, public.search_logs, public.product_views CASCADE;
DELETE FROM auth.users;
COMMIT;

-- (1) إنشاء الحسابات في auth.users
--     الـ trigger handle_new_user ينشئ تلقائياً سجل public.users والبروفايل المناسب
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('11111111-1111-1111-1111-111111111111'::uuid, '966501111111', 'أحمد محمد الشمري',    'merchant', 'متجر النخبة للإلكترونيات'),
      ('22222222-2222-2222-2222-222222222222'::uuid, '966502222222', 'سارة عبدالله القحطاني','merchant', 'بوتيك لمسة'),
      ('33333333-3333-3333-3333-333333333333'::uuid, '966503333333', 'عبدالله سعد العتيبي',  'customer', NULL),
      ('44444444-4444-4444-4444-444444444444'::uuid, '966504444444', 'نورة خالد السالم',     'customer', NULL),
      ('55555555-5555-5555-5555-555555555555'::uuid, '966505555555', 'خالد سعد الحربي',      'delivery', NULL),
      ('66666666-6666-6666-6666-666666666666'::uuid, '966506666666', 'فهد ناصر الدوسري',     'delivery', NULL),
      ('99999999-9999-9999-9999-999999999999'::uuid, '966509999999', 'مدير النظام',           'admin',    NULL)
    ) AS t(uid, digits, fname, urole, store)
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', rec.uid, 'authenticated', 'authenticated',
      'u' || rec.digits || '@levi-phone.app',
      extensions.crypt('Levi-' || rec.digits || '-auth', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object(
        'sub', rec.uid::text,
        'role', rec.urole,
        'full_name', rec.fname,
        'phone', '+' || rec.digits,
        'store_name', rec.store,
        'email_verified', true
      )),
      now(), now(), '', '', '', '', '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), rec.uid,
      jsonb_build_object('sub', rec.uid::text, 'email', 'u' || rec.digits || '@levi-phone.app', 'email_verified', true),
      'email', rec.uid::text, now(), now(), now()
    );
  END LOOP;
END $$;

-- (2) الهواتف والتوثيق وتفاصيل البروفايلات
-- session_replication_role يعطّل trigger حماية الحقول (protect_user_sensitive_fields)
-- لأن is_verified محمي ولا يمكن تعديله إلا بجلسة أدمن
BEGIN;
SET LOCAL session_replication_role = replica;

UPDATE public.users SET phone = '+966501111111', is_verified = true WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.users SET phone = '+966502222222', is_verified = true WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE public.users SET phone = '+966503333333', is_verified = true WHERE id = '33333333-3333-3333-3333-333333333333';
UPDATE public.users SET phone = '+966504444444', is_verified = true WHERE id = '44444444-4444-4444-4444-444444444444';
UPDATE public.users SET phone = '+966505555555', is_verified = true WHERE id = '55555555-5555-5555-5555-555555555555';
UPDATE public.users SET phone = '+966506666666', is_verified = true WHERE id = '66666666-6666-6666-6666-666666666666';
UPDATE public.users SET phone = '+966509999999', is_verified = true WHERE id = '99999999-9999-9999-9999-999999999999';

UPDATE public.merchant_profiles SET
  store_name = 'متجر النخبة للإلكترونيات',
  store_slug = 'elite-electronics',
  store_description = 'وجهتك الأولى لأحدث الأجهزة الإلكترونية والإكسسوارات التقنية الأصلية بضمان وأسعار منافسة. شحن سريع لجميع مدن المملكة.',
  store_category = 'إلكترونيات',
  store_logo_url = 'https://picsum.photos/seed/elite-logo/300/300',
  store_banner_url = 'https://picsum.photos/seed/elite-banner/1200/400',
  owner_name = 'أحمد محمد الشمري',
  national_id = '1045678912',
  commercial_register = '1010456789',
  tax_number = '300123456700003',
  address = 'حي العليا، شارع التحلية',
  city = 'الرياض',
  latitude = 24.7136, longitude = 46.6753,
  store_phone = '+966501111111',
  whatsapp = '+966501111111',
  bank_name = 'مصرف الراجحي',
  bank_account = 'SA0380000000608010167519',
  bank_account_name = 'أحمد محمد الشمري',
  commission_rate = 10.00,
  is_approved = true,
  rating = 4.80, total_reviews = 0
WHERE user_id = '11111111-1111-1111-1111-111111111111';

UPDATE public.merchant_profiles SET
  store_name = 'بوتيك لمسة',
  store_slug = 'lamsa-boutique',
  store_description = 'بوتيك نسائي راقٍ يقدم أحدث صيحات الأزياء والعبايات والعطور والإكسسوارات المختارة بعناية لإطلالة مميزة.',
  store_category = 'أزياء وموضة',
  store_logo_url = 'https://picsum.photos/seed/lamsa-logo/300/300',
  store_banner_url = 'https://picsum.photos/seed/lamsa-banner/1200/400',
  owner_name = 'سارة عبدالله القحطاني',
  national_id = '1087654321',
  commercial_register = '4030123456',
  tax_number = '300987654300003',
  address = 'حي الروضة، شارع الأمير سلطان',
  city = 'جدة',
  latitude = 21.5433, longitude = 39.1728,
  store_phone = '+966502222222',
  whatsapp = '+966502222222',
  bank_name = 'البنك الأهلي السعودي',
  bank_account = 'SA4420000001234567891234',
  bank_account_name = 'سارة عبدالله القحطاني',
  commission_rate = 10.00,
  is_approved = true,
  rating = 4.60, total_reviews = 0
WHERE user_id = '22222222-2222-2222-2222-222222222222';

UPDATE public.delivery_profiles SET
  national_id = '1056789123',
  vehicle_type = 'motorcycle',
  vehicle_plate = 'أ ب ج 1234',
  current_latitude = 24.7136, current_longitude = 46.6753,
  is_online = true, is_approved = true,
  rating = 4.90, total_deliveries = 0, wallet_balance = 0
WHERE user_id = '55555555-5555-5555-5555-555555555555';

UPDATE public.delivery_profiles SET
  national_id = '1023456789',
  vehicle_type = 'car',
  vehicle_plate = 'د هـ و 5678',
  current_latitude = 21.5433, current_longitude = 39.1728,
  is_online = true, is_approved = true,
  rating = 4.70, total_deliveries = 0, wallet_balance = 0
WHERE user_id = '66666666-6666-6666-6666-666666666666';

COMMIT;

-- (3) التصنيفات والمنتجات والصور وساعات العمل
DO $$
DECLARE
  m1 uuid; m2 uuid;
  cat_elec uuid := 'c1000000-0000-0000-0000-000000000001';
  cat_acc  uuid := 'c1000000-0000-0000-0000-000000000002';
  cat_fash uuid := 'c1000000-0000-0000-0000-000000000003';
  cat_perf uuid := 'c1000000-0000-0000-0000-000000000004';
  p uuid;
BEGIN
  SELECT id INTO m1 FROM public.merchant_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO m2 FROM public.merchant_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222';

  INSERT INTO public.categories (id, name, name_ar, icon_url, is_active) VALUES
    (cat_elec, 'Electronics',       'إلكترونيات',      'https://picsum.photos/seed/cat-elec/200/200', true),
    (cat_acc,  'Tech Accessories',  'إكسسوارات تقنية', 'https://picsum.photos/seed/cat-acc/200/200',  true),
    (cat_fash, 'Women Fashion',     'أزياء نسائية',    'https://picsum.photos/seed/cat-fash/200/200', true),
    (cat_perf, 'Perfumes & Beauty', 'عطور وجمال',      'https://picsum.photos/seed/cat-perf/200/200', true);

  -- منتجات متجر النخبة للإلكترونيات
  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m1, cat_elec, 'Wireless ANC Headphones', 'سماعات لاسلكية بعزل الضوضاء', 'Premium wireless headphones with active noise cancellation and 30h battery', 'سماعات رأس لاسلكية فاخرة بخاصية عزل الضوضاء النشط وبطارية تدوم 30 ساعة مع صوت نقي عالي الجودة', 349.00, 279.00, 'ELT-HP-001', 40, true, true, 0.35)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m1, cat_elec, 'Smart Sports Watch', 'ساعة ذكية رياضية', 'Fitness smartwatch with heart-rate monitor and GPS', 'ساعة ذكية رياضية بشاشة أموليد، تتبع نبضات القلب، GPS مدمج، ومقاومة للماء حتى 50 متر', 599.00, 499.00, 'ELT-SW-002', 25, true, true, 0.15)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m1, cat_elec, 'Portable Bluetooth Speaker', 'مكبر صوت بلوتوث محمول', 'Waterproof portable speaker with deep bass', 'مكبر صوت محمول مقاوم للماء بصوت باس عميق وبطارية 12 ساعة، مثالي للرحلات', 249.00, 199.00, 'ELT-SP-003', 35, true, false, 0.60)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m1, cat_acc, 'Power Bank 20000mAh', 'شاحن متنقل 20000 مللي أمبير', 'Fast-charging power bank with dual USB-C ports', 'شاحن متنقل بسعة 20000 مللي أمبير يدعم الشحن السريع بمنفذين USB-C وشاشة رقمية', 149.00, 119.00, 'ELT-PB-004', 60, true, false, 0.45)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m1, cat_acc, 'Mechanical Gaming Keyboard', 'لوحة مفاتيح ميكانيكية للألعاب', 'RGB mechanical keyboard with blue switches', 'لوحة مفاتيح ميكانيكية بإضاءة RGB ومفاتيح زرقاء، تصميم عربي/إنجليزي متين', 329.00, NULL, 'ELT-KB-005', 20, true, false, 0.90)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m1, cat_elec, 'WiFi Security Camera', 'كاميرا مراقبة منزلية واي فاي', 'Indoor 2K security camera with night vision', 'كاميرا مراقبة داخلية بدقة 2K مع رؤية ليلية وتنبيهات حركة فورية عبر التطبيق', 219.00, 189.00, 'ELT-CM-006', 30, true, false, 0.30)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&q=80', true, 1);

  -- منتجات بوتيك لمسة
  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m2, cat_fash, 'Classic Luxury Abaya', 'عباية كلاسيكية فاخرة', 'Elegant black abaya with embroidered sleeves', 'عباية سوداء أنيقة بأكمام مطرزة يدوياً من قماش الكريب الفاخر، متوفرة بجميع المقاسات', 320.00, 260.00, 'LMS-AB-001', 30, true, true, 0.50)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m2, cat_fash, 'Embroidered Summer Dress', 'فستان صيفي مطرز', 'Light summer dress with floral embroidery', 'فستان صيفي خفيف بتطريز زهري أنيق، قماش قطني مريح مثالي للإطلالات النهارية', 280.00, 230.00, 'LMS-DR-002', 25, true, false, 0.40)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m2, cat_fash, 'Leather Handbag', 'حقيبة يد جلدية', 'Genuine leather handbag with gold accents', 'حقيبة يد من الجلد الطبيعي بلمسات ذهبية، تصميم عملي وأنيق يناسب جميع المناسبات', 390.00, 340.00, 'LMS-BG-003', 18, true, true, 0.70)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m2, cat_fash, 'Women Running Sneakers', 'حذاء رياضي نسائي', 'Lightweight breathable running shoes', 'حذاء رياضي نسائي خفيف الوزن بخامة قابلة للتنفس ونعل مريح للمشي والجري', 260.00, 210.00, 'LMS-SH-004', 40, true, false, 0.55)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m2, cat_fash, 'Embroidered Silk Scarf', 'شال حرير مطرز', 'Premium silk scarf with hand embroidery', 'شال من الحرير الفاخر بتطريز يدوي دقيق، إضافة مثالية لأي إطلالة', 120.00, NULL, 'LMS-SC-005', 50, true, false, 0.10)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=600&q=80', true, 1);

  INSERT INTO public.products (merchant_id, category_id, name, name_ar, description, description_ar, base_price, sale_price, sku, stock_quantity, is_active, is_featured, weight)
  VALUES (m2, cat_perf, 'French Floral Perfume 100ml', 'عطر زهري فرنسي 100 مل', 'Luxury French floral fragrance for women', 'عطر نسائي فرنسي فاخر بمزيج زهري من الياسمين والورد يدوم طوال اليوم، عبوة 100 مل', 450.00, 380.00, 'LMS-PF-006', 22, true, true, 0.25)
  RETURNING id INTO p;
  INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order) VALUES (p, 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=80', true, 1);

  -- ساعات العمل للمتجرين (يومياً 9ص - 11م)
  INSERT INTO public.merchant_working_hours (merchant_id, day_of_week, open_time, close_time, is_closed)
  SELECT m.id, d, '09:00'::time, '23:00'::time, false
  FROM (VALUES (m1),(m2)) AS m(id), generate_series(0,6) AS d;
END $$;
