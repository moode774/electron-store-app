-- =============================================================
-- مفاتيح API الشخصية — لكل حساب (عميل/تاجر/مندوب/أدمن)
-- تُستخدم لربط الحساب مع Claude أو أي نموذج AI عبر Edge Function api-v1
--
-- الأمان:
--   • المفتاح بصيغة lv_live_<48 hex> ويُعرض للمستخدم مرة واحدة فقط عند الإنشاء
--   • لا يُخزَّن في القاعدة إلا SHA-256 hash — تسريب الجدول لا يسرّب المفاتيح
--   • كل مفتاح مرتبط بمستخدم ويرث دوره وصلاحياته (ولا يعمل إذا حُظر المستخدم)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,             -- أول 12 حرفاً للعرض فقط (lv_live_xxxx)
  key_hash text NOT NULL UNIQUE,        -- SHA-256 للمفتاح الكامل
  scopes text[] NOT NULL DEFAULT '{read,write}',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys (user_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- المالك يرى مفاتيحه (بدون الـ hash عبر العمود؟ الـ hash عديم الفائدة بدون المفتاح الأصلي)
DROP POLICY IF EXISTS api_keys_own ON public.api_keys;
CREATE POLICY api_keys_own ON public.api_keys
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS admin_full_access ON public.api_keys;
CREATE POLICY admin_full_access ON public.api_keys
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- إنشاء مفتاح: يولّد السر، يخزّن الـ hash، ويعيد المفتاح الكامل (مرة واحدة فقط)
CREATE OR REPLACE FUNCTION public.create_api_key(p_name text, p_expires_days integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_secret text;
  v_key text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF public.is_user_blocked(v_uid) THEN RAISE EXCEPTION 'account blocked'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;
  IF (SELECT count(*) FROM public.api_keys WHERE user_id = v_uid AND is_active) >= 10 THEN
    RAISE EXCEPTION 'max 10 active keys';
  END IF;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  v_key := 'lv_live_' || v_secret;

  INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, expires_at)
  VALUES (
    v_uid,
    trim(p_name),
    substring(v_key from 1 for 12) || '…',
    encode(extensions.digest(v_key, 'sha256'), 'hex'),
    CASE WHEN p_expires_days IS NULL THEN NULL ELSE now() + (p_expires_days || ' days')::interval END
  )
  RETURNING id INTO v_id;

  -- يُعاد المفتاح الكامل الآن فقط — لن يكون قابلاً للاسترجاع لاحقاً
  RETURN jsonb_build_object('id', v_id, 'key', v_key);
END;
$$;

REVOKE ALL ON FUNCTION public.create_api_key(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_key(text, integer) TO authenticated;

-- التحقق من مفتاح (تستدعيها Edge Function بمفتاح service_role):
-- تعيد هوية المالك ودوره إن كان المفتاح صالحاً، وتحدّث last_used_at
CREATE OR REPLACE FUNCTION public.verify_api_key(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $$
DECLARE
  v_row public.api_keys%ROWTYPE;
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.api_keys
  WHERE key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');

  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'error', 'invalid_key'); END IF;
  IF NOT v_row.is_active THEN RETURN jsonb_build_object('valid', false, 'error', 'key_revoked'); END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'key_expired');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_row.user_id;
  IF NOT FOUND OR NOT v_user.is_active OR public.is_user_blocked(v_user.id) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'account_blocked');
  END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'valid', true,
    'key_id', v_row.id,
    'scopes', to_jsonb(v_row.scopes),
    'user_id', v_user.id,
    'role', v_user.role,
    'full_name', v_user.full_name
  );
END;
$$;

-- للـ service_role فقط (Edge Function) — لا anon ولا authenticated
REVOKE ALL ON FUNCTION public.verify_api_key(text) FROM PUBLIC, anon, authenticated;
