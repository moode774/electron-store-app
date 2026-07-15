-- Make push dispatch concurrency-safe. A Database Webhook can be delivered
-- more than once or concurrently; the claim/commit/finalize protocol below
-- ensures that only one invocation is allowed to cross the external Expo
-- dispatch boundary for a notification.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_claim_token uuid,
  ADD COLUMN IF NOT EXISTS push_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_attempt_count integer NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_push_attempt_count_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_push_attempt_count_check
      CHECK (push_attempt_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_push_claim_pair_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_push_claim_pair_check
      CHECK ((push_claim_token IS NULL) = (push_claimed_at IS NULL));
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.notifications.push_claim_token IS
  'Opaque owner of the current push dispatch attempt; never exposed to app clients.';
COMMENT ON COLUMN public.notifications.push_claimed_at IS
  'Time the current push worker claimed this notification.';
COMMENT ON COLUMN public.notifications.push_dispatched_at IS
  'Time the one permitted external push dispatch boundary was committed.';
COMMENT ON COLUMN public.notifications.push_attempt_count IS
  'Number of database-authorized push attempts, including terminal skips.';

CREATE OR REPLACE FUNCTION public.claim_push_notification(
  p_notification_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.notifications%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_notification_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification and claim token are required';
  END IF;

  SELECT n.* INTO v_row
  FROM public.notifications AS n
  WHERE n.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('claimed', false, 'reason', 'not_found');
  END IF;
  IF v_row.channel <> 'push' THEN
    RETURN pg_catalog.jsonb_build_object('claimed', false, 'reason', 'not_push');
  END IF;
  IF v_row.sent_at IS NOT NULL OR v_row.push_dispatched_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('claimed', false, 'reason', 'already_dispatched');
  END IF;

  -- A different worker owns a fresh claim. A stale pre-dispatch claim can be
  -- recovered after two minutes; once push_dispatched_at is set it can never
  -- be reclaimed automatically, avoiding an ambiguous duplicate push.
  IF v_row.push_claim_token IS NOT NULL
     AND v_row.push_claim_token <> p_claim_token
     AND v_row.push_claimed_at > v_now - pg_catalog.make_interval(mins => 2) THEN
    RETURN pg_catalog.jsonb_build_object('claimed', false, 'reason', 'busy');
  END IF;

  IF v_row.push_claim_token = p_claim_token THEN
    UPDATE public.notifications
    SET push_claimed_at = v_now
    WHERE id = p_notification_id;
  ELSE
    UPDATE public.notifications
    SET push_claim_token = p_claim_token,
        push_claimed_at = v_now,
        push_attempt_count = push_attempt_count + 1,
        failed_reason = NULL
    WHERE id = p_notification_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'claimed', true,
    'notification', pg_catalog.jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'title', v_row.title,
      'body', v_row.body,
      'type', v_row.type,
      'data', v_row.data,
      'channel', v_row.channel,
      'sent_at', v_row.sent_at
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_push_notification_dispatched(
  p_notification_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.notifications%ROWTYPE;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_notification_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification and claim token are required';
  END IF;

  SELECT n.* INTO v_row
  FROM public.notifications AS n
  WHERE n.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.push_claim_token IS DISTINCT FROM p_claim_token
     OR v_row.sent_at IS NOT NULL
     OR v_row.push_dispatched_at IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE public.notifications
  SET push_dispatched_at = pg_catalog.clock_timestamp()
  WHERE id = p_notification_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_push_notification(
  p_notification_id uuid,
  p_claim_token uuid,
  p_accepted integer,
  p_failed_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.notifications%ROWTYPE;
  v_accepted integer := COALESCE(p_accepted, 0);
  v_failure text := NULLIF(pg_catalog.btrim(p_failed_reason), '');
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_notification_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification and claim token are required';
  END IF;
  IF v_accepted < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'accepted count cannot be negative';
  END IF;

  SELECT n.* INTO v_row
  FROM public.notifications AS n
  WHERE n.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.push_claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN false;
  END IF;

  UPDATE public.notifications
  SET push_dispatched_at = COALESCE(push_dispatched_at, pg_catalog.clock_timestamp()),
      sent_at = CASE
        WHEN v_accepted > 0 THEN COALESCE(sent_at, pg_catalog.clock_timestamp())
        ELSE sent_at
      END,
      failed_reason = pg_catalog.left(
        CASE
          WHEN v_failure IS NOT NULL THEN v_failure
          WHEN v_accepted = 0 THEN 'no push tickets accepted'
          ELSE NULL
        END,
        1000
      ),
      push_claim_token = NULL,
      push_claimed_at = NULL
  WHERE id = p_notification_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_notification_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_notifications_enabled boolean := true;
  v_order_notifications boolean := true;
  v_promo_notifications boolean := true;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authentication required';
  END IF;
  IF NOT public.is_current_user_operational() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;

  SELECT
    COALESCE(s.notifications_enabled, true),
    COALESCE(s.order_notifications, true),
    COALESCE(s.promo_notifications, true)
  INTO v_notifications_enabled, v_order_notifications, v_promo_notifications
  FROM public.user_settings AS s
  WHERE s.user_id = v_uid;
  IF NOT FOUND THEN
    v_notifications_enabled := true;
    v_order_notifications := true;
    v_promo_notifications := true;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'notifications_enabled', v_notifications_enabled,
    'order_notifications', v_order_notifications,
    'promo_notifications', v_promo_notifications
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_notification_settings(
  p_notifications_enabled boolean,
  p_order_notifications boolean,
  p_promo_notifications boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authentication required';
  END IF;
  IF NOT public.is_current_user_operational() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not operational';
  END IF;
  IF p_notifications_enabled IS NULL
     OR p_order_notifications IS NULL
     OR p_promo_notifications IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification settings must be boolean';
  END IF;

  INSERT INTO public.user_settings (
    user_id, notifications_enabled, order_notifications,
    promo_notifications, updated_at
  ) VALUES (
    v_uid, p_notifications_enabled, p_order_notifications,
    p_promo_notifications, pg_catalog.clock_timestamp()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET notifications_enabled = EXCLUDED.notifications_enabled,
      order_notifications = EXCLUDED.order_notifications,
      promo_notifications = EXCLUDED.promo_notifications,
      updated_at = EXCLUDED.updated_at;

  RETURN pg_catalog.jsonb_build_object(
    'notifications_enabled', p_notifications_enabled,
    'order_notifications', p_order_notifications,
    'promo_notifications', p_promo_notifications
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_push_notification(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_notification(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.mark_push_notification_dispatched(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_push_notification_dispatched(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_push_notification(uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_push_notification(uuid, uuid, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_my_notification_settings()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_notification_settings()
  TO authenticated;

REVOKE ALL ON FUNCTION public.update_my_notification_settings(boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_notification_settings(boolean, boolean, boolean)
  TO authenticated;

-- RLS filters rows, not columns. Remove the earlier table-wide SELECT grant so
-- claim tokens, dispatch internals, and delivery failures cannot reach clients.
REVOKE SELECT ON TABLE public.notifications FROM anon, authenticated;
GRANT SELECT (
  id, user_id, title, body, type, data, is_read, channel, created_at
) ON public.notifications TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.notifications TO service_role;

-- Preference changes are identity-bound RPCs. Do not expose a broad settings
-- table write surface that could later include security-sensitive preferences.
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.user_settings FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.user_settings TO service_role;
