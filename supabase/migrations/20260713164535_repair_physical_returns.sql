-- Physical merchandise returns are deliberately separate from financial-only
-- refunds. A return moves custody through customer, courier, merchant review,
-- inventory disposition, and only then the existing balanced refund ledger.

-- -----------------------------------------------------------------------------
-- Durable return records and one-to-one links to the financial refund.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested',
  reason text NOT NULL,
  description text,
  evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  pickup_method text NOT NULL,
  refund_method text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  merchant_recommendation text,
  merchant_response text,
  merchant_responded_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  review_fingerprint text,
  assigned_delivery_id uuid REFERENCES public.delivery_profiles(id) ON DELETE SET NULL,
  pickup_scheduled_at timestamptz,
  schedule_idempotency_key uuid,
  schedule_fingerprint text,
  picked_up_at timestamptz,
  received_at timestamptz,
  merchant_received_at timestamptz,
  inspected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  inspected_at timestamptz,
  inspection_notes text,
  inspection_fingerprint text,
  cancelled_at timestamptz,
  cancellation_reason text,
  refund_request_id uuid REFERENCES public.refund_requests(id) ON DELETE SET NULL,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  completion_idempotency_key uuid,
  completion_fingerprint text,
  completed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_requests_status_check CHECK (
    status IN (
      'requested','approved','rejected','cancelled','pickup_scheduled',
      'picked_up','received','inspected','completed'
    )
  ),
  CONSTRAINT return_requests_reason_check CHECK (
    reason IN ('damaged','not_as_described','wrong_item','changed_mind','other')
  ),
  CONSTRAINT return_requests_pickup_method_check CHECK (
    pickup_method IN ('courier_pickup','customer_dropoff')
  ),
  CONSTRAINT return_requests_refund_method_check CHECK (
    refund_method IN ('wallet','original_payment')
  ),
  CONSTRAINT return_requests_evidence_check CHECK (
    jsonb_typeof(evidence_images) = 'array'
  ),
  CONSTRAINT return_requests_merchant_recommendation_check CHECK (
    merchant_recommendation IS NULL OR merchant_recommendation IN ('approve','reject')
  ),
  CONSTRAINT return_requests_refund_amount_check CHECK (refund_amount >= 0),
  CONSTRAINT return_requests_review_timestamp_check CHECK (
    status NOT IN ('approved','rejected','pickup_scheduled','picked_up','received','inspected','completed')
    OR reviewed_at IS NOT NULL
  ),
  CONSTRAINT return_requests_schedule_timestamp_check CHECK (
    status NOT IN ('pickup_scheduled','picked_up','received','inspected','completed')
    OR pickup_scheduled_at IS NOT NULL
  ),
  CONSTRAINT return_requests_pickup_timestamp_check CHECK (
    status NOT IN ('picked_up','received','inspected','completed') OR picked_up_at IS NOT NULL
  ),
  CONSTRAINT return_requests_received_timestamp_check CHECK (
    status NOT IN ('received','inspected','completed') OR received_at IS NOT NULL
  ),
  CONSTRAINT return_requests_inspection_timestamp_check CHECK (
    status NOT IN ('inspected','completed') OR inspected_at IS NOT NULL
  ),
  CONSTRAINT return_requests_completion_check CHECK (
    status <> 'completed'
    OR (
      completed_at IS NOT NULL
      AND completed_by IS NOT NULL
      AND (
        (refund_amount = 0 AND refund_request_id IS NULL)
        OR (refund_amount > 0 AND refund_request_id IS NOT NULL)
      )
    )
  ),
  CONSTRAINT return_requests_cancelled_timestamp_check CHECK (
    status <> 'cancelled' OR cancelled_at IS NOT NULL
  ),
  CONSTRAINT return_requests_delivery_assignment_check CHECK (
    pickup_method <> 'courier_pickup'
    OR status NOT IN ('pickup_scheduled','picked_up','received','inspected','completed')
    OR assigned_delivery_id IS NOT NULL
  )
);

-- Replay-safe correction for databases that created return_requests with the
-- original rule requiring a financial refund for every completed return.
ALTER TABLE public.return_requests
  DROP CONSTRAINT IF EXISTS return_requests_completion_check;
