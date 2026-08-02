-- 1) كود استلام الطلب: يتولّد تلقائياً لكل طلب جديد؛ الطلبات القديمة تبقى NULL (استلام بدون كود للتوافق)
-- ملاحظة: هذا العمود يُنقل لاحقاً إلى جدول مقفل في 20260802150157 لأن جدول orders
-- مقروء من كل أطراف الطلب (بما فيهم المندوب) فلا يصلح لتخزين سر يخص التاجر.
ALTER TABLE public.orders
  ADD COLUMN pickup_code text DEFAULT lpad(floor(random() * 10000)::int::text, 4, '0');

-- 2) سجل رفض العروض من المندوبين (وصول عبر RPC فقط — RLS مفعّل بلا سياسات)
CREATE TABLE public.delivery_offer_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.delivery_profiles(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, order_id)
);
ALTER TABLE public.delivery_offer_rejections ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_delivery_offer_rejections_delivery ON public.delivery_offer_rejections (delivery_id);

-- 3) التاجر (أو الأدمن) يقرأ كود الاستلام — ويولَّد للطلبات القديمة عند الحاجة
CREATE FUNCTION public.get_order_pickup_code(p_order_id uuid)
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
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
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

  IF v_order.pickup_code IS NULL THEN
    UPDATE public.orders
    SET pickup_code = lpad(floor(random() * 10000)::int::text, 4, '0')
    WHERE id = p_order_id
    RETURNING pickup_code INTO v_code;
  ELSE
    v_code := v_order.pickup_code;
  END IF;
  RETURN v_code;
END;
$function$;

-- 4) المندوب يؤكد الاستلام بالكود — ثم يمر عبر مسار الانتقال المعتمد نفسه
CREATE FUNCTION public.confirm_order_pickup(p_order_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
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
  IF v_order.pickup_code IS NOT NULL
     AND trim(COALESCE(p_code, '')) IS DISTINCT FROM v_order.pickup_code THEN
    RAISE EXCEPTION 'INVALID_PICKUP_CODE';
  END IF;
  RETURN public.marketplace_transition_order_as(p_order_id, v_user, 'picked_up', NULL);
END;
$function$;

-- 5) تسجيل رفض عرض
CREATE FUNCTION public.reject_delivery_offer(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT dp.id INTO v_profile_id FROM public.delivery_profiles AS dp WHERE dp.user_id = v_user;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'DELIVERY_PROFILE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders AS o WHERE o.id = p_order_id) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  INSERT INTO public.delivery_offer_rejections (delivery_id, order_id)
  VALUES (v_profile_id, p_order_id)
  ON CONFLICT (delivery_id, order_id) DO NOTHING;
END;
$function$;

-- 6) قائمة الطلبات التي رفضها المندوب (لإخفائها من العروض)
CREATE FUNCTION public.list_my_offer_rejections()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT r.order_id
  FROM public.delivery_offer_rejections AS r
  JOIN public.delivery_profiles AS dp ON dp.id = r.delivery_id
  WHERE dp.user_id = auth.uid();
$function$;

-- الصلاحيات: المصادَقون فقط (سحب PUBLIC وanon صراحةً)
REVOKE ALL ON FUNCTION public.get_order_pickup_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_order_pickup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_delivery_offer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_offer_rejections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_pickup_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_pickup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_delivery_offer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_offer_rejections() TO authenticated;
