-- Public buckets serve objects via getPublicUrl/CDN without a SELECT policy.
-- These broad SELECT policies only enabled clients to LIST every file.
-- The app uses getPublicUrl only, so removing them is safe.
-- Applied to live DB 2026-06-19.
DROP POLICY IF EXISTS "Public bucket avatars read"  ON storage.objects;
DROP POLICY IF EXISTS "Public bucket products read" ON storage.objects;
DROP POLICY IF EXISTS "Public bucket stores read"   ON storage.objects;
