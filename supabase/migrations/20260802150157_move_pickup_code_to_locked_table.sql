-- كود الاستلام يجب ألّا يكون قابلاً للقراءة من صف الطلب (المندوب مشارك في الصف)،
-- لذا يُنقل إلى جدول مقفل لا يُقرأ إلا عبر دوال SECURITY DEFINER.
CREATE TABLE public.order_pickup_codes (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_pickup_codes ENABLE ROW LEVEL SECURITY;

-- نقل الأكواد المولّدة سابقاً ثم إزالة العمود المكشوف
INSERT INTO public.order_pickup_codes (order_id, code)
SELECT o.id, o.pickup_code FROM public.orders AS o WHERE o.pickup_code IS NOT NULL
ON CONFLICT (order_id) DO NOTHING;

ALTER TABLE public.orders DROP COLUMN pickup_code;

-- توليد/جلب الكود: التاجر صاحب الطلب أو الأدمن فقط
CREATE OR REPLACE FUNCTION public.get_order_pickup_code(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_code text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.merchant_profiles AS mp
      WHERE mp.id = v_order.merchant_id AND mp.user_id = v_user
    )
  ) THEN
    RAISE EXCEPTION 'PICKUP_CODE_ACCESS_DENIED';
  END IF;

  SELECT c.code INTO v_code
  FROM public.order_pickup_codes AS c
  WHERE c.order_id = p_order_id
  FOR UPDATE;

  IF v_code IS NULL THEN
    INSERT INTO public.order_pickup_codes (order_id, code)
    VALUES (p_order_id, lpad(floor(random() * 10000)::int::text, 4, '0'))
    ON CONFLICT (order_id) DO UPDATE SET code = public.order_pickup_codes.code
    RETURNING code INTO v_code;
  END IF;
  RETURN v_code;
END;
$function$;

-- تأكيد الاستلام: يقارن الكود المُدخل بالكود المخزّن (إن وُجد)
CREATE OR REPLACE FUNCTION public.confirm_order_pickup(p_order_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_code text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_profiles AS dp
    WHERE dp.id = v_order.delivery_id AND dp.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'NOT_ASSIGNED_DELIVERY';
  END IF;
  IF v_order.status = 'picked_up' THEN
    RETURN jsonb_build_object('id', v_order.id, 'status', v_order.status, 'idempotent_replay', true);
  END IF;
  IF v_order.status <> 'assigned' THEN RAISE EXCEPTION 'ORDER_NOT_ASSIGNED'; END IF;

  SELECT c.code INTO v_code FROM public.order_pickup_codes AS c WHERE c.order_id = p_order_id;
  -- لا يوجد كود مخزّن (طلب قديم لم يطلب التاجر كوده) => يُسمح بالاستلام بدون كود
  IF v_code IS NOT NULL AND trim(COALESCE(p_code, '')) IS DISTINCT FROM v_code THEN
    RAISE EXCEPTION 'INVALID_PICKUP_CODE';
  END IF;

  RETURN public.marketplace_transition_order_as(p_order_id, v_user, 'picked_up', NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_order_pickup_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_order_pickup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_pickup_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_pickup(uuid, text) TO authenticated;
