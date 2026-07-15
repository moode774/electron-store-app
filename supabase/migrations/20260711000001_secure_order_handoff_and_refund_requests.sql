-- Ownership of each status transition is enforced in the database:
-- merchant: pending -> preparing -> ready; driver: assigned -> picked_up -> on_the_way -> delivered.
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.users(id), reason text NOT NULL, description text,
  refund_amount numeric NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  merchant_note text, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (order_id)
);
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON public.refund_requests(order_id);
DROP POLICY IF EXISTS refund_requests_customer_insert ON public.refund_requests;
CREATE POLICY refund_requests_customer_insert ON public.refund_requests FOR INSERT TO authenticated WITH CHECK (customer_id=(select auth.uid()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.customer_id=(select auth.uid()) AND o.status='delivered'));
DROP POLICY IF EXISTS refund_requests_customer_read ON public.refund_requests;
CREATE POLICY refund_requests_customer_read ON public.refund_requests FOR SELECT TO authenticated USING (customer_id=(select auth.uid()));
DROP POLICY IF EXISTS refund_requests_merchant_read ON public.refund_requests;
CREATE POLICY refund_requests_merchant_read ON public.refund_requests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o JOIN public.merchant_profiles m ON m.id=o.merchant_id WHERE o.id=order_id AND m.user_id=(select auth.uid())));

CREATE OR REPLACE FUNCTION public.enforce_order_status_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('app.order_transition', true) IS DISTINCT FROM '1' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'لا يمكن تغيير حالة الطلب مباشرة؛ استخدم مسار الطلب المعتمد';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_order_status_handoff ON public.orders;
CREATE TRIGGER trg_enforce_order_status_handoff BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_handoff();

CREATE OR REPLACE FUNCTION public.transition_order_status(p_order_id uuid, p_next_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_order public.orders%ROWTYPE; v_is_merchant boolean; v_is_delivery boolean; v_allowed boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.merchant_profiles m WHERE m.id=v_order.merchant_id AND m.user_id=auth.uid()) INTO v_is_merchant;
  SELECT EXISTS (SELECT 1 FROM public.delivery_profiles d WHERE d.id=v_order.delivery_id AND d.user_id=auth.uid()) INTO v_is_delivery;
  v_allowed := public.is_admin()
    OR (p_next_status='preparing' AND v_order.status='pending' AND v_is_merchant)
    OR (p_next_status='ready' AND v_order.status='preparing' AND v_is_merchant)
    OR (p_next_status='picked_up' AND v_order.status='assigned' AND v_is_delivery)
    OR (p_next_status='on_the_way' AND v_order.status='picked_up' AND v_is_delivery)
    OR (p_next_status='delivered' AND v_order.status='on_the_way' AND v_is_delivery)
    OR (p_next_status='cancelled' AND v_order.status IN ('pending','preparing') AND v_order.customer_id=auth.uid());
  IF NOT v_allowed THEN RAISE EXCEPTION 'انتقال حالة غير مسموح لهذه الجهة'; END IF;
  PERFORM set_config('app.order_transition','1',true);
  UPDATE public.orders SET status=p_next_status, delivered_at=CASE WHEN p_next_status='delivered' THEN now() ELSE delivered_at END WHERE id=p_order_id;
  INSERT INTO public.order_tracking(order_id,status,created_by) VALUES (p_order_id,p_next_status::order_status_enum,auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.claim_delivery_order(p_order_id uuid, p_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_profile_id uuid; v_updated int;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'غير مصرّح'; END IF;
  SELECT id INTO v_profile_id FROM public.delivery_profiles WHERE user_id=auth.uid() AND is_approved=true AND is_online=true LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'حساب المندوب غير متاح لاستلام الطلبات'; END IF;
  PERFORM set_config('app.order_transition','1',true);
  UPDATE public.orders SET delivery_id=v_profile_id,status='assigned' WHERE id=p_order_id AND delivery_id IS NULL AND status='ready'; GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated>0 THEN INSERT INTO public.order_tracking(order_id,status,created_by) VALUES (p_order_id,'assigned',auth.uid()); END IF;
  RETURN v_updated>0;
END; $$;
REVOKE ALL ON FUNCTION public.transition_order_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid,text) TO authenticated;
