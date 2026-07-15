-- COD custody repair: courier remittance evidence, dual-control review,
-- once-only custody ledger transfer, and withdrawal availability controls.
--
-- This migration never creates historical collections or settlements. It only
-- extends collections produced by the proof-backed settlement transaction.

-- -----------------------------------------------------------------------------
-- Collection lifecycle and remittance submissions.
-- -----------------------------------------------------------------------------

ALTER TABLE public.delivery_cod_collections
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_reason text;

ALTER TABLE public.delivery_cod_collections
  DROP CONSTRAINT IF EXISTS delivery_cod_collections_status_check,
  DROP CONSTRAINT IF EXISTS delivery_cod_collections_status_amount_check,
  DROP CONSTRAINT IF EXISTS delivery_cod_collections_dispute_check;

-- A zero-value COD settlement carries no cash and is therefore already fully
-- remitted. Existing positive collections retain their real remittance amount.
UPDATE public.delivery_cod_collections
SET status = CASE
      WHEN status = 'disputed' THEN 'disputed'
      WHEN amount_remitted >= amount_collected THEN 'remitted'
      WHEN amount_remitted > 0 THEN 'partially_remitted'
      ELSE 'collected'
    END,
    remitted_at = CASE
      WHEN amount_remitted >= amount_collected
        THEN COALESCE(remitted_at, collected_at, now())
      ELSE NULL
    END,
    updated_at = COALESCE(updated_at, collected_at, now());

ALTER TABLE public.delivery_cod_collections
  ADD CONSTRAINT delivery_cod_collections_status_check
    CHECK (status IN ('collected','partially_remitted','remitted','disputed')),
  ADD CONSTRAINT delivery_cod_collections_status_amount_check
    CHECK (
      status = 'disputed'
      OR (status = 'collected' AND amount_remitted = 0 AND amount_collected > 0)
      OR (
        status = 'partially_remitted'
        AND amount_remitted > 0
        AND amount_remitted < amount_collected
      )
      OR (status = 'remitted' AND amount_remitted = amount_collected)
    ),
  ADD CONSTRAINT delivery_cod_collections_dispute_check
    CHECK (
      status <> 'disputed'
      OR (
        disputed_at IS NOT NULL
        AND disputed_by IS NOT NULL
        AND NULLIF(btrim(dispute_reason), '') IS NOT NULL
      )
    );

DO $cod_collection_pair_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.delivery_cod_collections'::regclass
      AND conname = 'delivery_cod_collections_id_delivery_uq'
  ) THEN
    ALTER TABLE public.delivery_cod_collections
      ADD CONSTRAINT delivery_cod_collections_id_delivery_uq UNIQUE (id, delivery_id);
  END IF;
END;
$cod_collection_pair_constraint$;

CREATE TABLE IF NOT EXISTS public.cod_remittance_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  submitted_by uuid NOT NULL REFERENCES public.users(id),
  amount numeric NOT NULL CHECK (amount > 0),
  remittance_reference text NOT NULL CHECK (
    NULLIF(btrim(remittance_reference), '') IS NOT NULL
    AND length(remittance_reference) <= 200
  ),
  proof_path text NOT NULL CHECK (
    NULLIF(btrim(proof_path), '') IS NOT NULL
    AND length(proof_path) <= 1000
  ),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 32),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','disputed')),
  processor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  ledger_entry_id uuid REFERENCES public.marketplace_ledger_entries(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  disputed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cod_remittance_collection_delivery_fk
    FOREIGN KEY (collection_id, delivery_id)
    REFERENCES public.delivery_cod_collections(id, delivery_id),
  CONSTRAINT cod_remittance_review_state_check CHECK (
    (status = 'pending'
      AND processor_id IS NULL
      AND reviewed_at IS NULL
      AND approved_at IS NULL
      AND rejected_at IS NULL
      AND disputed_at IS NULL
      AND ledger_entry_id IS NULL)
    OR (status = 'approved'
      AND processor_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND approved_at IS NOT NULL
      AND rejected_at IS NULL
      AND disputed_at IS NULL
      AND ledger_entry_id IS NOT NULL)
    OR (status = 'rejected'
      AND processor_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND approved_at IS NULL
      AND rejected_at IS NOT NULL
      AND disputed_at IS NULL
      AND ledger_entry_id IS NULL)
    OR (status = 'disputed'
      AND processor_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND approved_at IS NULL
      AND rejected_at IS NULL
      AND disputed_at IS NOT NULL
      AND ledger_entry_id IS NULL)
  ),
  CONSTRAINT cod_remittance_no_self_review_check
    CHECK (processor_id IS NULL OR processor_id <> submitted_by)
);

