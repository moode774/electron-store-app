-- The delivery offers UI reads the courier's work city to rank nearby offers.
-- Keep the grant column-scoped; approval, balances and protected identity fields
-- remain unavailable through the Data API.
GRANT SELECT (work_city) ON public.delivery_profiles TO authenticated;
