-- =============================================================
-- بيانات الاختبار الرسمية — هوية اليمن 🇾🇪 (مُحدّثة 2026-07-11)
--
-- 7 حسابات: تاجران، عميلان، مندوبان، أدمن + متجران كاملان
-- و4 تصنيفات و12 منتجاً (أسعار بالريال اليمني) وساعات عمل المتجرين.
--
-- الدخول في التطبيق برقم الجوال فقط (مقدمة +967، بدون OTP):
--   تاجر 1: 771111111  (متجر النخبة للإلكترونيات — صنعاء)
--   تاجر 2: 772222222  (بوتيك لمسة — عدن)
--   عميل 1: 773333333
--   عميل 2: 774444444
--   مندوب 1: 775555555
--   مندوب 2: 776666666
--   أدمن  : 535353535  (رقم التجاوز في LoginScreen → يسجّل دخولاً حقيقياً بحساب 509999999)
--
-- صيغة المصادقة (packages/shared-hooks/src/useAuthStore.ts):
--   email    = u<الرقم بدون +>@levi-phone.app   (مثال: u967771111111@levi-phone.app)
--   password = Levi-<الرقم بدون +>-auth
--
-- تحذير: القسم (0) يمسح كل المستخدمين والبيانات الحالية!
-- =============================================================

-- (0) مسح البيانات الحالية
BEGIN;
TRUNCATE public.users CASCADE;
TRUNCATE public.categories CASCADE;
TRUNCATE public.notifications, public.referral_codes, public.otp_codes,
         public.login_sessions, public.search_logs, public.product_views,
         public.user_activity_logs, public.api_keys CASCADE;
DELETE FROM auth.users;
COMMIT;

-- (1) إنشاء الحسابات في auth.users (الـ trigger handle_new_user ينشئ سجل users والبروفايل)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, '967771111111', 'أحمد محمد الشامي',   'merchant', 'متجر النخبة للإلكترونيات'),
    ('22222222-2222-2222-2222-222222222222'::uuid, '967772222222', 'سارة عبدالله الحضرمي','merchant', 'بوتيك لمسة'),
    ('33333333-3333-3333-3333-333333333333'::uuid, '967773333333', 'عبدالله سعد العمراني','customer', NULL),
    ('44444444-4444-4444-4444-444444444444'::uuid, '967774444444', 'نورة خالد الصنعاني', 'customer', NULL),
    ('55555555-5555-5555-5555-555555555555'::uuid, '967775555555', 'خالد سعد المخلافي',  'delivery', NULL),
    ('66666666-6666-6666-6666-666666666666'::uuid, '967776666666', 'فهد ناصر العدني',    'delivery', NULL),
    ('99999999-9999-9999-9999-999999999999'::uuid, '967509999999', 'مدير النظام',         'admin',    NULL)
  ) AS t(uid, digits, fname, urole, store)
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', rec.uid, 'authenticated', 'authenticated',
      'u' || rec.digits || '@levi-phone.app',
      extensions.crypt('Levi-' || rec.digits || '-auth', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object('sub', rec.uid::text, 'role', rec.urole,
        'full_name', rec.fname, 'phone', '+' || rec.digits, 'store_name', rec.store, 'email_verified', true)),
      now(), now(), '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), rec.uid,
      jsonb_build_object('sub', rec.uid::text, 'email', 'u' || rec.digits || '@levi-phone.app', 'email_verified', true),
      'email', rec.uid::text, now(), now(), now());
  END LOOP;
END $$;

-- (2) الهواتف والتوثيق وتفاصيل البروفايلات (session_replication_role يعطّل trigger حماية الحقول)
BEGIN;
SET LOCAL session_replication_role = replica;

UPDATE public.users SET phone = '+967771111111', is_verified = true WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.users SET phone = '+967772222222', is_verified = true WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE public.users SET phone = '+967773333333', is_verified = true WHERE id = '33333333-3333-3333-3333-333333333333';
UPDATE public.users SET phone = '+967774444444', is_verified = true WHERE id = '44444444-4444-4444-4444-444444444444';
UPDATE public.users SET phone = '+967775555555', is_verified = true WHERE id = '55555555-5555-5555-5555-555555555555';
UPDATE public.users SET phone = '+967776666666', is_verified = true WHERE id = '66666666-6666-6666-6666-666666666666';
UPDATE public.users SET phone = '+967509999999', is_verified = true WHERE id = '99999999-9999-9999-9999-999999999999';