ALTER TABLE public.return_requests
  ADD CONSTRAINT return_requests_completion_check CHECK (
    status <> 'completed'
    OR (
      completed_at IS NOT NULL
      AND completed_by IS NOT NULL
      AND (
        (refund_amount = 0 AND refund_request_id IS NULL)
        OR (refund_amount > 0 AND refund_request_id IS NOT NULL)
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  purchased_quantity integer NOT NULL CHECK (purchased_quantity > 0),
  requested_quantity integer NOT NULL CHECK (requested_quantity > 0),
  approved_quantity integer,
  accepted_quantity integer,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  disposition text,
  inspection_notes text,
  restocked_at timestamptz,
  restock_operation_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_items_request_order_item_uq UNIQUE (return_request_id, order_item_id),
  CONSTRAINT return_items_requested_bound CHECK (requested_quantity <= purchased_quantity),
  CONSTRAINT return_items_approved_bound CHECK (
    approved_quantity IS NULL OR (approved_quantity >= 0 AND approved_quantity <= requested_quantity)
  ),
  CONSTRAINT return_items_accepted_bound CHECK (
    accepted_quantity IS NULL OR (
      accepted_quantity >= 0
      AND approved_quantity IS NOT NULL
      AND accepted_quantity <= approved_quantity
    )
  ),
  CONSTRAINT return_items_disposition_check CHECK (
    disposition IS NULL OR disposition IN ('restock','discard','repair','return_to_vendor','rejected')
  ),
  CONSTRAINT return_items_disposition_quantity_check CHECK (
    accepted_quantity IS NULL
    OR (accepted_quantity = 0 AND disposition = 'rejected')
    OR (accepted_quantity > 0 AND disposition IN ('restock','discard','repair','return_to_vendor'))
  ),
  CONSTRAINT return_items_restock_check CHECK (
    restocked_at IS NULL
    OR (accepted_quantity > 0 AND disposition = 'restock' AND restock_operation_key IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.return_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role text,
  event_key text NOT NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_tracking_status_check CHECK (
    status IN (
      'requested','approved','rejected','cancelled','pickup_scheduled',
      'picked_up','received','inspected','completed'
    )
  ),
  CONSTRAINT return_tracking_event_key_uq UNIQUE (event_key)
);

CREATE TABLE IF NOT EXISTS public.return_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  delivery_profile_id uuid NOT NULL REFERENCES public.delivery_profiles(id) ON DELETE RESTRICT,
  proof_type text NOT NULL CHECK (proof_type IN ('pickup','merchant_delivery')),
  proof_path text NOT NULL CHECK (length(proof_path) BETWEEN 1 AND 2048),
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  captured_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_proofs_request_type_uq UNIQUE (return_request_id, proof_type),
  CONSTRAINT return_proofs_actor_idempotency_uq UNIQUE (captured_by, idempotency_key)
);

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS return_item_id uuid REFERENCES public.return_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_return_requests_customer_idempotency
  ON public.return_requests(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_return_requests_one_active_order
  ON public.return_requests(order_id)
  WHERE status IN ('requested','approved','pickup_scheduled','picked_up','received','inspected');
CREATE UNIQUE INDEX IF NOT EXISTS ux_return_requests_refund_request
  ON public.return_requests(refund_request_id) WHERE refund_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_requests_return_request
  ON public.refund_requests(return_request_id) WHERE return_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_logs_return_restock
  ON public.inventory_logs(return_item_id)
  WHERE return_item_id IS NOT NULL AND change_type = 'return_restock';

CREATE INDEX IF NOT EXISTS idx_return_requests_order_created
  ON public.return_requests(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer_created
  ON public.return_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_delivery_status
  ON public.return_requests(assigned_delivery_id, status, pickup_scheduled_at)
  WHERE assigned_delivery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_return_requests_status_created
  ON public.return_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_items_request
  ON public.return_items(return_request_id, order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item
  ON public.return_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_tracking_request_created
  ON public.return_tracking(return_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_return_tracking_actor
  ON public.return_tracking(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_return_proofs_request_created
  ON public.return_proofs(return_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_return_proofs_delivery
  ON public.return_proofs(delivery_profile_id, created_at DESC);

-- return_requests is created after the shared realtime migration. Add only the
-- aggregate request record needed by the app, and keep migration replay safe.
DO $return_requests_realtime$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'return_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.return_requests;
  END IF;
END;
$return_requests_realtime$;

-- Private evidence buckets. Object names are deterministic and immutable:
-- return-evidence: <customer>/<order>/<request-key>/<file-uuid>.<ext>
-- return-proofs:   <courier>/return-proofs/<return>/<step-key>.<ext>
INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES
  (
    'return-evidence', 'return-evidence', false, 10485760,
    ARRAY['image/jpeg','image/png','application/pdf']::text[]
  ),
  (
    'return-proofs', 'return-proofs', false, 10485760,
    ARRAY['image/jpeg','image/png']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Customer uploads return evidence" ON storage.objects;
DROP POLICY IF EXISTS "Customer deletes unreferenced return evidence" ON storage.objects;
DROP POLICY IF EXISTS "Return participants read evidence" ON storage.objects;
DROP POLICY IF EXISTS "Assigned courier uploads return proof" ON storage.objects;
DROP POLICY IF EXISTS "Return participants read courier proof" ON storage.objects;

CREATE POLICY "Customer uploads return evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'return-evidence'
  AND public.is_current_user_operational('customer')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|pdf)$'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND o.customer_id = (SELECT auth.uid())
      AND o.status::text IN ('delivered','returned')
  )
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN (
    'image/jpeg','image/png','application/pdf'
  )
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE false
  END
);

CREATE POLICY "Customer deletes unreferenced return evidence"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'return-evidence'
  AND public.is_current_user_operational('customer')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND NOT EXISTS (
    SELECT 1
    FROM public.return_requests rr
    WHERE rr.customer_id = (SELECT auth.uid())
      AND rr.evidence_images @> jsonb_build_array(storage.objects.name)
  )
);

CREATE POLICY "Return participants read evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'return-evidence'
  AND (
    (SELECT public.is_current_user_operational())
    OR (SELECT public.is_admin())
  )
  AND array_length(storage.foldername(name), 1) = 3
  AND (
    (
      COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id::text = (storage.foldername(name))[2]
          AND o.customer_id = (SELECT auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id
      LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
      WHERE o.id::text = (storage.foldername(name))[2]
        AND rr.evidence_images @> jsonb_build_array(storage.objects.name)
        AND (
          public.is_current_merchant_profile_owner(o.merchant_id)
          OR dp.user_id = (SELECT auth.uid())
          OR (SELECT public.is_admin())
        )
    )
  )
);

CREATE POLICY "Assigned courier uploads return proof"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'return-proofs'
  AND public.is_current_user_operational('delivery')
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = 'return-proofs'
  AND storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png)$'
  AND EXISTS (
    SELECT 1
    FROM public.return_requests rr
    JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
    WHERE rr.id::text = (storage.foldername(name))[3]
      AND dp.user_id = (SELECT auth.uid())
      AND rr.status IN ('pickup_scheduled','picked_up')
  )
  AND lower(COALESCE(metadata ->> 'mimetype', '')) IN ('image/jpeg','image/png')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE false
  END
);

CREATE POLICY "Return participants read courier proof"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'return-proofs'
  AND (
    (SELECT public.is_current_user_operational())
    OR (SELECT public.is_admin())
  )
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[2] = 'return-proofs'
  AND EXISTS (
    SELECT 1
    FROM public.return_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
    WHERE rr.id::text = (storage.foldername(name))[3]
      AND (
        rr.customer_id = (SELECT auth.uid())
        OR public.is_current_merchant_profile_owner(o.merchant_id)
        OR dp.user_id = (SELECT auth.uid())
        OR (SELECT public.is_admin())
      )
  )
);

-- -----------------------------------------------------------------------------
-- Table-level invariants protect service-side maintenance as well as RPC calls.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_return_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.pickup_method IS DISTINCT FROM OLD.pickup_method
       OR NEW.refund_method IS DISTINCT FROM OLD.refund_method
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'immutable return request fields cannot be changed';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'requested' AND NEW.status IN ('approved','rejected','cancelled'))
      OR (OLD.status = 'approved' AND NEW.status = 'pickup_scheduled')
      OR (OLD.status = 'pickup_scheduled' AND NEW.status = 'picked_up')
      OR (OLD.status = 'picked_up' AND NEW.status = 'received')
      OR (OLD.status = 'received' AND NEW.status = 'inspected')
      OR (OLD.status = 'inspected' AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'illegal return transition: ' || OLD.status || ' -> ' || NEW.status;
    END IF;
  END IF;

  IF NEW.status IN ('requested','approved','pickup_scheduled','picked_up','received','inspected')
     AND EXISTS (
       SELECT 1
       FROM public.refund_requests r
       WHERE r.order_id = NEW.order_id
         AND r.status IN ('pending','approved','processing')
         AND r.return_request_id IS DISTINCT FROM NEW.id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'an active financial refund already exists for this order';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_return_request_transition ON public.return_requests;
CREATE TRIGGER trg_enforce_return_request_transition
  BEFORE INSERT OR UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_return_request_transition();

CREATE OR REPLACE FUNCTION public.enforce_refund_return_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.return_request_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.return_requests rr
      WHERE rr.id = NEW.return_request_id
        AND rr.order_id = NEW.order_id
        AND rr.customer_id = NEW.customer_id
        AND rr.status IN ('inspected','completed')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503',
        MESSAGE = 'linked physical return does not match the refund order and customer';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('pending','approved','processing') THEN
    IF EXISTS (
      SELECT 1 FROM public.return_requests rr
      WHERE rr.order_id = NEW.order_id
        AND rr.status IN ('requested','approved','pickup_scheduled','picked_up','received','inspected')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'an active physical return already exists for this order';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_refund_return_exclusivity ON public.refund_requests;
CREATE TRIGGER trg_enforce_refund_return_exclusivity
  BEFORE INSERT OR UPDATE OF order_id, customer_id, reason, status, return_request_id
  ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_refund_return_exclusivity();

CREATE OR REPLACE FUNCTION public.validate_return_evidence_objects(
  p_evidence jsonb,
  p_actor_id uuid,
  p_order_id uuid,
  p_idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text;
  v_metadata jsonb;
  v_mimetype text;
  v_size_text text;
  v_expected_pattern text;
BEGIN
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array'
     OR p_actor_id IS NULL OR p_order_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return evidence identity is incomplete';
  END IF;
  v_expected_pattern := format(
    '^%s/%s/%s/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|pdf)$',
    p_actor_id::text, p_order_id::text, p_idempotency_key::text
  );

  FOR v_path IN SELECT value #>> '{}' FROM jsonb_array_elements(p_evidence)
  LOOP
    IF v_path IS NULL OR v_path !~* v_expected_pattern THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return evidence object path';
    END IF;
    SELECT so.metadata INTO v_metadata
    FROM storage.objects so
    WHERE so.bucket_id = 'return-evidence'
      AND so.name = v_path
      AND COALESCE(so.owner_id, so.owner::text) = p_actor_id::text
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'return evidence object was not found or is not owned by customer';
    END IF;
    v_mimetype := lower(COALESCE(v_metadata ->> 'mimetype', ''));
    v_size_text := COALESCE(v_metadata ->> 'size', '');
    IF NOT (
      (lower(v_path) ~ '[.]png$' AND v_mimetype = 'image/png')
      OR (lower(v_path) ~ '[.](jpg|jpeg)$' AND v_mimetype = 'image/jpeg')
      OR (lower(v_path) ~ '[.]pdf$' AND v_mimetype = 'application/pdf')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return evidence MIME type';
    END IF;
    IF v_size_text !~ '^[0-9]+$'
       OR v_size_text::bigint < 1 OR v_size_text::bigint > 10485760 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return evidence file size';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_return_proof_object(
  p_path text,
  p_actor_id uuid,
  p_request_id uuid,
  p_idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_metadata jsonb;
  v_mimetype text;
  v_size_text text;
  v_expected_pattern text;
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return proof identity is incomplete';
  END IF;
  v_expected_pattern := format(
    '^%s/return-proofs/%s/%s[.](jpg|jpeg|png)$',
    p_actor_id::text, p_request_id::text, p_idempotency_key::text
  );
  IF NULLIF(btrim(p_path), '') IS NULL OR p_path !~* v_expected_pattern THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'valid deterministic courier proof path is required';
  END IF;
  SELECT so.metadata INTO v_metadata
  FROM storage.objects so
  WHERE so.bucket_id = 'return-proofs'
    AND so.name = p_path
    AND COALESCE(so.owner_id, so.owner::text) = p_actor_id::text
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return proof object was not found or is not owned by courier';
  END IF;
  v_mimetype := lower(COALESCE(v_metadata ->> 'mimetype', ''));
  v_size_text := COALESCE(v_metadata ->> 'size', '');
  IF NOT (
    (lower(p_path) ~ '[.]png$' AND v_mimetype = 'image/png')
    OR (lower(p_path) ~ '[.](jpg|jpeg)$' AND v_mimetype = 'image/jpeg')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return proof MIME type';
  END IF;
  IF v_size_text !~ '^[0-9]+$'
     OR v_size_text::bigint < 1 OR v_size_text::bigint > 10485760 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return proof file size';
  END IF;
END;
$$;

-- Return notifications are durable in-app events. Push dispatch remains an
-- asynchronous concern, so a provider outage can never roll back custody or
-- finance state. The user/event unique index makes every retry idempotent.
CREATE OR REPLACE FUNCTION public.notify_return_event(
  p_request_id uuid,
  p_event_suffix text,
  p_recipient_kinds text[],
  p_title text,
  p_body text,
  p_type text,
  p_extra jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_request_id IS NULL OR NULLIF(btrim(p_event_suffix), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return notification identity is incomplete';
  END IF;

  WITH parties AS MATERIALIZED (
    SELECT
      rr.customer_id,
      COALESCE(mp.user_id, legacy_merchant.id) AS merchant_user_id,
      dp.user_id AS delivery_user_id,
      rr.order_id
    FROM public.return_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    LEFT JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
    LEFT JOIN public.users legacy_merchant
      ON legacy_merchant.id = o.merchant_id
     AND legacy_merchant.role::text = 'merchant'
    LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
    WHERE rr.id = p_request_id
  ), recipients AS (
    SELECT customer_id AS user_id FROM parties
    WHERE 'customer' = ANY (COALESCE(p_recipient_kinds, ARRAY[]::text[]))
    UNION
    SELECT merchant_user_id FROM parties
    WHERE 'merchant' = ANY (COALESCE(p_recipient_kinds, ARRAY[]::text[]))
      AND merchant_user_id IS NOT NULL
    UNION
    SELECT delivery_user_id FROM parties
    WHERE 'delivery' = ANY (COALESCE(p_recipient_kinds, ARRAY[]::text[]))
      AND delivery_user_id IS NOT NULL
    UNION
    SELECT u.id
    FROM parties
    CROSS JOIN public.users u
    WHERE 'admin' = ANY (COALESCE(p_recipient_kinds, ARRAY[]::text[]))
      AND u.role::text = 'admin'
  )
  INSERT INTO public.notifications (
    user_id, title, body, type, data, is_read, channel, event_key
  )
  SELECT
    r.user_id,
    p_title,
    p_body,
    p_type,
    jsonb_build_object(
      'return_request_id', p_request_id,
      'order_id', p.order_id
    ) || COALESCE(p_extra, '{}'::jsonb),
    false,
    'in_app',
    'physical-return:' || p_request_id::text || ':' || p_event_suffix
  FROM recipients r
  JOIN public.users u ON u.id = r.user_id
  CROSS JOIN parties p
  WHERE u.is_active IS TRUE
    AND NOT public.is_user_blocked(u.id)
  ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
END;
$$;

-- Keep the original financial-only implementation private and expose a guarded
-- wrapper under the existing public signature. This is replay-safe.
DO $rename_financial_refund$
BEGIN
  IF to_regprocedure('public.create_refund_request_financial_only(uuid,text,text,text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.create_refund_request(uuid,text,text,text,jsonb)
      RENAME TO create_refund_request_financial_only;
  END IF;
END;
$rename_financial_refund$;

CREATE OR REPLACE FUNCTION public.create_refund_request(
  p_order_id uuid,
  p_reason text,
  p_description text,
  p_refund_method text,
  p_evidence_images jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_reason text := lower(btrim(COALESCE(p_reason, '')));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF v_reason IN ('damaged','not_as_described','wrong_item','changed_mind') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'physical return is required for this refund reason';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('refund-order:' || p_order_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.return_requests rr
    WHERE rr.order_id = p_order_id
      AND rr.status IN ('requested','approved','pickup_scheduled','picked_up','received','inspected')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'an active physical return already exists for this order';
  END IF;

  RETURN public.create_refund_request_financial_only(
    p_order_id, p_reason, p_description, p_refund_method, p_evidence_images
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Customer and merchant entry points.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_return_request(
  p_order_id uuid,
  p_items jsonb,
  p_reason text,
  p_description text,
  p_evidence_images jsonb,
  p_pickup_method text,
  p_refund_method text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_active boolean;
  v_blocked boolean;
  v_order public.orders%ROWTYPE;
  v_order_item public.order_items%ROWTYPE;
  v_existing public.return_requests%ROWTYPE;
  v_item jsonb;
  v_order_item_id uuid;
  v_quantity integer;
  v_consumed integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_validated_items jsonb := '[]'::jsonb;
  v_canonical_items jsonb;
  v_evidence jsonb := COALESCE(p_evidence_images, '[]'::jsonb);
  v_reason text := lower(btrim(COALESCE(p_reason, '')));
  v_description text := NULLIF(btrim(p_description), '');
  v_pickup_method text := lower(btrim(COALESCE(p_pickup_method, '')));
  v_refund_method text := lower(btrim(COALESCE(p_refund_method, '')));
  v_request_hash text;
  v_request_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  SELECT u.role::text, COALESCE(u.is_active, true), public.is_user_blocked(u.id)
  INTO v_role, v_active, v_blocked
  FROM public.users u WHERE u.id = v_actor;
  IF NOT FOUND OR v_role <> 'customer' OR NOT v_active OR v_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'account is not allowed to create a physical return';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return idempotency key is required';
  END IF;
  IF v_reason NOT IN ('damaged','not_as_described','wrong_item','changed_mind','other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid physical return reason';
  END IF;
  IF v_pickup_method NOT IN ('courier_pickup','customer_dropoff') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return pickup method';
  END IF;
  IF v_refund_method NOT IN ('wallet','original_payment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return refund method';
  END IF;
  IF v_description IS NULL OR length(v_description) < 10 OR length(v_description) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return description must be between 10 and 2000 characters';
  END IF;
  IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return evidence must be an array of at most 10 paths';
  END IF;
  IF jsonb_array_length(v_evidence) > 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return evidence must be an array of at most 10 paths';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_evidence) e
    WHERE jsonb_typeof(e) IS DISTINCT FROM 'string'
       OR length(e #>> '{}') NOT BETWEEN 1 AND 2048
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return evidence path';
  END IF;
  IF v_reason IN ('damaged','not_as_described','wrong_item')
     AND jsonb_array_length(v_evidence) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'physical return evidence is required for this reason';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return items must be a non-empty array of at most 100 items';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return items must be a non-empty array of at most 100 items';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('refund-order:' || p_order_id::text, 0));
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'order not found';
  END IF;
  IF v_order.customer_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'cannot return another customer order';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR NOT (v_item ? 'order_item_id') OR NOT (v_item ? 'quantity') THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'each return item requires order_item_id and quantity';
    END IF;
    BEGIN
      v_order_item_id := (v_item ->> 'order_item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return item identifier or quantity';
    END;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return item quantity must be positive';
    END IF;
    IF v_order_item_id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate order item in return request';
    END IF;
    v_seen := array_append(v_seen, v_order_item_id);

    SELECT oi.* INTO v_order_item
    FROM public.order_items oi
    WHERE oi.id = v_order_item_id AND oi.order_id = p_order_id;
    IF NOT FOUND OR v_order_item.product_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'return item does not belong to the order';
    END IF;
    IF v_quantity > v_order_item.quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'return quantity exceeds purchased quantity';
    END IF;
    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object('order_item_id', v_order_item_id, 'quantity', v_quantity)
    );
  END LOOP;

  SELECT jsonb_agg(value ORDER BY value ->> 'order_item_id')
  INTO v_canonical_items
  FROM jsonb_array_elements(v_validated_items);
  v_request_hash := md5(concat_ws(
    E'\x1f', p_order_id::text, v_actor::text, v_reason, v_description,
    v_pickup_method, v_refund_method, v_evidence::text, v_canonical_items::text
  ));

  SELECT rr.* INTO v_existing
  FROM public.return_requests rr
  WHERE rr.customer_id = v_actor AND rr.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'return idempotency key was already used with another request';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'order_id', v_existing.order_id,
      'status', v_existing.status,
      'idempotent_replay', true
    );
  END IF;

  PERFORM public.validate_return_evidence_objects(
    v_evidence, v_actor, p_order_id, p_idempotency_key
  );

  IF v_order.status::text <> 'delivered' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'only delivered orders can be returned';
  END IF;
  IF COALESCE(v_order.delivered_at, v_order.updated_at, v_order.created_at)
       < now() - interval '7 days' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'physical return window has expired';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.refund_requests r
    WHERE r.order_id = p_order_id AND r.status IN ('pending','approved','processing')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'an active financial refund already exists for this order';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.return_requests rr
    WHERE rr.order_id = p_order_id
      AND rr.status IN ('requested','approved','pickup_scheduled','picked_up','received','inspected')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'an active physical return already exists for this order';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_canonical_items)
  LOOP
    v_order_item_id := (v_item ->> 'order_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    SELECT COALESCE(sum(COALESCE(ri.accepted_quantity, 0)), 0)::integer
    INTO v_consumed
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item_id AND rr.status = 'completed';
    SELECT oi.* INTO v_order_item FROM public.order_items oi WHERE oi.id = v_order_item_id;
    IF v_consumed + v_quantity > v_order_item.quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'cumulative return quantity exceeds purchased quantity';
    END IF;
  END LOOP;

  INSERT INTO public.return_requests (
    order_id, customer_id, status, reason, description, evidence_images,
    pickup_method, refund_method, idempotency_key, request_hash
  ) VALUES (
    p_order_id, v_actor, 'requested', v_reason, v_description, v_evidence,
    v_pickup_method, v_refund_method, p_idempotency_key, v_request_hash
  ) RETURNING id INTO v_request_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_canonical_items)
  LOOP
    v_order_item_id := (v_item ->> 'order_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    SELECT oi.* INTO v_order_item FROM public.order_items oi WHERE oi.id = v_order_item_id;
    INSERT INTO public.return_items (
      return_request_id, order_item_id, product_id, variant_id,
      purchased_quantity, requested_quantity, unit_price, line_total
    ) VALUES (
      v_request_id, v_order_item.id, v_order_item.product_id, v_order_item.variant_id,
      v_order_item.quantity, v_quantity,
      round(COALESCE(
        v_order_item.unit_price,
        v_order_item.total_price / NULLIF(v_order_item.quantity, 0),
        0
      ), 2),
      round(COALESCE(
        v_order_item.total_price,
        COALESCE(v_order_item.unit_price, 0) * v_order_item.quantity,
        0
      ), 2)
    );
  END LOOP;

  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    v_request_id, 'requested', v_actor, 'customer',
    'return-requested:' || v_actor::text || ':' || p_idempotency_key::text,
    v_description,
    jsonb_build_object('reason', v_reason, 'pickup_method', v_pickup_method)
  );
  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor, 'physical_return_requested', 'return_request', v_request_id,
    jsonb_build_object('order_id', p_order_id, 'request_hash', v_request_hash)
  );
  PERFORM public.notify_return_event(
    v_request_id,
    'requested',
    ARRAY['merchant','admin']::text[],
    'طلب إرجاع جديد',
    'تم إنشاء طلب إرجاع مادي ويحتاج إلى المراجعة.',
    'physical_return_requested',
    jsonb_build_object('status', 'requested', 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'id', v_request_id,
    'order_id', p_order_id,
    'status', 'requested',
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_return_request(
  p_request_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.return_requests%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_active boolean;
  v_blocked boolean;
BEGIN
  SELECT COALESCE(u.is_active, true), public.is_user_blocked(u.id)
  INTO v_active, v_blocked FROM public.users u WHERE u.id = v_actor;
  IF v_actor IS NULL OR NOT FOUND OR NOT v_active OR v_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to cancel a return';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return cancellation reason is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  IF v_request.customer_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the requesting customer can cancel this return';
  END IF;
  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', v_request.id, 'status', 'cancelled', 'idempotent_replay', true);
  END IF;
  IF v_request.status <> 'requested' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'customer can cancel only before return approval';
  END IF;

  UPDATE public.return_requests
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason
  WHERE id = p_request_id;
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes
  ) VALUES (
    p_request_id, 'cancelled', v_actor, 'customer',
    'return-cancelled:' || p_request_id::text, v_reason
  ) ON CONFLICT (event_key) DO NOTHING;
  PERFORM public.notify_return_event(
    p_request_id,
    'cancelled',
    ARRAY['merchant','admin']::text[],
    'تم إلغاء طلب الإرجاع',
    'ألغى العميل طلب الإرجاع قبل المراجعة.',
    'physical_return_cancelled',
    jsonb_build_object('status', 'cancelled', 'reason', v_reason)
  );

  RETURN jsonb_build_object('id', p_request_id, 'status', 'cancelled', 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_return_request(
  p_request_id uuid,
  p_recommendation text,
  p_response text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.return_requests%ROWTYPE;
  v_recommendation text := lower(btrim(COALESCE(p_recommendation, '')));
  v_response text := NULLIF(btrim(p_response), '');
  v_merchant_user uuid;
  v_active boolean;
  v_blocked boolean;
  v_event_key text;
BEGIN
  SELECT COALESCE(u.is_active, true), public.is_user_blocked(u.id)
  INTO v_active, v_blocked FROM public.users u WHERE u.id = v_actor;
  IF v_actor IS NULL OR NOT FOUND OR NOT v_active OR v_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to respond to a return';
  END IF;
  IF v_recommendation NOT IN ('approve','reject') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid merchant return recommendation';
  END IF;
  IF v_response IS NULL OR length(v_response) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant return response is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  SELECT mp.user_id INTO v_merchant_user
  FROM public.orders o JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  WHERE o.id = v_request.order_id;
  IF v_merchant_user IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the order merchant can respond to this return';
  END IF;
  IF v_request.merchant_recommendation = v_recommendation
     AND v_request.merchant_response = v_response THEN
    RETURN jsonb_build_object('id', p_request_id, 'status', v_request.status, 'idempotent_replay', true);
  END IF;
  IF v_request.status <> 'requested' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'merchant response can be changed only while return review is requested';
  END IF;

  UPDATE public.return_requests
  SET merchant_recommendation = v_recommendation,
      merchant_response = v_response,
      merchant_responded_at = now()
  WHERE id = p_request_id;
  v_event_key := 'return-merchant-response:' || p_request_id::text || ':' ||
    md5(v_recommendation || E'\x1f' || v_response);
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    p_request_id, 'requested', v_actor, 'merchant', v_event_key, v_response,
    jsonb_build_object('recommendation', v_recommendation)
  ) ON CONFLICT (event_key) DO NOTHING;
  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor, 'physical_return_merchant_responded', 'return_request', p_request_id,
    jsonb_build_object('recommendation', v_recommendation, 'response', v_response)
  );
  PERFORM public.notify_return_event(
    p_request_id,
    'merchant-response:' || md5(v_recommendation || E'\x1f' || v_response),
    ARRAY['customer','admin']::text[],
    'رد التاجر على طلب الإرجاع',
    'أضاف التاجر توصيته على طلب الإرجاع.',
    'physical_return_merchant_response',
    jsonb_build_object('status', 'requested', 'recommendation', v_recommendation)
  );

  RETURN jsonb_build_object('id', p_request_id, 'status', 'requested', 'idempotent_replay', false);
END;
$$;

-- -----------------------------------------------------------------------------
-- Administrative review and pickup assignment.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_return_request(
  p_request_id uuid,
  p_decision text,
  p_approved_items jsonb,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_request public.return_requests%ROWTYPE;
  v_decision text := lower(btrim(COALESCE(p_decision, '')));
  v_notes text := NULLIF(btrim(p_notes), '');
  v_item jsonb;
  v_return_item public.return_items%ROWTYPE;
  v_return_item_id uuid;
  v_approved_quantity integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_items_count integer;
  v_approved_total integer := 0;
  v_canonical jsonb := '[]'::jsonb;
  v_fingerprint text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true) AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF v_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return review decision';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return review notes are too long';
  END IF;
  IF v_decision = 'rejected' AND v_notes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return rejection reason is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;

  IF v_decision = 'approved' THEN
    IF jsonb_typeof(p_approved_items) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'approved return items must be an array';
    END IF;
    SELECT count(*)::integer INTO v_items_count
    FROM public.return_items ri WHERE ri.return_request_id = p_request_id;
    IF jsonb_array_length(p_approved_items) <> v_items_count THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'approval must decide every requested return item exactly once';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_approved_items)
    LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
         OR NOT (v_item ? 'return_item_id') OR NOT (v_item ? 'approved_quantity') THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'each approval item requires return_item_id and approved_quantity';
      END IF;
      BEGIN
        v_return_item_id := (v_item ->> 'return_item_id')::uuid;
        v_approved_quantity := (v_item ->> 'approved_quantity')::integer;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid approved return item';
      END;
      IF v_return_item_id = ANY(v_seen) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate item in return approval';
      END IF;
      v_seen := array_append(v_seen, v_return_item_id);
      SELECT ri.* INTO v_return_item
      FROM public.return_items ri
      WHERE ri.id = v_return_item_id AND ri.return_request_id = p_request_id
      FOR UPDATE;
      IF NOT FOUND OR v_approved_quantity IS NULL OR v_approved_quantity < 0
         OR v_approved_quantity > v_return_item.requested_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'approved return quantity exceeds the requested quantity';
      END IF;
      v_approved_total := v_approved_total + v_approved_quantity;
      v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
        'return_item_id', v_return_item_id,
        'approved_quantity', v_approved_quantity
      ));
    END LOOP;
    IF v_approved_total <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'at least one return item must be approved';
    END IF;
    SELECT jsonb_agg(value ORDER BY value ->> 'return_item_id')
    INTO v_canonical FROM jsonb_array_elements(v_canonical);
  ELSE
    IF p_approved_items IS NOT NULL THEN
      IF jsonb_typeof(p_approved_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'rejected return cannot contain approved quantities';
      END IF;
      IF jsonb_array_length(p_approved_items) > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'rejected return cannot contain approved quantities';
      END IF;
    END IF;
    v_canonical := '[]'::jsonb;
  END IF;

  v_fingerprint := md5(concat_ws(
    E'\x1f', p_request_id::text, v_decision, v_canonical::text, COALESCE(v_notes, '')
  ));
  IF v_request.review_fingerprint = v_fingerprint THEN
    RETURN jsonb_build_object(
      'id', p_request_id, 'status', v_request.status, 'idempotent_replay', true
    );
  END IF;
  IF v_request.status <> 'requested' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return can be reviewed only from requested status';
  END IF;

  IF v_decision = 'approved' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_canonical)
    LOOP
      UPDATE public.return_items
      SET approved_quantity = (v_item ->> 'approved_quantity')::integer,
          updated_at = now()
      WHERE id = (v_item ->> 'return_item_id')::uuid;
    END LOOP;
  ELSE
    UPDATE public.return_items
    SET approved_quantity = 0, updated_at = now()
    WHERE return_request_id = p_request_id;
  END IF;

  UPDATE public.return_requests
  SET status = v_decision,
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_notes = v_notes,
      review_fingerprint = v_fingerprint
  WHERE id = p_request_id;
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    p_request_id, v_decision, v_actor, 'admin',
    'return-review:' || v_fingerprint, v_notes,
    jsonb_build_object('approved_items', v_canonical)
  ) ON CONFLICT (event_key) DO NOTHING;
  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor, 'physical_return_reviewed', 'return_request', p_request_id,
    jsonb_build_object('decision', v_decision, 'items', v_canonical, 'notes', v_notes)
  );
  PERFORM public.notify_return_event(
    p_request_id,
    'review:' || v_fingerprint,
    ARRAY['customer','merchant']::text[],
    CASE WHEN v_decision = 'approved' THEN 'تم قبول طلب الإرجاع' ELSE 'تم رفض طلب الإرجاع' END,
    CASE
      WHEN v_decision = 'approved' THEN 'وافقت الإدارة على طلب الإرجاع بالكميات المحددة.'
      ELSE COALESCE(v_notes, 'تعذر قبول طلب الإرجاع.')
    END,
    'physical_return_reviewed',
    jsonb_build_object('status', v_decision, 'decision', v_decision)
  );

  RETURN jsonb_build_object(
    'id', p_request_id, 'status', v_decision,
    'approved_items', v_canonical, 'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_schedule_return_pickup(
  p_request_id uuid,
  p_delivery_profile_id uuid,
  p_scheduled_at timestamptz,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_request public.return_requests%ROWTYPE;
  v_delivery_user uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_schedule_fingerprint text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true) AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pickup scheduling idempotency key is required';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at < now() - interval '5 minutes'
     OR p_scheduled_at > now() + interval '30 days' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return pickup schedule';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pickup notes are too long';
  END IF;
  v_schedule_fingerprint := md5(concat_ws(
    E'\x1f', p_request_id::text, COALESCE(p_delivery_profile_id::text, ''),
    extract(epoch FROM p_scheduled_at)::text, COALESCE(v_notes, '')
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  IF v_request.schedule_idempotency_key = p_idempotency_key THEN
    IF v_request.schedule_fingerprint IS DISTINCT FROM v_schedule_fingerprint
       OR v_request.pickup_scheduled_at IS DISTINCT FROM p_scheduled_at
       OR v_request.assigned_delivery_id IS DISTINCT FROM p_delivery_profile_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'pickup scheduling idempotency key was reused with different details';
    END IF;
    RETURN jsonb_build_object(
      'id', p_request_id, 'status', v_request.status,
      'delivery_profile_id', v_request.assigned_delivery_id,
      'scheduled_at', v_request.pickup_scheduled_at,
      'idempotent_replay', true
    );
  END IF;
  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'only an approved return can be scheduled';
  END IF;

  IF v_request.pickup_method = 'courier_pickup' THEN
    IF p_delivery_profile_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'courier pickup requires an assigned delivery profile';
    END IF;
    SELECT dp.user_id INTO v_delivery_user
    FROM public.delivery_profiles dp
    JOIN public.users u ON u.id = dp.user_id
    WHERE dp.id = p_delivery_profile_id
      AND COALESCE(dp.is_approved, false)
      AND COALESCE(dp.is_online, false)
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id);
    IF v_delivery_user IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'assigned delivery profile is not approved, active, and online';
    END IF;
  ELSIF p_delivery_profile_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'customer dropoff cannot be assigned to a courier';
  END IF;

  UPDATE public.return_requests
  SET status = 'pickup_scheduled',
      assigned_delivery_id = p_delivery_profile_id,
      pickup_scheduled_at = p_scheduled_at,
      schedule_idempotency_key = p_idempotency_key,
      schedule_fingerprint = v_schedule_fingerprint,
      admin_notes = CASE
        WHEN v_notes IS NULL THEN admin_notes
        ELSE concat_ws(E'\n', NULLIF(admin_notes, ''), '[pickup] ' || v_notes)
      END
  WHERE id = p_request_id;
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    p_request_id, 'pickup_scheduled', v_actor, 'admin',
    'return-pickup-scheduled:' || p_request_id::text || ':' || p_idempotency_key::text, v_notes,
    jsonb_build_object(
      'pickup_method', v_request.pickup_method,
      'delivery_profile_id', p_delivery_profile_id,
      'scheduled_at', p_scheduled_at
    )
  ) ON CONFLICT (event_key) DO NOTHING;
  PERFORM public.notify_return_event(
    p_request_id,
    'scheduled:' || p_idempotency_key::text,
    ARRAY['customer','merchant','delivery']::text[],
    'تم تحديد موعد الإرجاع',
    CASE
      WHEN v_request.pickup_method = 'courier_pickup' THEN 'تم إسناد مندوب وموعد لاستلام المرتجع.'
      ELSE 'تم تحديد موعد تسليم المرتجع للمتجر.'
    END,
    'physical_return_scheduled',
    jsonb_build_object(
      'status', 'pickup_scheduled',
      'pickup_method', v_request.pickup_method,
      'scheduled_at', p_scheduled_at,
      'delivery_profile_id', p_delivery_profile_id
    )
  );

  RETURN jsonb_build_object(
    'id', p_request_id, 'status', 'pickup_scheduled',
    'delivery_profile_id', p_delivery_profile_id,
    'scheduled_at', p_scheduled_at, 'idempotent_replay', false
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Assigned-courier custody and merchant receipt/inspection.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_delivery_returns()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_delivery_profile_id uuid;
BEGIN
  SELECT dp.id INTO v_delivery_profile_id
  FROM public.delivery_profiles dp
  JOIN public.users u ON u.id = dp.user_id
  WHERE dp.user_id = v_actor
    AND COALESCE(dp.is_approved, false)
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id)
  ORDER BY dp.created_at, dp.id
  LIMIT 1;
  IF v_actor IS NULL OR v_delivery_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery authorization required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', rr.id,
    'order_id', rr.order_id,
    'status', rr.status,
    'reason', rr.reason,
    'pickup_method', rr.pickup_method,
    'scheduled_at', rr.pickup_scheduled_at,
    'picked_up_at', rr.picked_up_at,
    'received_at', rr.received_at,
    'customer_id', rr.customer_id,
    'order_number', o.order_number,
    'address_id', o.address_id,
    'merchant_id', o.merchant_id,
    'address', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', a.id,
      'label', a.label,
      'full_address', a.full_address,
      'city', a.city,
      'area', a.area,
      'latitude', a.latitude,
      'longitude', a.longitude
    ) END,
    -- Safe operational destination fields are returned inside this assigned-
    -- courier SECURITY DEFINER boundary. Do not make the courier depend on the
    -- public merchant profile policy: an inactive store can still be the
    -- required destination for merchandise already in return custody.
    'merchant', CASE WHEN mp.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', mp.id,
      'store_name', mp.store_name,
      'address', mp.address,
      'city', mp.city,
      'store_phone', mp.store_phone,
      'latitude', mp.latitude,
      'longitude', mp.longitude
    ) END,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'order_item_id', ri.order_item_id,
        'product_id', ri.product_id,
        'variant_id', ri.variant_id,
        'approved_quantity', ri.approved_quantity
      ) ORDER BY ri.created_at, ri.id)
      FROM public.return_items ri WHERE ri.return_request_id = rr.id
    ), '[]'::jsonb)
  )
  FROM public.return_requests rr
  JOIN public.orders o ON o.id = rr.order_id
  LEFT JOIN public.addresses a ON a.id = o.address_id
  LEFT JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  WHERE rr.assigned_delivery_id = v_delivery_profile_id
    AND rr.status IN ('pickup_scheduled','picked_up','received')
  ORDER BY rr.pickup_scheduled_at NULLS LAST, rr.created_at, rr.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delivery_update_return_status(
  p_request_id uuid,
  p_status text,
  p_proof_path text,
  p_latitude numeric,
  p_longitude numeric,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_delivery_profile_id uuid;
  v_request public.return_requests%ROWTYPE;
  v_target text := lower(btrim(COALESCE(p_status, '')));
  v_path text := NULLIF(btrim(p_proof_path), '');
  v_proof_type text;
  v_existing_proof public.return_proofs%ROWTYPE;
BEGIN
  SELECT dp.id INTO v_delivery_profile_id
  FROM public.delivery_profiles dp
  JOIN public.users u ON u.id = dp.user_id
  WHERE dp.user_id = v_actor
    AND COALESCE(dp.is_approved, false)
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id)
  ORDER BY dp.created_at, dp.id
  LIMIT 1;
  IF v_actor IS NULL OR v_delivery_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery authorization required';
  END IF;
  IF v_target NOT IN ('picked_up','received') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid courier return status';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'courier return idempotency key is required';
  END IF;
  IF v_path IS NULL OR length(v_path) > 2048 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'valid deterministic courier proof path is required';
  END IF;
  IF p_latitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid courier proof coordinates are required';
  END IF;
  v_proof_type := CASE WHEN v_target = 'picked_up' THEN 'pickup' ELSE 'merchant_delivery' END;

  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  IF v_request.assigned_delivery_id IS DISTINCT FROM v_delivery_profile_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'only the assigned courier can update this return';
  END IF;
  SELECT rp.* INTO v_existing_proof
  FROM public.return_proofs rp
  WHERE rp.captured_by = v_actor AND rp.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing_proof.return_request_id IS DISTINCT FROM p_request_id
       OR v_existing_proof.proof_type IS DISTINCT FROM v_proof_type
       OR v_existing_proof.proof_path IS DISTINCT FROM v_path
       OR v_existing_proof.latitude IS DISTINCT FROM round(p_latitude, 6)
       OR v_existing_proof.longitude IS DISTINCT FROM round(p_longitude, 6) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'courier return idempotency key was reused with different proof';
    END IF;
    RETURN jsonb_build_object(
      'id', p_request_id, 'status', v_request.status,
      'proof_id', v_existing_proof.id, 'idempotent_replay', true
    );
  END IF;

  PERFORM public.validate_return_proof_object(
    v_path, v_actor, p_request_id, p_idempotency_key
  );

  IF NOT (
    (v_request.status = 'pickup_scheduled' AND v_target = 'picked_up')
    OR (v_request.status = 'picked_up' AND v_target = 'received')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'illegal courier return transition: ' || v_request.status || ' -> ' || v_target;
  END IF;

  INSERT INTO public.return_proofs (
    return_request_id, delivery_profile_id, proof_type, proof_path,
    latitude, longitude, captured_by, idempotency_key
  ) VALUES (
    p_request_id, v_delivery_profile_id, v_proof_type, v_path,
    round(p_latitude, 6), round(p_longitude, 6), v_actor, p_idempotency_key
  ) RETURNING * INTO v_existing_proof;
  UPDATE public.return_requests
  SET status = v_target,
      picked_up_at = CASE WHEN v_target = 'picked_up' THEN now() ELSE picked_up_at END,
      received_at = CASE WHEN v_target = 'received' THEN now() ELSE received_at END
  WHERE id = p_request_id;
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, metadata
  ) VALUES (
    p_request_id, v_target, v_actor, 'delivery',
    'return-delivery:' || v_actor::text || ':' || p_idempotency_key::text,
    jsonb_build_object(
      'proof_id', v_existing_proof.id,
      'proof_path', v_path,
      'latitude', round(p_latitude, 6),
      'longitude', round(p_longitude, 6)
    )
  );
  PERFORM public.notify_return_event(
    p_request_id,
    v_target,
    CASE
      WHEN v_target = 'picked_up' THEN ARRAY['customer','merchant']::text[]
      ELSE ARRAY['customer','merchant','admin']::text[]
    END,
    CASE WHEN v_target = 'picked_up' THEN 'استلم المندوب المرتجع' ELSE 'وصل المرتجع إلى المتجر' END,
    CASE
      WHEN v_target = 'picked_up' THEN 'استلم المندوب المرتجع من العميل.'
      ELSE 'سلّم المندوب المرتجع إلى المتجر وينتظر تأكيد الاستلام.'
    END,
    CASE WHEN v_target = 'picked_up' THEN 'physical_return_picked_up' ELSE 'physical_return_received' END,
    jsonb_build_object('status', v_target, 'proof_id', v_existing_proof.id)
  );

  RETURN jsonb_build_object(
    'id', p_request_id, 'status', v_target,
    'proof_id', v_existing_proof.id, 'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merchant_receive_return(
  p_request_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_request public.return_requests%ROWTYPE;
  v_merchant_user uuid;
  v_active boolean;
  v_blocked boolean;
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  SELECT COALESCE(u.is_active, true), public.is_user_blocked(u.id)
  INTO v_active, v_blocked FROM public.users u WHERE u.id = v_actor;
  IF v_actor IS NULL OR NOT FOUND OR NOT v_active OR v_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to receive a return';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return receipt notes are too long';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  SELECT mp.user_id INTO v_merchant_user
  FROM public.orders o JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  WHERE o.id = v_request.order_id;
  IF v_merchant_user IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the order merchant can confirm return receipt';
  END IF;
  IF v_request.merchant_received_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', p_request_id, 'status', v_request.status, 'idempotent_replay', true);
  END IF;

  IF v_request.pickup_method = 'customer_dropoff' AND v_request.status = 'pickup_scheduled' THEN
    UPDATE public.return_requests
    SET status = 'picked_up', picked_up_at = now()
    WHERE id = p_request_id;
    INSERT INTO public.return_tracking (
      return_request_id, status, actor_id, actor_role, event_key, notes, metadata
    ) VALUES (
      p_request_id, 'picked_up', v_actor, 'merchant',
      'return-customer-dropoff-picked-up:' || p_request_id::text, v_notes,
      jsonb_build_object('pickup_method', 'customer_dropoff')
    ) ON CONFLICT (event_key) DO NOTHING;
    PERFORM public.notify_return_event(
      p_request_id,
      'picked_up',
      ARRAY['customer','merchant']::text[],
      'استلم المتجر المرتجع',
      'سلّم العميل المرتجع مباشرة إلى المتجر.',
      'physical_return_picked_up',
      jsonb_build_object('status', 'picked_up', 'pickup_method', 'customer_dropoff')
    );
    UPDATE public.return_requests
    SET status = 'received', received_at = now(), merchant_received_at = now()
    WHERE id = p_request_id;
  ELSIF v_request.status = 'received' THEN
    UPDATE public.return_requests SET merchant_received_at = now() WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'return must reach the merchant before receipt confirmation';
  END IF;

  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    p_request_id, 'received', v_actor, 'merchant',
    'return-merchant-received:' || p_request_id::text, v_notes,
    jsonb_build_object('confirmed_by_merchant', true)
  ) ON CONFLICT (event_key) DO NOTHING;
  PERFORM public.notify_return_event(
    p_request_id,
    'received',
    ARRAY['customer','merchant','admin']::text[],
    'أكد المتجر استلام المرتجع',
    'أصبح المرتجع لدى المتجر وجاهزًا للفحص.',
    'physical_return_received',
    jsonb_build_object('status', 'received', 'merchant_confirmed', true)
  );

  RETURN jsonb_build_object('id', p_request_id, 'status', 'received', 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.inspect_return_request(
  p_request_id uuid,
  p_items jsonb,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_active boolean;
  v_blocked boolean;
  v_request public.return_requests%ROWTYPE;
  v_merchant_user uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_item jsonb;
  v_return_item public.return_items%ROWTYPE;
  v_return_item_id uuid;
  v_accepted integer;
  v_disposition text;
  v_item_notes text;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_count integer;
  v_accepted_total integer := 0;
  v_canonical jsonb := '[]'::jsonb;
  v_fingerprint text;
BEGIN
  SELECT u.role::text, COALESCE(u.is_active, true), public.is_user_blocked(u.id)
  INTO v_role, v_active, v_blocked FROM public.users u WHERE u.id = v_actor;
  IF v_actor IS NULL OR NOT FOUND OR v_role NOT IN ('merchant','admin')
     OR NOT v_active OR v_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'merchant or admin authorization required';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'inspection notes are too long';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'inspection items must be an array';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));
  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  SELECT mp.user_id INTO v_merchant_user
  FROM public.orders o JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  WHERE o.id = v_request.order_id;
  IF v_role = 'merchant' AND v_merchant_user IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the order merchant can inspect this return';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM public.return_items ri WHERE ri.return_request_id = p_request_id;
  IF jsonb_array_length(p_items) <> v_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'inspection must decide every return item exactly once';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR NOT (v_item ? 'return_item_id') OR NOT (v_item ? 'accepted_quantity')
       OR NOT (v_item ? 'disposition') THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'each inspection item requires id, accepted quantity, and disposition';
    END IF;
    BEGIN
      v_return_item_id := (v_item ->> 'return_item_id')::uuid;
      v_accepted := (v_item ->> 'accepted_quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid inspection item';
    END;
    v_disposition := lower(btrim(COALESCE(v_item ->> 'disposition', '')));
    v_item_notes := NULLIF(btrim(v_item ->> 'notes'), '');
    IF v_return_item_id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate item in return inspection';
    END IF;
    v_seen := array_append(v_seen, v_return_item_id);
    SELECT ri.* INTO v_return_item
    FROM public.return_items ri
    WHERE ri.id = v_return_item_id AND ri.return_request_id = p_request_id
    FOR UPDATE;
    IF NOT FOUND OR v_return_item.approved_quantity IS NULL OR v_accepted IS NULL OR v_accepted < 0
       OR v_accepted > v_return_item.approved_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'accepted quantity exceeds approved return quantity';
    END IF;
    IF (v_accepted = 0 AND v_disposition <> 'rejected')
       OR (v_accepted > 0 AND v_disposition NOT IN ('restock','discard','repair','return_to_vendor')) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'inspection disposition does not match accepted quantity';
    END IF;
    IF v_item_notes IS NOT NULL AND length(v_item_notes) > 2000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'item inspection notes are too long';
    END IF;
    v_accepted_total := v_accepted_total + v_accepted;
    v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
      'return_item_id', v_return_item_id,
      'accepted_quantity', v_accepted,
      'disposition', v_disposition,
      'notes', v_item_notes
    ));
  END LOOP;
  SELECT jsonb_agg(value ORDER BY value ->> 'return_item_id')
  INTO v_canonical FROM jsonb_array_elements(v_canonical);
  v_fingerprint := md5(concat_ws(
    E'\x1f', p_request_id::text, v_canonical::text, COALESCE(v_notes, '')
  ));
  IF v_request.inspection_fingerprint = v_fingerprint THEN
    RETURN jsonb_build_object(
      'id', p_request_id, 'status', v_request.status, 'idempotent_replay', true
    );
  END IF;
  IF v_request.status <> 'received' OR v_request.merchant_received_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'merchant receipt must be confirmed before inspection';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_canonical)
  LOOP
    UPDATE public.return_items
    SET accepted_quantity = (v_item ->> 'accepted_quantity')::integer,
        disposition = v_item ->> 'disposition',
        inspection_notes = NULLIF(v_item ->> 'notes', ''),
        updated_at = now()
    WHERE id = (v_item ->> 'return_item_id')::uuid;
  END LOOP;
  UPDATE public.return_requests
  SET status = 'inspected', inspected_by = v_actor, inspected_at = now(),
      inspection_notes = v_notes, inspection_fingerprint = v_fingerprint
  WHERE id = p_request_id;
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    p_request_id, 'inspected', v_actor, v_role,
    'return-inspected:' || v_fingerprint, v_notes,
    jsonb_build_object(
      'items', v_canonical,
      'accepted_total_quantity', v_accepted_total,
      'all_items_rejected', v_accepted_total = 0
    )
  ) ON CONFLICT (event_key) DO NOTHING;
  PERFORM public.notify_return_event(
    p_request_id,
    'inspected',
    ARRAY['customer','admin']::text[],
    CASE
      WHEN v_accepted_total = 0 THEN 'اكتمل الفحص دون قبول أي كمية'
      ELSE 'اكتمل فحص المرتجع'
    END,
    CASE
      WHEN v_accepted_total = 0
        THEN 'رفض المتجر جميع الكميات بعد الفحص ولم تُقبل أي بضاعة للاسترداد.'
      ELSE 'سجّل المتجر نتيجة فحص الكميات المرتجعة.'
    END,
    'physical_return_inspected',
    jsonb_build_object(
      'status', 'inspected',
      'accepted_total_quantity', v_accepted_total,
      'all_items_rejected', v_accepted_total = 0
    )
  );

  RETURN jsonb_build_object(
    'id', p_request_id, 'status', 'inspected',
    'items', v_canonical,
    'accepted_total_quantity', v_accepted_total,
    'all_items_rejected', v_accepted_total = 0,
    'idempotent_replay', false
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Completion has two terminal paths. Accepted merchandise uses the verified
-- settlement/refund/restock transaction. A fully rejected inspection closes
-- without any financial or inventory movement, while retaining full audit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_complete_return(
  p_request_id uuid,
  p_external_reference text,
  p_notes text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_request public.return_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_settlement public.order_settlements%ROWTYPE;
  v_return_item public.return_items%ROWTYPE;
  v_order_id uuid;
  v_refund_id uuid;
  v_external_reference text := NULLIF(btrim(p_external_reference), '');
  v_notes text := NULLIF(btrim(p_notes), '');
  v_completion_fingerprint text;
  v_items_gross numeric(12,2);
  v_order_subtotal numeric(12,2);
  v_discount_share numeric(12,2);
  v_tax_share numeric(12,2);
  v_calculated_refund numeric(12,2);
  v_remaining numeric(12,2);
  v_refund_amount numeric(12,2);
  v_stock_before integer;
  v_full_return boolean := false;
  v_old_order_status text;
  v_restock_count integer := 0;
  v_item_count integer := 0;
  v_uninspected_count integer := 0;
  v_accepted_total integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true) AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return completion idempotency key is required';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'return completion notes are too long';
  END IF;
  IF v_external_reference IS NOT NULL AND length(v_external_reference) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external refund reference is too long';
  END IF;
  v_completion_fingerprint := md5(concat_ws(
    E'\x1f', p_request_id::text, COALESCE(v_external_reference, ''), COALESCE(v_notes, '')
  ));

  SELECT rr.order_id INTO v_order_id
  FROM public.return_requests rr WHERE rr.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-order:' || v_order_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('return-request:' || p_request_id::text, 0));

  SELECT rr.* INTO v_request FROM public.return_requests rr WHERE rr.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return request not found';
  END IF;
  IF v_request.status = 'completed' THEN
    IF v_request.completion_idempotency_key IS DISTINCT FROM p_idempotency_key
       OR v_request.completion_fingerprint IS DISTINCT FROM v_completion_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'return was already completed with another idempotency key or payload';
    END IF;
    RETURN jsonb_build_object(
      'id', p_request_id, 'status', 'completed',
      'refund_request_id', v_request.refund_request_id,
      'refund_amount', v_request.refund_amount,
      'outcome', CASE
        WHEN v_request.refund_request_id IS NULL AND v_request.refund_amount = 0
          THEN 'closed_without_refund'
        ELSE 'refunded'
      END,
      'idempotent_replay', true
    );
  END IF;
  IF v_request.status <> 'inspected' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'only an inspected return can be completed';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = v_request.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return order is missing';
  END IF;
  v_old_order_status := v_order.status::text;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE ri.accepted_quantity IS NULL OR ri.disposition IS NULL
    )::integer,
    COALESCE(sum(ri.accepted_quantity), 0)::integer
  INTO v_item_count, v_uninspected_count, v_accepted_total
  FROM public.return_items ri
  WHERE ri.return_request_id = p_request_id;
  IF v_item_count = 0 OR v_uninspected_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'every return item requires an explicit inspection decision';
  END IF;

  IF v_accepted_total = 0 THEN
    IF v_external_reference IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'external refund reference is not allowed when inspection accepted no merchandise';
    END IF;

    UPDATE public.return_requests
    SET status = 'completed', refund_request_id = NULL, refund_amount = 0,
        completion_idempotency_key = p_idempotency_key,
        completion_fingerprint = v_completion_fingerprint,
        completed_by = v_actor, completed_at = now(),
        admin_notes = concat_ws(
          E'\n', NULLIF(admin_notes, ''),
          '[completed_without_refund] ' || COALESCE(
            v_notes, 'Closed after inspection without refund because no merchandise was accepted.'
          )
        ),
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.order_operation_audit (
      order_id, event_key, operation, actor_id, actor_role,
      old_status, new_status, reason, metadata
    ) VALUES (
      v_order.id, 'physical-return-completed:' || p_request_id::text,
      'complete_physical_return_without_refund', v_actor, 'admin',
      v_old_order_status, v_old_order_status,
      COALESCE(v_notes, 'Closed after inspection without refund because no merchandise was accepted.'),
      jsonb_build_object(
        'return_request_id', p_request_id,
        'outcome', 'closed_without_refund',
        'accepted_total_quantity', 0,
        'refund_request_id', NULL,
        'refund_amount', 0,
        'financial_reversal_created', false,
        'full_return', false,
        'restocked_line_count', 0
      )
    ) ON CONFLICT (event_key) DO NOTHING;
    INSERT INTO public.return_tracking (
      return_request_id, status, actor_id, actor_role, event_key, notes, metadata
    ) VALUES (
      p_request_id, 'completed', v_actor, 'admin',
      'return-completed:' || p_request_id::text || ':' || p_idempotency_key::text,
      COALESCE(v_notes, 'Closed after inspection without refund because no merchandise was accepted.'),
      jsonb_build_object(
        'outcome', 'closed_without_refund',
        'accepted_total_quantity', 0,
        'refund_request_id', NULL,
        'refund_amount', 0,
        'financial_reversal_created', false,
        'full_return', false,
        'restocked_line_count', 0
      )
    );
    PERFORM public.notify_return_event(
      p_request_id,
      'completed',
      ARRAY['customer','merchant']::text[],
      'أُغلق المرتجع بعد الفحص بلا استرداد',
      'أظهر الفحص عدم قبول أي كمية، لذلك أُغلق المرتجع دون إنشاء استرداد مالي.',
      'physical_return_completed_without_refund',
      jsonb_build_object(
        'status', 'completed',
        'outcome', 'closed_without_refund',
        'accepted_total_quantity', 0,
        'refund_request_id', NULL,
        'refund_amount', 0,
        'full_return', false
      )
    );

    RETURN jsonb_build_object(
      'id', p_request_id, 'status', 'completed',
      'outcome', 'closed_without_refund',
      'accepted_total_quantity', 0,
      'refund_request_id', NULL,
      'refund_amount', 0,
      'full_return', false,
      'restocked_line_count', 0,
      'idempotent_replay', false
    );
  END IF;

  IF v_request.refund_method = 'original_payment' AND v_external_reference IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external refund reference is required';
  END IF;

  SELECT s.* INTO v_settlement
  FROM public.order_settlements s WHERE s.order_id = v_request.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'verified order settlement is missing; legacy return requires reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.refund_requests r
    WHERE r.order_id = v_request.order_id
      AND r.status IN ('pending','approved','processing')
      AND r.return_request_id IS DISTINCT FROM p_request_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'another active financial refund exists for this order';
  END IF;

  SELECT round(COALESCE(sum(
    round(ri.line_total * ri.accepted_quantity / NULLIF(ri.purchased_quantity, 0), 2)
  ), 0), 2)
  INTO v_items_gross
  FROM public.return_items ri
  WHERE ri.return_request_id = p_request_id AND ri.accepted_quantity > 0;
  IF v_items_gross <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'accepted return has no refundable merchandise value';
  END IF;

  v_order_subtotal := round(GREATEST(COALESCE(v_order.subtotal, 0), 0), 2);
  IF v_order_subtotal <= 0 THEN
    SELECT round(COALESCE(sum(COALESCE(oi.total_price, oi.unit_price * oi.quantity, 0)), 0), 2)
    INTO v_order_subtotal FROM public.order_items oi WHERE oi.order_id = v_order.id;
  END IF;
  IF v_order_subtotal <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'order merchandise subtotal cannot be verified';
  END IF;

  v_discount_share := round(
    LEAST(GREATEST(COALESCE(v_order.discount_amount, 0), 0), v_order_subtotal)
      * LEAST(v_items_gross, v_order_subtotal) / v_order_subtotal,
    2
  );
  v_tax_share := round(
    GREATEST(COALESCE(v_order.tax_amount, 0), 0)
      * LEAST(v_items_gross, v_order_subtotal) / v_order_subtotal,
    2
  );
  v_calculated_refund := round(GREATEST(v_items_gross - v_discount_share + v_tax_share, 0), 2);
  v_remaining := round(GREATEST(v_settlement.gross_amount - v_settlement.reversed_amount, 0), 2);
  v_refund_amount := LEAST(v_calculated_refund, v_remaining);
  IF v_refund_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'order has no settled refundable remainder';
  END IF;

  v_refund_id := gen_random_uuid();
  INSERT INTO public.refund_requests (
    id, order_id, customer_id, reason, description, evidence_images,
    refund_amount, refund_method, status, request_fingerprint,
    return_request_id, updated_at
  ) VALUES (
    v_refund_id, v_request.order_id, v_request.customer_id,
    'physical_return',
    'Refund generated from inspected physical return ' || p_request_id::text,
    v_request.evidence_images,
    v_refund_amount, v_request.refund_method, 'pending',
    md5('physical-return-refund:' || p_request_id::text || ':' || v_refund_amount::text),
    p_request_id, now()
  );
  PERFORM public.process_refund_request(
    v_refund_id, 'approved', COALESCE(v_notes, 'Approved inspected physical return'), NULL
  );
  PERFORM public.process_refund_request(v_refund_id, 'processing', NULL, NULL);
  PERFORM public.process_refund_request(
    v_refund_id, 'completed', COALESCE(v_notes, 'Completed inspected physical return'),
    v_external_reference
  );

  FOR v_return_item IN
    SELECT ri.*
    FROM public.return_items ri
    WHERE ri.return_request_id = p_request_id
      AND ri.accepted_quantity > 0
      AND ri.disposition = 'restock'
    ORDER BY ri.product_id, ri.variant_id NULLS FIRST, ri.id
    FOR UPDATE
  LOOP
    IF v_return_item.restocked_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.inventory_logs il
      WHERE il.return_item_id = v_return_item.id AND il.change_type = 'return_restock'
    ) THEN
      CONTINUE;
    END IF;

    IF v_return_item.variant_id IS NOT NULL THEN
      SELECT COALESCE(pv.stock_qty, 0) INTO v_stock_before
      FROM public.product_variants pv
      WHERE pv.id = v_return_item.variant_id AND pv.product_id = v_return_item.product_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return variant is missing during restock';
      END IF;
      UPDATE public.product_variants
      SET stock_qty = COALESCE(stock_qty, 0) + v_return_item.accepted_quantity
      WHERE id = v_return_item.variant_id AND product_id = v_return_item.product_id;
    ELSE
      SELECT COALESCE(p.stock_quantity, 0) INTO v_stock_before
      FROM public.products p WHERE p.id = v_return_item.product_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'return product is missing during restock';
      END IF;
      UPDATE public.products
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_return_item.accepted_quantity
      WHERE id = v_return_item.product_id;
    END IF;

    INSERT INTO public.inventory_logs (
      product_id, variant_id, order_id, return_item_id,
      change_amount, change_type, quantity_before, quantity_after,
      reason, created_by
    ) VALUES (
      v_return_item.product_id, v_return_item.variant_id, v_request.order_id,
      v_return_item.id, v_return_item.accepted_quantity, 'return_restock',
      v_stock_before, v_stock_before + v_return_item.accepted_quantity,
      'physical_return:' || p_request_id::text, v_actor
    ) ON CONFLICT (return_item_id)
        WHERE return_item_id IS NOT NULL AND change_type = 'return_restock' DO NOTHING;
    UPDATE public.return_items
    SET restocked_at = now(),
        restock_operation_key = 'return-restock:' || id::text,
        updated_at = now()
    WHERE id = v_return_item.id AND restocked_at IS NULL;
    v_restock_count := v_restock_count + 1;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = v_request.order_id
      AND COALESCE((
        SELECT sum(COALESCE(ri.accepted_quantity, 0))
        FROM public.return_items ri
        JOIN public.return_requests rr ON rr.id = ri.return_request_id
        WHERE ri.order_item_id = oi.id
          AND (rr.status = 'completed' OR rr.id = p_request_id)
      ), 0) < oi.quantity
  ) INTO v_full_return;

  UPDATE public.return_requests
  SET status = 'completed', refund_request_id = v_refund_id,
      refund_amount = v_refund_amount,
      completion_idempotency_key = p_idempotency_key,
      completion_fingerprint = v_completion_fingerprint,
      completed_by = v_actor, completed_at = now(),
      admin_notes = CASE
        WHEN v_notes IS NULL THEN admin_notes
        ELSE concat_ws(E'\n', NULLIF(admin_notes, ''), '[completed] ' || v_notes)
      END
  WHERE id = p_request_id;

  IF v_full_return AND v_old_order_status = 'delivered' THEN
    PERFORM set_config('app.order_transition', '1', true);
    UPDATE public.orders SET status = 'returned', updated_at = now() WHERE id = v_order.id;
    INSERT INTO public.order_tracking (
      order_id, status, notes, created_by, actor_role, event_key, metadata
    ) VALUES (
      v_order.id, 'returned', 'All purchased quantities were accepted through physical returns.',
      v_actor, 'admin', 'physical-return-completed:' || p_request_id::text,
      jsonb_build_object('return_request_id', p_request_id, 'refund_request_id', v_refund_id)
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  INSERT INTO public.order_operation_audit (
    order_id, event_key, operation, actor_id, actor_role,
    old_status, new_status, reason, metadata
  ) VALUES (
    v_order.id, 'physical-return-completed:' || p_request_id::text,
    'complete_physical_return', v_actor, 'admin', v_old_order_status,
    CASE WHEN v_full_return THEN 'returned' ELSE v_old_order_status END,
    v_notes,
    jsonb_build_object(
      'return_request_id', p_request_id,
      'refund_request_id', v_refund_id,
      'items_gross', v_items_gross,
      'discount_share', v_discount_share,
      'tax_share', v_tax_share,
      'delivery_fee_refunded', 0,
      'calculated_refund', v_calculated_refund,
      'settlement_remaining_before', v_remaining,
      'refund_amount', v_refund_amount,
      'full_return', v_full_return,
      'restocked_line_count', v_restock_count
    )
  ) ON CONFLICT (event_key) DO NOTHING;
  INSERT INTO public.return_tracking (
    return_request_id, status, actor_id, actor_role, event_key, notes, metadata
  ) VALUES (
    p_request_id, 'completed', v_actor, 'admin',
    'return-completed:' || p_request_id::text || ':' || p_idempotency_key::text, v_notes,
    jsonb_build_object(
      'refund_request_id', v_refund_id,
      'refund_amount', v_refund_amount,
      'full_return', v_full_return,
      'restocked_line_count', v_restock_count
    )
  );
  PERFORM public.notify_return_event(
    p_request_id,
    'completed',
    ARRAY['customer','merchant']::text[],
    'اكتمل الإرجاع والاسترداد',
    'اكتملت معالجة المرتجع وتم تسجيل مبلغ الاسترداد.',
    'physical_return_completed',
    jsonb_build_object(
      'status', 'completed',
      'refund_request_id', v_refund_id,
      'refund_amount', v_refund_amount,
      'full_return', v_full_return
    )
  );

  RETURN jsonb_build_object(
    'id', p_request_id, 'status', 'completed',
    'refund_request_id', v_refund_id,
    'refund_amount', v_refund_amount,
    'full_return', v_full_return,
    'restocked_line_count', v_restock_count,
    'idempotent_replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_return_requests(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_status text := NULLIF(lower(btrim(p_status)), '');
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true) AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN (
    'requested','approved','rejected','cancelled','pickup_scheduled',
    'picked_up','received','inspected','completed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return status filter';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 500 OR p_offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid return list pagination';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'return', to_jsonb(rr),
    'order', jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
      'discount_amount', o.discount_amount, 'tax_amount', o.tax_amount,
      'total_amount', o.total_amount, 'payment_status', o.payment_status
    ),
    'customer', jsonb_build_object(
      'id', cu.id, 'full_name', cu.full_name, 'phone', cu.phone, 'email', cu.email
    ),
    'merchant', jsonb_build_object(
      'id', mp.id, 'user_id', mp.user_id, 'store_name', mp.store_name
    ),
    'delivery', CASE WHEN dp.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', dp.id, 'user_id', dp.user_id, 'full_name', du.full_name, 'phone', du.phone
    ) END,
    'items', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(ri) || jsonb_build_object(
          'order_items', CASE WHEN oi.id IS NULL THEN NULL ELSE jsonb_build_object(
            'product_name', oi.product_name,
            'variant_details', oi.variant_details
          ) END,
          'products', CASE WHEN product.id IS NULL THEN NULL ELSE jsonb_build_object(
            'name', product.name,
            'name_ar', product.name_ar
          ) END
        ) ORDER BY ri.created_at, ri.id
      )
      FROM public.return_items ri
      LEFT JOIN public.order_items oi ON oi.id = ri.order_item_id
      LEFT JOIN public.products product ON product.id = ri.product_id
      WHERE ri.return_request_id = rr.id
    ), '[]'::jsonb),
    'tracking', COALESCE((
      SELECT jsonb_agg(to_jsonb(rt) ORDER BY rt.created_at, rt.id)
      FROM public.return_tracking rt WHERE rt.return_request_id = rr.id
    ), '[]'::jsonb),
    'proofs', COALESCE((
      SELECT jsonb_agg(to_jsonb(rp) ORDER BY rp.created_at, rp.id)
      FROM public.return_proofs rp WHERE rp.return_request_id = rr.id
    ), '[]'::jsonb),
    'refund', CASE WHEN fr.id IS NULL THEN NULL ELSE to_jsonb(fr) END
  )
  FROM public.return_requests rr
  JOIN public.orders o ON o.id = rr.order_id
  JOIN public.users cu ON cu.id = rr.customer_id
  LEFT JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
  LEFT JOIN public.users du ON du.id = dp.user_id
  LEFT JOIN public.refund_requests fr ON fr.id = rr.refund_request_id
  WHERE v_status IS NULL OR rr.status = v_status
  ORDER BY rr.created_at DESC, rr.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- -----------------------------------------------------------------------------
