-- =============================================================
-- بيانات عرض: 5 متاجر × 4 منتجات (أسعار بالريال اليمني)
--
-- إضافي وآمن: لا يمسح أي بيانات، وتشغيله أكثر من مرة لا يكرر شيئاً.
-- كل متجر: حساب تاجر كامل (auth + users + merchant_profiles) موثّق ومعتمد
-- ومفتوح، بيانات المالك والبنك والعنوان والإحداثيات، وساعات العمل.
-- كل منتج: اسم ووصف بالعربي والإنجليزي، سعر وخصم، SKU، وزن، وسوم، 3 صور،
-- وخيارات (لون/مقاس) لكل منها كمية مخزون وكود لون، والمخزون الكلي = مجموع الخيارات.
--
-- الدخول برقم الجوال (+967) عبر OTP. للتجربة بدون SMS أضف الأرقام في
-- Supabase → Authentication → Providers → Phone → Test phone numbers:
--   778100001  دار العود للعطور            (صنعاء)
--   778100002  تقنية بلس للجوالات          (عدن)
--   778100003  بيت الأناقة للأزياء الرجالية (تعز)
--   778100004  ركن البيت للأدوات المنزلية   (صنعاء)
--   778100005  سبورت زون للمستلزمات الرياضية (المكلا)
-- =============================================================

-- (1) حسابات التجار في auth.users (الـ trigger handle_new_user ينشئ users و merchant_profiles)
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('a1000000-0000-4000-8000-000000000001'::uuid, '967778100001', 'عبدالرحمن علي الوصابي', 'دار العود للعطور'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, '967778100002', 'محمد صالح باعباد',      'تقنية بلس للجوالات'),
    ('a1000000-0000-4000-8000-000000000003'::uuid, '967778100003', 'يوسف أحمد الشرعبي',    'بيت الأناقة للأزياء الرجالية'),
    ('a1000000-0000-4000-8000-000000000004'::uuid, '967778100004', 'أمل حسين الكبسي',      'ركن البيت للأدوات المنزلية'),
    ('a1000000-0000-4000-8000-000000000005'::uuid, '967778100005', 'سالم عمر بن بريك',      'سبورت زون للمستلزمات الرياضية')
  ) AS t(uid, digits, fname, store)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = rec.uid OR phone = rec.digits);
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, phone, phone_confirmed_at, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', rec.uid, 'authenticated', 'authenticated',
      'u' || rec.digits || '@levi-phone.app', rec.digits, now(),
      extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')), now(),
      '{"provider":"phone","providers":["phone"]}'::jsonb,
      jsonb_build_object('sub', rec.uid::text, 'role', 'merchant', 'full_name', rec.fname,
        'phone', '+' || rec.digits, 'store_name', rec.store, 'email_verified', true),
      now(), now(), '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), rec.uid,
      jsonb_build_object('sub', rec.uid::text, 'phone', rec.digits, 'phone_verified', true),
      'phone', rec.uid::text, now(), now(), now());
  END LOOP;
END $$;

-- (2) بيانات الحسابات والمتاجر الكاملة (session_replication_role يتجاوز trigger حماية الحقول)
BEGIN;
SET LOCAL session_replication_role = replica;

UPDATE public.users u SET phone = '+' || v.digits, full_name = v.fname, is_verified = true
FROM (VALUES
  ('a1000000-0000-4000-8000-000000000001'::uuid, '967778100001', 'عبدالرحمن علي الوصابي'),
  ('a1000000-0000-4000-8000-000000000002'::uuid, '967778100002', 'محمد صالح باعباد'),
  ('a1000000-0000-4000-8000-000000000003'::uuid, '967778100003', 'يوسف أحمد الشرعبي'),
  ('a1000000-0000-4000-8000-000000000004'::uuid, '967778100004', 'أمل حسين الكبسي'),
  ('a1000000-0000-4000-8000-000000000005'::uuid, '967778100005', 'سالم عمر بن بريك')
) AS v(uid, digits, fname)
WHERE u.id = v.uid;

