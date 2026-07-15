-- Courier presence and live-location writes are transactional and identity
-- derived.  The client no longer performs a history insert and profile update
-- as two independent requests that can partially succeed.

ALTER TABLE public.delivery_location_history
  ADD COLUMN IF NOT EXISTS sample_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_location_history_delivery_sample_uq
  ON public.delivery_location_history(delivery_id, sample_id)
  WHERE sample_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_my_delivery_presence(
  p_online boolean,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_profile public.delivery_profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'operational delivery account required';
  END IF;
  IF p_online IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'online state is required';
  END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL)
     OR (p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90))
     OR (p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid coordinate pair is required';
  END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles dp
  WHERE dp.user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery profile not found';
  END IF;
  IF p_online AND NOT COALESCE(v_profile.is_approved, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'delivery profile approval is required';
  END IF;

  UPDATE public.delivery_profiles
  SET is_online = p_online,
      current_latitude = COALESCE(p_latitude, current_latitude),
      current_longitude = COALESCE(p_longitude, current_longitude)
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'is_online', v_profile.is_online,
    'is_approved', v_profile.is_approved,
    'current_latitude', v_profile.current_latitude,
    'current_longitude', v_profile.current_longitude
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_my_delivery_location(
  p_order_id uuid,
  p_sample_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_speed numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_profile public.delivery_profiles%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_location_id uuid;
  v_recorded_at timestamptz;
  v_existing public.delivery_location_history%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'operational delivery account required';
  END IF;
  IF p_order_id IS NULL OR p_sample_id IS NULL
     OR p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180
     OR (p_speed IS NOT NULL AND (p_speed < 0 OR p_speed > 100)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid delivery location payload';
  END IF;

  -- Keep the same lock order as delivery completion: order, then courier
  -- profile. Location sampling runs frequently and must never deadlock proof
  -- completion by taking those rows in the opposite order.
  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'order not found';
  END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles dp
  WHERE dp.user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_profile.is_approved, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery profile required';
  END IF;

  SELECT h.* INTO v_existing
  FROM public.delivery_location_history h
  WHERE h.delivery_id = v_profile.id AND h.sample_id = p_sample_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.order_id IS DISTINCT FROM p_order_id
       OR v_existing.latitude IS DISTINCT FROM round(p_latitude, 8)
       OR v_existing.longitude IS DISTINCT FROM round(p_longitude, 8)
       OR v_existing.speed IS DISTINCT FROM (
         CASE WHEN p_speed IS NULL THEN NULL ELSE round(p_speed, 2) END
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'delivery location sample payload conflict';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'sample_id', v_existing.sample_id,
      'order_id', v_existing.order_id,
      'delivery_id', v_existing.delivery_id,
      'latitude', v_existing.latitude,
      'longitude', v_existing.longitude,
      'speed', v_existing.speed,
      'recorded_at', v_existing.recorded_at,
      'idempotent_replay', true
    );
  END IF;
  IF v_order.delivery_id IS DISTINCT FROM v_profile.id
     OR v_order.status::text NOT IN ('assigned','picked_up','on_the_way') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'order is not an active assignment for this courier';
  END IF;

  INSERT INTO public.delivery_location_history(
    delivery_id, order_id, sample_id, latitude, longitude, speed
  ) VALUES (
    v_profile.id, v_order.id, p_sample_id, p_latitude, p_longitude, p_speed
  )
  RETURNING id, recorded_at INTO v_location_id, v_recorded_at;

  UPDATE public.delivery_profiles
  SET current_latitude = p_latitude,
      current_longitude = p_longitude
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'id', v_location_id,
    'sample_id', p_sample_id,
    'order_id', v_order.id,
    'delivery_id', v_profile.id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'speed', p_speed,
    'recorded_at', v_recorded_at,
    'idempotent_replay', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_delivery_presence(boolean,numeric,numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_delivery_presence(boolean,numeric,numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_my_delivery_location(uuid,uuid,numeric,numeric,numeric)
  TO authenticated;

-- Presence and history mutation are now RPC-only. Read grants and participant
-- RLS remain unchanged.
REVOKE UPDATE (current_latitude, current_longitude, is_online)
  ON public.delivery_profiles FROM authenticated;
REVOKE INSERT ON public.delivery_location_history FROM authenticated;