-- Participant-only reads. Every mutation is RPC-owned; no direct DML policy or
-- API table privilege is granted.
-- -----------------------------------------------------------------------------
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_proofs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_policy record;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY['return_requests','return_items','return_tracking','return_proofs'])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename
    );
  END LOOP;
END;
$$;

CREATE POLICY return_requests_participant_select ON public.return_requests
FOR SELECT TO authenticated
USING (
  (
    (SELECT public.is_current_user_operational())
    OR (SELECT public.is_admin())
  )
  AND (
    customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = return_requests.order_id
        AND public.is_current_merchant_profile_owner(o.merchant_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.delivery_profiles dp
      WHERE dp.id = return_requests.assigned_delivery_id
        AND dp.user_id = (SELECT auth.uid())
    )
    OR (SELECT public.is_admin())
  )
);

CREATE POLICY return_items_participant_select ON public.return_items
FOR SELECT TO authenticated
USING (
  (
    (SELECT public.is_current_user_operational())
    OR (SELECT public.is_admin())
  )
  AND EXISTS (
    SELECT 1
    FROM public.return_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
    WHERE rr.id = return_items.return_request_id
      AND (
        rr.customer_id = (SELECT auth.uid())
        OR public.is_current_merchant_profile_owner(o.merchant_id)
        OR dp.user_id = (SELECT auth.uid())
        OR (SELECT public.is_admin())
      )
  )
);