CREATE UNIQUE INDEX IF NOT EXISTS cod_remittance_delivery_idempotency_uq
  ON public.cod_remittance_submissions(delivery_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS cod_remittance_active_reference_uq
  ON public.cod_remittance_submissions(collection_id, lower(btrim(remittance_reference)))
  WHERE status IN ('pending','approved','disputed');
CREATE UNIQUE INDEX IF NOT EXISTS cod_remittance_active_proof_uq
  ON public.cod_remittance_submissions(proof_path)
  WHERE status IN ('pending','approved','disputed');
CREATE INDEX IF NOT EXISTS cod_remittance_collection_status_idx
  ON public.cod_remittance_submissions(collection_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS cod_remittance_delivery_status_idx
  ON public.cod_remittance_submissions(delivery_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS cod_remittance_processor_idx
  ON public.cod_remittance_submissions(processor_id, reviewed_at DESC)
  WHERE processor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cod_collections_delivery_status_idx
  ON public.delivery_cod_collections(delivery_id, status, collected_at DESC);

CREATE OR REPLACE FUNCTION public.marketplace_normalize_cod_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.amount_collected IS NULL OR NEW.amount_collected < 0
     OR NEW.amount_remitted IS NULL OR NEW.amount_remitted < 0
     OR NEW.amount_remitted > NEW.amount_collected THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid COD collection amounts';
  END IF;

  IF NEW.status = 'disputed' THEN
    IF NEW.disputed_at IS NULL
       OR NEW.disputed_by IS NULL
       OR NULLIF(btrim(NEW.dispute_reason), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COD dispute metadata is required';
    END IF;
  ELSE
    NEW.status := CASE
      WHEN NEW.amount_remitted = NEW.amount_collected THEN 'remitted'
      WHEN NEW.amount_remitted > 0 THEN 'partially_remitted'
      ELSE 'collected'
    END;
    NEW.disputed_at := NULL;
    NEW.disputed_by := NULL;
    NEW.dispute_reason := NULL;
  END IF;

  IF NEW.amount_remitted = NEW.amount_collected THEN
    NEW.remitted_at := COALESCE(NEW.remitted_at, now());
  ELSIF NEW.status <> 'disputed' THEN
    NEW.remitted_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Withdrawal availability: settlement wallet credits remain visible, but the
-- merchant/courier share attributable to cash still in courier custody cannot
-- be reserved for withdrawal. Approved remittance releases it automatically.
-- Refund reversals reduce the hold proportionally without creating new money.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketplace_cod_held_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH exposures AS (
    SELECT
      s.merchant_proceeds AS wallet_component,
      s.gross_amount,
      s.reversed_amount,
      c.amount_collected,
      c.amount_remitted
    FROM public.delivery_cod_collections AS c
    JOIN public.order_settlements AS s ON s.order_id = c.order_id
    JOIN public.merchant_profiles AS mp ON mp.id = s.merchant_id
    WHERE mp.user_id = p_user_id

    UNION ALL

    SELECT
      s.delivery_earning AS wallet_component,
      s.gross_amount,
      s.reversed_amount,
      c.amount_collected,
      c.amount_remitted
    FROM public.delivery_cod_collections AS c
    JOIN public.order_settlements AS s ON s.order_id = c.order_id
    JOIN public.delivery_profiles AS dp ON dp.id = s.delivery_id
    WHERE dp.user_id = p_user_id
  )
  SELECT COALESCE(round(sum(
    COALESCE(wallet_component, 0)
    * CASE
        WHEN COALESCE(amount_collected, 0) > 0 THEN
          GREATEST(amount_collected - COALESCE(amount_remitted, 0), 0)
          / NULLIF(amount_collected, 0)
        ELSE 0
      END
    * CASE
        WHEN COALESCE(gross_amount, 0) > 0 THEN
          GREATEST(gross_amount - COALESCE(reversed_amount, 0), 0)
          / NULLIF(gross_amount, 0)
        ELSE 0
      END
  ), 2), 0)::numeric
  FROM exposures
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_enforce_cod_withdrawal_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_wallet numeric := 0;
  v_active_reserved numeric := 0;
  v_held numeric := 0;
  v_gross_before_reservations numeric := 0;
  v_available numeric := 0;
BEGIN
  -- Only balance-reserving states can spend wallet availability. Historical
  -- terminal imports do not reserve funds and therefore need no availability
  -- decision here.
  IF NEW.status NOT IN ('pending','approved','processing') THEN
    RETURN NEW;
  END IF;

  SELECT u.role::text
  INTO v_role
  FROM public.users AS u
  WHERE u.id = NEW.user_id
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id);
  IF v_role IS NULL OR v_role NOT IN ('merchant','delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'only active merchant and delivery wallets may reserve withdrawals';
  END IF;

  IF v_role = 'merchant' THEN
    SELECT COALESCE(mp.wallet_balance, 0)
    INTO v_wallet
    FROM public.merchant_profiles AS mp
    WHERE mp.user_id = NEW.user_id
    FOR UPDATE;
  ELSE
    SELECT COALESCE(dp.wallet_balance, 0)
    INTO v_wallet
    FROM public.delivery_profiles AS dp
    WHERE dp.user_id = NEW.user_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'withdrawal wallet profile not found';
  END IF;

  SELECT COALESCE(sum(w.amount), 0)
  INTO v_active_reserved
  FROM public.withdrawal_requests AS w
  WHERE w.user_id = NEW.user_id
    AND w.status IN ('pending','approved','processing');

  v_held := public.marketplace_cod_held_balance(NEW.user_id);
  -- wallet_balance is already net of active reservations. Reconstructing and
  -- then subtracting them makes that accounting explicit and avoids ever
  -- counting an existing reservation as available a second time.
  v_gross_before_reservations := v_wallet + v_active_reserved;
  v_available := GREATEST(
    round(v_gross_before_reservations - v_active_reserved - v_held, 2),
    0
  );

  IF COALESCE(NEW.amount, 0) > v_available THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'COD_FUNDS_NOT_YET_REMITTED',
      DETAIL = format(
        'requested=%s available=%s cod_held=%s active_reserved=%s',
        COALESCE(NEW.amount, 0), v_available, v_held, v_active_reserved
      );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_cod_withdrawal_hold ON public.withdrawal_requests;
CREATE TRIGGER trg_enforce_cod_withdrawal_hold
BEFORE INSERT ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.marketplace_enforce_cod_withdrawal_hold();

-- -----------------------------------------------------------------------------
-- RLS and private storage policies.
-- -----------------------------------------------------------------------------

ALTER TABLE public.delivery_cod_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_remittance_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_cod_collections_participant_select
  ON public.delivery_cod_collections;
CREATE POLICY delivery_cod_collections_participant_select
ON public.delivery_cod_collections
FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.id = delivery_cod_collections.order_id
      AND (
        public.is_current_merchant_profile_owner(o.merchant_id)
        OR EXISTS (
          SELECT 1
          FROM public.delivery_profiles AS dp
          WHERE dp.id = o.delivery_id
            AND dp.user_id = (SELECT auth.uid())
        )
      )
  )
);

DROP POLICY IF EXISTS cod_remittance_submissions_participant_select
  ON public.cod_remittance_submissions;
CREATE POLICY cod_remittance_submissions_participant_select
ON public.cod_remittance_submissions
FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR cod_remittance_submissions.submitted_by = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.delivery_profiles AS dp
    WHERE dp.id = cod_remittance_submissions.delivery_id
      AND dp.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Assigned courier uploads COD remittance proof" ON storage.objects;
CREATE POLICY "Assigned courier uploads COD remittance proof"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cod-remittance-proofs'
  AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
  AND NOT (SELECT public.is_current_user_blocked())
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = 'cod-remittances'
  AND storage.filename(name)
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|jpeg|png|pdf)$'
  AND lower(COALESCE(metadata ->> 'mimetype', ''))
    IN ('image/jpeg','image/png','application/pdf')
  AND CASE
    WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
      THEN (metadata ->> 'size')::bigint BETWEEN 1 AND 10485760
    ELSE false
  END
  AND EXISTS (
    SELECT 1
    FROM public.delivery_cod_collections AS c
    JOIN public.delivery_profiles AS dp ON dp.id = c.delivery_id
    JOIN public.users AS u ON u.id = dp.user_id
    WHERE c.id::text = (storage.foldername(name))[3]
      AND dp.user_id = (SELECT auth.uid())
      AND c.collected_by = (SELECT auth.uid())
      AND c.status IN ('collected','partially_remitted')
      AND c.amount_remitted < c.amount_collected
      AND COALESCE(dp.is_approved, false)
      AND u.role = 'delivery'
      AND COALESCE(u.is_active, true)
  )
);

