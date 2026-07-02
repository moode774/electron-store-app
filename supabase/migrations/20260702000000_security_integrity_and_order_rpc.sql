-- ============================================================
-- SECURITY + INTEGRITY HARDENING  (2026-07-02)
--
-- يعالج هذا الملف الثغرات الحرجة المكتشفة في تقرير الفحص:
--   C3  كشف بيانات: تفعيل RLS + سياسات ملكية على الجداول المكشوفة.
--   C4  تصعيد صلاحيات: منع تعديل الدور/الحالة على users إلا للأدمن.
--   C5  دورة الطلب: RPC آمنة لإنشاء الطلب وتحديث حالته.
--   C6  التلاعب بالأسعار: حساب الإجماليات في الخادم فقط.
--   H1/H2  الكوبونات: تحقق وفرض استخدام في الخادم.
--
-- ⚠️ ملاحظة مهمة قبل التطبيق:
--   القاعدة الحيّة انحرفت عن ملفات الـ migration (أسماء أعمدة مختلفة في
--   coupons/chat/reviews...). لذلك كُتب هذا الملف "دفاعياً": كل سياسة تُنشأ
--   داخل بلوك يتجاوز الأعمدة/الجداول غير الموجودة بدل الفشل. طبّقه على فرع
--   staging عبر `supabase db push` وراجع التحذيرات قبل الإنتاج.
-- ============================================================

-- ------------------------------------------------------------
-- 0) دوال مساعدة
-- ------------------------------------------------------------
-- هل المستخدم الحالي أدمن؟ (SECURITY DEFINER لتجاوز RLS بأمان)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- منشئ سياسات دفاعي: يتجاوز الأعمدة/الجداول غير الموجودة بدل الفشل.
CREATE OR REPLACE FUNCTION public._mk_policy(
  p_name text, p_table text, p_cmd text, p_using text, p_check text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p_name, p_table);
  IF p_cmd = 'INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s);',
      p_name, p_table, p_check);
  ELSIF p_check IS NULL THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s);',
      p_name, p_table, p_cmd, p_using);
  ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s);',
      p_name, p_table, p_cmd, p_using, p_check);
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE 'skip policy % (missing column) on %', p_name, p_table;
  WHEN undefined_table  THEN RAISE NOTICE 'skip policy % (missing table) on %',  p_name, p_table;
END $$;

-- ------------------------------------------------------------
-- 1) تفعيل RLS على الجداول المكشوفة (C3)
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'addresses','customer_profiles','chat_conversations','chat_messages',
    'notifications','carts','cart_items','wishlists','refund_requests',
    'product_images','product_variants','advertisements','complaints',
    'order_tracking','platform_settings','inventory_logs','store_follows'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'skip RLS (missing table) %', t;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) سياسات الملكية
-- ------------------------------------------------------------
-- العناوين: صاحبها فقط
SELECT public._mk_policy('addresses_owner_sel','addresses','SELECT','user_id = auth.uid()', NULL);
SELECT public._mk_policy('addresses_owner_ins','addresses','INSERT', NULL, 'user_id = auth.uid()');
SELECT public._mk_policy('addresses_owner_upd','addresses','UPDATE','user_id = auth.uid()','user_id = auth.uid()');
SELECT public._mk_policy('addresses_owner_del','addresses','DELETE','user_id = auth.uid()', NULL);

-- ملف العميل
SELECT public._mk_policy('cust_prof_owner_sel','customer_profiles','SELECT','user_id = auth.uid()', NULL);
SELECT public._mk_policy('cust_prof_owner_ins','customer_profiles','INSERT', NULL, 'user_id = auth.uid()');
SELECT public._mk_policy('cust_prof_owner_upd','customer_profiles','UPDATE','user_id = auth.uid()','user_id = auth.uid()');

-- الإشعارات: قراءة/تحديث (تعليم كمقروء) لصاحبها؛ الإدراج من الخادم فقط
SELECT public._mk_policy('notif_owner_sel','notifications','SELECT','user_id = auth.uid()', NULL);
SELECT public._mk_policy('notif_owner_upd','notifications','UPDATE','user_id = auth.uid()','user_id = auth.uid()');

-- السلة وعناصرها
SELECT public._mk_policy('carts_owner_sel','carts','SELECT','user_id = auth.uid()', NULL);
SELECT public._mk_policy('carts_owner_ins','carts','INSERT', NULL, 'user_id = auth.uid()');
SELECT public._mk_policy('carts_owner_upd','carts','UPDATE','user_id = auth.uid()','user_id = auth.uid()');
SELECT public._mk_policy('carts_owner_del','carts','DELETE','user_id = auth.uid()', NULL);
SELECT public._mk_policy('cart_items_owner_all','cart_items','ALL',
  'cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())',
  'cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())');

