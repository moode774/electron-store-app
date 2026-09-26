-- Delivery onboarding uploads: enforce identity/path in RLS and file constraints at bucket level.
-- Approved couriers may fill missing onboarding metadata/documents without losing approval.

UPDATE storage.buckets
SET file_size_limit=10485760,
    allowed_mime_types=ARRAY['image/jpeg','image/png']::text[]
WHERE id='delivery-onboarding-documents';

DROP POLICY IF EXISTS "Delivery uploads onboarding documents" ON storage.objects;
CREATE POLICY "Delivery uploads onboarding documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='delivery-onboarding-documents'
  AND public.is_current_user_operational('delivery')
  AND array_length(storage.foldername(name),1)=2
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND (storage.foldername(name))[2]='onboarding'
  AND storage.filename(name) ~* '^(national-id|driver-license)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$'
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png')
);

CREATE OR REPLACE FUNCTION public.save_my_delivery_onboarding_documents(
  p_work_city text,
  p_national_id_image_path text DEFAULT NULL,
  p_license_image_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_city text := NULLIF(btrim(p_work_city),'');
  v_national_path text := NULLIF(btrim(p_national_id_image_path),'');
  v_license_path text := NULLIF(btrim(p_license_image_path),'');
  v_profile public.delivery_profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='operational delivery account required';
  END IF;
  IF v_city IS NULL OR length(v_city) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='valid work city is required';
  END IF;

  SELECT dp.* INTO v_profile FROM public.delivery_profiles dp
  WHERE dp.user_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='delivery profile not found';
  END IF;

  IF v_national_path IS NOT NULL THEN
    PERFORM public.marketplace_validate_delivery_onboarding_document(v_national_path,v_actor,'national-id');
  END IF;
  IF v_license_path IS NOT NULL THEN
    PERFORM public.marketplace_validate_delivery_onboarding_document(v_license_path,v_actor,'driver-license');
  END IF;

  UPDATE public.delivery_profiles
  SET work_city=v_city,
      national_id_image_path=COALESCE(v_national_path,national_id_image_path),
      license_image_path=COALESCE(v_license_path,license_image_path)
  WHERE id=v_profile.id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object('id',v_profile.id,'work_city',v_profile.work_city,
    'national_id_image_path',v_profile.national_id_image_path,
    'license_image_path',v_profile.license_image_path,
    'application_revision',v_profile.application_revision,
    'is_approved',v_profile.is_approved);
END;
$$;
