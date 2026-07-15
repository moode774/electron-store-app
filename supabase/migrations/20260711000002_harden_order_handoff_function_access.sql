CREATE OR REPLACE FUNCTION public.enforce_order_status_handoff()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('app.order_transition', true) IS DISTINCT FROM '1' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'لا يمكن تغيير حالة الطلب مباشرة؛ استخدم مسار الطلب المعتمد';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.transition_order_status(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_delivery_order(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(uuid, uuid) TO authenticated;