-- المفضلة والمتابعة
SELECT public._mk_policy('wishlist_owner_all','wishlists','ALL','user_id = auth.uid()','user_id = auth.uid()');
SELECT public._mk_policy('follows_owner_all','store_follows','ALL','user_id = auth.uid()','user_id = auth.uid()');

-- طلبات الاسترجاع والشكاوى: صاحبها فقط
SELECT public._mk_policy('refund_owner_sel','refund_requests','SELECT','customer_id = auth.uid()', NULL);
SELECT public._mk_policy('refund_owner_ins','refund_requests','INSERT', NULL, 'customer_id = auth.uid()');
SELECT public._mk_policy('complaint_owner_sel','complaints','SELECT','user_id = auth.uid()', NULL);
SELECT public._mk_policy('complaint_owner_ins','complaints','INSERT', NULL, 'user_id = auth.uid()');

-- صور/خيارات المنتج: قراءة عامة، كتابة لصاحب المنتج فقط
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS product_images_public_read ON public.product_images';
  EXECUTE 'CREATE POLICY product_images_public_read ON public.product_images FOR SELECT USING (true)';
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
SELECT public._mk_policy('product_images_merchant_write','product_images','ALL',
  'product_id IN (SELECT id FROM public.products WHERE merchant_id = auth.uid())',
  'product_id IN (SELECT id FROM public.products WHERE merchant_id = auth.uid())');
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS product_variants_public_read ON public.product_variants';
  EXECUTE 'CREATE POLICY product_variants_public_read ON public.product_variants FOR SELECT USING (true)';
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
SELECT public._mk_policy('product_variants_merchant_write','product_variants','ALL',
  'product_id IN (SELECT id FROM public.products WHERE merchant_id = auth.uid())',
  'product_id IN (SELECT id FROM public.products WHERE merchant_id = auth.uid())');

-- الإعلانات وإعدادات المنصة: قراءة عامة فقط (لا كتابة من العميل)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS ads_public_read ON public.advertisements';
  EXECUTE 'CREATE POLICY ads_public_read ON public.advertisements FOR SELECT USING (is_active = true)';
EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN
  EXECUTE 'CREATE POLICY ads_public_read ON public.advertisements FOR SELECT USING (true)';
WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS platform_settings_public_read ON public.platform_settings';
  EXECUTE 'CREATE POLICY platform_settings_public_read ON public.platform_settings FOR SELECT USING (true)';
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- تتبّع الطلب + سجل المخزون: قراءة للأطراف المعنية / صاحب المنتج
SELECT public._mk_policy('order_tracking_involved_sel','order_tracking','SELECT',
  'order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid() OR merchant_id = auth.uid() OR delivery_id = auth.uid())', NULL);
SELECT public._mk_policy('inventory_logs_merchant_sel','inventory_logs','SELECT',
  'product_id IN (SELECT id FROM public.products WHERE merchant_id = auth.uid())', NULL);

-- المحادثات (شكل القاعدة الحيّة: customer_id/merchant_id)
SELECT public._mk_policy('chat_conv_party_sel','chat_conversations','SELECT',
  'customer_id = auth.uid() OR merchant_id = auth.uid()', NULL);
SELECT public._mk_policy('chat_conv_party_ins','chat_conversations','INSERT', NULL,
  'customer_id = auth.uid() OR merchant_id = auth.uid()');
SELECT public._mk_policy('chat_conv_party_upd','chat_conversations','UPDATE',
  'customer_id = auth.uid() OR merchant_id = auth.uid()','customer_id = auth.uid() OR merchant_id = auth.uid()');
SELECT public._mk_policy('chat_msg_party_sel','chat_messages','SELECT',
  'conversation_id IN (SELECT id FROM public.chat_conversations WHERE customer_id = auth.uid() OR merchant_id = auth.uid())', NULL);
SELECT public._mk_policy('chat_msg_party_ins','chat_messages','INSERT', NULL,
  'sender_id = auth.uid() AND conversation_id IN (SELECT id FROM public.chat_conversations WHERE customer_id = auth.uid() OR merchant_id = auth.uid())');

-- ------------------------------------------------------------
-- 3) منع تصعيد الصلاحيات على users (C4)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW; -- الأدمن يدير كل الحقول
  END IF;
  -- أي مستخدم عادي: تثبيت الحقول الحسّاسة على قيمها القديمة
  NEW.role          := OLD.role;
  NEW.is_active     := OLD.is_active;
  NEW.is_verified   := OLD.is_verified;
  NEW.admin_role_id := OLD.admin_role_id;
  NEW.id            := OLD.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_user_fields ON public.users;
