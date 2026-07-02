-- ============================================================
-- RLS PARITY & FIXES — سدّ فجوات initial_rls التي تُعطّل التطبيق
-- على أي بناء جديد وتفتح ثغرات أمنية:
--   * orders بلا INSERT/UPDATE → الدفع وتحديثات الحالة مرفوضة.
--   * المندوب لا يرى الطلبات الجاهزة غير المُسندة.
--   * coupons محجوبة كلياً (USING false) عن القراءة.
--   * users قراءة ذاتية فقط → لا اسم/هاتف للعميل عند التاجر والمندوب.
--   * لا INSERT لملفَي التاجر/المندوب + عمود id بلا default.
--   * customer_profiles لا يُنشأ أبداً → الولاء ميت.
--   * جداول حساسة (addresses, notifications, chat, ...) بلا RLS إطلاقاً.
--   * لا سياسات رفع للتخزين (products/stores/avatars).
-- كل السياسات إضافية (permissive تُجمع بـ OR) وكل العبارات idempotent —
-- آمنة على قاعدة حية تملك سياسات مكافئة بأسماء أخرى.
-- ============================================================

-- ============================================================
-- 0) id الافتراضي لملفَي التاجر/المندوب (id = user_id علاقة 1:1)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_profile_id_from_user()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.id := COALESCE(NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_profile_id ON public.merchant_profiles;
CREATE TRIGGER trg_merchant_profile_id
  BEFORE INSERT ON public.merchant_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_id_from_user();

DROP TRIGGER IF EXISTS trg_delivery_profile_id ON public.delivery_profiles;
CREATE TRIGGER trg_delivery_profile_id
  BEFORE INSERT ON public.delivery_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_id_from_user();

-- إنشاء ملفات التاجر/المندوب (التسجيل) — للمالك فقط
DROP POLICY IF EXISTS merchant_profiles_insert_own ON public.merchant_profiles;
CREATE POLICY merchant_profiles_insert_own ON public.merchant_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS delivery_profiles_insert_own ON public.delivery_profiles;
CREATE POLICY delivery_profiles_insert_own ON public.delivery_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 1) users — إدراج ذاتي + قراءة أطراف الطلب/الدردشة لبعضهم
-- ============================================================
DROP POLICY IF EXISTS users_insert_self ON public.users;
CREATE POLICY users_insert_self ON public.users
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- أطراف الطلب الواحد يرون بيانات بعضهم الأساسية (اسم/هاتف للتواصل)
DROP POLICY IF EXISTS users_read_order_parties ON public.users;
CREATE POLICY users_read_order_parties ON public.users
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE (o.customer_id = users.id OR o.merchant_id = users.id OR o.delivery_id = users.id)
        AND (o.customer_id = auth.uid() OR o.merchant_id = auth.uid() OR o.delivery_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS users_read_chat_parties ON public.users;
CREATE POLICY users_read_chat_parties ON public.users
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE (c.customer_id = users.id OR c.merchant_id = users.id)
        AND (c.customer_id = auth.uid() OR c.merchant_id = auth.uid())
    )
  );

-- ============================================================
-- 2) orders — دورة حياة الطلب كاملة
-- ============================================================
-- العميل يُنشئ طلبه (pending فقط)
DROP POLICY IF EXISTS orders_insert_customer ON public.orders;
CREATE POLICY orders_insert_customer ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND status = 'pending');

-- التاجر: قبول/تجهيز/جاهز/رفض لطلباته قبل التسليم للمندوب
DROP POLICY IF EXISTS orders_update_merchant ON public.orders;
CREATE POLICY orders_update_merchant ON public.orders
  FOR UPDATE TO authenticated
  USING (merchant_id = auth.uid() AND status IN ('pending','confirmed','preparing'))
  WITH CHECK (merchant_id = auth.uid() AND status IN ('confirmed','preparing','ready','cancelled'));

-- العميل: إلغاء طلبه قبل الجاهزية فقط
DROP POLICY IF EXISTS orders_update_customer_cancel ON public.orders;
CREATE POLICY orders_update_customer_cancel ON public.orders
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() AND status IN ('pending','confirmed','preparing'))
  WITH CHECK (customer_id = auth.uid() AND status = 'cancelled');

