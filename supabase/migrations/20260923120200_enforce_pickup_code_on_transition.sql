-- Enforce the pickup code server-side.
--
-- confirm_order_pickup checks the merchant's 6-digit code (with lockout), but
-- the courier could skip it entirely: marketplace_transition_order_as still
-- allowed delivery `assigned -> picked_up`, reachable through
-- transition_order_status (PostgREST) and api_transition_order_status
-- (personal API). The code therefore protected nothing.
--
-- Now `picked_up` requires the transaction-local flag that only
-- confirm_order_pickup sets after a successful code match. Admins keep a
-- manual override. Bodies are otherwise identical to 20260713164458 and
-- 20260802162408; CREATE OR REPLACE keeps existing grants.

CREATE OR REPLACE FUNCTION public.marketplace_transition_order_as(
  p_order_id uuid,
  p_actor_id uuid,
  p_next_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
  v_allowed boolean := false;
  v_is_participant boolean := false;
  v_next text := lower(trim(COALESCE(p_next_status, '')));
  v_event_key text;
  v_event_metadata jsonb := '{}'::jsonb;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  IF v_next = '' THEN RAISE EXCEPTION 'NEXT_STATUS_REQUIRED'; END IF;
  IF length(COALESCE(p_reason, '')) > 1000 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  IF v_next = 'delivered' THEN RAISE EXCEPTION 'DELIVERY_PROOF_REQUIRED'; END IF;
  IF v_next = 'cancelled' THEN
    RETURN public.marketplace_cancel_order_as(p_order_id, p_actor_id, p_reason);
  END IF;

  v_role := public.marketplace_actor_role(p_actor_id);
  SELECT o.* INTO v_order
  FROM public.orders AS o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  v_is_participant :=
    (v_role = 'customer' AND v_order.customer_id = p_actor_id) OR
    (v_role = 'merchant' AND EXISTS (
      SELECT 1 FROM public.merchant_profiles AS mp
      WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
    )) OR
    (v_role = 'delivery' AND EXISTS (
      SELECT 1 FROM public.delivery_profiles AS dp
      WHERE dp.id = v_order.delivery_id AND dp.user_id = p_actor_id
    )) OR
    v_role = 'admin';
  IF v_order.status::text = v_next THEN
    IF NOT v_is_participant THEN RAISE EXCEPTION 'STATUS_TRANSITION_NOT_ALLOWED'; END IF;
    RETURN jsonb_build_object(
      'id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'idempotent_replay', true
    );
  END IF;
  IF v_order.status IN ('cancelled', 'returned') OR v_order.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_STATE_TERMINAL';
  END IF;

  IF v_role = 'merchant' AND EXISTS (
    SELECT 1 FROM public.merchant_profiles AS mp
    WHERE mp.id = v_order.merchant_id AND mp.user_id = p_actor_id
  ) THEN
    v_allowed :=
      (v_order.status = 'pending' AND v_next IN ('confirmed', 'preparing')) OR
      (v_order.status = 'confirmed' AND v_next = 'preparing') OR
      (v_order.status = 'preparing' AND v_next = 'ready');
  ELSIF v_role = 'delivery' AND EXISTS (
    SELECT 1 FROM public.delivery_profiles AS dp
    WHERE dp.id = v_order.delivery_id AND dp.user_id = p_actor_id
  ) THEN
    v_allowed :=
      (v_order.status = 'assigned' AND v_next = 'picked_up') OR
      (v_order.status = 'picked_up' AND v_next = 'on_the_way') OR
      (v_order.status IN ('assigned', 'picked_up', 'on_the_way') AND v_next = 'failed_delivery');
  ELSIF v_role = 'admin' THEN
    v_allowed :=
      (v_order.status = 'pending' AND v_next IN ('confirmed', 'preparing')) OR
      (v_order.status = 'confirmed' AND v_next = 'preparing') OR
      (v_order.status = 'preparing' AND v_next = 'ready') OR
      (v_order.status = 'assigned' AND v_next = 'picked_up') OR
      (v_order.status = 'picked_up' AND v_next = 'on_the_way') OR
      (v_order.status IN ('assigned', 'picked_up', 'on_the_way') AND v_next = 'failed_delivery') OR
      (v_order.status = 'failed_delivery' AND v_next IN ('rescheduled', 'disputed')) OR
      (v_order.status = 'rescheduled' AND v_next = 'ready');
  END IF;

  IF v_next IN ('failed_delivery', 'rescheduled', 'disputed')
     AND NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'STATUS_REASON_REQUIRED';
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'STATUS_TRANSITION_NOT_ALLOWED'; END IF;
  -- The courier takes custody only by presenting the merchant's pickup code
  -- (confirm_order_pickup marks the order as verified for this transaction).
  -- Admins keep a manual override for support cases.
  IF v_next = 'picked_up' AND v_role <> 'admin'
     AND current_setting('app.pickup_code_verified', true) IS DISTINCT FROM p_order_id::text THEN
    RAISE EXCEPTION 'PICKUP_CODE_REQUIRED';
  END IF;

  PERFORM set_config('app.order_transition', '1', true);
  IF v_order.status = 'rescheduled' AND v_next = 'ready' THEN
    -- Preserve old location/audit history, but release the failed assignment so
    -- the ready order can be offered and claimed by another courier.
    UPDATE public.orders
    SET status = 'ready', delivery_id = NULL
    WHERE id = p_order_id;
    v_event_metadata := jsonb_build_object(
      'released_delivery_id', v_order.delivery_id,
      'assignment_released', true
    );
  ELSE
    EXECUTE format('UPDATE public.orders SET status = %L WHERE id = $1', v_next)
    USING p_order_id;
  END IF;
  v_event_key := 'status-transition:' || p_order_id::text || ':' ||
    txid_current()::text || ':' || v_order.status::text || ':' || v_next;
  PERFORM public.marketplace_record_order_event(
    p_order_id,
    v_event_key,
    'transition_order_status',
    p_actor_id,
    v_role,
    v_order.status::text,
    v_next,
    p_reason,
    v_event_metadata
  );
  PERFORM public.marketplace_notify_order_event(p_order_id, v_event_key, v_next);

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_next,
    'previous_status', v_order.status::text,
    'idempotent_replay', false
  );
