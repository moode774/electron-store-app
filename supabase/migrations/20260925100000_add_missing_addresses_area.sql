-- The live project was missing addresses.area (defined in the initial schema),
-- so list_my_delivery_returns() failed with "column a.area does not exist" and
-- the courier returns screen could not load. No-op where the column exists.
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS area text;