DROP POLICY IF EXISTS "Courier or admin reads COD remittance proof" ON storage.objects;
CREATE POLICY "Courier or admin reads COD remittance proof"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cod-remittance-proofs'
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[2] = 'cod-remittances'
  AND (
    (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND COALESCE(owner_id, owner::text) = (SELECT auth.uid())::text
    )
    OR (SELECT public.is_admin())
  )
);

-- -----------------------------------------------------------------------------
-- Admin dual-control review. Approval is the only path that moves custody in
-- the ledger and increments amount_remitted, in one transaction and once.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_review_cod_remittance(
  p_submission_id uuid,
  p_decision text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_decision text := lower(NULLIF(btrim(p_decision), ''));
  v_note text := NULLIF(btrim(p_note), '');
  v_submission public.cod_remittance_submissions%ROWTYPE;
  v_collection public.delivery_cod_collections%ROWTYPE;
  v_ledger public.marketplace_ledger_entries%ROWTYPE;
  v_ledger_id uuid;
  v_operation_key text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_submission_id IS NULL
     OR v_decision IS NULL
     OR v_decision NOT IN ('approved','rejected','disputed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid COD remittance decision';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'review note is too long';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cod-remittance-review:' || p_submission_id::text, 0)
  );
  SELECT s.*
  INTO v_submission
  FROM public.cod_remittance_submissions AS s
  WHERE s.id = p_submission_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COD remittance submission not found';
  END IF;
  IF v_submission.submitted_by = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'courier cannot confirm their own remittance';
  END IF;

  SELECT c.*
  INTO v_collection
  FROM public.delivery_cod_collections AS c
  WHERE c.id = v_submission.collection_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COD collection not found';
  END IF;

  IF v_submission.status = v_decision THEN
    RETURN jsonb_build_object(
      'id', v_submission.id,
      'collection_id', v_submission.collection_id,
      'status', v_submission.status,
      'amount', v_submission.amount,
      'amount_remitted', v_collection.amount_remitted,
      'collection_status', v_collection.status,
      'ledger_entry_id', v_submission.ledger_entry_id,
      'idempotent_replay', true
    );
  END IF;
  IF v_submission.status NOT IN ('pending','disputed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'COD remittance submission is already terminal';
  END IF;
  IF v_decision IN ('rejected','disputed') AND v_note IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'rejection and dispute decisions require a reason';
  END IF;

  IF v_decision = 'approved' THEN
    -- Re-check the immutable private object at approval time as well as at
    -- submission time. A service-side deletion or corruption must fail closed
    -- instead of moving cash without surviving evidence.
    PERFORM public.marketplace_validate_cod_remittance_proof(
      v_submission.proof_path,
      v_submission.submitted_by,
      v_submission.collection_id,
      v_submission.idempotency_key
    );
    IF v_collection.status = 'disputed' THEN
      IF v_submission.status <> 'disputed'
         OR EXISTS (
           SELECT 1
           FROM public.cod_remittance_submissions AS other
           WHERE other.collection_id = v_collection.id
             AND other.status = 'disputed'
             AND other.id <> v_submission.id
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'resolve other COD collection disputes before approval';
      END IF;
      -- Approving the sole disputed submission is an explicit resolution of
      -- that dispute. Clear the collection marker in the same locked
      -- transaction before moving custody.
      UPDATE public.delivery_cod_collections AS c
      SET status = 'collected',
          disputed_at = NULL,
          disputed_by = NULL,
          dispute_reason = NULL
      WHERE c.id = v_collection.id
      RETURNING c.* INTO v_collection;
    END IF;
    IF v_submission.amount > round(
         GREATEST(v_collection.amount_collected - v_collection.amount_remitted, 0),
         2
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'approved remittance would exceed collected cash';
    END IF;

    v_operation_key := 'cod-remittance:' || v_submission.id::text || ':approved';
    INSERT INTO public.marketplace_ledger_entries(
      operation_key,
      order_id,
      entry_type,
      debit_account,
      debit_owner_id,
      credit_account,
      credit_owner_id,
      amount,
      metadata,
      created_by
    )
    VALUES (
      v_operation_key,
      v_collection.order_id,
      'cod_remittance',
      'delivery_cash_custody',
      v_submission.submitted_by,
      'platform_cash_clearing',
      NULL,
      v_submission.amount,
      jsonb_build_object(
        'collection_id', v_collection.id,
        'submission_id', v_submission.id,
        'reference', v_submission.remittance_reference,
        'proof_path', v_submission.proof_path
      ),
      v_actor
    )
    ON CONFLICT (operation_key) DO NOTHING
    RETURNING id INTO v_ledger_id;

    IF v_ledger_id IS NULL THEN
      SELECT le.*
      INTO v_ledger
      FROM public.marketplace_ledger_entries AS le
      WHERE le.operation_key = v_operation_key
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23505',
          MESSAGE = 'COD remittance ledger idempotency conflict';
      END IF;
      IF v_ledger.order_id IS DISTINCT FROM v_collection.order_id
         OR v_ledger.entry_type IS DISTINCT FROM 'cod_remittance'
         OR v_ledger.debit_account IS DISTINCT FROM 'delivery_cash_custody'
         OR v_ledger.debit_owner_id IS DISTINCT FROM v_submission.submitted_by
         OR v_ledger.credit_account IS DISTINCT FROM 'platform_cash_clearing'
         OR v_ledger.credit_owner_id IS NOT NULL
         OR v_ledger.amount IS DISTINCT FROM v_submission.amount THEN
        RAISE EXCEPTION USING ERRCODE = '23505',
          MESSAGE = 'COD remittance ledger idempotency conflict';
      END IF;
      v_ledger_id := v_ledger.id;
    END IF;

    UPDATE public.delivery_cod_collections AS c
    SET amount_remitted = c.amount_remitted + v_submission.amount,
        status = 'collected'
    WHERE c.id = v_collection.id
    RETURNING c.* INTO v_collection;

    UPDATE public.cod_remittance_submissions
    SET status = 'approved',
        processor_id = v_actor,
        review_note = v_note,
        ledger_entry_id = v_ledger_id,
        reviewed_at = now(),
        approved_at = now(),
        rejected_at = NULL,
        disputed_at = NULL,
        updated_at = now()
    WHERE id = v_submission.id
    RETURNING * INTO v_submission;

  ELSIF v_decision = 'rejected' THEN
    UPDATE public.cod_remittance_submissions
    SET status = 'rejected',
        processor_id = v_actor,
        review_note = v_note,
        ledger_entry_id = NULL,
        reviewed_at = now(),
        approved_at = NULL,
        rejected_at = now(),
        disputed_at = NULL,
        updated_at = now()
    WHERE id = v_submission.id
    RETURNING * INTO v_submission;

  ELSE
    UPDATE public.cod_remittance_submissions
    SET status = 'disputed',
        processor_id = v_actor,
        review_note = v_note,
        ledger_entry_id = NULL,
        reviewed_at = now(),
        approved_at = NULL,
        rejected_at = NULL,
        disputed_at = now(),
        updated_at = now()
    WHERE id = v_submission.id
    RETURNING * INTO v_submission;

    UPDATE public.delivery_cod_collections AS c
    SET status = 'disputed',
        disputed_at = now(),
        disputed_by = v_actor,
        dispute_reason = v_note
    WHERE c.id = v_collection.id
    RETURNING c.* INTO v_collection;
  END IF;

  INSERT INTO public.admin_activity_logs(
    admin_id, action, target_type, target_id, details
  )
  VALUES (
    v_actor,
    'cod_remittance_' || v_decision,
    'cod_remittance_submission',
    v_submission.id,
    jsonb_build_object(
      'collection_id', v_collection.id,
      'order_id', v_collection.order_id,
      'amount', v_submission.amount,
      'note', v_note,
      'ledger_entry_id', v_submission.ledger_entry_id,
      'collection_status', v_collection.status,
      'amount_remitted', v_collection.amount_remitted
    )
  );

  INSERT INTO public.notifications(
    user_id, title, body, type, data, is_read, channel, event_key
  )
  VALUES (
    v_submission.submitted_by,
    CASE v_decision
      WHEN 'approved' THEN 'تم اعتماد تحويل التحصيل النقدي'
      WHEN 'rejected' THEN 'تم رفض تحويل التحصيل النقدي'
      ELSE 'تحويل التحصيل النقدي قيد النزاع'
    END,
    CASE v_decision
      WHEN 'approved' THEN 'استلمت الإدارة المبلغ وأغلقته في سجل التحصيل.'
      WHEN 'rejected' THEN 'راجع سبب الرفض ثم أرسل إثباتاً صحيحاً بطلب جديد.'
      ELSE 'أوقفت الإدارة التحويل مؤقتاً حتى اكتمال المراجعة.'
    END,
    'cod_remittance_review',
    jsonb_build_object(
      'submission_id', v_submission.id,
      'collection_id', v_collection.id,
      'order_id', v_collection.order_id,
      'decision', v_decision,
      'amount', v_submission.amount,
      'review_note', v_note
    ),
    false,
    'in_app',
    'cod-remittance-review:' || v_submission.id::text || ':' || v_decision
  )
  ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_submission.id,
    'collection_id', v_submission.collection_id,
    'status', v_submission.status,
    'amount', v_submission.amount,
    'amount_remitted', v_collection.amount_remitted,
    'collection_status', v_collection.status,
    'ledger_entry_id', v_submission.ledger_entry_id,
    'reviewed_at', v_submission.reviewed_at,
    'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_cod_collection_dispute(
  p_collection_id uuid,
  p_disputed boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_reason text := NULLIF(btrim(p_reason), '');
  v_collection public.delivery_cod_collections%ROWTYPE;
  v_was_disputed boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_collection_id IS NULL OR p_disputed IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'collection and dispute state are required';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'dispute reason is too long';
  END IF;
  IF p_disputed AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'dispute reason is required';
  END IF;

  SELECT c.*
  INTO v_collection
  FROM public.delivery_cod_collections AS c
  WHERE c.id = p_collection_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COD collection not found';
  END IF;
  v_was_disputed := v_collection.status = 'disputed';

  IF p_disputed THEN
    IF v_was_disputed AND v_collection.dispute_reason IS NOT DISTINCT FROM v_reason THEN
      RETURN jsonb_build_object(
        'id', v_collection.id,
        'status', v_collection.status,
        'amount_remitted', v_collection.amount_remitted,
        'dispute_reason', v_collection.dispute_reason,
        'idempotent_replay', true
      );
    END IF;
    UPDATE public.delivery_cod_collections AS c
    SET status = 'disputed',
        disputed_at = now(),
        disputed_by = v_actor,
        dispute_reason = v_reason
    WHERE c.id = v_collection.id
    RETURNING c.* INTO v_collection;
  ELSE
    IF NOT v_was_disputed THEN
      RETURN jsonb_build_object(
        'id', v_collection.id,
        'status', v_collection.status,
        'amount_remitted', v_collection.amount_remitted,
        'dispute_reason', NULL,
        'idempotent_replay', true
      );
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.cod_remittance_submissions AS s
      WHERE s.collection_id = v_collection.id
        AND s.status = 'disputed'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'resolve disputed remittance submissions before clearing the collection dispute';
    END IF;
    UPDATE public.delivery_cod_collections AS c
    SET status = 'collected',
        disputed_at = NULL,
        disputed_by = NULL,
        dispute_reason = NULL
    WHERE c.id = v_collection.id
    RETURNING c.* INTO v_collection;
  END IF;

  INSERT INTO public.admin_activity_logs(
    admin_id, action, target_type, target_id, details
  )
  VALUES (
    v_actor,
    CASE WHEN p_disputed THEN 'cod_collection_disputed' ELSE 'cod_collection_dispute_cleared' END,
    'delivery_cod_collection',
    v_collection.id,
    jsonb_build_object(
      'order_id', v_collection.order_id,
      'reason', v_reason,
      'status', v_collection.status,
      'amount_collected', v_collection.amount_collected,
      'amount_remitted', v_collection.amount_remitted
    )
  );

  INSERT INTO public.notifications(
    user_id, title, body, type, data, is_read, channel, event_key
  )
  VALUES (
    v_collection.collected_by,
    CASE WHEN p_disputed
      THEN 'تم تعليق تحصيل نقدي للمراجعة'
      ELSE 'تم إنهاء نزاع التحصيل النقدي'
    END,
    CASE WHEN p_disputed
      THEN 'أوقفت الإدارة التحصيل مؤقتاً. راجع سبب النزاع ولا ترسل مبالغ إضافية حتى حله.'
      ELSE 'أنهت الإدارة النزاع وعاد التحصيل إلى حالته المحسوبة من المبالغ المعتمدة.'
    END,
    'cod_collection_dispute',
    jsonb_build_object(
      'collection_id', v_collection.id,
      'order_id', v_collection.order_id,
      'disputed', p_disputed,
      'status', v_collection.status,
      'reason', v_reason
    ),
    false,
    'in_app',
    'cod-collection-dispute:' || v_collection.id::text || ':' ||
      CASE WHEN p_disputed THEN 'set' ELSE 'cleared' END
  )
  ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_collection.id,
    'status', v_collection.status,
    'amount_collected', v_collection.amount_collected,
    'amount_remitted', v_collection.amount_remitted,
    'dispute_reason', v_collection.dispute_reason,
    'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_cod_collections()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'order_id', c.order_id,
    'order_number', o.order_number,
    'delivery_id', c.delivery_id,
    'delivery_user_id', dp.user_id,
    'delivery_name', du.full_name,
    'merchant_id', o.merchant_id,
    'merchant_user_id', mp.user_id,
    'customer_id', o.customer_id,
    'amount_collected', c.amount_collected,
    'amount_remitted', c.amount_remitted,
    'amount_outstanding', GREATEST(c.amount_collected - c.amount_remitted, 0),
    'amount_pending_review', COALESCE((
      SELECT sum(s.amount)
      FROM public.cod_remittance_submissions AS s
      WHERE s.collection_id = c.id AND s.status IN ('pending','disputed')
    ), 0),
    'status', c.status,
    'collected_at', c.collected_at,
    'remitted_at', c.remitted_at,
    'disputed_at', c.disputed_at,
    'disputed_by', c.disputed_by,
    'dispute_reason', c.dispute_reason,
    'submissions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'amount', s.amount,
          'reference', s.remittance_reference,
          'proof_path', s.proof_path,
          'status', s.status,
          'submitted_by', s.submitted_by,
          'processor_id', s.processor_id,
          'review_note', s.review_note,
          'ledger_entry_id', s.ledger_entry_id,
          'submitted_at', s.submitted_at,
          'reviewed_at', s.reviewed_at
        ) ORDER BY s.submitted_at DESC, s.id
      )
      FROM public.cod_remittance_submissions AS s
      WHERE s.collection_id = c.id
    ), '[]'::jsonb)
  )
  FROM public.delivery_cod_collections AS c
  JOIN public.orders AS o ON o.id = c.order_id
  LEFT JOIN public.delivery_profiles AS dp ON dp.id = c.delivery_id
  LEFT JOIN public.users AS du ON du.id = dp.user_id
  LEFT JOIN public.merchant_profiles AS mp ON mp.id = o.merchant_id
  ORDER BY
    CASE c.status
      WHEN 'disputed' THEN 0
      WHEN 'collected' THEN 1
      WHEN 'partially_remitted' THEN 2
      ELSE 3
    END,
    c.collected_at DESC,
    c.id;
