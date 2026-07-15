-- Persist the delivery onboarding fields that the application already asks the
-- courier to provide. Identity and licence images live in a private bucket and
-- are attached only after server-side ownership, path, MIME and size checks.

ALTER TABLE public.delivery_profiles
  ADD COLUMN IF NOT EXISTS work_city text,
  ADD COLUMN IF NOT EXISTS national_id_image_path text,
  ADD COLUMN IF NOT EXISTS license_image_path text,
  ADD COLUMN IF NOT EXISTS application_revision bigint;

UPDATE public.delivery_profiles
SET application_revision = 1
WHERE application_revision IS NULL OR application_revision < 1;

ALTER TABLE public.delivery_profiles
  ALTER COLUMN application_revision SET DEFAULT 1,
  ALTER COLUMN application_revision SET NOT NULL;

ALTER TABLE public.delivery_profiles
  DROP CONSTRAINT IF EXISTS delivery_profiles_work_city_check,
  DROP CONSTRAINT IF EXISTS delivery_profiles_national_id_image_path_check,
  DROP CONSTRAINT IF EXISTS delivery_profiles_license_image_path_check,
  DROP CONSTRAINT IF EXISTS delivery_profiles_application_revision_check;
ALTER TABLE public.delivery_profiles
  ADD CONSTRAINT delivery_profiles_work_city_check CHECK (
    work_city IS NULL OR length(btrim(work_city)) BETWEEN 2 AND 100
  ),
  ADD CONSTRAINT delivery_profiles_national_id_image_path_check CHECK (
    national_id_image_path IS NULL OR length(national_id_image_path) <= 1000
  ),
  ADD CONSTRAINT delivery_profiles_license_image_path_check CHECK (
    license_image_path IS NULL OR length(license_image_path) <= 1000
  ),
  ADD CONSTRAINT delivery_profiles_application_revision_check CHECK (
    application_revision > 0
  );

CREATE OR REPLACE FUNCTION public.bump_delivery_application_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF ROW(
    NEW.national_id,
    NEW.vehicle_type,
    NEW.vehicle_plate,
    NEW.work_city,
    NEW.national_id_image_path,
    NEW.license_image_path
  ) IS DISTINCT FROM ROW(
    OLD.national_id,
    OLD.vehicle_type,
    OLD.vehicle_plate,
    OLD.work_city,
    OLD.national_id_image_path,
    OLD.license_image_path
  ) THEN
    IF OLD.is_approved IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'approved delivery identity changes require admin re-verification';
    END IF;
    NEW.application_revision := GREATEST(COALESCE(OLD.application_revision, 1), 1) + 1;
  ELSIF NEW.application_revision IS NULL OR NEW.application_revision < OLD.application_revision THEN
    NEW.application_revision := OLD.application_revision;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bump_delivery_application_revision ON public.delivery_profiles;
CREATE TRIGGER trg_bump_delivery_application_revision
BEFORE UPDATE ON public.delivery_profiles
FOR EACH ROW EXECUTE FUNCTION public.bump_delivery_application_revision();

CREATE OR REPLACE FUNCTION public.bump_delivery_application_revision_for_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    IF EXISTS (
      SELECT 1 FROM public.delivery_profiles dp
      WHERE dp.user_id = NEW.id AND dp.is_approved IS TRUE
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'approved delivery identity changes require admin re-verification';
    END IF;
    UPDATE public.delivery_profiles
    SET application_revision = application_revision + 1
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bump_delivery_application_revision_for_name ON public.users;
CREATE TRIGGER trg_bump_delivery_application_revision_for_name
AFTER UPDATE OF full_name ON public.users
FOR EACH ROW
WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name)
EXECUTE FUNCTION public.bump_delivery_application_revision_for_name();