UPDATE public.merchant_profiles SET
  store_name = 'متجر النخبة للإلكترونيات', store_slug = 'elite-electronics',
  store_description = 'وجهتك الأولى لأحدث الأجهزة الإلكترونية والإكسسوارات التقنية الأصلية بضمان وأسعار منافسة. توصيل سريع لكل المدن.',
  store_category = 'إلكترونيات',
  store_logo_url = 'https://picsum.photos/seed/elite-logo/300/300', store_banner_url = 'https://picsum.photos/seed/elite-banner/1200/400',
  owner_name = 'أحمد محمد الشامي', national_id = '01234567', commercial_register = 'SAN-45678', tax_number = '300123456700003',
  address = 'شارع حدة، أمام مول بلقيس', city = 'صنعاء', latitude = 15.3694, longitude = 44.1910,
  store_phone = '+967771111111', whatsapp = '+967771111111',
  bank_name = 'بنك الكريمي', bank_account = '0101234567890', bank_account_name = 'أحمد محمد الشامي',
  commission_rate = 10.00, is_approved = true, is_active = true, is_open = true, rating = 4.80, total_reviews = 0
WHERE user_id = '11111111-1111-1111-1111-111111111111';

UPDATE public.merchant_profiles SET
  store_name = 'بوتيك لمسة', store_slug = 'lamsa-boutique',
  store_description = 'بوتيك نسائي راقٍ يقدم أحدث صيحات الأزياء والعبايات والعطور والإكسسوارات المختارة بعناية.',
  store_category = 'أزياء وموضة',
  store_logo_url = 'https://picsum.photos/seed/lamsa-logo/300/300', store_banner_url = 'https://picsum.photos/seed/lamsa-banner/1200/400',
  owner_name = 'سارة عبدالله الحضرمي', national_id = '07654321', commercial_register = 'ADN-98765', tax_number = '300987654300003',
  address = 'شارع القاهرة، كريتر', city = 'عدن', latitude = 12.7797, longitude = 45.0367,
  store_phone = '+967772222222', whatsapp = '+967772222222',
  bank_name = 'بنك التضامن', bank_account = '0209876543210', bank_account_name = 'سارة عبدالله الحضرمي',
  commission_rate = 10.00, is_approved = true, is_active = true, is_open = true, rating = 4.60, total_reviews = 0
WHERE user_id = '22222222-2222-2222-2222-222222222222';

UPDATE public.delivery_profiles SET
  national_id = '05678912', vehicle_type = 'motorcycle', vehicle_plate = 'صنعاء 1234',
  current_latitude = 15.3694, current_longitude = 44.1910,
  is_online = true, is_approved = true, rating = 4.90, total_deliveries = 0, wallet_balance = 0
WHERE user_id = '55555555-5555-5555-5555-555555555555';

UPDATE public.delivery_profiles SET
  national_id = '02345678', vehicle_type = 'car', vehicle_plate = 'عدن 5678',
  current_latitude = 12.7797, current_longitude = 45.0367,
  is_online = true, is_approved = true, rating = 4.70, total_deliveries = 0, wallet_balance = 0
WHERE user_id = '66666666-6666-6666-6666-666666666666';

COMMIT;

-- (3) التصنيفات والمنتجات (أسعار بالريال اليمني) والصور وساعات العمل ومناطق الخدمة
DO $$
DECLARE
  m1 uuid; m2 uuid;
  ce uuid := 'c1000000-0000-0000-0000-000000000001';
  ca uuid := 'c1000000-0000-0000-0000-000000000002';
  cf uuid := 'c1000000-0000-0000-0000-000000000003';
  cp uuid := 'c1000000-0000-0000-0000-000000000004';
  p uuid;
