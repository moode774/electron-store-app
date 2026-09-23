-- Customer privacy: a courier kept read access to a customer's saved address
-- forever after delivering one order to it (addresses_order_parties_select
-- matched any order ever assigned to them). Couriers now read the address only
-- while the delivery is in progress. The store keeps access for its own orders.
--
-- Offer and return screens are unaffected: list_available_delivery_orders and
-- list_my_delivery_returns are SECURITY DEFINER and select the fields they
-- need themselves.
DROP POLICY IF EXISTS addresses_order_parties_select ON public.addresses;
CREATE POLICY addresses_order_parties_select ON public.addresses
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.address_id = addresses.id
      AND (
        (SELECT public.is_current_merchant_profile_owner(o.merchant_id))
        OR (
          o.status IN ('assigned', 'picked_up', 'on_the_way', 'failed_delivery')
          AND EXISTS (
            SELECT 1 FROM public.delivery_profiles dp
            WHERE dp.id = o.delivery_id AND dp.user_id = (SELECT auth.uid())
          )
        )
      )
  ));