INSERT INTO storage.buckets(
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'delivery-onboarding-documents',
  'delivery-onboarding-documents',
  false,
  10485760,
  ARRAY['image/jpeg','image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png']::text[];

CREATE OR REPLACE FUNCTION public.marketplace_validate_delivery_onboarding_document(
  p_path text,
  p_actor uuid,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_metadata jsonb;
  v_mimetype text;
  v_size_text text;
  v_expected_pattern text;
BEGIN
  IF p_kind NOT IN ('national-id','driver-license') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid delivery document kind';
  END IF;
  v_expected_pattern := format(
    '^%s/onboarding/%s-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$',
    p_actor::text,
    p_kind
  );
  IF p_path IS NULL OR p_path !~* v_expected_pattern THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid delivery document path';
  END IF;

  SELECT so.metadata INTO v_metadata
  FROM storage.objects so
  WHERE so.bucket_id = 'delivery-onboarding-documents'
    AND so.name = p_path
    AND COALESCE(so.owner_id, so.owner::text) = p_actor::text
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery document is missing or not owned';
  END IF;

  v_mimetype := lower(COALESCE(v_metadata ->> 'mimetype', ''));
  v_size_text := COALESCE(v_metadata ->> 'size', '');
  IF NOT (
    (lower(p_path) ~ '[.]png$' AND v_mimetype = 'image/png')
    OR (lower(p_path) ~ '[.](jpg|jpeg)$' AND v_mimetype = 'image/jpeg')
  ) OR v_size_text !~ '^[0-9]+$'
     OR v_size_text::bigint NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid delivery document content';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_delivery_onboarding_documents(
  p_work_city text,
  p_national_id_image_path text DEFAULT NULL,
  p_license_image_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_city text := NULLIF(btrim(p_work_city), '');
  v_national_path text := NULLIF(btrim(p_national_id_image_path), '');
  v_license_path text := NULLIF(btrim(p_license_image_path), '');
  v_profile public.delivery_profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'operational delivery account required';
  END IF;
  IF v_city IS NULL OR length(v_city) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid work city is required';
  END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles dp
  WHERE dp.user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery profile not found';
  END IF;
  IF COALESCE(v_profile.is_approved, false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'approved identity documents require an admin re-verification workflow';
  END IF;

  IF v_national_path IS NOT NULL THEN
    PERFORM public.marketplace_validate_delivery_onboarding_document(
      v_national_path, v_actor, 'national-id'
    );
  END IF;
  IF v_license_path IS NOT NULL THEN
    PERFORM public.marketplace_validate_delivery_onboarding_document(
      v_license_path, v_actor, 'driver-license'
    );
  END IF;

  UPDATE public.delivery_profiles
  SET work_city = v_city,
      national_id_image_path = COALESCE(v_national_path, national_id_image_path),
      license_image_path = COALESCE(v_license_path, license_image_path)
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'work_city', v_profile.work_city,
    'national_id_image_path', v_profile.national_id_image_path,
    'license_image_path', v_profile.license_image_path,
    'application_revision', v_profile.application_revision,
    'is_approved', v_profile.is_approved
  );
END;
$function$;

-- The authenticated role cannot update is_approved directly, so this RPC is
-- the single application approval boundary. Re-check profile completeness and
-- private evidence at decision time; paths saved during onboarding are not, by
-- themselves, proof that the objects still exist. A documented external check
-- is an explicit alternative for legacy/manual verification.
DROP FUNCTION IF EXISTS public.review_delivery_application(uuid,boolean,text);
CREATE OR REPLACE FUNCTION public.review_delivery_application(
  p_profile_id uuid,
  p_approved boolean,
  p_reason text,
  p_expected_revision bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_reason text := NULLIF(btrim(p_reason), '');
  v_profile public.delivery_profiles%ROWTYPE;
  v_full_name text;
  v_external_verification boolean := false;
  v_verification_method text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_approved IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery review decision is required';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery application revision is required';
  END IF;
  IF NOT p_approved AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery rejection reason is required';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery review reason is too long';
  END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles dp
  WHERE dp.id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery profile not found';
  END IF;
  IF v_profile.application_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'delivery application changed since review; reload the evidence';
  END IF;

  -- Preserve historical approvals. Merely replaying "approved" must not make a
  -- legacy courier fail newly introduced evidence requirements. If an admin
  -- rejects that courier later, a future re-approval uses the new checks.
  IF p_approved AND v_profile.is_approved IS TRUE THEN
    RETURN;
  END IF;
  IF NOT p_approved
     AND v_profile.approval_reviewed_at IS NOT NULL
     AND v_profile.is_approved IS FALSE
     AND v_profile.approval_review_reason IS NOT DISTINCT FROM v_reason THEN
    RETURN;
  END IF;

  IF p_approved THEN
    SELECT u.full_name INTO v_full_name
    FROM public.users u
    WHERE u.id = v_profile.user_id AND u.role = 'delivery';

    IF length(btrim(COALESCE(v_full_name, ''))) < 2
       OR length(btrim(COALESCE(v_profile.national_id, ''))) NOT BETWEEN 3 AND 100
       OR v_profile.vehicle_type IS NULL
       OR v_profile.vehicle_type NOT IN ('motorcycle','car','bicycle','pickup')
       OR length(btrim(COALESCE(v_profile.vehicle_plate, ''))) NOT BETWEEN 2 AND 40
       OR length(btrim(COALESCE(v_profile.work_city, ''))) NOT BETWEEN 2 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'delivery approval requires complete core profile fields';
    END IF;

    v_external_verification := v_reason IS NOT NULL AND length(v_reason) >= 20;
    IF v_external_verification THEN
      v_verification_method := 'external_note';
    ELSE
      IF NULLIF(btrim(v_profile.national_id_image_path), '') IS NULL
         OR NULLIF(btrim(v_profile.license_image_path), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'approval requires both stored delivery documents or an external verification note of at least 20 characters';
      END IF;
      PERFORM public.marketplace_validate_delivery_onboarding_document(
        v_profile.national_id_image_path, v_profile.user_id, 'national-id'
      );
      PERFORM public.marketplace_validate_delivery_onboarding_document(
        v_profile.license_image_path, v_profile.user_id, 'driver-license'
      );
      v_verification_method := 'private_documents';
    END IF;
  END IF;

  UPDATE public.delivery_profiles
  SET is_approved = p_approved,
      is_online = CASE WHEN p_approved THEN is_online ELSE false END,
      approval_reviewed_at = now(),
      approval_reviewed_by = v_actor,
      approval_review_reason = v_reason
  WHERE id = p_profile_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'delivery_application_reviewed',
    'delivery_profile',
    p_profile_id,
    jsonb_build_object(
      'from_approved', v_profile.is_approved,
      'approved', p_approved,
      'reason', v_reason,
      'verification_method', v_verification_method,
      'application_revision', v_profile.application_revision
    )
  );
  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_profile.user_id,
    CASE WHEN p_approved THEN 'تم قبول حساب التوصيل' ELSE 'تعذر قبول حساب التوصيل' END,
    CASE WHEN p_approved THEN 'أصبح حساب التوصيل معتمدًا.' ELSE COALESCE(v_reason, 'تم رفض طلب التوصيل.') END,
    'delivery_review',
    jsonb_build_object(
      'delivery_profile_id', p_profile_id,
      'approved', p_approved,
      'verification_method', v_verification_method,
      'application_revision', v_profile.application_revision
    ),
    false,
    'in_app'
  );
END;
$function$;

DROP POLICY IF EXISTS "Delivery uploads onboarding documents" ON storage.objects;
CREATE POLICY "Delivery uploads onboarding documents"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'delivery-onboarding-documents'
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND public.is_current_user_operational('delivery')
  AND EXISTS (
    SELECT 1 FROM public.delivery_profiles dp
    WHERE dp.user_id = (SELECT auth.uid())
      AND dp.is_approved IS NOT TRUE
  )
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = 'onboarding'
  AND storage.filename(name) ~* '^(national-id|driver-license)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png)$'
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE false
  END
);

DROP POLICY IF EXISTS "Delivery updates onboarding documents" ON storage.objects;

DROP POLICY IF EXISTS "Delivery or admin reads onboarding documents" ON storage.objects;
CREATE POLICY "Delivery or admin reads onboarding documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-onboarding-documents'
  AND (
    (
      COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
    OR (SELECT public.is_admin())
  )
);

REVOKE ALL ON FUNCTION public.marketplace_validate_delivery_onboarding_document(text,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_delivery_application_revision()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_delivery_application_revision_for_name()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_my_delivery_onboarding_documents(text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_delivery_application(uuid,boolean,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_delivery_onboarding_documents(text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_delivery_application(uuid,boolean,text,bigint)
  TO authenticated;