CREATE TRIGGER trg_protect_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_sensitive_fields();

-- ------------------------------------------------------------
-- 4) إنشاء الطلب في الخادم مع حساب الأسعار والمخزون (C5/C6/H1/H2)
--    p_items: jsonb مثل '[{"product_id":"...","quantity":2}]'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_merchant_id   uuid,
  p_address_id    uuid,
  p_payment_method text,
  p_items         jsonb,
  p_coupon_code   text DEFAULT NULL,
  p_notes         text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer   uuid := auth.uid();
  v_order_id   uuid;
  v_order_no   text;
  v_subtotal   numeric := 0;
  v_delivery   numeric;
  v_discount   numeric := 0;
  v_total      numeric;
  v_item       jsonb;
  v_pid        uuid;
  v_qty        integer;
  v_price      numeric;
  v_active     boolean;
  v_pmerchant  uuid;
  v_coupon     record;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;

  -- العنوان يجب أن يخصّ العميل
  IF NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = p_address_id AND user_id = v_customer) THEN
    RAISE EXCEPTION 'INVALID_ADDRESS';
  END IF;

  -- احسب المجموع من أسعار الخادم مع قفل صفوف المنتجات وفحص المخزون
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));

    SELECT COALESCE(sale_price, base_price), is_active, merchant_id
      INTO v_price, v_active, v_pmerchant
      FROM public.products WHERE id = v_pid FOR UPDATE;

    IF NOT FOUND OR v_active IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', v_pid; END IF;
    IF v_pmerchant <> p_merchant_id THEN RAISE EXCEPTION 'PRODUCT_WRONG_MERCHANT:%', v_pid; END IF;

    -- خصم المخزون بأمان إن كان العمود موجوداً (يمنع البيع الزائد)
    BEGIN
      EXECUTE 'UPDATE public.products SET stock_quantity = stock_quantity - $1
               WHERE id = $2 AND stock_quantity >= $1'
        USING v_qty, v_pid;
      IF NOT FOUND THEN RAISE EXCEPTION 'OUT_OF_STOCK:%', v_pid; END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL; -- لا يوجد عمود مخزون على products (المخزون على الخيارات) → تخطَّ
    END;

    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  -- رسوم التوصيل من إعدادات المنصة (غير قابلة للتلاعب من العميل)
  BEGIN
    SELECT COALESCE((value#>>'{}')::numeric, 1500) INTO v_delivery
      FROM public.platform_settings WHERE key = 'default_delivery_fee';
  EXCEPTION WHEN OTHERS THEN v_delivery := 1500; END;
  v_delivery := COALESCE(v_delivery, 1500);

  -- الكوبون (تحقق وفرض في الخادم)
  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    SELECT * INTO v_coupon FROM public.coupons
      WHERE code = upper(trim(p_coupon_code)) AND is_active = true FOR UPDATE;
    IF FOUND THEN
      IF (v_coupon.expires_at IS NULL OR v_coupon.expires_at >= now())
         AND (v_coupon.min_order_amount IS NULL OR v_subtotal >= v_coupon.min_order_amount)
         AND (v_coupon.max_uses IS NULL OR v_coupon.used_count < v_coupon.max_uses)
         AND NOT EXISTS (SELECT 1 FROM public.coupon_usage
                         WHERE coupon_id = v_coupon.id AND user_id = v_customer)
      THEN
        IF v_coupon.discount_type = 'percentage'
          THEN v_discount := round(v_subtotal * v_coupon.discount_value / 100);
          ELSE v_discount := v_coupon.discount_value;
        END IF;
        IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;
      END IF;
    END IF;
  END IF;

  v_total := v_subtotal + v_delivery - v_discount;
  v_order_no := 'ORD-' || to_char(now(),'YYMMDD') || '-' || substr(md5(random()::text),1,6);

  INSERT INTO public.orders(
    order_number, customer_id, merchant_id, address_id, status,
    subtotal, delivery_fee, discount_amount, tax_amount, total_amount,
    payment_method, payment_status, notes,
    coupon_id
  ) VALUES (
    v_order_no, v_customer, p_merchant_id, p_address_id, 'pending',
    v_subtotal, v_delivery, v_discount, 0, v_total,
    p_payment_method::payment_method_enum, 'pending', p_notes,
    CASE WHEN v_discount > 0 THEN v_coupon.id ELSE NULL END
  ) RETURNING id INTO v_order_id;

  -- عناصر الطلب بأسعار الخادم
  INSERT INTO public.order_items(order_id, product_id, quantity, unit_price, total_price, product_name)
  SELECT v_order_id,
         (it->>'product_id')::uuid,
         GREATEST(1, COALESCE((it->>'quantity')::int,1)),
         COALESCE(p.sale_price, p.base_price),
         COALESCE(p.sale_price, p.base_price) * GREATEST(1, COALESCE((it->>'quantity')::int,1)),
         p.name
  FROM jsonb_array_elements(p_items) it
  JOIN public.products p ON p.id = (it->>'product_id')::uuid;

  -- تسجيل استخدام الكوبون + زيادة العدّاد
  IF v_discount > 0 THEN
    INSERT INTO public.coupon_usage(coupon_id, user_id, order_id) VALUES (v_coupon.id, v_customer, v_order_id);
    UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
  END IF;

  -- أثر المخزون + تتبّع مبدئي (تجاهل الأخطاء غير الحرجة)
  BEGIN
    INSERT INTO public.order_tracking(order_id, status, created_by) VALUES (v_order_id, 'pending', v_customer);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('id', v_order_id, 'order_number', v_order_no, 'total', v_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.place_order(uuid,uuid,text,jsonb,text,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.place_order(uuid,uuid,text,jsonb,text,text) TO authenticated;

-- ------------------------------------------------------------
-- 5) معاينة الكوبون للعميل (بدون كشف جدول coupons)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_subtotal numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_c record; v_discount numeric := 0;
BEGIN
  SELECT * INTO v_c FROM public.coupons WHERE code = upper(trim(p_code)) AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'discount',0,'message','كود الخصم غير صحيح'); END IF;
  IF v_c.expires_at IS NOT NULL AND v_c.expires_at < now() THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','انتهت صلاحية هذا الكود'); END IF;
  IF v_c.min_order_amount IS NOT NULL AND p_subtotal < v_c.min_order_amount THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','لم يتحقق الحد الأدنى للطلب'); END IF;
  IF v_c.max_uses IS NOT NULL AND v_c.used_count >= v_c.max_uses THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','انتهت الكمية المتاحة لهذا الكود'); END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_usage WHERE coupon_id = v_c.id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('valid',false,'discount',0,'message','استخدمت هذا الكود من قبل'); END IF;
  IF v_c.discount_type = 'percentage'
    THEN v_discount := round(p_subtotal * v_c.discount_value / 100);
    ELSE v_discount := v_c.discount_value;
  END IF;
  IF v_discount > p_subtotal THEN v_discount := p_subtotal; END IF;
  RETURN jsonb_build_object('valid',true,'discount',v_discount,'message','تم تطبيق الخصم');
END $$;
REVOKE EXECUTE ON FUNCTION public.preview_coupon(text,numeric) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.preview_coupon(text,numeric) TO authenticated;

-- ------------------------------------------------------------
-- 6) تحديث حالة الطلب بضوابط الدور والانتقالات (C5)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_o record; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  -- التاجر: تأكيد/تجهيز/جاهز/إلغاء طلبه
  IF v_uid = v_o.merchant_id AND p_status IN ('confirmed','preparing','ready','cancelled') THEN NULL;
  -- المندوب: استلام/في الطريق/تسليم لطلب مُسند له
  ELSIF v_uid = v_o.delivery_id AND p_status IN ('picked_up','on_the_way','delivered') THEN NULL;
  -- العميل: إلغاء طلب لم يُجهَّز بعد
  ELSIF v_uid = v_o.customer_id AND p_status = 'cancelled' AND v_o.status IN ('pending','confirmed') THEN NULL;
  ELSE
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  UPDATE public.orders
     SET status = p_status::order_status_enum,
         delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
         cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END
   WHERE id = p_order_id;

  BEGIN
    INSERT INTO public.order_tracking(order_id, status, created_by) VALUES (p_order_id, p_status::order_status_enum, v_uid);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_order_status(uuid,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_order_status(uuid,text) TO authenticated;

-- ------------------------------------------------------------
-- 7) حذف الحساب نهائياً (مطلب متاجر التطبيقات)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  -- حذف سجل users يُسقط تِبعاً (ON DELETE CASCADE) الملفات والعناوين والسلة...
  DELETE FROM public.users WHERE id = v_uid;
  -- حذف حساب المصادقة نفسه
  DELETE FROM auth.users WHERE id = v_uid;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- تنظيف الدالة المساعدة المؤقتة
DROP FUNCTION IF EXISTS public._mk_policy(text,text,text,text,text);