CREATE POLICY return_tracking_participant_select ON public.return_tracking
FOR SELECT TO authenticated
USING (
  (
    (SELECT public.is_current_user_operational())
    OR (SELECT public.is_admin())
  )
  AND EXISTS (
    SELECT 1
    FROM public.return_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
    WHERE rr.id = return_tracking.return_request_id
      AND (
        rr.customer_id = (SELECT auth.uid())
        OR public.is_current_merchant_profile_owner(o.merchant_id)
        OR dp.user_id = (SELECT auth.uid())
        OR (SELECT public.is_admin())
      )
  )
);

CREATE POLICY return_proofs_participant_select ON public.return_proofs
FOR SELECT TO authenticated
USING (
  (
    (SELECT public.is_current_user_operational())
    OR (SELECT public.is_admin())
  )
  AND EXISTS (
    SELECT 1
    FROM public.return_requests rr
    JOIN public.orders o ON o.id = rr.order_id
    LEFT JOIN public.delivery_profiles dp ON dp.id = rr.assigned_delivery_id
    WHERE rr.id = return_proofs.return_request_id
      AND (
        rr.customer_id = (SELECT auth.uid())
        OR public.is_current_merchant_profile_owner(o.merchant_id)
        OR dp.user_id = (SELECT auth.uid())
        OR (SELECT public.is_admin())
      )
  )
);