END;
$function$;


DROP TRIGGER IF EXISTS trg_normalize_cod_collection ON public.delivery_cod_collections;
CREATE TRIGGER trg_normalize_cod_collection
BEFORE INSERT OR UPDATE OF amount_collected, amount_remitted, status,
  disputed_at, disputed_by, dispute_reason
ON public.delivery_cod_collections
FOR EACH ROW EXECUTE FUNCTION public.marketplace_normalize_cod_collection();

-- Dedicated private evidence bucket. Object paths are deterministic:
-- <courier-user-id>/cod-remittances/<collection-id>/<idempotency-key>.<ext>
INSERT INTO storage.buckets(
  id, name, public, file_size_limit, allowed_mime_types
)
VALUES (
  'cod-remittance-proofs',
  'cod-remittance-proofs',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Internal evidence validation and courier submission.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketplace_validate_cod_remittance_proof(
  p_path text,
  p_actor_id uuid,
  p_collection_id uuid,
  p_idempotency_key uuid
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
  IF p_actor_id IS NULL OR p_collection_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COD proof identity is incomplete';
  END IF;
  v_expected_pattern := format(
    '^%s/cod-remittances/%s/%s[.](jpg|jpeg|png|pdf)$',
    p_actor_id::text,
    p_collection_id::text,
    p_idempotency_key::text
  );
  IF NULLIF(btrim(p_path), '') IS NULL OR p_path !~* v_expected_pattern THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid COD remittance proof path';
  END IF;

  SELECT so.metadata
  INTO v_metadata
  FROM storage.objects AS so
  WHERE so.bucket_id = 'cod-remittance-proofs'
    AND so.name = p_path
    AND COALESCE(so.owner_id, so.owner::text) = p_actor_id::text
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'COD remittance proof object was not found or is not owned by the courier';
  END IF;

  v_mimetype := lower(COALESCE(v_metadata ->> 'mimetype', ''));
  v_size_text := COALESCE(v_metadata ->> 'size', '');
  IF NOT (
    (lower(p_path) ~ '[.]png$' AND v_mimetype = 'image/png')
    OR (lower(p_path) ~ '[.](jpg|jpeg)$' AND v_mimetype = 'image/jpeg')
    OR (lower(p_path) ~ '[.]pdf$' AND v_mimetype = 'application/pdf')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid COD remittance proof MIME type';
  END IF;
  IF v_size_text !~ '^[0-9]+$'
     OR v_size_text::bigint < 1
     OR v_size_text::bigint > 10485760 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid COD remittance proof file size';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_cod_collections()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_delivery_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  v_role := public.marketplace_actor_role(v_actor);
  IF v_role <> 'delivery' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'delivery role required';
  END IF;

  SELECT dp.id
  INTO v_delivery_id
  FROM public.delivery_profiles AS dp
  WHERE dp.user_id = v_actor
    AND COALESCE(dp.is_approved, false);
  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery profile required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.id,
    'order_id', c.order_id,
    'order_number', o.order_number,
    'delivery_id', c.delivery_id,
    'amount_collected', c.amount_collected,
    'amount_remitted', c.amount_remitted,
    'amount_outstanding', GREATEST(c.amount_collected - c.amount_remitted, 0),
    'amount_pending_review', COALESCE((
      SELECT sum(s.amount)
      FROM public.cod_remittance_submissions AS s
      WHERE s.collection_id = c.id AND s.status IN ('pending','disputed')
    ), 0),
    'status', c.status,
    'collected_at', c.collected_at,
    'remitted_at', c.remitted_at,
    'disputed_at', c.disputed_at,
    'dispute_reason', c.dispute_reason,
    'submissions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'amount', s.amount,
          'reference', s.remittance_reference,
          'proof_path', s.proof_path,
          'status', s.status,
          'review_note', s.review_note,
          'submitted_at', s.submitted_at,
          'reviewed_at', s.reviewed_at
        ) ORDER BY s.submitted_at DESC, s.id
      )
      FROM public.cod_remittance_submissions AS s
      WHERE s.collection_id = c.id
    ), '[]'::jsonb)
  )
  FROM public.delivery_cod_collections AS c
  JOIN public.orders AS o ON o.id = c.order_id
  WHERE c.delivery_id = v_delivery_id
    AND c.collected_by = v_actor
  ORDER BY
    CASE c.status
      WHEN 'disputed' THEN 0
      WHEN 'collected' THEN 1
      WHEN 'partially_remitted' THEN 2
      ELSE 3
    END,
    c.collected_at DESC,
    c.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_cod_remittance(
  p_collection_id uuid,
  p_amount numeric,
  p_reference text,
  p_proof_path text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_delivery public.delivery_profiles%ROWTYPE;
  v_collection public.delivery_cod_collections%ROWTYPE;
  v_existing public.cod_remittance_submissions%ROWTYPE;
  v_submission public.cod_remittance_submissions%ROWTYPE;
  v_amount numeric := round(COALESCE(p_amount, 0), 2);
  v_reference text := NULLIF(btrim(p_reference), '');
  v_proof_path text := NULLIF(btrim(p_proof_path), '');
  v_request_hash text;
  v_reserved numeric := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  v_role := public.marketplace_actor_role(v_actor);
  IF v_role <> 'delivery' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'delivery role required';
  END IF;
  IF p_collection_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'collection and idempotency key are required';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'remittance amount must be positive';
  END IF;
  IF v_reference IS NULL OR length(v_reference) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'a remittance reference of at most 200 characters is required';
  END IF;
  IF v_proof_path IS NULL OR length(v_proof_path) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'remittance proof is required';
  END IF;

  SELECT dp.*
  INTO v_delivery
  FROM public.delivery_profiles AS dp
  WHERE dp.user_id = v_actor
    AND COALESCE(dp.is_approved, false)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery profile required';
  END IF;

  v_request_hash := md5(concat_ws(
    E'\x1f',
    p_collection_id::text,
    v_amount::text,
    lower(v_reference),
    v_proof_path
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cod-remittance:' || v_delivery.id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT s.*
  INTO v_existing
  FROM public.cod_remittance_submissions AS s
  WHERE s.delivery_id = v_delivery.id
    AND s.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'remittance idempotency key was reused with different details';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'collection_id', v_existing.collection_id,
      'amount', v_existing.amount,
      'status', v_existing.status,
      'reference', v_existing.remittance_reference,
      'proof_path', v_existing.proof_path,
      'submitted_at', v_existing.submitted_at,
      'reviewed_at', v_existing.reviewed_at,
      'idempotent_replay', true
    );
  END IF;

  SELECT c.*
  INTO v_collection
  FROM public.delivery_cod_collections AS c
  WHERE c.id = p_collection_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COD collection not found';
  END IF;
  IF v_collection.delivery_id IS DISTINCT FROM v_delivery.id
     OR v_collection.collected_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'COD collection is not assigned to this courier';
  END IF;
  IF v_collection.status = 'disputed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COD collection is disputed';
  END IF;
  IF v_collection.status = 'remitted'
     OR v_collection.amount_remitted >= v_collection.amount_collected THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COD collection is already remitted';
  END IF;

  SELECT COALESCE(sum(s.amount), 0)
  INTO v_reserved
  FROM public.cod_remittance_submissions AS s
  WHERE s.collection_id = v_collection.id
    AND s.status IN ('pending','disputed');
  IF v_amount > round(
       GREATEST(v_collection.amount_collected - v_collection.amount_remitted - v_reserved, 0),
       2
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'remittance exceeds the unremitted amount available for review';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.cod_remittance_submissions AS s
    WHERE s.collection_id = v_collection.id
      AND lower(btrim(s.remittance_reference)) = lower(v_reference)
      AND s.status IN ('pending','approved','disputed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'duplicate active remittance reference';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.cod_remittance_submissions AS s
    WHERE s.proof_path = v_proof_path
      AND s.status IN ('pending','approved','disputed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'duplicate active remittance proof';
  END IF;

  PERFORM public.marketplace_validate_cod_remittance_proof(
    v_proof_path,
    v_actor,
    v_collection.id,
    p_idempotency_key
  );

  INSERT INTO public.cod_remittance_submissions(
    collection_id,
    delivery_id,
    submitted_by,
    amount,
    remittance_reference,
    proof_path,
    idempotency_key,
    request_hash,
    status
  )
  VALUES (
    v_collection.id,
    v_delivery.id,
    v_actor,
    v_amount,
    v_reference,
    v_proof_path,
    p_idempotency_key,
    v_request_hash,
    'pending'
  )
  RETURNING * INTO v_submission;

  INSERT INTO public.admin_activity_logs(
    admin_id, action, target_type, target_id, details
  )
  VALUES (
    v_actor,
    'cod_remittance_submitted',
    'cod_remittance_submission',
    v_submission.id,
    jsonb_build_object(
      'collection_id', v_collection.id,
      'order_id', v_collection.order_id,
      'amount', v_submission.amount,
      'reference', v_submission.remittance_reference
    )
  );

  INSERT INTO public.notifications(
    user_id, title, body, type, data, is_read, channel, event_key
  )
  SELECT
    u.id,
    'تحويل تحصيل نقدي جديد',
    'أرسل مندوب إثبات تحويل نقدي ويحتاج إلى مراجعة الإدارة.',
    'cod_remittance_submitted',
    jsonb_build_object(
      'submission_id', v_submission.id,
      'collection_id', v_collection.id,
      'order_id', v_collection.order_id,
      'delivery_id', v_delivery.id,
      'amount', v_submission.amount,
      'reference', v_submission.remittance_reference
    ),
    false,
    'in_app',
    'cod-remittance-submitted:' || v_submission.id::text
  FROM public.users AS u
  WHERE u.role = 'admin'
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id)
  ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_submission.id,
    'collection_id', v_submission.collection_id,
    'amount', v_submission.amount,
    'status', v_submission.status,
    'reference', v_submission.remittance_reference,
    'proof_path', v_submission.proof_path,
    'submitted_at', v_submission.submitted_at,
    'idempotent_replay', false
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- Privileges and realtime. Mutations are RPC-only.
-- -----------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON TABLE public.delivery_cod_collections
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cod_remittance_submissions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_cod_collections TO authenticated;
GRANT SELECT ON TABLE public.cod_remittance_submissions TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.delivery_cod_collections TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.cod_remittance_submissions TO service_role;

REVOKE ALL ON FUNCTION public.marketplace_normalize_cod_collection()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_validate_cod_remittance_proof(text,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_cod_held_balance(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_enforce_cod_withdrawal_hold()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_my_cod_collections()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_cod_remittance(uuid,numeric,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_cod_remittance(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_cod_collection_dispute(uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_cod_collections()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_my_cod_collections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_cod_remittance(uuid,numeric,text,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_cod_remittance(uuid,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_cod_collection_dispute(uuid,boolean,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cod_collections() TO authenticated;

ALTER TABLE public.delivery_cod_collections REPLICA IDENTITY FULL;
ALTER TABLE public.cod_remittance_submissions REPLICA IDENTITY FULL;

DO $cod_realtime$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'delivery_cod_collections'
    ) THEN
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.delivery_cod_collections;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'cod_remittance_submissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.cod_remittance_submissions;
    END IF;
  END IF;
END;
$cod_realtime$;
