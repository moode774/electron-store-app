-- Audit fixes (2026-09-26). Applied to project sghaihfjuttwqikdszgh on 2026-09-26.
-- Does not touch existing rows or balances.

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-1 (Critical): couriers were auto-approved on self-registration.
-- delivery_profiles.is_approved defaulted to TRUE, so create_my_delivery_profile
-- produced an approved courier with no documents and no admin review, able to
-- claim orders and hold COD cash immediately.
-- Existing approved couriers are NOT changed here; review them in the admin UI.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_profiles ALTER COLUMN is_approved SET DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-2 (High): a courier could withdraw delivery earnings while still holding
-- unremitted customer cash. marketplace_cod_held_balance() only holds the
-- courier's own earning share of each open collection, not the cash liability.
-- For delivery wallets, hold at least the full outstanding cash in custody.
-- Merchant logic is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_enforce_cod_withdrawal_hold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_wallet numeric := 0;
  v_active_reserved numeric := 0;
  v_held numeric := 0;
  v_cash_outstanding numeric := 0;
  v_gross_before_reservations numeric := 0;
  v_available numeric := 0;
BEGIN
  IF NEW.status NOT IN ('pending','approved','processing') THEN
    RETURN NEW;
  END IF;

  SELECT u.role::text
  INTO v_role
  FROM public.users AS u
  WHERE u.id = NEW.user_id
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id);
  IF v_role IS NULL OR v_role NOT IN ('merchant','delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'only active merchant and delivery wallets may reserve withdrawals';
  END IF;

  IF v_role = 'merchant' THEN
    SELECT COALESCE(mp.wallet_balance, 0)
    INTO v_wallet
    FROM public.merchant_profiles AS mp
    WHERE mp.user_id = NEW.user_id
    FOR UPDATE;
  ELSE
    SELECT COALESCE(dp.wallet_balance, 0)
    INTO v_wallet
    FROM public.delivery_profiles AS dp
    WHERE dp.user_id = NEW.user_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'withdrawal wallet profile not found';
  END IF;

  SELECT COALESCE(sum(w.amount), 0)
  INTO v_active_reserved
  FROM public.withdrawal_requests AS w
  WHERE w.user_id = NEW.user_id
    AND w.status IN ('pending','approved','processing');

  v_held := public.marketplace_cod_held_balance(NEW.user_id);

  IF v_role = 'delivery' THEN
    SELECT COALESCE(sum(GREATEST(c.amount_collected - c.amount_remitted, 0)), 0)
    INTO v_cash_outstanding
    FROM public.delivery_cod_collections AS c
    JOIN public.delivery_profiles AS dp ON dp.id = c.delivery_id
    WHERE dp.user_id = NEW.user_id;
    v_held := GREATEST(v_held, v_cash_outstanding);
  END IF;

  v_gross_before_reservations := v_wallet + v_active_reserved;
  v_available := GREATEST(
    round(v_gross_before_reservations - v_active_reserved - v_held, 2),
    0
  );

  IF COALESCE(NEW.amount, 0) > v_available THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'COD_FUNDS_NOT_YET_REMITTED',
      DETAIL = format(
        'requested=%s available=%s cod_held=%s active_reserved=%s',
        COALESCE(NEW.amount, 0), v_available, v_held, v_active_reserved
      );
  END IF;
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-3 (High): failed delivery was unreachable from the app.
-- transition_order_status() always passes reason NULL, but failed_delivery,
-- rescheduled and disputed require a reason, so a courier could never report a
-- refused delivery. The order stayed on_the_way forever and held a courier slot.
-- Add a reason-carrying wrapper; authorization stays in marketplace_transition_order_as.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_order_status_with_reason(
  p_order_id uuid, p_next_status text, p_reason text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN public.marketplace_transition_order_as(
    p_order_id, auth.uid(), p_next_status, p_reason
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.transition_order_status_with_reason(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status_with_reason(uuid, text, text) TO authenticated;

-- FIX-3b: an admin could not cancel an order after a failed delivery. The only
-- exit was rescheduled -> ready. Allow admin cancellation from failed_delivery /
-- rescheduled; no settlement or COD row exists in those states, so inventory is
-- released exactly once as for any other cancellation.
CREATE OR REPLACE FUNCTION public.marketplace_cancel_order_as(p_order_id uuid, p_actor_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
  v_is_owner boolean := false;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED';
  END IF;
  IF length(p_reason) > 1000 THEN RAISE EXCEPTION 'CANCELLATION_REASON_TOO_LONG'; END IF;
  v_role := public.marketplace_actor_role(p_actor_id);

  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'cancelled' THEN
    v_is_owner :=
      (v_role = 'customer' AND v_order.customer_id = p_actor_id) OR
      (v_role = 'merchant' AND EXISTS (
        SELECT 1 FROM public.merchant_profiles AS mp
        WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
      )) OR
      v_role = 'admin';
    IF NOT v_is_owner THEN RAISE EXCEPTION 'CANCELLATION_NOT_ALLOWED'; END IF;
    PERFORM public.marketplace_notify_order_event(
      p_order_id, 'order-cancelled:' || p_order_id::text, 'cancelled'
    );
    RETURN jsonb_build_object(
      'id', v_order.id, 'status', v_order.status,
      'cancel_reason', v_order.cancel_reason, 'idempotent_replay', true
    );
  END IF;
  IF v_order.status = 'delivered' OR v_order.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'DELIVERED_ORDER_CANNOT_BE_CANCELLED';
  END IF;

  IF v_role = 'customer' THEN
    v_is_owner := v_order.customer_id = p_actor_id
      AND v_order.status IN ('pending', 'confirmed', 'preparing');
  ELSIF v_role = 'merchant' THEN
    v_is_owner := v_order.status IN ('pending', 'confirmed', 'preparing')
      AND EXISTS (
        SELECT 1 FROM public.merchant_profiles AS mp
        WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
      );
  ELSIF v_role = 'admin' THEN
    v_is_owner := v_order.status IN (
      'pending', 'confirmed', 'preparing', 'ready', 'failed_delivery', 'rescheduled'
    );
  END IF;
  IF NOT v_is_owner THEN RAISE EXCEPTION 'CANCELLATION_NOT_ALLOWED'; END IF;

  IF v_order.group_id IS NOT NULL THEN
    PERFORM 1 FROM public.order_groups AS og
    WHERE og.id = v_order.group_id FOR UPDATE;
  END IF;

  PERFORM public.marketplace_release_inventory_once(p_order_id, p_actor_id);
  PERFORM set_config('app.order_transition', '1', true);
  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = trim(p_reason),
      cancellation_actor_id = p_actor_id,
      cancellation_actor_role = v_role
  WHERE id = p_order_id;

  IF v_order.group_id IS NOT NULL THEN
    UPDATE public.order_groups AS og
    SET total_amount = COALESCE((
          SELECT round(sum(COALESCE(child.total_amount, 0)), 2)
          FROM public.orders AS child
          WHERE child.group_id = og.id AND child.status <> 'cancelled'
        ), 0),
        payment_status = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.orders AS child
            WHERE child.group_id = og.id AND child.status <> 'cancelled'
          ) THEN 'cancelled'
          WHEN NOT EXISTS (
            SELECT 1 FROM public.orders AS child
            WHERE child.group_id = og.id
              AND child.status <> 'cancelled'
              AND child.payment_status <> 'paid'
          ) THEN 'paid'
          ELSE 'pending'
        END
    WHERE og.id = v_order.group_id;
  END IF;

  PERFORM public.marketplace_record_order_event(
    p_order_id,
    'order-cancelled:' || p_order_id::text,
    'cancel_order',
    p_actor_id,
    v_role,
    v_order.status::text,
    'cancelled',
    trim(p_reason),
    '{}'::jsonb
  );
  PERFORM public.marketplace_notify_order_event(
    p_order_id, 'order-cancelled:' || p_order_id::text, 'cancelled'
  );

  RETURN jsonb_build_object(
    'id', p_order_id, 'status', 'cancelled',
    'cancel_reason', trim(p_reason), 'idempotent_replay', false
  );
END;
$function$;
