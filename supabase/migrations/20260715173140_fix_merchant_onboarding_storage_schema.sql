-- Repair merchant onboarding in two places:
--   1. Storage upsert RLS must evaluate the same immutable path identity for
--      INSERT/SELECT/UPDATE. Storage-managed owner/metadata fields are not
--      reliable predicates while the object row is being created.
--   2. Production drifted to jsonb for service_area_ids and an unsafe true
--      default for is_approved. The onboarding RPC writes text[].

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.merchant_profiles
    WHERE service_area_ids IS NOT NULL
      AND pg_catalog.jsonb_typeof(pg_catalog.to_jsonb(service_area_ids)) <> 'array'
  ) OR EXISTS (
    SELECT 1
    FROM public.merchant_profiles AS mp
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      COALESCE(pg_catalog.to_jsonb(mp.service_area_ids), '[]'::jsonb)
    ) AS element(value)
    WHERE pg_catalog.jsonb_typeof(element.value) <> 'string'
  ) OR EXISTS (
    SELECT 1
    FROM public.merchant_profiles
    WHERE is_approved IS NULL
  ) THEN
    RAISE EXCEPTION 'merchant onboarding normalization preflight failed';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.__merchant_service_areas_to_text_array(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.array_agg(element.value ORDER BY element.ordinality),
    ARRAY[]::text[]
  )
  FROM pg_catalog.jsonb_array_elements_text(p_value)
       WITH ORDINALITY AS element(value, ordinality)
$$;

REVOKE ALL ON FUNCTION public.__merchant_service_areas_to_text_array(jsonb)
  FROM PUBLIC, anon, authenticated;

DO $normalize_service_areas$
DECLARE
  v_udt_name text;
BEGIN
  SELECT c.udt_name
  INTO v_udt_name
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'merchant_profiles'
    AND c.column_name = 'service_area_ids';

  IF v_udt_name = 'jsonb' THEN
    ALTER TABLE public.merchant_profiles
      ALTER COLUMN service_area_ids DROP DEFAULT;

    EXECUTE $sql$
      ALTER TABLE public.merchant_profiles
        ALTER COLUMN service_area_ids TYPE text[]
        USING COALESCE(
          public.__merchant_service_areas_to_text_array(service_area_ids),
          ARRAY[]::text[]
        )
    $sql$;
  ELSIF v_udt_name IS DISTINCT FROM '_text' THEN
    RAISE EXCEPTION 'Unexpected merchant_profiles.service_area_ids type: %', v_udt_name;
  END IF;
END;
$normalize_service_areas$;

ALTER TABLE public.merchant_profiles
  ALTER COLUMN service_area_ids SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN service_area_ids SET NOT NULL,
  ALTER COLUMN is_approved SET DEFAULT false,
  ALTER COLUMN is_approved SET NOT NULL;

DROP FUNCTION public.__merchant_service_areas_to_text_array(jsonb);

DROP POLICY IF EXISTS "Merchant uploads store media" ON storage.objects;
DROP POLICY IF EXISTS "Merchant updates store media" ON storage.objects;
DROP POLICY IF EXISTS "Merchant reads own store media" ON storage.objects;

CREATE POLICY "Merchant uploads store media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] IN ('logos', 'banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
);

CREATE POLICY "Merchant reads own store media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] IN ('logos', 'banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
);

CREATE POLICY "Merchant updates store media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] IN ('logos', 'banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
)
WITH CHECK (
  bucket_id = 'stores'
  AND public.is_current_user_operational('merchant')
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] IN ('logos', 'banners')
  AND split_part(storage.filename(name), '.', 1) = (SELECT auth.uid())::text
  AND storage.filename(name) ~* '\.(jpg|jpeg|png)$'
);
