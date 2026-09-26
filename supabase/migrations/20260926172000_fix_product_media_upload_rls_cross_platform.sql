-- Product media upload RLS: cross-platform and merchant-safe.
-- File size/MIME are enforced by the bucket; RLS enforces authenticated merchant ownership.

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
WHERE id = 'products';

DROP POLICY IF EXISTS "Merchant uploads product media" ON storage.objects;
CREATE POLICY "Merchant uploads product media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'products'
  AND public.is_current_user_operational('merchant')
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif')
);

DROP POLICY IF EXISTS "Merchant updates product media" ON storage.objects;
CREATE POLICY "Merchant updates product media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'products'
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
)
WITH CHECK (
  bucket_id = 'products'
  AND public.is_current_user_operational('merchant')
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif')
);

DROP POLICY IF EXISTS "Merchant deletes own product media" ON storage.objects;
CREATE POLICY "Merchant deletes own product media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'products'
  AND public.is_current_merchant_profile_operational(public.get_current_merchant_profile_id())
  AND (storage.foldername(name))[1] = public.get_current_merchant_profile_id()::text
);