-- المندوب: خطوات التوصيل على طلبه المُسنَد
DROP POLICY IF EXISTS orders_update_delivery ON public.orders;
CREATE POLICY orders_update_delivery ON public.orders
  FOR UPDATE TO authenticated
  USING (delivery_id = auth.uid() AND status IN ('assigned','picked_up','on_the_way'))
  WITH CHECK (delivery_id = auth.uid() AND status IN ('picked_up','on_the_way','delivered'));

-- المندوبون يرون الطلبات الجاهزة غير المُسندة (عروض التوصيل)
DROP POLICY IF EXISTS orders_ready_for_couriers ON public.orders;
CREATE POLICY orders_ready_for_couriers ON public.orders
  FOR SELECT TO authenticated
  USING (
    status = 'ready' AND delivery_id IS NULL
    AND EXISTS (SELECT 1 FROM public.delivery_profiles dp WHERE dp.user_id = auth.uid())
  );

-- ============================================================
-- 3) addresses — مالكها + أطراف الطلب المرتبط بها
-- ============================================================
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addresses_owner ON public.addresses;
CREATE POLICY addresses_owner ON public.addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- التاجر/المندوب يقرأ عنوان الطلب الذي هو طرف فيه
DROP POLICY IF EXISTS addresses_order_parties_read ON public.addresses;
CREATE POLICY addresses_order_parties_read ON public.addresses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.address_id = addresses.id
        AND (o.merchant_id = auth.uid() OR o.delivery_id = auth.uid())
    )
  );

-- المندوبون يرون عنوان الطلبات الجاهزة غير المُسندة (لتقييم العرض)
DROP POLICY IF EXISTS addresses_ready_orders_couriers ON public.addresses;
CREATE POLICY addresses_ready_orders_couriers ON public.addresses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.address_id = addresses.id AND o.status = 'ready' AND o.delivery_id IS NULL
    )
    AND EXISTS (SELECT 1 FROM public.delivery_profiles dp WHERE dp.user_id = auth.uid())
  );

-- ============================================================
-- 4) coupons — قراءة الفعّالة (كانت محجوبة كلياً بـ USING false)
-- ============================================================
DROP POLICY IF EXISTS coupons_read_active ON public.coupons;
CREATE POLICY coupons_read_active ON public.coupons
  FOR SELECT TO authenticated USING (is_active = true);

-- ============================================================
-- 5) تفعيل RLS على الجداول المكشوفة + سياسات المالك/الأطراف
-- ============================================================
ALTER TABLE public.customer_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_follows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_groups       ENABLE ROW LEVEL SECURITY;

-- customer_profiles: المالك يقرأ ويحدّث (الإنشاء عبر التريغر أدناه)
DROP POLICY IF EXISTS customer_profiles_owner ON public.customer_profiles;
CREATE POLICY customer_profiles_owner ON public.customer_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS customer_profiles_owner_update ON public.customer_profiles;
CREATE POLICY customer_profiles_owner_update ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- notifications: المالك يقرأ ويعلّم كمقروء (الإدراج عبر تريغرات definer)
DROP POLICY IF EXISTS notifications_owner_read ON public.notifications;
CREATE POLICY notifications_owner_read ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- wishlists: المالك فقط
DROP POLICY IF EXISTS wishlists_owner ON public.wishlists;
CREATE POLICY wishlists_owner ON public.wishlists
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- store_follows: إدارة المالك + قراءة عامة (لعدّاد المتابعين)
DROP POLICY IF EXISTS store_follows_owner ON public.store_follows;
CREATE POLICY store_follows_owner ON public.store_follows
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS store_follows_public_read ON public.store_follows;
CREATE POLICY store_follows_public_read ON public.store_follows
  FOR SELECT TO authenticated USING (true);