-- البروفايل يُنشأ هنا (الـ trigger الحالي ينشئ سجل users فقط)، و id يساوي user_id
INSERT INTO public.merchant_profiles (
  id, user_id, store_name, store_slug, store_description, store_category,
  store_logo_url, store_banner_url, owner_name, national_id, commercial_register, tax_number,
  address, city, latitude, longitude, store_phone, whatsapp,
  bank_name, bank_account, bank_account_name,
  commission_rate, is_approved, approval_reviewed_at, is_active, is_open, rating, total_reviews
)
SELECT v.uid, v.uid, v.store, v.slug, v.descr, v.cat,
  'https://picsum.photos/seed/' || v.slug || '-logo/300/300',
  'https://picsum.photos/seed/' || v.slug || '-banner/1200/400',
  v.owner, v.nid, v.cr, v.tax, v.addr, v.city, v.lat, v.lng, '+' || v.digits, '+' || v.digits,
  v.bank, v.iban, v.owner, 10.00, true, now(), true, true, v.rating, 0
FROM (VALUES
  ('a1000000-0000-4000-8000-000000000001'::uuid, '967778100001', 'دار العود للعطور', 'dar-aloud',
   'متجر متخصص في العطور الشرقية والفرنسية ودهن العود والبخور الفاخر. منتجات أصلية مختارة بعناية مع تغليف هدايا مجاني.',
   'عطور وجمال', 'عبدالرحمن علي الوصابي', '01120034', 'SAN-11203', '300112003400003',
   'شارع الزبيري، جوار جامع الصالح', 'صنعاء', 15.3547, 44.2066, 'بنك الكريمي', '0101120034501', 4.9),
  ('a1000000-0000-4000-8000-000000000002'::uuid, '967778100002', 'تقنية بلس للجوالات', 'tech-plus',
   'أحدث الجوالات الذكية والإكسسوارات الأصلية بضمان الوكيل. صيانة وبرمجة وتوصيل سريع داخل عدن والمحافظات.',
   'جوالات وإلكترونيات', 'محمد صالح باعباد', '02230045', 'ADN-22304', '300223004500003',
   'المنصورة، شارع التسعين', 'عدن', 12.8586, 44.9940, 'بنك عدن الإسلامي', '0202230045602', 4.7),
  ('a1000000-0000-4000-8000-000000000003'::uuid, '967778100003', 'بيت الأناقة للأزياء الرجالية', 'beit-alanaqa',
   'ثياب رجالية وشماغات ومعاوز وأحذية بخامات فاخرة وتفصيل دقيق. مقاسات متكاملة وخدمة تعديل مجانية.',
   'أزياء رجالية', 'يوسف أحمد الشرعبي', '03340056', 'TAZ-33405', '300334005600003',
   'شارع جمال، مقابل البنك الأهلي', 'تعز', 13.5795, 44.0209, 'بنك التضامن', '0303340056703', 4.8),
  ('a1000000-0000-4000-8000-000000000004'::uuid, '967778100004', 'ركن البيت للأدوات المنزلية', 'rukn-albeit',
   'كل ما يحتاجه مطبخك وبيتك: أواني طهي، أجهزة صغيرة، وأدوات تنظيم عالية الجودة بأسعار مناسبة.',
   'أدوات منزلية', 'أمل حسين الكبسي', '04450067', 'SAN-44506', '300445006700003',
   'شارع الستين الغربي، حدة', 'صنعاء', 15.3260, 44.1820, 'بنك اليمن والكويت', '0404450067804', 4.6),
  ('a1000000-0000-4000-8000-000000000005'::uuid, '967778100005', 'سبورت زون للمستلزمات الرياضية', 'sport-zone',
   'ملابس وأحذية ومعدات رياضية أصلية للجري واللياقة وكرة القدم. خصومات مستمرة وتوصيل لكل حضرموت.',
   'رياضة ولياقة', 'سالم عمر بن بريك', '05560078', 'MKL-55607', '300556007800003',
   'خلف، شارع المكلا الرئيسي', 'المكلا', 14.5425, 49.1242, 'بنك حضرموت', '0505560078905', 4.8)
) AS v(uid, digits, store, slug, descr, cat, owner, nid, cr, tax, addr, city, lat, lng, bank, iban, rating)
WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.uid)
ON CONFLICT (id) DO UPDATE SET
  store_name = EXCLUDED.store_name, store_slug = EXCLUDED.store_slug,
  store_description = EXCLUDED.store_description, store_category = EXCLUDED.store_category,
  store_logo_url = EXCLUDED.store_logo_url, store_banner_url = EXCLUDED.store_banner_url,
  owner_name = EXCLUDED.owner_name, national_id = EXCLUDED.national_id,
  commercial_register = EXCLUDED.commercial_register, tax_number = EXCLUDED.tax_number,
  address = EXCLUDED.address, city = EXCLUDED.city, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
  store_phone = EXCLUDED.store_phone, whatsapp = EXCLUDED.whatsapp,
  bank_name = EXCLUDED.bank_name, bank_account = EXCLUDED.bank_account, bank_account_name = EXCLUDED.bank_account_name,
  is_approved = true, is_active = true, is_open = true;

