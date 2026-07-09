-- =============================================================
-- سيطرة الأدمن الكاملة: حظر دائم/مؤقت + سجل تحركات المستخدمين
-- + دالة الملف الكامل لأي مستخدم (admin_get_user_details)
-- =============================================================

-- (1) الحظر المؤقت: حتى تاريخ معيّن، مع سبب
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS blocked_until timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS blocked_reason text;

-- المستخدم محظور إذا: حظر دائم، أو حظر مؤقت لم ينتهِ بعد
CREATE OR REPLACE FUNCTION public.is_user_blocked(p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND (is_blocked = true OR (blocked_until IS NOT NULL AND blocked_until > now()))
  );
$$;

-- (2) سجل تحركات المستخدمين — يتعبأ تلقائياً عبر triggers
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_time ON public.user_activity_logs (user_id, created_at DESC);

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_full_access ON public.user_activity_logs;
CREATE POLICY admin_full_access ON public.user_activity_logs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- لا سياسات أخرى: الكتابة تتم حصراً عبر triggers بصلاحية SECURITY DEFINER

-- (3) دالة تسجيل موحّدة تلتقط الأحداث من الجداول المهمة
CREATE OR REPLACE FUNCTION public.log_user_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (NEW.customer_id, 'order_created', 'order', NEW.id,
              jsonb_build_object('order_number', NEW.order_number, 'total', NEW.total_amount, 'payment_method', NEW.payment_method));
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (NEW.customer_id, 'order_' || NEW.status, 'order', NEW.id,
              jsonb_build_object('order_number', NEW.order_number, 'from', OLD.status, 'to', NEW.status));
    END IF;
  ELSIF TG_TABLE_NAME = 'reviews' THEN
    INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.reviewer_id, 'review_created', 'review', NEW.id,
            jsonb_build_object('rating', NEW.rating, 'target_type', NEW.target_type));
  ELSIF TG_TABLE_NAME = 'support_tickets' THEN
    INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.user_id, 'support_ticket_created', 'support_ticket', NEW.id,
            jsonb_build_object('subject', NEW.subject, 'category', NEW.category));
  ELSIF TG_TABLE_NAME = 'refund_requests' THEN
    INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.customer_id, 'refund_requested', 'refund', NEW.id,
            jsonb_build_object('amount', NEW.refund_amount, 'reason', NEW.reason));
  ELSIF TG_TABLE_NAME = 'complaints' THEN
    INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.complainant_id, 'complaint_created', 'complaint', NEW.id,
            jsonb_build_object('title', NEW.title, 'category', NEW.category));
  ELSIF TG_TABLE_NAME = 'wallet_transactions' THEN
    INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.user_id, 'wallet_' || NEW.type, 'wallet_transaction', NEW.id,
            jsonb_build_object('amount', NEW.amount, 'source', NEW.source));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_activity_orders ON public.orders;
CREATE TRIGGER trg_log_activity_orders AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

DROP TRIGGER IF EXISTS trg_log_activity_reviews ON public.reviews;
CREATE TRIGGER trg_log_activity_reviews AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

DROP TRIGGER IF EXISTS trg_log_activity_tickets ON public.support_tickets;
CREATE TRIGGER trg_log_activity_tickets AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

DROP TRIGGER IF EXISTS trg_log_activity_refunds ON public.refund_requests;
CREATE TRIGGER trg_log_activity_refunds AFTER INSERT ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

DROP TRIGGER IF EXISTS trg_log_activity_complaints ON public.complaints;
CREATE TRIGGER trg_log_activity_complaints AFTER INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

DROP TRIGGER IF EXISTS trg_log_activity_wallet ON public.wallet_transactions;
CREATE TRIGGER trg_log_activity_wallet AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_user_activity();

-- (4) توثيق قرارات الأدمن (حظر/فك/تعطيل) في سجلَّي النشاط والإدارة
CREATE OR REPLACE FUNCTION public.log_user_block_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_action text;
BEGIN
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     OR NEW.blocked_until IS DISTINCT FROM OLD.blocked_until
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN

    v_action := CASE
      WHEN NEW.is_blocked AND NOT COALESCE(OLD.is_blocked, false) THEN 'blocked_permanent'
      WHEN NEW.blocked_until IS NOT NULL AND NEW.blocked_until IS DISTINCT FROM OLD.blocked_until THEN 'blocked_temporary'
      WHEN (NOT NEW.is_blocked AND COALESCE(OLD.is_blocked, false))
        OR (NEW.blocked_until IS NULL AND OLD.blocked_until IS NOT NULL) THEN 'unblocked'
      WHEN NOT NEW.is_active AND OLD.is_active THEN 'deactivated'
      WHEN NEW.is_active AND NOT OLD.is_active THEN 'activated'
      ELSE 'moderation_change'
    END;

    INSERT INTO public.user_activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.id, v_action, 'user', NEW.id,
            jsonb_build_object('by_admin', auth.uid(), 'reason', NEW.blocked_reason, 'until', NEW.blocked_until));

    INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), v_action, 'user', NEW.id,
            jsonb_build_object('reason', NEW.blocked_reason, 'until', NEW.blocked_until));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_user_block ON public.users;