-- chat: طرفا المحادثة فقط
DROP POLICY IF EXISTS chat_conversations_parties ON public.chat_conversations;
CREATE POLICY chat_conversations_parties ON public.chat_conversations
  FOR ALL TO authenticated
  USING (customer_id = auth.uid() OR merchant_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() OR merchant_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_member_read ON public.chat_messages;
CREATE POLICY chat_messages_member_read ON public.chat_messages
  FOR SELECT TO authenticated USING (
    conversation_id IN (
      SELECT id FROM public.chat_conversations
      WHERE customer_id = auth.uid() OR merchant_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS chat_messages_member_insert ON public.chat_messages;
CREATE POLICY chat_messages_member_insert ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.chat_conversations
      WHERE customer_id = auth.uid() OR merchant_id = auth.uid()
    )
  );

-- refund_requests: العميل يقرأ وينشئ طلباته (المراجعة للأدمن)
DROP POLICY IF EXISTS refunds_customer_read ON public.refund_requests;
CREATE POLICY refunds_customer_read ON public.refund_requests
  FOR SELECT TO authenticated USING (customer_id = auth.uid());
DROP POLICY IF EXISTS refunds_customer_insert ON public.refund_requests;
CREATE POLICY refunds_customer_insert ON public.refund_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND status = 'pending');

-- product_variants / product_images: قراءة عامة + إدارة تاجر المنتج
DROP POLICY IF EXISTS variants_public_read ON public.product_variants;
CREATE POLICY variants_public_read ON public.product_variants
  FOR SELECT USING (true);
DROP POLICY IF EXISTS variants_merchant_all ON public.product_variants;
CREATE POLICY variants_merchant_all ON public.product_variants
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.merchant_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.merchant_id = auth.uid())
  );

DROP POLICY IF EXISTS images_public_read ON public.product_images;
CREATE POLICY images_public_read ON public.product_images
  FOR SELECT USING (true);
DROP POLICY IF EXISTS images_merchant_all ON public.product_images;
CREATE POLICY images_merchant_all ON public.product_images
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND p.merchant_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND p.merchant_id = auth.uid())
  );

-- order_tracking: أطراف الطلب يقرؤون سجله (الكتابة عبر التريغر)
DROP POLICY IF EXISTS order_tracking_parties_read ON public.order_tracking;
CREATE POLICY order_tracking_parties_read ON public.order_tracking
  FOR SELECT TO authenticated USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE customer_id = auth.uid() OR merchant_id = auth.uid() OR delivery_id = auth.uid()
    )
  );

-- advertisements: قراءة الفعّالة
DROP POLICY IF EXISTS ads_public_read ON public.advertisements;
CREATE POLICY ads_public_read ON public.advertisements
  FOR SELECT USING (is_active = true);

-- complaints: المالك
DROP POLICY IF EXISTS complaints_owner ON public.complaints;
CREATE POLICY complaints_owner ON public.complaints
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- carts/cart_items: المالك (غير مستخدمة حالياً — تُقفل احتياطاً)
DROP POLICY IF EXISTS carts_owner ON public.carts;
CREATE POLICY carts_owner ON public.carts
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS cart_items_owner ON public.cart_items;
CREATE POLICY cart_items_owner ON public.cart_items
  FOR ALL TO authenticated USING (
    cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
  ) WITH CHECK (
    cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
  );

-- ============================================================
-- 6) إنشاء customer_profiles تلقائياً (كان الولاء ميتاً بدونه)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, phone, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  ON CONFLICT (id) DO NOTHING;

  -- ملف نقاط الولاء/المحفظة لكل مستخدم
  INSERT INTO public.customer_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- تعويض المستخدمين الحاليين بلا ملف
INSERT INTO public.customer_profiles (user_id)
SELECT u.id FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM public.customer_profiles cp WHERE cp.user_id = u.id);

-- ============================================================
-- 7) التخزين — رفع الصور للسلال العامة (كان مرفوضاً في البناء الجديد)
-- ============================================================
DROP POLICY IF EXISTS app_public_buckets_insert ON storage.objects;
CREATE POLICY app_public_buckets_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('products','stores','avatars'));

DROP POLICY IF EXISTS app_public_buckets_update ON storage.objects;
CREATE POLICY app_public_buckets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('products','stores','avatars'))
  WITH CHECK (bucket_id IN ('products','stores','avatars'));