COMMIT;

-- (3) التصنيفات والمنتجات والخيارات والصور وساعات العمل
DO $$
DECLARE
  data jsonb := $json$
[
 {"uid":"a1000000-0000-4000-8000-000000000001","products":[
  {"cat":["Perfumes","عطور وجمال"],"name":"Royal Cambodian Oud Oil","name_ar":"دهن عود كمبودي ملكي","sku":"DAO-OUD-01","price":120000,"sale":105000,"weight":0.05,"featured":true,"tags":["عود","دهن عود","هدايا"],
   "desc":"Aged Cambodian oud oil with a deep, smoky and long-lasting scent.","desc_ar":"دهن عود كمبودي معتّق بثبات عالٍ يدوم أكثر من 24 ساعة.\nرائحة دافئة عميقة بلمسة دخانية.\nمستخلص طبيعي 100% بدون إضافات.\nيأتي في علبة هدايا خشبية فاخرة.",
   "images":["photo-1594035910387-fea47794261f","photo-1541643600914-78b084683601","photo-1588405748880-12d1d2a59f75"],
   "variants":[{"label":"3 مل","size":"3 ml","color":null,"hex":null,"stock":25,"mod":0},{"label":"6 مل","size":"6 ml","color":null,"hex":null,"stock":15,"mod":85000},{"label":"12 مل","size":"12 ml","color":null,"hex":null,"stock":8,"mod":190000}]},
  {"cat":["Perfumes","عطور وجمال"],"name":"Musk Al Tahara Eau de Parfum","name_ar":"عطر مسك الطهارة","sku":"DAO-MSK-02","price":38000,"sale":null,"weight":0.3,"featured":false,"tags":["مسك","عطر يومي"],
   "desc":"Soft white musk perfume, clean and fresh for daily wear.","desc_ar":"مسك أبيض ناعم بانتعاش نظيف يناسب الاستخدام اليومي.\nتركيز Eau de Parfum بثبات 8-10 ساعات.\nمناسب للرجال والنساء.",
   "images":["photo-1592945403244-b3fbafd7f539","photo-1523293182086-7651a899d37f","photo-1615634260167-c8cdede054de"],
   "variants":[{"label":"50 مل","size":"50 ml","color":null,"hex":null,"stock":40,"mod":0},{"label":"100 مل","size":"100 ml","color":null,"hex":null,"stock":30,"mod":22000}]},
  {"cat":["Perfumes","عطور وجمال"],"name":"Premium Bakhoor Mamool","name_ar":"بخور معمول فاخر","sku":"DAO-BKH-03","price":25000,"sale":21000,"weight":0.25,"featured":false,"tags":["بخور","معمول"],
   "desc":"Hand-made bakhoor with oud, rose and amber.","desc_ar":"بخور معمول يدوياً بخلطة العود والورد والعنبر.\nفوحان قوي يعطّر البيت لساعات.\nعلبة 250 جرام محكمة الإغلاق.",
   "images":["photo-1600612253971-422e7f7faeb6","photo-1608571423902-eed4a5ad8108","photo-1602874801007-bd458bb1b8b6"],
   "variants":[{"label":"عود وورد","size":"Oud & Rose","color":"عنابي","hex":"#7B1E2B","stock":30,"mod":0},{"label":"عنبر","size":"Amber","color":"ذهبي","hex":"#C9A227","stock":25,"mod":0}]},
  {"cat":["Perfumes","عطور وجمال"],"name":"Electric Bakhoor Burner","name_ar":"مبخرة كهربائية حديثة","sku":"DAO-BRN-04","price":45000,"sale":39000,"weight":0.6,"featured":true,"tags":["مبخرة","هدايا"],
   "desc":"Rechargeable electric burner with two heat levels.","desc_ar":"مبخرة كهربائية قابلة للشحن بمنفذ USB-C.\nمستويان للحرارة وإطفاء تلقائي للأمان.\nتصميم معدني أنيق يناسب المجالس.",
   "images":["photo-1610461888750-10bfc601b874","photo-1585386959984-a4155224a1ad","photo-1563170351-be82bc888aa4"],
   "variants":[{"label":"ذهبي","size":"Gold","color":"ذهبي","hex":"#C9A227","stock":12,"mod":0},{"label":"أسود","size":"Black","color":"أسود","hex":"#111111","stock":14,"mod":0},{"label":"فضي","size":"Silver","color":"فضي","hex":"#C0C0C0","stock":10,"mod":0}]}
 ]},
 {"uid":"a1000000-0000-4000-8000-000000000002","products":[
  {"cat":["Mobiles","جوالات"],"name":"Galaxy A55 5G","name_ar":"سامسونج جالكسي A55 5G","sku":"TPL-A55-01","price":285000,"sale":265000,"weight":0.21,"featured":true,"tags":["سامسونج","جوال","5G"],
   "desc":"6.6\" Super AMOLED, 50MP camera, 5000mAh battery.","desc_ar":"شاشة Super AMOLED مقاس 6.6 بوصة بتردد 120Hz.\nكاميرا خلفية 50 ميجابكسل بثبات بصري.\nبطارية 5000 مللي أمبير بشحن سريع 25W.\nضمان الوكيل سنة كاملة.",
   "images":["photo-1610945265064-0e34e5519bbf","photo-1511707171634-5f897ff02aa9","photo-1598327105666-5b89351aff97"],
   "variants":[{"label":"أسود / 128GB","size":"128GB","color":"أسود","hex":"#1C1C1E","stock":10,"mod":0},{"label":"أزرق / 128GB","size":"128GB","color":"أزرق","hex":"#9BB7D4","stock":8,"mod":0},{"label":"أسود / 256GB","size":"256GB","color":"أسود","hex":"#1C1C1E","stock":6,"mod":35000}]},
  {"cat":["Tech Accessories","إكسسوارات تقنية"],"name":"True Wireless Earbuds Pro","name_ar":"سماعات لاسلكية برو","sku":"TPL-EAR-02","price":42000,"sale":36000,"weight":0.06,"featured":false,"tags":["سماعات","بلوتوث"],
   "desc":"ANC earbuds with 30h total battery and wireless charging.","desc_ar":"عزل ضوضاء نشط ووضع الشفافية.\nبطارية حتى 30 ساعة مع العلبة وشحن لاسلكي.\nمقاومة للماء والعرق IPX4.",
   "images":["photo-1590658268037-6bf12165a8df","photo-1606220945770-b5b6c2c55bf1","photo-1572569511254-d8f925fe2cbb"],
   "variants":[{"label":"أبيض","size":"White","color":"أبيض","hex":"#F5F5F5","stock":35,"mod":0},{"label":"أسود","size":"Black","color":"أسود","hex":"#111111","stock":30,"mod":0}]},
  {"cat":["Tech Accessories","إكسسوارات تقنية"],"name":"65W GaN Fast Charger","name_ar":"شاحن سريع 65 واط GaN","sku":"TPL-CHG-03","price":24000,"sale":null,"weight":0.12,"featured":false,"tags":["شاحن","شحن سريع"],
   "desc":"Compact 3-port GaN charger for phones and laptops.","desc_ar":"شاحن GaN صغير الحجم بثلاثة منافذ (2×USB-C + USB-A).\nيشحن الجوال واللابتوب معاً بقوة حتى 65 واط.\nحماية من الحرارة وارتفاع الجهد.",
   "images":["photo-1583863788434-e58a36330cf0","photo-1609091839311-d5365f9ff1c5","photo-1615526675159-e248c3021d3f"],
   "variants":[{"label":"أبيض","size":"White","color":"أبيض","hex":"#F5F5F5","stock":50,"mod":0},{"label":"أسود","size":"Black","color":"أسود","hex":"#111111","stock":40,"mod":0}]},
  {"cat":["Tech Accessories","إكسسوارات تقنية"],"name":"Shockproof Clear Case","name_ar":"غطاء حماية شفاف ضد الصدمات","sku":"TPL-CAS-04","price":9000,"sale":7500,"weight":0.04,"featured":false,"tags":["غطاء","حماية"],
   "desc":"Military-grade drop protection, anti-yellowing clear back.","desc_ar":"حماية من السقوط بمعيار عسكري وزوايا مدعّمة.\nظهر شفاف مقاوم للاصفرار.\nيدعم الشحن اللاسلكي.",
   "images":["photo-1601593346740-925612772716","photo-1541877944-ac82a091518a","photo-1586105251261-72a756497a11"],
   "variants":[{"label":"شفاف / A55","size":"A55","color":"شفاف","hex":"#E8EEF2","stock":60,"mod":0},{"label":"شفاف / A35","size":"A35","color":"شفاف","hex":"#E8EEF2","stock":45,"mod":0},{"label":"أسود مطفي / A55","size":"A55","color":"أسود","hex":"#222222","stock":30,"mod":1000}]}
 ]},
 {"uid":"a1000000-0000-4000-8000-000000000003","products":[
  {"cat":["Men Fashion","أزياء رجالية"],"name":"Premium Cotton Thobe","name_ar":"ثوب رجالي قطن فاخر","sku":"BAN-THB-01","price":48000,"sale":42000,"weight":0.7,"featured":true,"tags":["ثوب","قطن"],
   "desc":"Breathable premium cotton thobe with a tailored fit.","desc_ar":"قماش قطني فاخر خفيف ومريح للجو الحار.\nتفصيل مضبوط بياقة صينية وأزرار مخفية.\nلا يتجعد بسهولة ويحافظ على لونه.",
   "images":["photo-1622445275576-721325763afe","photo-1617137968427-85924c800a22","photo-1593030761757-71fae45fa0e7"],
   "variants":[{"label":"أبيض / 54","size":"54","color":"أبيض","hex":"#FFFFFF","stock":12,"mod":0},{"label":"أبيض / 56","size":"56","color":"أبيض","hex":"#FFFFFF","stock":15,"mod":0},{"label":"أبيض / 58","size":"58","color":"أبيض","hex":"#FFFFFF","stock":10,"mod":0},{"label":"رمادي / 56","size":"56","color":"رمادي","hex":"#9CA3AF","stock":8,"mod":3000}]},
  {"cat":["Men Fashion","أزياء رجالية"],"name":"Embroidered Shemagh","name_ar":"شماغ مطرز","sku":"BAN-SHM-02","price":22000,"sale":null,"weight":0.2,"featured":false,"tags":["شماغ"],
   "desc":"Classic red-and-white shemagh with fine embroidery.","desc_ar":"شماغ كلاسيكي بنقشة حمراء وتطريز ناعم على الأطراف.\nقماش ثقيل يحافظ على شكله طوال اليوم.",
   "images":["photo-1590736969955-71cc94901144","photo-1520975916090-3105956dac38","photo-1516826957135-700dedea698c"],
   "variants":[{"label":"أحمر","size":"Standard","color":"أحمر","hex":"#B91C1C","stock":40,"mod":0},{"label":"أبيض","size":"Standard","color":"أبيض","hex":"#FFFFFF","stock":30,"mod":0}]},
  {"cat":["Men Fashion","أزياء رجالية"],"name":"Hadrami Ma'awaz","name_ar":"معوز حضرمي","sku":"BAN-MAW-03","price":18000,"sale":15500,"weight":0.4,"featured":false,"tags":["معوز","تراث"],
   "desc":"Traditional woven ma'awaz in rich classic patterns.","desc_ar":"معوز حضرمي منسوج بنقشات تقليدية أصيلة.\nخامة قطنية متينة وألوان ثابتة.",
   "images":["photo-1603252109303-2751441dd157","photo-1489987707025-afc232f7ea0f","photo-1434389677669-e08b4cac3105"],
   "variants":[{"label":"كحلي","size":"Free","color":"كحلي","hex":"#1E3A5F","stock":20,"mod":0},{"label":"عنابي","size":"Free","color":"عنابي","hex":"#7B1E2B","stock":18,"mod":0},{"label":"أخضر","size":"Free","color":"أخضر","hex":"#166534","stock":15,"mod":0}]},
  {"cat":["Men Fashion","أزياء رجالية"],"name":"Leather Sandals","name_ar":"صندل جلد طبيعي","sku":"BAN-SND-04","price":30000,"sale":26000,"weight":0.8,"featured":true,"tags":["صندل","جلد"],
   "desc":"Hand-stitched genuine leather sandals with soft sole.","desc_ar":"جلد طبيعي مخيط يدوياً.\nنعل طبي مريح للمشي الطويل.",
   "images":["photo-1603487742131-4160ec999306","photo-1560343090-f0409e92791a","photo-1531310197839-ccf54634509e"],
   "variants":[{"label":"بني / 41","size":"41","color":"بني","hex":"#8B5A2B","stock":8,"mod":0},{"label":"بني / 42","size":"42","color":"بني","hex":"#8B5A2B","stock":10,"mod":0},{"label":"بني / 43","size":"43","color":"بني","hex":"#8B5A2B","stock":9,"mod":0},{"label":"أسود / 42","size":"42","color":"أسود","hex":"#111111","stock":7,"mod":0}]}
 ]},
 {"uid":"a1000000-0000-4000-8000-000000000004","products":[
  {"cat":["Home & Kitchen","أدوات منزلية"],"name":"Granite Cookware Set 10pcs","name_ar":"طقم قدور جرانيت 10 قطع","sku":"RKB-CKW-01","price":95000,"sale":82000,"weight":6.5,"featured":true,"tags":["قدور","مطبخ"],
   "desc":"Non-stick granite cookware set with glass lids.","desc_ar":"طقم 10 قطع بطبقة جرانيت مانعة للالتصاق خالية من PFOA.\nأغطية زجاجية مقاومة للحرارة.\nيعمل على جميع أنواع المواقد بما فيها الحثي.",
   "images":["photo-1584990347449-a2d4c2c044c9","photo-1556911220-bff31c812dba","photo-1556909114-f6e7ad7d3136"],
   "variants":[{"label":"أسود","size":"10 pcs","color":"أسود","hex":"#1F2937","stock":10,"mod":0},{"label":"بيج","size":"10 pcs","color":"بيج","hex":"#D6C7A1","stock":8,"mod":0}]},
  {"cat":["Home & Kitchen","أدوات منزلية"],"name":"Electric Kettle 1.7L","name_ar":"غلاية كهربائية 1.7 لتر","sku":"RKB-KTL-02","price":28000,"sale":null,"weight":1.2,"featured":false,"tags":["غلاية","أجهزة صغيرة"],
   "desc":"Stainless steel kettle with auto shut-off.","desc_ar":"جسم ستانلس ستيل وسعة 1.7 لتر.\nإطفاء تلقائي عند الغليان وحماية من التشغيل بدون ماء.\nقدرة 2200 واط لغليان سريع.",
   "images":["photo-1594213114663-d94db9b17126","photo-1585515320310-259814833e62","photo-1570222094114-d054a817e56b"],
   "variants":[{"label":"فضي","size":"1.7L","color":"فضي","hex":"#C0C0C0","stock":25,"mod":0},{"label":"أسود","size":"1.7L","color":"أسود","hex":"#111111","stock":20,"mod":0}]},
  {"cat":["Home & Kitchen","أدوات منزلية"],"name":"Airtight Storage Jars Set","name_ar":"طقم علب حفظ محكمة","sku":"RKB-JAR-03","price":19000,"sale":16000,"weight":1.5,"featured":false,"tags":["تنظيم","حفظ"],
   "desc":"Set of 6 airtight BPA-free jars with labels.","desc_ar":"6 علب بأحجام مختلفة خالية من BPA.\nأغطية محكمة تحفظ الحبوب والبهارات طازجة.\nملصقات مجانية لتنظيم المطبخ.",
   "images":["photo-1584473457406-6240486418e9","photo-1600585152220-90363fe7e115","photo-1556228578-8c89e6adf883"],
   "variants":[{"label":"6 قطع","size":"6 pcs","color":"شفاف","hex":"#E8EEF2","stock":30,"mod":0},{"label":"12 قطعة","size":"12 pcs","color":"شفاف","hex":"#E8EEF2","stock":15,"mod":14000}]},
  {"cat":["Home & Kitchen","أدوات منزلية"],"name":"Professional Knife Set","name_ar":"طقم سكاكين احترافي","sku":"RKB-KNF-04","price":36000,"sale":31000,"weight":1.8,"featured":true,"tags":["سكاكين","مطبخ"],
   "desc":"6 German-steel knives with a wooden block.","desc_ar":"6 سكاكين من الفولاذ الألماني مع قاعدة خشبية.\nمقابض مريحة مانعة للانزلاق.\nحدة تدوم طويلاً وسهلة التنظيف.",
   "images":["photo-1593618998160-e34014e67546","photo-1566454419290-57a0589c9b17","photo-1590794056226-79ef3a8147e1"],
   "variants":[{"label":"خشب طبيعي","size":"6 pcs","color":"بني","hex":"#8B5A2B","stock":18,"mod":0},{"label":"أسود","size":"6 pcs","color":"أسود","hex":"#111111","stock":12,"mod":0}]}
 ]},
 {"uid":"a1000000-0000-4000-8000-000000000005","products":[
  {"cat":["Sports","رياضة ولياقة"],"name":"Pro Running Shoes","name_ar":"حذاء جري احترافي","sku":"SPZ-RUN-01","price":65000,"sale":55000,"weight":0.6,"featured":true,"tags":["جري","حذاء رياضي"],
   "desc":"Lightweight running shoes with responsive cushioning.","desc_ar":"نعل مرن بامتصاص صدمات عالٍ.\nخامة شبكية تسمح بالتهوية.\nوزن خفيف مناسب للجري والمشي اليومي.",
   "images":["photo-1542291026-7eec264c27ff","photo-1606107557195-0e29a4b5b4aa","photo-1595950653106-6c9ebd614d3a"],
   "variants":[{"label":"أسود / 41","size":"41","color":"أسود","hex":"#111111","stock":8,"mod":0},{"label":"أسود / 42","size":"42","color":"أسود","hex":"#111111","stock":10,"mod":0},{"label":"أحمر / 42","size":"42","color":"أحمر","hex":"#DC2626","stock":7,"mod":0},{"label":"أبيض / 43","size":"43","color":"أبيض","hex":"#F5F5F5","stock":9,"mod":0}]},
  {"cat":["Sports","رياضة ولياقة"],"name":"Dri-Fit Training T-Shirt","name_ar":"تيشيرت تدريب سريع الجفاف","sku":"SPZ-TEE-02","price":16000,"sale":null,"weight":0.2,"featured":false,"tags":["تيشيرت","تمارين"],
   "desc":"Moisture-wicking training tee with a slim fit.","desc_ar":"قماش سريع الجفاف يطرد العرق.\nقصّة رياضية مريحة لا تقيّد الحركة.",
   "images":["photo-1581655353564-df123a1eb820","photo-1521572163474-6864f9cf17ab","photo-1583743814966-8936f5b7be1a"],
   "variants":[{"label":"أسود / M","size":"M","color":"أسود","hex":"#111111","stock":20,"mod":0},{"label":"أسود / L","size":"L","color":"أسود","hex":"#111111","stock":18,"mod":0},{"label":"كحلي / L","size":"L","color":"كحلي","hex":"#1E3A5F","stock":15,"mod":0},{"label":"رمادي / XL","size":"XL","color":"رمادي","hex":"#9CA3AF","stock":12,"mod":0}]},
  {"cat":["Sports","رياضة ولياقة"],"name":"Adjustable Dumbbells 20kg","name_ar":"دمبلز قابل للتعديل 20 كجم","sku":"SPZ-DMB-03","price":88000,"sale":79000,"weight":20,"featured":true,"tags":["دمبلز","لياقة منزلية"],
   "desc":"Pair of adjustable dumbbells with secure collars.","desc_ar":"زوج دمبلز بأوزان قابلة للتعديل حتى 20 كجم.\nأقراص مطلية بالمطاط لحماية الأرضية.\nمقابض مانعة للانزلاق.",
   "images":["photo-1583454110551-21f2fa2afe61","photo-1584735935682-2f2b69dff9d2","photo-1517836357463-d25dfeac3438"],
   "variants":[{"label":"10 كجم","size":"10 kg","color":"أسود","hex":"#111111","stock":10,"mod":0},{"label":"20 كجم","size":"20 kg","color":"أسود","hex":"#111111","stock":6,"mod":32000}]},
  {"cat":["Sports","رياضة ولياقة"],"name":"Match Football Size 5","name_ar":"كرة قدم احترافية مقاس 5","sku":"SPZ-BAL-04","price":21000,"sale":18000,"weight":0.43,"featured":false,"tags":["كرة قدم"],
   "desc":"Thermo-bonded match ball for grass and turf.","desc_ar":"كرة مباريات بتقنية اللحام الحراري.\nمناسبة للعشب الطبيعي والصناعي.\nمقاس 5 رسمي.",
   "images":["photo-1614632537190-23e4146777db","photo-1579952363873-27f3bade9f55","photo-1551958219-acbc608c6377"],
   "variants":[{"label":"أبيض/أزرق","size":"5","color":"أبيض","hex":"#FFFFFF","stock":25,"mod":0},{"label":"أصفر","size":"5","color":"أصفر","hex":"#FACC15","stock":20,"mod":0}]}
 ]}
]
$json$;
  store jsonb; prod jsonb; v jsonb;
  m uuid; c uuid; p uuid; i int; total int;
