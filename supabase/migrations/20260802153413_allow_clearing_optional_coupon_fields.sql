-- COALESCE يمنع إزالة القيم الاختيارية بعد ضبطها؛ نضيف أعلام مسح صريحة.
CREATE OR REPLACE FUNCTION public.merchant_update_coupon(
  p_id uuid,
  p_is_active boolean DEFAULT NULL,
  p_min_order_amount numeric DEFAULT NULL,
  p_max_discount_amount numeric DEFAULT NULL,
  p_max_uses integer DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_clear_min_order boolean DEFAULT false,
  p_clear_max_discount boolean DEFAULT false,
  p_clear_max_uses boolean DEFAULT false,
  p_clear_end_date boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_owned boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_current_user_operational('merchant') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant account is not operational';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.coupons AS c
    JOIN public.merchant_profiles AS mp ON mp.id = c.merchant_id
    WHERE c.id = p_id AND mp.user_id = v_user
  ) INTO v_owned;
  IF NOT v_owned THEN RAISE EXCEPTION 'COUPON_NOT_FOUND'; END IF;

  IF p_min_order_amount IS NOT NULL AND p_min_order_amount < 0 THEN RAISE EXCEPTION 'INVALID_MIN_ORDER'; END IF;
  IF p_max_discount_amount IS NOT NULL AND p_max_discount_amount <= 0 THEN RAISE EXCEPTION 'INVALID_MAX_DISCOUNT'; END IF;
  IF p_max_uses IS NOT NULL AND p_max_uses <= 0 THEN RAISE EXCEPTION 'INVALID_MAX_USES'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date <= now() THEN RAISE EXCEPTION 'END_DATE_IN_PAST'; END IF;

  UPDATE public.coupons AS c
  SET is_active           = COALESCE(p_is_active, c.is_active),
      min_order_amount    = CASE WHEN p_clear_min_order   THEN NULL ELSE COALESCE(p_min_order_amount, c.min_order_amount) END,
      max_discount_amount = CASE WHEN p_clear_max_discount THEN NULL ELSE COALESCE(p_max_discount_amount, c.max_discount_amount) END,
      max_uses            = CASE WHEN p_clear_max_uses    THEN NULL ELSE COALESCE(p_max_uses, c.max_uses) END,
      end_date            = CASE WHEN p_clear_end_date    THEN NULL ELSE COALESCE(p_end_date, c.end_date) END
  WHERE c.id = p_id;
END;
$function$;

-- إزالة النسخة القديمة ذات الست معاملات حتى لا يبقى مسار بلا أعلام المسح
DROP FUNCTION IF EXISTS public.merchant_update_coupon(uuid, boolean, numeric, numeric, integer, timestamptz);

REVOKE ALL ON FUNCTION public.merchant_update_coupon(uuid, boolean, numeric, numeric, integer, timestamptz, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_update_coupon(uuid, boolean, numeric, numeric, integer, timestamptz, boolean, boolean, boolean, boolean) TO authenticated;