END;
$function$;

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
  v_attempts integer;
  v_locked timestamptz;
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
    RETURN jsonb_build_object('ok', true, 'id', v_order.id, 'status', v_order.status, 'idempotent_replay', true);
  END IF;
  IF v_order.status <> 'assigned' THEN RAISE EXCEPTION 'ORDER_NOT_ASSIGNED'; END IF;

  SELECT c.* INTO v_row
  FROM public.order_pickup_codes AS c
  WHERE c.order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.order_pickup_codes (order_id, code)
    VALUES (p_order_id, public.generate_pickup_code())
    ON CONFLICT (order_id) DO NOTHING;
    RETURN jsonb_build_object('ok', false, 'error', 'PICKUP_CODE_NOT_ISSUED');
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PICKUP_CODE_LOCKED', 'locked_until', v_row.locked_until);
  END IF;

  -- القفل انتهى: صفّر العدّاد قبل احتساب محاولة جديدة
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until <= now() THEN
    UPDATE public.order_pickup_codes
    SET failed_attempts = 0, locked_until = NULL
    WHERE order_id = p_order_id;
    v_row.failed_attempts := 0;
  END IF;

  IF v_input IS NULL OR v_input IS DISTINCT FROM v_row.code THEN
    v_attempts := v_row.failed_attempts + 1;
    v_locked := CASE WHEN v_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;
    UPDATE public.order_pickup_codes
    SET failed_attempts = v_attempts, locked_until = COALESCE(v_locked, locked_until)
    WHERE order_id = p_order_id;
    -- لا RAISE هنا حتى لا يتراجع التحديث
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_locked IS NOT NULL THEN 'PICKUP_CODE_LOCKED' ELSE 'INVALID_PICKUP_CODE' END,
      'attempts_left', GREATEST(0, 5 - v_attempts),
      'locked_until', v_locked
    );
  END IF;

  UPDATE public.order_pickup_codes
  SET failed_attempts = 0, locked_until = NULL
  WHERE order_id = p_order_id;

  PERFORM set_config('app.pickup_code_verified', p_order_id::text, true);
  RETURN public.marketplace_transition_order_as(p_order_id, v_user, 'picked_up', NULL)
         || jsonb_build_object('ok', true);
END;
$function$;