BEGIN
  FOR store IN SELECT * FROM jsonb_array_elements(data) LOOP
    SELECT id INTO m FROM public.merchant_profiles WHERE user_id = (store->>'uid')::uuid;
    IF m IS NULL THEN RAISE EXCEPTION 'merchant profile missing for %', store->>'uid'; END IF;

    FOR prod IN SELECT * FROM jsonb_array_elements(store->'products') LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.products WHERE sku = prod->>'sku');

      SELECT id INTO c FROM public.categories WHERE name_ar = prod->'cat'->>1 LIMIT 1;
      IF c IS NULL THEN
        INSERT INTO public.categories (name, name_ar, icon_url, is_active)
        VALUES (prod->'cat'->>0, prod->'cat'->>1, 'https://picsum.photos/seed/cat-' || md5(prod->'cat'->>0) || '/200', true)
        RETURNING id INTO c;
      END IF;

      SELECT COALESCE(SUM((x->>'stock')::int), 0) INTO total FROM jsonb_array_elements(prod->'variants') x;

      INSERT INTO public.products (
        merchant_id, category_id, name, name_ar, description, description_ar,
        base_price, sale_price, sku, stock_quantity, weight, tags, rating,
        is_active, is_featured, is_approved, approval_status, approved_at,
        og_image_url, meta_title, meta_description
      ) VALUES (
        m, c, prod->>'name', prod->>'name_ar', prod->>'desc', prod->>'desc_ar',
        (prod->>'price')::numeric, NULLIF(prod->>'sale', '')::numeric, prod->>'sku', total,
        (prod->>'weight')::numeric, ARRAY(SELECT jsonb_array_elements_text(prod->'tags')), 4.5 + random() * 0.5,
        true, (prod->>'featured')::boolean, true, 'approved', now(),
        'https://images.unsplash.com/' || (prod->'images'->>0) || '?w=1200',
        prod->>'name_ar', left(prod->>'desc_ar', 150)
      ) RETURNING id INTO p;

      i := 0;
      FOR v IN SELECT * FROM jsonb_array_elements(prod->'images') LOOP
        i := i + 1;
        INSERT INTO public.product_images (product_id, image_url, is_primary, sort_order)
        VALUES (p, 'https://images.unsplash.com/' || (v #>> '{}') || '?w=900', i = 1, i);
      END LOOP;

      i := 0;
      FOR v IN SELECT * FROM jsonb_array_elements(prod->'variants') LOOP
        i := i + 1;
        INSERT INTO public.product_variants (
          product_id, name, name_ar, size, color, color_hex, sku,
          stock_quantity, stock_qty, price_modifier, additional_price, is_active
        ) VALUES (
          p, v->>'label', v->>'label', v->>'label', v->>'color', v->>'hex',
          (prod->>'sku') || '-' || i,
          (v->>'stock')::int, (v->>'stock')::int, (v->>'mod')::numeric, (v->>'mod')::numeric, true
        );
      END LOOP;
    END LOOP;

    -- ساعات العمل: السبت–الخميس 9ص–11م، الجمعة 4م–11م
    INSERT INTO public.merchant_working_hours (merchant_id, day_of_week, open_time, close_time, is_closed)
    SELECT m, d, CASE WHEN d = 5 THEN '16:00'::time ELSE '09:00'::time END, '23:00'::time, false
    FROM generate_series(0, 6) d
    WHERE NOT EXISTS (SELECT 1 FROM public.merchant_working_hours w WHERE w.merchant_id = m AND w.day_of_week = d);
  END LOOP;
END $$;

-- مناطق الخدمة لمدن المتاجر
INSERT INTO public.service_areas (city, country, is_active, delivery_available)
SELECT c, 'YE', true, true FROM (VALUES ('صنعاء'),('عدن'),('تعز'),('المكلا')) v(c)
WHERE NOT EXISTS (SELECT 1 FROM public.service_areas s WHERE s.city = v.c);

-- تحقق سريع
SELECT mp.store_name, mp.city, count(DISTINCT p.id) AS products, count(pv.id) AS variants, sum(pv.stock_qty) AS stock
FROM public.merchant_profiles mp
JOIN public.products p ON p.merchant_id = mp.id
LEFT JOIN public.product_variants pv ON pv.product_id = p.id
WHERE mp.user_id::text LIKE 'a1000000-0000-4000-8000-00000000000_'
GROUP BY mp.store_name, mp.city ORDER BY mp.store_name;
