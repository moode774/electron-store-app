-- ============================================================
-- ADMIN ACCESS POLICIES + PUSH DEVICE TOKENS  (2026-07-02)
-- يعتمد على public.is_admin() المُعرّفة في الملف السابق.
-- كل السياسات دفاعية (تتجاوز الجداول غير الموجودة).
-- ============================================================

CREATE OR REPLACE FUNCTION public._mk_admin_policy(
  p_name text, p_table text, p_cmd text, p_expr text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', p_name, p_table);
  IF p_cmd = 'INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s);', p_name, p_table, p_expr);
  ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s);', p_name, p_table, p_cmd, p_expr, p_expr);
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE 'skip admin policy % (missing column) on %', p_name, p_table;
  WHEN undefined_table  THEN RAISE NOTICE 'skip admin policy % (missing table) on %',  p_name, p_table;
END $$;

-- الأدمن يقرأ/يعدّل الجداول الإدارية
SELECT public._mk_admin_policy('users_admin_sel','users','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('users_admin_upd','users','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('merchants_admin_upd','merchant_profiles','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('delivery_admin_sel','delivery_profiles','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('delivery_admin_upd','delivery_profiles','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('orders_admin_sel','orders','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('orders_admin_upd','orders','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('products_admin_all','products','ALL','public.is_admin()');
SELECT public._mk_admin_policy('categories_admin_all','categories','ALL','public.is_admin()');
SELECT public._mk_admin_policy('refunds_admin_sel','refund_requests','SELECT','public.is_admin()');
SELECT public._mk_admin_policy('refunds_admin_upd','refund_requests','UPDATE','public.is_admin()');
SELECT public._mk_admin_policy('coupons_admin_all','coupons','ALL','public.is_admin()');
SELECT public._mk_admin_policy('ads_admin_all','advertisements','ALL','public.is_admin()');
SELECT public._mk_admin_policy('complaints_admin_all','complaints','ALL','public.is_admin()');

DROP FUNCTION IF EXISTS public._mk_admin_policy(text,text,text,text);

-- ------------------------------------------------------------
-- إحصائيات لوحة الإدارة (SECURITY DEFINER، للأدمن فقط)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT jsonb_build_object(
    'users',            (SELECT count(*) FROM public.users),
    'merchants',        (SELECT count(*) FROM public.merchant_profiles),
    'pending_merchants',(SELECT count(*) FROM public.merchant_profiles WHERE is_approved = false),
    'delivery',         (SELECT count(*) FROM public.delivery_profiles),
    'orders',           (SELECT count(*) FROM public.orders),
    'orders_today',     (SELECT count(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    'revenue',          (SELECT COALESCE(sum(total_amount),0) FROM public.orders WHERE status = 'delivered'),
    'open_refunds',     (SELECT count(*) FROM public.refund_requests WHERE status = 'pending')
  ) INTO v;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

-- الموافقة/الحظر (للأدمن)
CREATE OR REPLACE FUNCTION public.admin_set_merchant_approval(p_merchant uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.merchant_profiles SET is_approved = p_approved WHERE id = p_merchant;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_merchant_approval(uuid,boolean) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_set_merchant_approval(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.users SET is_active = p_active WHERE id = p_user;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean) TO authenticated;

-- ------------------------------------------------------------
-- PUSH: سياسات ملكية على device_tokens (RLS مُفعّل مسبقاً)
-- ------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS device_tokens_owner_all ON public.device_tokens';
  EXECUTE 'CREATE POLICY device_tokens_owner_all ON public.device_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
