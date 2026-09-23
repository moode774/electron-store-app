-- refund_requests_merchant_select joined merchant_profiles and compared
-- mp.user_id, but `authenticated` only has column-level SELECT on
-- merchant_profiles and user_id is not one of those columns. Postgres checks
-- every permissive policy, so ANY authenticated read of refund_requests failed
-- with "permission denied for table merchant_profiles":
--   * customers could not see their refund status on the order screen;
--   * merchants could not load their refunds screen.
--
-- Use the same SECURITY DEFINER ownership helper as the other merchant
-- policies (orders_participant_select, products_merchant_select, ...).
DROP POLICY IF EXISTS refund_requests_merchant_select ON public.refund_requests;
CREATE POLICY refund_requests_merchant_select ON public.refund_requests
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = refund_requests.order_id
      AND (SELECT public.is_current_merchant_profile_owner(o.merchant_id))
  ));