BEGIN
  SELECT id INTO m1 FROM public.merchant_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO m2 FROM public.merchant_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222';

  INSERT INTO public.categories (id, name, name_ar, icon_url, is_active) VALUES
    (ce, 'Electronics',      'إلكترونيات',      'https://picsum.photos/seed/cat-elec/200', true),
    (ca, 'Tech Accessories', 'إكسسوارات تقنية', 'https://picsum.photos/seed/cat-acc/200',  true),
    (cf, 'Women Fashion',    'أزياء نسائية',    'https://picsum.photos/seed/cat-fash/200', true),
    (cp, 'Perfumes',         'عطور وجمال',      'https://picsum.photos/seed/cat-perf/200', true);

  -- متجر النخبة للإلكترونيات
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m1,ce,'Wireless ANC Headphones','سماعات لاسلكية بعزل الضوضاء','سماعات رأس لاسلكية فاخرة بعزل ضوضاء نشط وبطارية 30 ساعة',75000,60000,'ELT-HP-001',40,true,true,0.35) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m1,ce,'Smart Sports Watch','ساعة ذكية رياضية','ساعة ذكية بشاشة أموليد وتتبع نبضات القلب وGPS ومقاومة للماء',130000,105000,'ELT-SW-002',25,true,true,0.15) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m1,ce,'Portable Bluetooth Speaker','مكبر صوت بلوتوث محمول','مكبر صوت محمول مقاوم للماء بصوت عميق وبطارية 12 ساعة',52000,43000,'ELT-SP-003',35,true,false,0.60) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m1,ca,'Power Bank 20000mAh','شاحن متنقل 20000 مللي أمبير','شاحن متنقل بشحن سريع ومنفذين USB-C وشاشة رقمية',32000,26000,'ELT-PB-004',60,true,false,0.45) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m1,ca,'Mechanical Gaming Keyboard','لوحة مفاتيح ميكانيكية للألعاب','لوحة مفاتيح ميكانيكية بإضاءة RGB ومفاتيح زرقاء',70000,NULL,'ELT-KB-005',20,true,false,0.90) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m1,ce,'WiFi Security Camera','كاميرا مراقبة واي فاي','كاميرا مراقبة داخلية 2K برؤية ليلية وتنبيهات حركة فورية',47000,40000,'ELT-CM-006',30,true,false,0.30) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1558002038-1055907df827?w=600',true,1);

  -- بوتيك لمسة
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m2,cf,'Classic Luxury Abaya','عباية كلاسيكية فاخرة','عباية سوداء أنيقة بأكمام مطرزة يدوياً من قماش الكريب الفاخر',68000,55000,'LMS-AB-001',30,true,true,0.50) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m2,cf,'Embroidered Summer Dress','فستان صيفي مطرز','فستان صيفي خفيف بتطريز زهري أنيق وقماش قطني مريح',60000,48000,'LMS-DR-002',25,true,false,0.40) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m2,cf,'Leather Handbag','حقيبة يد جلدية','حقيبة يد من الجلد الطبيعي بلمسات ذهبية وتصميم عملي أنيق',82000,72000,'LMS-BG-003',18,true,true,0.70) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m2,cf,'Women Running Sneakers','حذاء رياضي نسائي','حذاء رياضي نسائي خفيف بخامة قابلة للتنفس ونعل مريح',55000,45000,'LMS-SH-004',40,true,false,0.55) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m2,cf,'Embroidered Silk Scarf','شال حرير مطرز','شال من الحرير الفاخر بتطريز يدوي دقيق',25000,NULL,'LMS-SC-005',50,true,false,0.10) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=600',true,1);
  INSERT INTO public.products (merchant_id,category_id,name,name_ar,description_ar,base_price,sale_price,sku,stock_quantity,is_active,is_featured,weight)
  VALUES (m2,cp,'French Floral Perfume 100ml','عطر زهري فرنسي 100 مل','عطر نسائي فرنسي فاخر بمزيج زهري من الياسمين والورد يدوم طويلاً',95000,80000,'LMS-PF-006',22,true,true,0.25) RETURNING id INTO p;
  INSERT INTO public.product_images(product_id,image_url,is_primary,sort_order) VALUES (p,'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600',true,1);

  -- ساعات العمل (يومياً 9ص - 11م)
  INSERT INTO public.merchant_working_hours (merchant_id, day_of_week, open_time, close_time, is_closed)
  SELECT m.id, d, '09:00'::time, '23:00'::time, false FROM (VALUES (m1),(m2)) m(id), generate_series(0,6) d;
END $$;

-- مناطق الخدمة اليمنية
INSERT INTO public.service_areas (city, country, is_active, delivery_available)
SELECT c, 'YE', true, true FROM (VALUES ('صنعاء'),('عدن'),('تعز'),('إب'),('الحديدة'),('المكلا')) v(c)
WHERE NOT EXISTS (SELECT 1 FROM public.service_areas s WHERE s.city = v.c);
