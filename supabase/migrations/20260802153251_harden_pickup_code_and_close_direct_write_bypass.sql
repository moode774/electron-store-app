-- ============================================================
-- 1) تقوية كود الاستلام: كود 6 أرقام يُولَّد تلقائياً + حد للمحاولات + منع الاستلام بلا كود
-- ============================================================
ALTER TABLE public.order_pickup_codes
  ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

-- مولّد الكود: 6 أرقام (مليون احتمال بدل عشرة آلاف)
CREATE FUNCTION public.generate_pickup_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO ''
AS $function$
  SELECT lpad((floor(random() * 1000000))::int::text, 6, '0');
$function$;

-- يُولَّد الكود تلقائياً بمجرد أن يصبح الطلب جاهزاً، فلا يعتمد على فتح التاجر للشاشة
CREATE FUNCTION public.ensure_pickup_code_on_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'ready' THEN
    INSERT INTO public.order_pickup_codes (order_id, code)
    VALUES (NEW.id, public.generate_pickup_code())
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_ensure_pickup_code_on_ready
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.ensure_pickup_code_on_ready();

-- تعبئة أكواد للطلبات القائمة غير المنتهية حتى لا تعلق بلا كود
INSERT INTO public.order_pickup_codes (order_id, code)
SELECT o.id, public.generate_pickup_code()
FROM public.orders AS o
WHERE o.status NOT IN ('delivered', 'cancelled', 'returned')
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================
-- 2) تأكيد الاستلام: الكود إلزامي دائماً + قفل مؤقت بعد 5 محاولات خاطئة
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_order_pickup(p_order_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_row public.order_pickup_codes%ROWTYPE;
  v_input text := NULLIF(trim(COALESCE(p_code, '')), '');
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

  SELECT c.* INTO v_row
  FROM public.order_pickup_codes AS c
  WHERE c.order_id = p_order_id
  FOR UPDATE;

  -- لا استلام بلا كود إطلاقاً: يُولَّد الكود عند الجاهزية ويُسلّمه التاجر يدويًا
  IF NOT FOUND THEN
    INSERT INTO public.order_pickup_codes (order_id, code)
    VALUES (p_order_id, public.generate_pickup_code())
    ON CONFLICT (order_id) DO NOTHING;
    RAISE EXCEPTION 'PICKUP_CODE_NOT_ISSUED';
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RAISE EXCEPTION 'PICKUP_CODE_LOCKED';
  END IF;

  IF v_input IS NULL OR v_input IS DISTINCT FROM v_row.code THEN
    UPDATE public.order_pickup_codes
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
    WHERE order_id = p_order_id;
    RAISE EXCEPTION 'INVALID_PICKUP_CODE';
  END IF;

  UPDATE public.order_pickup_codes
  SET failed_attempts = 0, locked_until = NULL
  WHERE order_id = p_order_id;

  RETURN public.marketplace_transition_order_as(p_order_id, v_user, 'picked_up', NULL);
END;
$function$;

-- جلب الكود للتاجر: يقرأ الكود المولَّد مسبقاً وينشئه فقط إن غاب
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
  WHERE c.order_id = p_order_id;

  IF v_code IS NULL THEN
    INSERT INTO public.order_pickup_codes (order_id, code)
    VALUES (p_order_id, public.generate_pickup_code())
    ON CONFLICT (order_id) DO UPDATE SET code = public.order_pickup_codes.code
    RETURNING code INTO v_code;
  END IF;
  RETURN v_code;
END;
$function$;

-- ============================================================
-- 3) إغلاق مسارات الكتابة المباشرة التي حلّت محلها RPCs
--    (الإنشاء صار حصراً عبر create_product_with_images و merchant_*_coupon)
-- ============================================================
DROP POLICY IF EXISTS products_merchant_insert ON public.products;
DROP POLICY IF EXISTS coupons_merchant_insert ON public.coupons;
DROP POLICY IF EXISTS coupons_merchant_update ON public.coupons;
DROP POLICY IF EXISTS coupons_merchant_delete ON public.coupons;

REVOKE ALL ON FUNCTION public.generate_pickup_code() FROM PUBLIC, anon, authenticated;
