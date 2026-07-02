-- ============================================================
-- ADMIN ACCESS — صلاحيات لوحة الأدمن عبر RLS
-- الأدمن = مستخدم في public.users بدور 'admin'. كل السياسات إضافية
-- (permissive) فلا تُغيّر سلوك المستخدمين العاديين إطلاقاً.
-- كل العبارات idempotent وغير مُتلِفة.
-- ============================================================

-- ---- 1) الدالة المساعدة: هل المستخدم الحالي أدمن؟ ----------------
-- SECURITY DEFINER لتجاوز RLS على users نفسها (لا recursion).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---- 2) قراءة الأدمن للجداول التي تعرضها اللوحة -------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','merchant_profiles','delivery_profiles','orders','order_items',
    'products','withdrawal_requests','refund_requests','support_tickets',
    'support_messages','coupons','wallet_transactions','delivery_earnings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_select_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY admin_select_%I ON public.%I FOR SELECT TO authenticated USING (public.is_admin());',
      t, t
    );
  END LOOP;
END $$;

-- ---- 3) تحديث الأدمن (اعتماد/تعليق، تسوية استرجاع، إدارة تذاكر وكوبونات) ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','merchant_profiles','delivery_profiles',
    'refund_requests','support_tickets','coupons'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_update_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY admin_update_%I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());',
      t, t
    );
  END LOOP;
END $$;

-- ---- 4) إدراج الأدمن (ردود الدعم، كوبونات، إشعارات) --------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['support_messages','coupons','notifications']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_insert_%I ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY admin_insert_%I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin());',
      t, t
    );
  END LOOP;
END $$;

-- ---- 5) قراءة الأدمن لوثائق المندوبين (سلة documents الخاصة) -------
DROP POLICY IF EXISTS documents_admin_read ON storage.objects;
CREATE POLICY documents_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin());

-- ---- 6) تسوية طلب السحب (المسار الوحيد لتغيير حالته) ---------------
-- عند "تم التحويل": يخصم رصيد المندوب، ويسجّل قيد محفظة (debit) للطرفين،
-- ويُشعر صاحب الطلب بالنتيجة في كل الحالات.
CREATE OR REPLACE FUNCTION public.admin_settle_withdrawal(
  p_id uuid, p_status text, p_note text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_status NOT IN ('approved','rejected','paid') THEN
    RAISE EXCEPTION 'invalid status %', p_status;
  END IF;

  SELECT * INTO r FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal not found'; END IF;
  IF r.status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'already settled';
  END IF;

  UPDATE public.withdrawal_requests
     SET status = p_status,
         admin_note = COALESCE(p_note, admin_note),
         reviewed_by = auth.uid(),
         reviewed_at = NOW()
   WHERE id = p_id;

  IF p_status = 'paid' THEN
    IF r.role = 'delivery' THEN
      UPDATE public.delivery_profiles
         SET wallet_balance = COALESCE(wallet_balance, 0) - r.amount
       WHERE user_id = r.user_id
       RETURNING wallet_balance INTO v_balance;
    ELSE
      SELECT COALESCE((
        SELECT balance_after FROM public.wallet_transactions
        WHERE user_id = r.user_id ORDER BY created_at DESC LIMIT 1
      ), 0) - r.amount INTO v_balance;
    END IF;

    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, description, reference_id)
    VALUES (r.user_id, 'debit', r.amount, COALESCE(v_balance, 0),
            'سحب رصيد — ' || COALESCE(r.method, ''), r.id);
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, channel)
  VALUES (
    r.user_id, 'طلب السحب',
    CASE p_status
      WHEN 'paid'     THEN 'تم تحويل مبلغ ' || r.amount || ' ر.ي إلى حسابك (' || COALESCE(r.method,'') || ')'
      WHEN 'approved' THEN 'تمت الموافقة على طلب السحب وجارٍ التحويل'
      ELSE 'تم رفض طلب السحب' || COALESCE(' — ' || p_note, '')
    END,
    'withdrawal', 'in_app'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_settle_withdrawal(uuid, text, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_settle_withdrawal(uuid, text, text) TO authenticated;