CREATE TRIGGER trg_log_user_block AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.log_user_block_changes();

-- (5) الملف الكامل للمستخدم — كل شيء عنه في استدعاء واحد (للأدمن فقط)
CREATE OR REPLACE FUNCTION public.admin_get_user_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;

  result := jsonb_build_object(
    'user', to_jsonb(v_user),
    'is_currently_blocked', public.is_user_blocked(p_user_id),

    'auth', (SELECT jsonb_build_object('email', email, 'last_sign_in_at', last_sign_in_at, 'created_at', created_at)
             FROM auth.users WHERE id = p_user_id),

    'profile', CASE v_user.role
      WHEN 'customer' THEN (SELECT to_jsonb(cp) FROM public.customer_profiles cp WHERE cp.user_id = p_user_id)
      WHEN 'merchant' THEN (SELECT to_jsonb(mp) FROM public.merchant_profiles mp WHERE mp.user_id = p_user_id)
      WHEN 'delivery' THEN (SELECT to_jsonb(dp) FROM public.delivery_profiles dp WHERE dp.user_id = p_user_id)
      ELSE NULL END,

    'stats', jsonb_build_object(
      'orders_count',     (SELECT count(*) FROM public.orders WHERE customer_id = p_user_id),
      'total_spent',      (SELECT COALESCE(sum(total_amount),0) FROM public.orders WHERE customer_id = p_user_id AND status = 'delivered'),
      'cancelled_orders', (SELECT count(*) FROM public.orders WHERE customer_id = p_user_id AND status = 'cancelled'),
      'addresses_count',  (SELECT count(*) FROM public.addresses WHERE user_id = p_user_id),
      'reviews_count',    (SELECT count(*) FROM public.reviews WHERE reviewer_id = p_user_id),
      'complaints_count', (SELECT count(*) FROM public.complaints WHERE complainant_id = p_user_id),
      'refunds_count',    (SELECT count(*) FROM public.refund_requests WHERE customer_id = p_user_id)
    ),

    'recent_orders', COALESCE((SELECT jsonb_agg(o ORDER BY o.created_at DESC) FROM (
      SELECT id, order_number, status, total_amount, payment_method, created_at
      FROM public.orders WHERE customer_id = p_user_id ORDER BY created_at DESC LIMIT 10) o), '[]'::jsonb),

    'addresses', COALESCE((SELECT jsonb_agg(a) FROM (
      SELECT id, label, full_address, city, is_default
      FROM public.addresses WHERE user_id = p_user_id) a), '[]'::jsonb),

    'recent_searches', COALESCE((SELECT jsonb_agg(sl ORDER BY sl.created_at DESC) FROM (
      SELECT query, results_count, created_at
      FROM public.search_logs WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 10) sl), '[]'::jsonb),

    'recent_views', COALESCE((SELECT jsonb_agg(pv ORDER BY pv.created_at DESC) FROM (
      SELECT p.name_ar AS product_name, v.created_at
      FROM public.product_views v JOIN public.products p ON p.id = v.product_id
      WHERE v.user_id = p_user_id ORDER BY v.created_at DESC LIMIT 10) pv), '[]'::jsonb),

    'wallet_transactions', COALESCE((SELECT jsonb_agg(wt ORDER BY wt.created_at DESC) FROM (
      SELECT type, amount, source, balance_after, created_at
      FROM public.wallet_transactions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 10) wt), '[]'::jsonb),

    'activity', COALESCE((SELECT jsonb_agg(al ORDER BY al.created_at DESC) FROM (
      SELECT action, entity_type, details, created_at
      FROM public.user_activity_logs WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 30) al), '[]'::jsonb),

    'sessions', COALESCE((SELECT jsonb_agg(ls ORDER BY ls.created_at DESC) FROM (
      SELECT device_info, ip_address, is_active, last_active_at, created_at
      FROM public.login_sessions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 5) ls), '[]'::jsonb)
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