REVOKE ALL PRIVILEGES ON TABLE public.return_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.return_items FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.return_tracking FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.return_proofs FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.return_requests TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.return_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.return_tracking TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.return_proofs TO service_role;

GRANT SELECT (
  id, order_id, customer_id, status, reason, description, evidence_images,
  pickup_method, refund_method, merchant_recommendation, merchant_response,
  merchant_responded_at, reviewed_at, review_notes, assigned_delivery_id,
  pickup_scheduled_at, picked_up_at, received_at, merchant_received_at,
  inspected_at, inspection_notes, cancelled_at, cancellation_reason,
  refund_request_id, refund_amount, completed_at, created_at, updated_at
) ON public.return_requests TO authenticated;
GRANT SELECT (
  id, return_request_id, order_item_id, product_id, variant_id,
  purchased_quantity, requested_quantity, approved_quantity, accepted_quantity,
  unit_price, line_total, disposition, inspection_notes, restocked_at,
  created_at, updated_at
) ON public.return_items TO authenticated;
GRANT SELECT (
  id, return_request_id, status, actor_id, actor_role, event_key,
  notes, metadata, created_at
) ON public.return_tracking TO authenticated;
GRANT SELECT (
  id, return_request_id, delivery_profile_id, proof_type, proof_path,
  latitude, longitude, captured_by, created_at
) ON public.return_proofs TO authenticated;

-- -----------------------------------------------------------------------------
-- Explicit function privileges. Trigger helpers and the renamed financial-only
-- implementation are private; authenticated callers receive only entry points.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.enforce_return_request_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_refund_return_exclusivity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_return_evidence_objects(jsonb,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_return_proof_object(text,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_return_event(uuid,text,text[],text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_refund_request_financial_only(uuid,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_refund_request(uuid,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_return_request(uuid,jsonb,text,text,jsonb,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_return_request(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_return_request(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_return_request(uuid,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_schedule_return_pickup(uuid,uuid,timestamptz,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_delivery_returns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_update_return_status(uuid,text,text,numeric,numeric,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merchant_receive_return(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inspect_return_request(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_complete_return(uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_return_requests(text,integer,integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_refund_request(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_request(uuid,jsonb,text,text,jsonb,text,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_return_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_return_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_return_request(uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_schedule_return_pickup(uuid,uuid,timestamptz,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_delivery_returns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_update_return_status(uuid,text,text,numeric,numeric,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_receive_return(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_return_request(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_return(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_return_requests(text,integer,integer) TO authenticated;
