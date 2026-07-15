-- Atomic finance, support, administrative review, and broadcast contracts.
--
-- Production was inspected read-only before this migration was authored. The
-- live database had three pending refunds (two active rows for one order), no
-- withdrawal rows, and none of the RPCs below. This migration is deliberately
-- replayable against both that live shape and the older clean-replay shape.

-- -----------------------------------------------------------------------------
-- Refund requests: normalize the drifted schemas and preserve decision audit.
-- -----------------------------------------------------------------------------
ALTER TABLE public.refund_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_status_check;
ALTER TABLE public.refund_requests
  ALTER COLUMN status TYPE text USING status::text;

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS evidence_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_method text NOT NULL DEFAULT 'original_payment',
  ADD COLUMN IF NOT EXISTS merchant_response text,
  ADD COLUMN IF NOT EXISTS merchant_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS reversal_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversal_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refund_requests' AND column_name = 'amount'
  ) THEN
    EXECUTE 'UPDATE public.refund_requests SET refund_amount = COALESCE(NULLIF(refund_amount, 0), amount, 0)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refund_requests' AND column_name = 'merchant_note'
  ) THEN
    EXECUTE 'UPDATE public.refund_requests SET merchant_response = COALESCE(merchant_response, merchant_note)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refund_requests' AND column_name = 'reviewed_by'
  ) THEN
    EXECUTE 'UPDATE public.refund_requests SET processed_by = COALESCE(processed_by, reviewed_by)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refund_requests' AND column_name = 'reviewed_at'
  ) THEN
    EXECUTE 'UPDATE public.refund_requests SET processed_at = COALESCE(processed_at, reviewed_at)';
  END IF;
END;
$$;

UPDATE public.refund_requests
SET status = CASE WHEN status = 'processed' THEN 'completed' ELSE COALESCE(status, 'pending') END,
    evidence_images = COALESCE(evidence_images, '[]'::jsonb),
    refund_amount = GREATEST(COALESCE(refund_amount, 0), 0),
    refund_method = COALESCE(NULLIF(refund_method, ''), 'original_payment'),
    external_reference = NULLIF(btrim(external_reference), ''),
    reversal_amount = GREATEST(COALESCE(reversal_amount, 0), 0),
    updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE public.refund_requests ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.refund_requests ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN reason SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN evidence_images SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN evidence_images SET DEFAULT '[]'::jsonb;
ALTER TABLE public.refund_requests ALTER COLUMN refund_amount SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN refund_amount SET DEFAULT 0;
ALTER TABLE public.refund_requests ALTER COLUMN refund_method SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN refund_method SET DEFAULT 'original_payment';
ALTER TABLE public.refund_requests ALTER COLUMN reversal_amount SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN reversal_amount SET DEFAULT 0;
ALTER TABLE public.refund_requests ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.refund_requests ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_order_id_key;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_status_check;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_refund_method_check;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_evidence_images_check;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_refund_amount_check;
ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_status_check
    CHECK (status IN ('pending','approved','rejected','processing','completed')),
  ADD CONSTRAINT refund_requests_refund_method_check
    CHECK (refund_method IN ('wallet','original_payment')),
  ADD CONSTRAINT refund_requests_evidence_images_check
    CHECK (jsonb_typeof(evidence_images) = 'array'),
  ADD CONSTRAINT refund_requests_refund_amount_check
    CHECK (refund_amount >= 0 AND reversal_amount >= 0 AND reversal_amount <= refund_amount);

-- Reconcile, never delete, pre-existing duplicate active requests. The oldest
-- request remains canonical and each superseded row gets an immutable audit.
WITH ranked AS (
  SELECT r.id,
         r.order_id,
         first_value(r.id) OVER (
           PARTITION BY r.order_id ORDER BY r.created_at NULLS LAST, r.id
         ) AS canonical_id,
         row_number() OVER (
           PARTITION BY r.order_id ORDER BY r.created_at NULLS LAST, r.id
         ) AS sequence_number
  FROM public.refund_requests r
  WHERE r.status IN ('pending','approved','processing')
)
INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
SELECT NULL,
       'refund_duplicate_reconciled',
       'refund_request',
       ranked.id,
       jsonb_build_object(
         'canonical_request_id', ranked.canonical_id,
         'order_id', ranked.order_id,
         'reason', 'duplicate active request found during finance-contract migration'
       )
FROM ranked
WHERE ranked.sequence_number > 1;

WITH ranked AS (
  SELECT r.id,
         first_value(r.id) OVER (
           PARTITION BY r.order_id ORDER BY r.created_at NULLS LAST, r.id
         ) AS canonical_id,
         row_number() OVER (
           PARTITION BY r.order_id ORDER BY r.created_at NULLS LAST, r.id
         ) AS sequence_number
  FROM public.refund_requests r
  WHERE r.status IN ('pending','approved','processing')
)
UPDATE public.refund_requests r
SET status = 'rejected',
    admin_notes = concat_ws(
      E'\n',
      NULLIF(r.admin_notes, ''),
      'Duplicate request reconciled; canonical request: ' || ranked.canonical_id::text
    ),
    processed_at = COALESCE(r.processed_at, now()),
    updated_at = now()
FROM ranked
WHERE r.id = ranked.id AND ranked.sequence_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_requests_one_active_order
  ON public.refund_requests (order_id)
  WHERE status IN ('pending','approved','processing');
CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_requests_external_reference
  ON public.refund_requests (external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_requests_status_created
  ON public.refund_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_customer_created
  ON public.refund_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_processed_by
  ON public.refund_requests (processed_by) WHERE processed_by IS NOT NULL;

-- Supabase's FK helper indexes already cover these single-column lookups.
-- Remove the legacy duplicates; the composite indexes above remain for queues.
DROP INDEX IF EXISTS public.idx_refund_requests_customer;
DROP INDEX IF EXISTS public.idx_refund_requests_order;

-- -----------------------------------------------------------------------------
-- Withdrawals: a request reserves balance immediately; terminal rejection or
-- failure releases it, while paid finalizes the existing reservation.
-- -----------------------------------------------------------------------------
ALTER TABLE public.withdrawal_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE public.withdrawal_requests
  ALTER COLUMN status TYPE text USING status::text;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_notes text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS payout_destination jsonb,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.withdrawal_requests
SET status = COALESCE(status, 'pending'),
    idempotency_key = COALESCE(idempotency_key, gen_random_uuid()),
    requester_notes = COALESCE(requester_notes, notes),
    external_reference = NULLIF(btrim(external_reference), ''),
    updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE public.withdrawal_requests ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.withdrawal_requests ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.withdrawal_requests ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE public.withdrawal_requests ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid();
ALTER TABLE public.withdrawal_requests ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.withdrawal_requests ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_payout_destination_check;
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
    CHECK (status IN ('pending','approved','rejected','processing','paid','failed')),
  ADD CONSTRAINT withdrawal_requests_payout_destination_check
    CHECK (payout_destination IS NULL OR jsonb_typeof(payout_destination) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS ux_withdrawal_requests_idempotency_key
  ON public.withdrawal_requests (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_withdrawal_requests_one_active_user
  ON public.withdrawal_requests (user_id)
  WHERE status IN ('pending','approved','processing');
CREATE UNIQUE INDEX IF NOT EXISTS ux_withdrawal_requests_external_reference
  ON public.withdrawal_requests (external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_created
  ON public.withdrawal_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_created
  ON public.withdrawal_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_processed_by
  ON public.withdrawal_requests (processed_by) WHERE processed_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Review/support/broadcast audit fields.
-- -----------------------------------------------------------------------------
ALTER TABLE public.merchant_profiles
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS approval_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_review_reason text;
ALTER TABLE public.delivery_profiles
  ADD COLUMN IF NOT EXISTS approval_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_review_reason text;
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_approval_reviewed_by
  ON public.merchant_profiles (approval_reviewed_by) WHERE approval_reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_profiles_approval_reviewed_by
  ON public.delivery_profiles (approval_reviewed_by) WHERE approval_reviewed_by IS NOT NULL;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.support_tickets
SET updated_at = COALESCE(updated_at, created_at, now());
ALTER TABLE public.support_tickets ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.support_tickets ALTER COLUMN updated_at SET DEFAULT now();

WITH latest AS (
  SELECT DISTINCT ON (sm.ticket_id)
         sm.ticket_id, sm.created_at, sm.sender_id
  FROM public.support_messages sm
  ORDER BY sm.ticket_id, sm.created_at DESC, sm.id DESC
)
UPDATE public.support_tickets t
SET last_message_at = latest.created_at,
    last_message_by = latest.sender_id,
    updated_at = GREATEST(
      COALESCE(t.updated_at, t.created_at, now()),
      COALESCE(latest.created_at, t.created_at, now())
    )
FROM latest
WHERE latest.ticket_id = t.id AND t.last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
  ON public.support_messages (ticket_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated
  ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated
  ON public.support_tickets (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_by
  ON public.support_tickets (last_message_by) WHERE last_message_by IS NOT NULL;

ALTER TABLE public.broadcast_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS matched_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_queued_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.broadcast_notifications DROP CONSTRAINT IF EXISTS broadcast_notifications_channel_check;
ALTER TABLE public.broadcast_notifications DROP CONSTRAINT IF EXISTS broadcast_notifications_delivery_counts_check;
ALTER TABLE public.broadcast_notifications ALTER COLUMN channel DROP DEFAULT;
ALTER TABLE public.broadcast_notifications
  ALTER COLUMN channel TYPE text USING channel::text;
UPDATE public.broadcast_notifications
SET channel = COALESCE(NULLIF(btrim(channel), ''), 'in_app'),
    matched_count = GREATEST(
      COALESCE(matched_count, 0), COALESCE(created_count, 0),
      COALESCE(push_queued_count, 0), 0
    ),
    created_count = GREATEST(COALESCE(created_count, 0), COALESCE(push_queued_count, 0), 0),
    push_queued_count = GREATEST(COALESCE(push_queued_count, 0), 0);
ALTER TABLE public.broadcast_notifications
  ALTER COLUMN channel SET DEFAULT 'in_app',
  ALTER COLUMN channel SET NOT NULL,
  ALTER COLUMN matched_count SET DEFAULT 0,
  ALTER COLUMN matched_count SET NOT NULL,
  ALTER COLUMN created_count SET DEFAULT 0,
  ALTER COLUMN created_count SET NOT NULL,
  ALTER COLUMN push_queued_count SET DEFAULT 0,
  ALTER COLUMN push_queued_count SET NOT NULL,
  ADD CONSTRAINT broadcast_notifications_channel_check CHECK (channel IN ('in_app','push')),
  ADD CONSTRAINT broadcast_notifications_delivery_counts_check CHECK (
    matched_count >= 0 AND created_count >= 0 AND push_queued_count >= 0
    AND created_count <= matched_count AND push_queued_count <= created_count
  );
CREATE UNIQUE INDEX IF NOT EXISTS ux_broadcast_notifications_idempotency
  ON public.broadcast_notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS broadcast_id uuid;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE public.notifications ALTER COLUMN channel DROP DEFAULT;
ALTER TABLE public.notifications ALTER COLUMN channel TYPE text USING channel::text;
UPDATE public.notifications
SET channel = COALESCE(NULLIF(btrim(channel), ''), 'in_app');
ALTER TABLE public.notifications ALTER COLUMN channel SET DEFAULT 'in_app';
ALTER TABLE public.notifications ALTER COLUMN channel SET NOT NULL;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_channel_check CHECK (channel IN ('push','sms','email','in_app'));
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_broadcast_id_fkey'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_broadcast_id_fkey
      FOREIGN KEY (broadcast_id) REFERENCES public.broadcast_notifications(id) ON DELETE SET NULL;
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_broadcast_user
  ON public.notifications (broadcast_id, user_id)
  WHERE broadcast_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- RLS: participants may read their records; every business mutation goes
-- through the transactional RPCs below. No direct insert/update policy remains.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'refund_requests','withdrawal_requests','wallet_transactions',
        'support_tickets','support_messages','broadcast_notifications',
        'admin_activity_logs'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END;
$$;

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY refund_requests_admin_select ON public.refund_requests
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );
CREATE POLICY refund_requests_customer_select ON public.refund_requests
  FOR SELECT TO authenticated USING (customer_id = (SELECT auth.uid()));
CREATE POLICY refund_requests_merchant_select ON public.refund_requests
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
    WHERE o.id = refund_requests.order_id AND mp.user_id = (SELECT auth.uid())
  ));

CREATE POLICY withdrawal_requests_admin_select ON public.withdrawal_requests
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );
CREATE POLICY withdrawal_requests_owner_select ON public.withdrawal_requests
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY wallet_transactions_admin_select ON public.wallet_transactions
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );
CREATE POLICY wallet_transactions_owner_select ON public.wallet_transactions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY support_tickets_admin_select ON public.support_tickets
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );
CREATE POLICY support_tickets_owner_select ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY support_messages_admin_select ON public.support_messages
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );
CREATE POLICY support_messages_owner_select ON public.support_messages
  FOR SELECT TO authenticated USING (
    COALESCE(is_internal, false) IS FALSE
    AND EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = support_messages.ticket_id AND st.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY broadcast_notifications_admin_select ON public.broadcast_notifications
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );
CREATE POLICY admin_activity_logs_admin_select ON public.admin_activity_logs
  FOR SELECT TO authenticated USING (
    (SELECT public.is_admin())
    AND NOT (SELECT public.is_current_user_blocked())
  );

-- Table privileges are independent of RLS. API roles can read only the fields
-- required by their screens; every mutation remains RPC-owned.
REVOKE ALL PRIVILEGES ON TABLE public.refund_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.withdrawal_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.wallet_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.support_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.broadcast_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.admin_activity_logs FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.refund_requests TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.withdrawal_requests TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.wallet_transactions TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.support_tickets TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.support_messages TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.broadcast_notifications TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.admin_activity_logs TO service_role;

GRANT SELECT (
  id, order_id, customer_id, reason, description, evidence_images, refund_amount,
  refund_method, status, merchant_response, decision_reason, processed_at, created_at
) ON public.refund_requests TO authenticated;
GRANT SELECT (
  id, user_id, amount, status, notes, requester_notes, admin_notes,
  payout_destination, external_reference, processed_at, paid_at, created_at
) ON public.withdrawal_requests TO authenticated;
GRANT SELECT (
  id, user_id, type, amount, source, reference_id, balance_after, notes, created_at
) ON public.wallet_transactions TO authenticated;
GRANT SELECT (
  id, user_id, order_id, subject, category, status, priority, assigned_to,
  created_at, resolved_at
) ON public.support_tickets TO authenticated;
GRANT SELECT (
  id, ticket_id, sender_id, message, attachments, is_internal, created_at
) ON public.support_messages TO authenticated;
GRANT SELECT ON public.broadcast_notifications TO authenticated;
GRANT SELECT ON public.admin_activity_logs TO authenticated;

-- -----------------------------------------------------------------------------
-- Refund RPCs.
-- -----------------------------------------------------------------------------
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
  v_actor_active boolean;
  v_actor_blocked boolean;
  v_order public.orders%ROWTYPE;
  v_settlement public.order_settlements%ROWTYPE;
  v_existing public.refund_requests%ROWTYPE;
  v_has_settlement boolean := false;
  v_evidence jsonb := COALESCE(p_evidence_images, '[]'::jsonb);
  v_description text := NULLIF(btrim(p_description), '');
  v_method text := COALESCE(NULLIF(btrim(p_refund_method), ''), 'original_payment');
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_refund_amount numeric(12,2);
  v_fingerprint text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;

  SELECT COALESCE(u.is_active, true),
         public.is_user_blocked(u.id)
  INTO v_actor_active, v_actor_blocked
  FROM public.users u
  WHERE u.id = v_actor;
  IF NOT FOUND OR NOT v_actor_active OR v_actor_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to request a refund';
  END IF;

  IF v_reason NOT IN ('wrong_item','damaged','not_as_described','changed_mind','not_received','other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid refund reason';
  END IF;
  IF v_method NOT IN ('wallet','original_payment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid refund method';
  END IF;
  IF v_description IS NOT NULL AND (length(v_description) < 10 OR length(v_description) > 2000) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refund description must be between 10 and 2000 characters';
  END IF;
  IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(v_evidence) > 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refund evidence must be an array of at most 10 items';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_evidence) item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'string'
       OR length(item #>> '{}') > 2048
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid refund evidence item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('refund-order:' || p_order_id::text, 0));
  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'order not found';
  END IF;
  IF v_order.customer_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'cannot refund another customer order';
  END IF;
  IF v_order.status IS DISTINCT FROM 'delivered' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'only delivered orders can be refunded';
  END IF;
  IF COALESCE(v_order.delivered_at, v_order.updated_at, v_order.created_at) < now() - interval '3 days' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refund window has expired';
  END IF;

  SELECT s.* INTO v_settlement
  FROM public.order_settlements s
  WHERE s.order_id = v_order.id;
  v_has_settlement := FOUND;
  IF v_has_settlement THEN
    v_refund_amount := round(GREATEST(v_settlement.gross_amount - v_settlement.reversed_amount, 0), 2);
  ELSE
    -- Legacy delivered orders are reviewable, but completion will explicitly
    -- require a verified settlement rather than inventing one.
    v_refund_amount := round(GREATEST(COALESCE(v_order.total_amount, 0), 0), 2);
  END IF;
  IF v_refund_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'order has no refundable remainder';
  END IF;

  v_fingerprint := md5(concat_ws(
    E'\x1f', v_actor::text, p_order_id::text, v_reason,
    COALESCE(v_description, ''), v_method, v_evidence::text, v_refund_amount::text
  ));

  SELECT r.* INTO v_existing
  FROM public.refund_requests r
  WHERE r.order_id = p_order_id AND r.status IN ('pending','approved','processing')
  ORDER BY r.created_at, r.id
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS NULL OR v_existing.request_fingerprint = v_fingerprint THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'an active refund request already exists for this order';
  END IF;

  INSERT INTO public.refund_requests (
    order_id, customer_id, reason, description, evidence_images,
    refund_amount, refund_method, status, request_fingerprint, updated_at
  ) VALUES (
    p_order_id, v_actor, v_reason, v_description, v_evidence,
    v_refund_amount, v_method, 'pending', v_fingerprint, now()
  )
  RETURNING * INTO v_existing;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'refund_requested',
    'refund_request',
    v_existing.id,
    jsonb_build_object(
      'order_id', p_order_id,
      'refund_amount', v_refund_amount,
      'refund_method', v_method,
      'settlement_verified', v_has_settlement,
      'request_fingerprint', v_fingerprint
    )
  );

  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  SELECT u.id,
         'طلب استرداد جديد',
         'تم إنشاء طلب استرداد ويحتاج إلى مراجعة الإدارة.',
         'refund_admin_review',
         jsonb_build_object('refund_request_id', v_existing.id, 'order_id', p_order_id),
         false,
         'in_app'
  FROM public.users u
  WHERE u.role = 'admin' AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id);

  RETURN v_existing.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_refund_request(
  p_request_id uuid,
  p_response text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_actor_active boolean;
  v_actor_blocked boolean;
  v_response text := btrim(COALESCE(p_response, ''));
  v_request public.refund_requests%ROWTYPE;
  v_request_order_id uuid;
  v_merchant_user uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  SELECT COALESCE(u.is_active, true),
         public.is_user_blocked(u.id)
  INTO v_actor_active, v_actor_blocked
  FROM public.users u WHERE u.id = v_actor;
  IF NOT FOUND OR NOT v_actor_active OR v_actor_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to respond';
  END IF;
  IF length(v_response) < 1 OR length(v_response) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant response must be between 1 and 2000 characters';
  END IF;

  SELECT r.order_id INTO v_request_order_id
  FROM public.refund_requests r
  WHERE r.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'refund request not found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-order:' || v_request_order_id::text, 0));

  SELECT r.* INTO v_request
  FROM public.refund_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'refund request not found';
  END IF;

  SELECT mp.user_id INTO v_merchant_user
  FROM public.orders o
  JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  WHERE o.id = v_request.order_id;
  IF v_merchant_user IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the order merchant can respond to this refund';
  END IF;
  IF v_request.merchant_response IS NOT NULL THEN
    IF v_request.merchant_response = v_response THEN
      RETURN;
    END IF;
  END IF;
  IF v_request.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant response can only be changed while the refund is pending';
  END IF;

  UPDATE public.refund_requests
  SET merchant_response = v_response,
      merchant_responded_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    CASE WHEN v_request.merchant_response IS NULL
      THEN 'refund_merchant_responded'
      ELSE 'refund_merchant_response_updated'
    END,
    'refund_request',
    p_request_id,
    jsonb_build_object(
      'order_id', v_request.order_id,
      'previous_response', v_request.merchant_response,
      'new_response', v_response
    )
  );

  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_request.customer_id,
    'رد التاجر على طلب الاسترداد',
    'أضاف التاجر رده على طلب الاسترداد.',
    'refund_merchant_response',
    jsonb_build_object('refund_request_id', p_request_id, 'order_id', v_request.order_id),
    false,
    'in_app'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_refund_request(
  p_request_id uuid,
  p_status text,
  p_notes text,
  p_external_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_target text := btrim(COALESCE(p_status, ''));
  v_notes text := NULLIF(btrim(p_notes), '');
  v_external_reference text := NULLIF(btrim(p_external_reference), '');
  v_request public.refund_requests%ROWTYPE;
  v_request_order_id uuid;
  v_settlement public.order_settlements%ROWTYPE;
  v_old_status text;
  v_amount numeric(12,2);
  v_remaining numeric(12,2);
  v_new_reversed numeric(12,2);
  v_old_merchant_target numeric(12,2);
  v_new_merchant_target numeric(12,2);
  v_old_delivery_target numeric(12,2);
  v_new_delivery_target numeric(12,2);
  v_old_platform_target numeric(12,2);
  v_new_platform_target numeric(12,2);
  v_merchant_reversal numeric(12,2);
  v_delivery_reversal numeric(12,2);
  v_platform_reversal numeric(12,2);
  v_merchant_user uuid;
  v_delivery_user uuid;
  v_balance numeric(12,2);
  v_original_entry uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF v_target NOT IN ('approved','rejected','processing','completed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid refund status';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'admin notes are too long';
  END IF;
  IF v_external_reference IS NOT NULL AND length(v_external_reference) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external reference is too long';
  END IF;
  SELECT r.order_id INTO v_request_order_id
  FROM public.refund_requests r
  WHERE r.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'refund request not found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('refund-order:' || v_request_order_id::text, 0));

  SELECT r.* INTO v_request
  FROM public.refund_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'refund request not found';
  END IF;
  v_old_status := v_request.status;

  IF v_old_status = v_target THEN
    IF v_target = 'completed'
       AND v_external_reference IS NOT NULL
       AND v_request.external_reference IS DISTINCT FROM v_external_reference THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refund was completed with another external reference';
    END IF;
    RETURN;
  END IF;

  IF NOT (
    (v_old_status = 'pending' AND v_target IN ('approved','rejected'))
    OR (v_old_status = 'approved' AND v_target = 'processing')
    OR (v_old_status = 'processing' AND v_target = 'completed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'illegal refund transition: ' || v_old_status || ' -> ' || v_target;
  END IF;
  IF v_target = 'rejected' AND v_notes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rejection reason is required';
  END IF;

  IF v_target = 'completed' THEN
    IF v_request.refund_method = 'original_payment' AND v_external_reference IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external refund reference is required';
    END IF;

    SELECT s.* INTO v_settlement
    FROM public.order_settlements s
    WHERE s.order_id = v_request.order_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'verified order settlement is missing; legacy refund requires reconciliation';
    END IF;

    v_amount := round(v_request.refund_amount, 2);
    v_remaining := round(GREATEST(v_settlement.gross_amount - v_settlement.reversed_amount, 0), 2);
    IF v_amount <= 0 OR v_amount > v_remaining THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refund amount exceeds the settled refundable remainder';
    END IF;
    IF v_settlement.gross_amount <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid settlement gross amount';
    END IF;
    IF (
      SELECT count(*)
      FROM public.marketplace_ledger_entries le
      WHERE le.order_id = v_request.order_id
        AND (
          (le.operation_key = 'settlement:' || v_request.order_id::text || ':merchant_proceeds'
            AND le.entry_type = 'merchant_proceeds' AND le.amount = v_settlement.merchant_proceeds)
          OR (le.operation_key = 'settlement:' || v_request.order_id::text || ':delivery_earning'
            AND le.entry_type = 'delivery_earning' AND le.amount = v_settlement.delivery_earning)
          OR (le.operation_key = 'settlement:' || v_request.order_id::text || ':platform_revenue'
            AND le.entry_type = 'platform_revenue' AND le.amount = v_settlement.platform_amount)
        )
    ) <> 3 THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'verified settlement ledger is incomplete; refund cannot be reversed safely';
    END IF;

    v_new_reversed := round(v_settlement.reversed_amount + v_amount, 2);
    v_old_merchant_target := round(v_settlement.merchant_proceeds * v_settlement.reversed_amount / v_settlement.gross_amount, 2);
    v_new_merchant_target := CASE
      WHEN v_new_reversed >= v_settlement.gross_amount THEN v_settlement.merchant_proceeds
      ELSE round(v_settlement.merchant_proceeds * v_new_reversed / v_settlement.gross_amount, 2)
    END;
    v_old_delivery_target := round(v_settlement.delivery_earning * v_settlement.reversed_amount / v_settlement.gross_amount, 2);
    v_new_delivery_target := CASE
      WHEN v_new_reversed >= v_settlement.gross_amount THEN v_settlement.delivery_earning
      ELSE round(v_settlement.delivery_earning * v_new_reversed / v_settlement.gross_amount, 2)
    END;
    v_old_platform_target := round(v_settlement.reversed_amount - v_old_merchant_target - v_old_delivery_target, 2);
    v_new_platform_target := round(v_new_reversed - v_new_merchant_target - v_new_delivery_target, 2);

    v_merchant_reversal := GREATEST(v_new_merchant_target - v_old_merchant_target, 0);
    v_delivery_reversal := GREATEST(v_new_delivery_target - v_old_delivery_target, 0);
    v_platform_reversal := GREATEST(v_new_platform_target - v_old_platform_target, 0);
    IF round(v_merchant_reversal + v_delivery_reversal + v_platform_reversal, 2) <> v_amount THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refund reversal components do not balance';
    END IF;

    PERFORM set_config('app.marketplace_operation', '1', true);

    IF v_merchant_reversal > 0 THEN
      UPDATE public.merchant_profiles mp
      SET wallet_balance = COALESCE(mp.wallet_balance, 0) - v_merchant_reversal
      WHERE mp.id = v_settlement.merchant_id
      RETURNING mp.user_id, mp.wallet_balance INTO v_merchant_user, v_balance;
      IF v_merchant_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'settlement merchant profile is missing';
      END IF;
      INSERT INTO public.wallet_transactions (
        user_id, type, amount, source, reference_id, balance_after, notes
      ) VALUES (
        v_merchant_user, 'debit', v_merchant_reversal, 'refund_reversal_merchant',
        p_request_id, v_balance, 'Refund reversal for order ' || v_request.order_id::text
      ) ON CONFLICT (user_id, source, reference_id, type)
          WHERE source IS NOT NULL AND reference_id IS NOT NULL DO NOTHING;

      SELECT le.id INTO v_original_entry
      FROM public.marketplace_ledger_entries le
      WHERE le.operation_key = 'settlement:' || v_request.order_id::text || ':merchant_proceeds';
      INSERT INTO public.marketplace_ledger_entries (
        operation_key, order_id, entry_type, debit_account, debit_owner_id,
        credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
      ) VALUES (
        'refund:' || p_request_id::text || ':merchant', v_request.order_id,
        'refund_merchant_reversal', 'merchant_wallet', v_merchant_user,
        'refund_clearing', v_request.customer_id, v_merchant_reversal,
        v_original_entry,
        jsonb_build_object('refund_id', p_request_id, 'settlement_key', v_settlement.settlement_key),
        v_actor
      ) ON CONFLICT (operation_key) DO NOTHING;
    ELSE
      SELECT mp.user_id INTO v_merchant_user
      FROM public.merchant_profiles mp
      WHERE mp.id = v_settlement.merchant_id;
      IF v_merchant_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'settlement merchant profile is missing';
      END IF;
      SELECT le.id INTO v_original_entry
      FROM public.marketplace_ledger_entries le
      WHERE le.operation_key = 'settlement:' || v_request.order_id::text || ':merchant_proceeds';
      INSERT INTO public.marketplace_ledger_entries (
        operation_key, order_id, entry_type, debit_account, debit_owner_id,
        credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
      ) VALUES (
        'refund:' || p_request_id::text || ':merchant', v_request.order_id,
        'refund_merchant_reversal', 'merchant_wallet', v_merchant_user,
        'refund_clearing', v_request.customer_id, 0,
        v_original_entry,
        jsonb_build_object('refund_id', p_request_id, 'settlement_key', v_settlement.settlement_key),
        v_actor
      ) ON CONFLICT (operation_key) DO NOTHING;
    END IF;

    IF v_delivery_reversal > 0 THEN
      UPDATE public.delivery_profiles dp
      SET wallet_balance = COALESCE(dp.wallet_balance, 0) - v_delivery_reversal
      WHERE dp.id = v_settlement.delivery_id
      RETURNING dp.user_id, dp.wallet_balance INTO v_delivery_user, v_balance;
      IF v_delivery_user IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'settlement delivery profile is missing';
      END IF;
      INSERT INTO public.wallet_transactions (
        user_id, type, amount, source, reference_id, balance_after, notes
      ) VALUES (
        v_delivery_user, 'debit', v_delivery_reversal, 'refund_reversal_delivery',
        p_request_id, v_balance, 'Refund reversal for order ' || v_request.order_id::text
      ) ON CONFLICT (user_id, source, reference_id, type)
          WHERE source IS NOT NULL AND reference_id IS NOT NULL DO NOTHING;

      SELECT le.id INTO v_original_entry
      FROM public.marketplace_ledger_entries le
      WHERE le.operation_key = 'settlement:' || v_request.order_id::text || ':delivery_earning';
      INSERT INTO public.marketplace_ledger_entries (
        operation_key, order_id, entry_type, debit_account, debit_owner_id,
        credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
      ) VALUES (
        'refund:' || p_request_id::text || ':delivery', v_request.order_id,
        'refund_delivery_reversal', 'delivery_wallet', v_delivery_user,
        'refund_clearing', v_request.customer_id, v_delivery_reversal,
        v_original_entry,
        jsonb_build_object('refund_id', p_request_id, 'settlement_key', v_settlement.settlement_key),
        v_actor
      ) ON CONFLICT (operation_key) DO NOTHING;
    ELSE
      SELECT dp.user_id INTO v_delivery_user
      FROM public.delivery_profiles dp
      WHERE dp.id = v_settlement.delivery_id;
      SELECT le.id INTO v_original_entry
      FROM public.marketplace_ledger_entries le
      WHERE le.operation_key = 'settlement:' || v_request.order_id::text || ':delivery_earning';
      INSERT INTO public.marketplace_ledger_entries (
        operation_key, order_id, entry_type, debit_account, debit_owner_id,
        credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
      ) VALUES (
        'refund:' || p_request_id::text || ':delivery', v_request.order_id,
        'refund_delivery_reversal', 'delivery_wallet', v_delivery_user,
        'refund_clearing', v_request.customer_id, 0,
        v_original_entry,
        jsonb_build_object('refund_id', p_request_id, 'settlement_key', v_settlement.settlement_key),
        v_actor
      ) ON CONFLICT (operation_key) DO NOTHING;
    END IF;

    IF v_platform_reversal > 0 THEN
      SELECT le.id INTO v_original_entry
      FROM public.marketplace_ledger_entries le
      WHERE le.operation_key = 'settlement:' || v_request.order_id::text || ':platform_revenue';
      INSERT INTO public.marketplace_ledger_entries (
        operation_key, order_id, entry_type, debit_account, debit_owner_id,
        credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
      ) VALUES (
        'refund:' || p_request_id::text || ':platform', v_request.order_id,
        'refund_platform_reversal', 'platform_revenue', NULL,
        'refund_clearing', v_request.customer_id, v_platform_reversal,
        v_original_entry,
        jsonb_build_object('refund_id', p_request_id, 'settlement_key', v_settlement.settlement_key),
        v_actor
      ) ON CONFLICT (operation_key) DO NOTHING;
    ELSE
      SELECT le.id INTO v_original_entry
      FROM public.marketplace_ledger_entries le
      WHERE le.operation_key = 'settlement:' || v_request.order_id::text || ':platform_revenue';
      INSERT INTO public.marketplace_ledger_entries (
        operation_key, order_id, entry_type, debit_account, debit_owner_id,
        credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
      ) VALUES (
        'refund:' || p_request_id::text || ':platform', v_request.order_id,
        'refund_platform_reversal', 'platform_revenue', NULL,
        'refund_clearing', v_request.customer_id, 0,
        v_original_entry,
        jsonb_build_object('refund_id', p_request_id, 'settlement_key', v_settlement.settlement_key),
        v_actor
      ) ON CONFLICT (operation_key) DO NOTHING;
    END IF;

    IF v_request.refund_method = 'wallet' THEN
      INSERT INTO public.customer_profiles (user_id, wallet_balance)
      VALUES (v_request.customer_id, 0)
      ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;
      UPDATE public.customer_profiles cp
      SET wallet_balance = COALESCE(cp.wallet_balance, 0) + v_amount
      WHERE cp.user_id = v_request.customer_id
      RETURNING cp.wallet_balance INTO v_balance;
      INSERT INTO public.wallet_transactions (
        user_id, type, amount, source, reference_id, balance_after, notes
      ) VALUES (
        v_request.customer_id, 'credit', v_amount, 'refund_customer_wallet',
        p_request_id, v_balance, 'Refund credit for order ' || v_request.order_id::text
      ) ON CONFLICT (user_id, source, reference_id, type)
          WHERE source IS NOT NULL AND reference_id IS NOT NULL DO NOTHING;
    END IF;

    INSERT INTO public.marketplace_ledger_entries (
      operation_key, order_id, entry_type, debit_account, debit_owner_id,
      credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
    ) VALUES (
      'refund:' || p_request_id::text || ':customer', v_request.order_id,
      CASE WHEN v_request.refund_method = 'wallet' THEN 'refund_customer_credit' ELSE 'refund_external_payment' END,
      'refund_clearing', NULL,
      CASE WHEN v_request.refund_method = 'wallet' THEN 'customer_wallet' ELSE 'external_refund' END,
      v_request.customer_id, v_amount, NULL,
      jsonb_build_object(
        'refund_id', p_request_id,
        'settlement_key', v_settlement.settlement_key,
        'refund_method', v_request.refund_method,
        'external_reference', v_external_reference
      ),
      v_actor
    ) ON CONFLICT (operation_key) DO NOTHING;

    UPDATE public.order_settlements
    SET reversed_amount = v_new_reversed,
        status = CASE
          WHEN v_new_reversed >= gross_amount THEN 'reversed'
          ELSE 'partially_reversed'
        END,
        updated_at = now()
    WHERE order_id = v_request.order_id;

    UPDATE public.orders
    SET payment_status = CASE
          WHEN v_new_reversed >= v_settlement.gross_amount THEN 'refunded'
          ELSE payment_status
        END,
        updated_at = now()
    WHERE id = v_request.order_id;

    PERFORM set_config('app.marketplace_operation', '0', true);
  END IF;

  UPDATE public.refund_requests
  SET status = v_target,
      decision_reason = CASE WHEN v_target = 'rejected' THEN v_notes ELSE decision_reason END,
      admin_notes = CASE
        WHEN v_notes IS NULL THEN admin_notes
        ELSE concat_ws(E'\n', NULLIF(admin_notes, ''), '[' || v_target || '] ' || v_notes)
      END,
      processed_by = v_actor,
      processed_at = now(),
      external_reference = CASE WHEN v_target = 'completed' THEN v_external_reference ELSE external_reference END,
      reversal_amount = CASE WHEN v_target = 'completed' THEN v_amount ELSE reversal_amount END,
      reversal_applied_at = CASE WHEN v_target = 'completed' THEN now() ELSE reversal_applied_at END,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'refund_status_changed',
    'refund_request',
    p_request_id,
    jsonb_build_object(
      'from_status', v_old_status,
      'to_status', v_target,
      'notes', v_notes,
      'external_reference', v_external_reference,
      'reversal_amount', CASE WHEN v_target = 'completed' THEN v_amount ELSE NULL END
    )
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Withdrawal RPCs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role text;
  v_full_name text;
  v_phone text;
  v_actor_active boolean;
  v_actor_blocked boolean;
  v_amount numeric(12,2) := round(COALESCE(p_amount, 0), 2);
  v_notes text := NULLIF(btrim(p_notes), '');
  v_profile_id uuid;
  v_balance numeric(12,2);
  v_bank_name text;
  v_bank_account text;
  v_bank_account_name text;
  v_destination jsonb;
  v_existing public.withdrawal_requests%ROWTYPE;
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  IF v_amount < 50 OR v_amount > 1000000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'withdrawal amount must be between 50 and 1000000000';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'withdrawal notes are too long';
  END IF;

  SELECT u.role::text, u.full_name, u.phone,
         COALESCE(u.is_active, true),
         public.is_user_blocked(u.id)
  INTO v_role, v_full_name, v_phone, v_actor_active, v_actor_blocked
  FROM public.users u
  WHERE u.id = v_actor;
  IF NOT FOUND OR NOT v_actor_active OR v_actor_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to withdraw';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('withdrawal-user:' || v_actor::text, 0));

  IF v_role = 'merchant' THEN
    SELECT mp.id, COALESCE(mp.wallet_balance, 0), mp.bank_name, mp.bank_account, mp.bank_account_name
    INTO v_profile_id, v_balance, v_bank_name, v_bank_account, v_bank_account_name
    FROM public.merchant_profiles mp
    WHERE mp.user_id = v_actor AND COALESCE(mp.is_approved, false) AND COALESCE(mp.is_active, false)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved active merchant profile is required';
    END IF;
    v_destination := jsonb_strip_nulls(jsonb_build_object(
      'method', CASE WHEN NULLIF(btrim(v_bank_account), '') IS NULL THEN 'manual_transfer' ELSE 'bank_transfer' END,
      'provider', NULLIF(btrim(v_bank_name), ''),
      'beneficiary', COALESCE(NULLIF(btrim(v_bank_account_name), ''), v_full_name),
      'account_name', NULLIF(btrim(v_bank_account_name), ''),
      'account_number', NULLIF(btrim(v_bank_account), ''),
      'phone', NULLIF(btrim(v_phone), '')
    ));
  ELSIF v_role = 'delivery' THEN
    SELECT dp.id, COALESCE(dp.wallet_balance, 0)
    INTO v_profile_id, v_balance
    FROM public.delivery_profiles dp
    WHERE dp.user_id = v_actor AND COALESCE(dp.is_approved, false)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery profile is required';
    END IF;
    v_destination := jsonb_strip_nulls(jsonb_build_object(
      'method', 'manual_transfer',
      'beneficiary', v_full_name,
      'phone', NULLIF(btrim(v_phone), '')
    ));
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only merchants and delivery users can withdraw';
  END IF;

  IF NOT (v_destination ? 'account_number' OR v_destination ? 'phone') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'a verified bank account or phone payout destination is required';
  END IF;

  SELECT w.* INTO v_existing
  FROM public.withdrawal_requests w
  WHERE w.user_id = v_actor AND w.status IN ('pending','approved','processing')
  ORDER BY w.created_at, w.id
  LIMIT 1
  FOR UPDATE;

  -- The explicit block avoids relying on a client idempotency key that the
  -- current RPC contract does not accept.
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.amount = v_amount
       AND COALESCE(v_existing.requester_notes, '') = COALESCE(v_notes, '') THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'an active withdrawal request already exists';
  END IF;

  IF v_amount > v_balance THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'withdrawal amount exceeds available balance';
  END IF;

  INSERT INTO public.withdrawal_requests (
    user_id, amount, status, notes, requester_notes, payout_destination,
    reserved_at, updated_at
  ) VALUES (
    v_actor, v_amount, 'pending', v_notes, v_notes, v_destination,
    now(), now()
  )
  RETURNING * INTO v_request;

  PERFORM set_config('app.marketplace_operation', '1', true);
  IF v_role = 'merchant' THEN
    UPDATE public.merchant_profiles mp
    SET wallet_balance = COALESCE(mp.wallet_balance, 0) - v_amount
    WHERE mp.id = v_profile_id
    RETURNING mp.wallet_balance INTO v_balance;
  ELSE
    UPDATE public.delivery_profiles dp
    SET wallet_balance = COALESCE(dp.wallet_balance, 0) - v_amount
    WHERE dp.id = v_profile_id
    RETURNING dp.wallet_balance INTO v_balance;
  END IF;
  PERFORM set_config('app.marketplace_operation', '0', true);

  INSERT INTO public.wallet_transactions (
    user_id, type, amount, source, reference_id, balance_after, notes
  ) VALUES (
    v_actor, 'debit', v_amount, 'withdrawal_reserve', v_request.id,
    v_balance, 'Withdrawal balance reservation'
  ) ON CONFLICT (user_id, source, reference_id, type)
      WHERE source IS NOT NULL AND reference_id IS NOT NULL DO NOTHING;

  INSERT INTO public.marketplace_ledger_entries (
    operation_key, order_id, entry_type, debit_account, debit_owner_id,
    credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
  ) VALUES (
    'withdrawal:' || v_request.id::text || ':reserve', NULL,
    'withdrawal_reserve', v_role || '_wallet', v_actor,
    'withdrawal_reserve', v_actor, v_amount, NULL,
    jsonb_build_object(
      'withdrawal_id', v_request.id,
      'payout_destination', v_destination,
      'profile_id', v_profile_id,
      'role', v_role
    ),
    v_actor
  ) ON CONFLICT (operation_key) DO NOTHING;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'withdrawal_requested_and_reserved',
    'withdrawal_request',
    v_request.id,
    jsonb_build_object('amount', v_amount, 'role', v_role, 'balance_after', v_balance)
  );

  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  SELECT u.id,
         'طلب سحب جديد',
         'تم حجز المبلغ وإنشاء طلب سحب يحتاج إلى مراجعة.',
         'withdrawal_admin_review',
         jsonb_build_object('withdrawal_request_id', v_request.id, 'requester_id', v_actor),
         false,
         'in_app'
  FROM public.users u
  WHERE u.role = 'admin' AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id);

  RETURN v_request.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_withdrawal_request(
  p_request_id uuid,
  p_status text,
  p_notes text,
  p_external_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_target text := btrim(COALESCE(p_status, ''));
  v_notes text := NULLIF(btrim(p_notes), '');
  v_external_reference text := NULLIF(btrim(p_external_reference), '');
  v_request public.withdrawal_requests%ROWTYPE;
  v_requester_id uuid;
  v_old_status text;
  v_role text;
  v_profile_id uuid;
  v_balance numeric(12,2);
  v_reserve_entry uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF v_target NOT IN ('approved','rejected','processing','paid','failed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid withdrawal status';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'admin notes are too long';
  END IF;
  IF v_external_reference IS NOT NULL AND length(v_external_reference) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external reference is too long';
  END IF;
  SELECT w.user_id INTO v_requester_id
  FROM public.withdrawal_requests w
  WHERE w.id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'withdrawal request not found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('withdrawal-user:' || v_requester_id::text, 0));

  SELECT w.* INTO v_request
  FROM public.withdrawal_requests w
  WHERE w.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'withdrawal request not found';
  END IF;
  v_old_status := v_request.status;

  IF v_old_status = v_target THEN
    IF v_target = 'paid'
       AND v_external_reference IS NOT NULL
       AND v_request.external_reference IS DISTINCT FROM v_external_reference THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'withdrawal was paid with another reference';
    END IF;
    RETURN;
  END IF;

  IF NOT (
    (v_old_status = 'pending' AND v_target IN ('approved','rejected'))
    OR (v_old_status = 'approved' AND v_target = 'processing')
    OR (v_old_status = 'processing' AND v_target IN ('paid','failed'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'illegal withdrawal transition: ' || v_old_status || ' -> ' || v_target;
  END IF;
  IF v_target IN ('rejected','failed') AND v_notes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rejection or failure reason is required';
  END IF;
  IF v_target = 'paid' AND v_external_reference IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment reference is required';
  END IF;
  IF v_request.reserved_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'withdrawal has no verified balance reservation';
  END IF;
  IF v_request.payout_destination IS NULL OR v_request.payout_destination = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'withdrawal payout destination is missing';
  END IF;

  SELECT le.id,
         le.metadata ->> 'role',
         NULLIF(le.metadata ->> 'profile_id', '')::uuid
  INTO v_reserve_entry, v_role, v_profile_id
  FROM public.marketplace_ledger_entries le
  WHERE le.operation_key = 'withdrawal:' || p_request_id::text || ':reserve'
    AND le.entry_type = 'withdrawal_reserve'
    AND le.debit_owner_id = v_request.user_id
    AND le.credit_owner_id = v_request.user_id
    AND le.debit_account = (le.metadata ->> 'role') || '_wallet'
    AND le.credit_account = 'withdrawal_reserve'
    AND le.amount = v_request.amount;
  IF v_reserve_entry IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.user_id = v_request.user_id
      AND wt.type::text = 'debit'
      AND wt.source = 'withdrawal_reserve'
      AND wt.reference_id = p_request_id
      AND wt.amount = v_request.amount
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'verified withdrawal reservation evidence is missing';
  END IF;

  IF v_role = 'merchant' THEN
    SELECT mp.id, COALESCE(mp.wallet_balance, 0)
    INTO v_profile_id, v_balance
    FROM public.merchant_profiles mp
    WHERE mp.id = v_profile_id AND mp.user_id = v_request.user_id
    FOR UPDATE;
  ELSIF v_role = 'delivery' THEN
    SELECT dp.id, COALESCE(dp.wallet_balance, 0)
    INTO v_profile_id, v_balance
    FROM public.delivery_profiles dp
    WHERE dp.id = v_profile_id AND dp.user_id = v_request.user_id
    FOR UPDATE;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'withdrawal requester role is invalid';
  END IF;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'withdrawal requester profile is missing';
  END IF;

  IF v_target IN ('rejected','failed') THEN
    PERFORM set_config('app.marketplace_operation', '1', true);
    IF v_role = 'merchant' THEN
      UPDATE public.merchant_profiles mp
      SET wallet_balance = COALESCE(mp.wallet_balance, 0) + v_request.amount
      WHERE mp.id = v_profile_id
      RETURNING mp.wallet_balance INTO v_balance;
    ELSE
      UPDATE public.delivery_profiles dp
      SET wallet_balance = COALESCE(dp.wallet_balance, 0) + v_request.amount
      WHERE dp.id = v_profile_id
      RETURNING dp.wallet_balance INTO v_balance;
    END IF;
    PERFORM set_config('app.marketplace_operation', '0', true);

    INSERT INTO public.wallet_transactions (
      user_id, type, amount, source, reference_id, balance_after, notes
    ) VALUES (
      v_request.user_id, 'credit', v_request.amount, 'withdrawal_release',
      p_request_id, v_balance, 'Withdrawal reservation released: ' || v_target
    ) ON CONFLICT (user_id, source, reference_id, type)
        WHERE source IS NOT NULL AND reference_id IS NOT NULL DO NOTHING;

    INSERT INTO public.marketplace_ledger_entries (
      operation_key, order_id, entry_type, debit_account, debit_owner_id,
      credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
    ) VALUES (
      'withdrawal:' || p_request_id::text || ':release', NULL,
      'withdrawal_release', 'withdrawal_reserve', v_request.user_id,
      v_role || '_wallet', v_request.user_id, v_request.amount,
      v_reserve_entry,
      jsonb_build_object('withdrawal_id', p_request_id, 'terminal_status', v_target),
      v_actor
    ) ON CONFLICT (operation_key) DO NOTHING;
  ELSIF v_target = 'paid' THEN
    INSERT INTO public.marketplace_ledger_entries (
      operation_key, order_id, entry_type, debit_account, debit_owner_id,
      credit_account, credit_owner_id, amount, reversal_of, metadata, created_by
    ) VALUES (
      'withdrawal:' || p_request_id::text || ':paid', NULL,
      'withdrawal_payment', 'withdrawal_reserve', v_request.user_id,
      'external_payout', v_request.user_id, v_request.amount, NULL,
      jsonb_build_object(
        'withdrawal_id', p_request_id,
        'external_reference', v_external_reference,
        'payout_destination', v_request.payout_destination,
        'reserve_entry_id', v_reserve_entry
      ),
      v_actor
    ) ON CONFLICT (operation_key) DO NOTHING;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = v_target,
      admin_notes = CASE
        WHEN v_notes IS NULL THEN admin_notes
        ELSE concat_ws(E'\n', NULLIF(admin_notes, ''), '[' || v_target || '] ' || v_notes)
      END,
      processed_by = v_actor,
      processed_at = now(),
      external_reference = CASE WHEN v_target = 'paid' THEN v_external_reference ELSE external_reference END,
      paid_at = CASE WHEN v_target = 'paid' THEN now() ELSE paid_at END,
      released_at = CASE WHEN v_target IN ('rejected','failed') THEN now() ELSE released_at END,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'withdrawal_status_changed',
    'withdrawal_request',
    p_request_id,
    jsonb_build_object(
      'from_status', v_old_status,
      'to_status', v_target,
      'amount', v_request.amount,
      'notes', v_notes,
      'external_reference', v_external_reference,
      'balance_after_release', CASE WHEN v_target IN ('rejected','failed') THEN v_balance ELSE NULL END
    )
  );

  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_request.user_id,
    'تحديث طلب السحب',
    CASE v_target
      WHEN 'approved' THEN 'تم اعتماد طلب السحب وحجز المبلغ ما زال قائمًا.'
      WHEN 'processing' THEN 'بدأ تنفيذ تحويل طلب السحب.'
      WHEN 'paid' THEN 'تم تسجيل دفع طلب السحب بالمرجع المعتمد.'
      WHEN 'rejected' THEN 'تم رفض طلب السحب وإعادة المبلغ إلى الرصيد المتاح.'
      ELSE 'فشل التحويل وأعيد المبلغ إلى الرصيد المتاح.'
    END,
    'withdrawal_update',
    jsonb_build_object('withdrawal_request_id', p_request_id, 'status', v_target),
    false,
    'in_app'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Support RPCs. Ticket creation, first message, state, notification, and audit
-- are one transaction. Direct table writes are intentionally unavailable.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_subject text,
  p_category text,
  p_message text,
  p_order_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_category text := btrim(COALESCE(p_category, ''));
  v_message text := btrim(COALESCE(p_message, ''));
  v_role text;
  v_actor_active boolean;
  v_actor_blocked boolean;
  v_is_admin boolean := false;
  v_ticket_id uuid;
  v_message_id uuid;
  v_is_order_participant boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  SELECT u.role::text, COALESCE(u.is_active, true),
         public.is_user_blocked(u.id)
  INTO v_role, v_actor_active, v_actor_blocked
  FROM public.users u WHERE u.id = v_actor;
  IF NOT FOUND OR NOT v_actor_active OR v_actor_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to create support tickets';
  END IF;
  v_is_admin := v_role = 'admin';

  IF length(v_subject) < 3 OR length(v_subject) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support subject must be between 3 and 200 characters';
  END IF;
  IF length(v_message) < 1 OR length(v_message) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support message must be between 1 and 5000 characters';
  END IF;
  IF v_category NOT IN ('technical','payment','delivery','order','order_complaint','general','account','other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid support category';
  END IF;
  IF v_category = 'order_complaint' AND p_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'order complaint requires an order';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = p_order_id
        AND (
          o.customer_id = v_actor
          OR EXISTS (
            SELECT 1 FROM public.merchant_profiles mp
            WHERE mp.id = o.merchant_id AND mp.user_id = v_actor
          )
          OR EXISTS (
            SELECT 1 FROM public.delivery_profiles dp
            WHERE dp.id = o.delivery_id AND dp.user_id = v_actor
          )
          OR v_is_admin
        )
    ) INTO v_is_order_participant;
    IF NOT v_is_order_participant THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support order is not related to the requester';
    END IF;
  END IF;

  -- The public contract predates an explicit idempotency parameter. Collapse an
  -- immediate exact retry while still allowing a later intentional new ticket.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'support-create:' || v_actor::text || ':' || md5(concat_ws(
      E'\x1f', v_subject, v_category, COALESCE(p_order_id::text, ''), v_message
    )),
    0
  ));
  SELECT st.id INTO v_ticket_id
  FROM public.support_tickets st
  WHERE st.user_id = v_actor
    AND st.subject = v_subject
    AND st.category = v_category
    AND st.order_id IS NOT DISTINCT FROM p_order_id
    AND st.message = v_message
    AND st.created_at >= now() - interval '2 minutes'
  ORDER BY st.created_at DESC, st.id DESC
  LIMIT 1;
  IF v_ticket_id IS NOT NULL THEN
    RETURN v_ticket_id;
  END IF;

  INSERT INTO public.support_tickets (
    user_id, order_id, subject, category, status, priority, message,
    created_at, updated_at, last_message_at, last_message_by
  ) VALUES (
    v_actor, p_order_id, v_subject, v_category, 'open', 'medium', v_message,
    now(), now(), now(), v_actor
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO public.support_messages (
    ticket_id, sender_id, message, attachments, is_internal, created_at
  ) VALUES (
    v_ticket_id, v_actor, v_message, '[]'::jsonb, false, now()
  ) RETURNING id INTO v_message_id;

  UPDATE public.support_tickets
  SET last_message_at = (SELECT sm.created_at FROM public.support_messages sm WHERE sm.id = v_message_id),
      last_message_by = v_actor,
      updated_at = now()
  WHERE id = v_ticket_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'support_ticket_created',
    'support_ticket',
    v_ticket_id,
    jsonb_build_object('category', v_category, 'order_id', p_order_id, 'initial_message_id', v_message_id)
  );

  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  SELECT u.id,
         'تذكرة دعم جديدة',
         v_subject,
         'support_ticket_created',
         jsonb_build_object('ticket_id', v_ticket_id, 'order_id', p_order_id),
         false,
         'in_app'
  FROM public.users u
  WHERE u.role = 'admin' AND u.id <> v_actor
    AND COALESCE(u.is_active, true)
    AND NOT public.is_user_blocked(u.id);

  RETURN v_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_support_ticket(
  p_ticket_id uuid,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_message text := btrim(COALESCE(p_message, ''));
  v_role text;
  v_actor_active boolean;
  v_actor_blocked boolean;
  v_is_admin boolean := false;
  v_ticket public.support_tickets%ROWTYPE;
  v_message_id uuid;
  v_next_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication required';
  END IF;
  SELECT u.role::text, COALESCE(u.is_active, true),
         public.is_user_blocked(u.id)
  INTO v_role, v_actor_active, v_actor_blocked
  FROM public.users u WHERE u.id = v_actor;
  IF NOT FOUND OR NOT v_actor_active OR v_actor_blocked THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'account is not allowed to reply to support';
  END IF;
  v_is_admin := v_role = 'admin';
  IF length(v_message) < 1 OR length(v_message) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support reply must be between 1 and 5000 characters';
  END IF;

  SELECT st.* INTO v_ticket
  FROM public.support_tickets st
  WHERE st.id = p_ticket_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'support ticket not found';
  END IF;
  IF NOT v_is_admin AND v_ticket.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not a support ticket participant';
  END IF;
  -- Network retries of the same reply return the recent message rather than
  -- duplicating it. A later intentional identical reply remains possible.
  SELECT sm.id INTO v_message_id
  FROM public.support_messages sm
  WHERE sm.ticket_id = p_ticket_id
    AND sm.sender_id = v_actor
    AND sm.message = v_message
    AND sm.created_at >= now() - interval '2 minutes'
  ORDER BY sm.created_at DESC, sm.id DESC
  LIMIT 1;
  IF v_message_id IS NOT NULL THEN
    RETURN v_message_id;
  END IF;
  IF v_ticket.status = 'closed' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'closed support ticket cannot receive replies';
  END IF;

  INSERT INTO public.support_messages (
    ticket_id, sender_id, message, attachments, is_internal, created_at
  ) VALUES (
    p_ticket_id, v_actor, v_message, '[]'::jsonb, false, now()
  ) RETURNING id INTO v_message_id;

  v_next_status := CASE WHEN v_is_admin THEN 'waiting_user' ELSE 'in_progress' END;
  UPDATE public.support_tickets
  SET status = v_next_status,
      assigned_to = CASE WHEN v_is_admin THEN COALESCE(assigned_to, v_actor) ELSE assigned_to END,
      resolved_at = NULL,
      last_message_at = now(),
      last_message_by = v_actor,
      updated_at = now()
  WHERE id = p_ticket_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    CASE WHEN v_is_admin THEN 'support_admin_replied' ELSE 'support_requester_replied' END,
    'support_ticket',
    p_ticket_id,
    jsonb_build_object('message_id', v_message_id, 'from_status', v_ticket.status, 'to_status', v_next_status)
  );

  IF v_is_admin THEN
    INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
    VALUES (
      v_ticket.user_id,
      'رد جديد من الدعم',
      'أضاف فريق الدعم ردًا جديدًا على تذكرتك.',
      'support_reply',
      jsonb_build_object('ticket_id', p_ticket_id, 'message_id', v_message_id),
      false,
      'in_app'
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
    SELECT u.id,
           'رد جديد على تذكرة الدعم',
           v_ticket.subject,
           'support_requester_reply',
           jsonb_build_object('ticket_id', p_ticket_id, 'message_id', v_message_id),
           false,
           'in_app'
    FROM public.users u
    WHERE u.role = 'admin' AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id);
  END IF;

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status(
  p_ticket_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_target text := btrim(COALESCE(p_status, ''));
  v_ticket public.support_tickets%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF v_target NOT IN ('open','in_progress','waiting_user','resolved','closed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid support status';
  END IF;

  SELECT st.* INTO v_ticket
  FROM public.support_tickets st
  WHERE st.id = p_ticket_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'support ticket not found';
  END IF;
  IF v_ticket.status = v_target THEN
    RETURN;
  END IF;
  IF NOT (
    (v_ticket.status = 'open' AND v_target IN ('in_progress','waiting_user','resolved','closed'))
    OR (v_ticket.status = 'in_progress' AND v_target IN ('waiting_user','resolved','closed'))
    OR (v_ticket.status = 'waiting_user' AND v_target IN ('in_progress','resolved','closed'))
    OR (v_ticket.status = 'resolved' AND v_target IN ('in_progress','closed'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'illegal support transition: ' || v_ticket.status || ' -> ' || v_target;
  END IF;

  UPDATE public.support_tickets
  SET status = v_target,
      assigned_to = COALESCE(assigned_to, v_actor),
      resolved_at = CASE WHEN v_target IN ('resolved','closed') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_ticket_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'support_status_changed',
    'support_ticket',
    p_ticket_id,
    jsonb_build_object('from_status', v_ticket.status, 'to_status', v_target)
  );

  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_ticket.user_id,
    'تحديث تذكرة الدعم',
    'تغيرت حالة تذكرة الدعم إلى ' || v_target || '.',
    'support_status',
    jsonb_build_object('ticket_id', p_ticket_id, 'status', v_target),
    false,
    'in_app'
  );
END;
$$;

-- Admin refund listing is separated from participant table grants so customers
-- and merchants never need SELECT privilege on protected decision columns.
CREATE OR REPLACE FUNCTION public.admin_list_refund_requests()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', r.id,
    'order_id', r.order_id,
    'customer_id', r.customer_id,
    'reason', r.reason,
    'description', r.description,
    'evidence_images', r.evidence_images,
    'refund_amount', r.refund_amount,
    'refund_method', r.refund_method,
    'status', r.status,
    'merchant_response', r.merchant_response,
    'merchant_responded_at', r.merchant_responded_at,
    'decision_reason', r.decision_reason,
    'admin_notes', r.admin_notes,
    'processed_by', r.processed_by,
    'processed_at', r.processed_at,
    'external_reference', r.external_reference,
    'reversal_amount', r.reversal_amount,
    'reversal_applied_at', r.reversal_applied_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'users', jsonb_build_object('full_name', cu.full_name, 'phone', cu.phone),
    'orders', jsonb_build_object(
      'order_number', o.order_number,
      'total_amount', o.total_amount,
      'payment_method', o.payment_method,
      'payment_status', o.payment_status,
      'delivered_at', o.delivered_at,
      'merchant_profiles', jsonb_build_object('store_name', mp.store_name),
      'order_items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'product_name', oi.product_name,
          'variant_details', oi.variant_details,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price
        ) ORDER BY oi.id)
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), '[]'::jsonb)
    )
  )
  FROM public.refund_requests r
  JOIN public.orders o ON o.id = r.order_id
  JOIN public.users cu ON cu.id = r.customer_id
  JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  ORDER BY r.created_at DESC, r.id DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- Administrative application and operational controls.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_merchant_application(
  p_profile_id uuid,
  p_approved boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_profile public.merchant_profiles%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_approved IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant review decision is required';
  END IF;
  IF NOT p_approved AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant rejection reason is required';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant review reason is too long';
  END IF;

  SELECT mp.* INTO v_profile
  FROM public.merchant_profiles mp
  WHERE mp.id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'merchant profile not found';
  END IF;
  IF v_profile.approval_reviewed_at IS NOT NULL
     AND v_profile.is_approved IS NOT DISTINCT FROM p_approved
     AND (p_approved OR v_profile.approval_review_reason IS NOT DISTINCT FROM v_reason) THEN
    RETURN;
  END IF;

  UPDATE public.merchant_profiles
  SET is_approved = p_approved,
      is_active = CASE WHEN p_approved THEN true ELSE false END,
      is_open = CASE WHEN p_approved THEN is_open ELSE false END,
      pause_reason = CASE WHEN p_approved THEN NULL ELSE v_reason END,
      approval_reviewed_at = now(),
      approval_reviewed_by = v_actor,
      approval_review_reason = v_reason
  WHERE id = p_profile_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'merchant_application_reviewed',
    'merchant_profile',
    p_profile_id,
    jsonb_build_object('from_approved', v_profile.is_approved, 'approved', p_approved, 'reason', v_reason)
  );
  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_profile.user_id,
    CASE WHEN p_approved THEN 'تم قبول المتجر' ELSE 'تعذر قبول المتجر' END,
    CASE WHEN p_approved THEN 'أصبح حساب المتجر معتمدًا.' ELSE COALESCE(v_reason, 'تم رفض طلب المتجر.') END,
    'merchant_review',
    jsonb_build_object('merchant_profile_id', p_profile_id, 'approved', p_approved),
    false,
    'in_app'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_merchant_operational_status(
  p_profile_id uuid,
  p_active boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_profile public.merchant_profiles%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant operational status is required';
  END IF;
  IF NOT p_active AND v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant pause reason is required';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'merchant pause reason is too long';
  END IF;

  SELECT mp.* INTO v_profile
  FROM public.merchant_profiles mp
  WHERE mp.id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'merchant profile not found';
  END IF;
  IF p_active AND NOT COALESCE(v_profile.is_approved, false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unapproved merchant cannot be activated';
  END IF;
  IF p_active AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_profile.user_id
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'inactive or blocked merchant account cannot be activated';
  END IF;
  IF v_profile.is_active IS NOT DISTINCT FROM p_active
     AND (p_active OR v_profile.pause_reason IS NOT DISTINCT FROM v_reason) THEN
    RETURN;
  END IF;

  UPDATE public.merchant_profiles
  SET is_active = p_active,
      is_open = CASE WHEN p_active THEN is_open ELSE false END,
      pause_reason = CASE WHEN p_active THEN NULL ELSE v_reason END
  WHERE id = p_profile_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'merchant_operational_status_changed',
    'merchant_profile',
    p_profile_id,
    jsonb_build_object('from_active', v_profile.is_active, 'active', p_active, 'reason', v_reason)
  );
  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_profile.user_id,
    CASE WHEN p_active THEN 'تم تفعيل المتجر' ELSE 'تم إيقاف المتجر مؤقتًا' END,
    CASE WHEN p_active THEN 'أصبح المتجر فعالًا مجددًا.' ELSE v_reason END,
    'merchant_operational_status',
    jsonb_build_object('merchant_profile_id', p_profile_id, 'active', p_active),
    false,
    'in_app'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_delivery_application(
  p_profile_id uuid,
  p_approved boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_profile public.delivery_profiles%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_approved IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery review decision is required';
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
  IF v_profile.approval_reviewed_at IS NOT NULL
     AND v_profile.is_approved IS NOT DISTINCT FROM p_approved
     AND (p_approved OR v_profile.approval_review_reason IS NOT DISTINCT FROM v_reason) THEN
    RETURN;
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
    jsonb_build_object('from_approved', v_profile.is_approved, 'approved', p_approved, 'reason', v_reason)
  );
  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_profile.user_id,
    CASE WHEN p_approved THEN 'تم قبول حساب التوصيل' ELSE 'تعذر قبول حساب التوصيل' END,
    CASE WHEN p_approved THEN 'أصبح حساب التوصيل معتمدًا.' ELSE COALESCE(v_reason, 'تم رفض طلب التوصيل.') END,
    'delivery_review',
    jsonb_build_object('delivery_profile_id', p_profile_id, 'approved', p_approved),
    false,
    'in_app'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_delivery_online(
  p_profile_id uuid,
  p_online boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_admin boolean := false;
  v_profile public.delivery_profiles%ROWTYPE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_online IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'delivery online status is required';
  END IF;

  SELECT dp.* INTO v_profile
  FROM public.delivery_profiles dp
  WHERE dp.id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'delivery profile not found';
  END IF;
  IF p_online AND NOT COALESCE(v_profile.is_approved, false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unapproved delivery profile cannot go online';
  END IF;
  IF p_online AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_profile.user_id
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'inactive or blocked delivery account cannot go online';
  END IF;
  IF v_profile.is_online IS NOT DISTINCT FROM p_online THEN
    RETURN;
  END IF;

  UPDATE public.delivery_profiles SET is_online = p_online WHERE id = p_profile_id;
  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'delivery_online_status_changed',
    'delivery_profile',
    p_profile_id,
    jsonb_build_object('from_online', v_profile.is_online, 'online', p_online)
  );
  INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
  VALUES (
    v_profile.user_id,
    'تحديث حالة استقبال الطلبات',
    CASE WHEN p_online THEN 'فعّلت الإدارة استقبال طلبات التوصيل.' ELSE 'أوقفت الإدارة استقبال طلبات التوصيل.' END,
    'delivery_online_status',
    jsonb_build_object('delivery_profile_id', p_profile_id, 'online', p_online),
    false,
    'in_app'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Idempotent broadcast campaign. One campaign and one notification per matched
-- active recipient are committed together.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_broadcast_campaign(
  p_title text,
  p_body text,
  p_role text,
  p_channel text,
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
  v_title text := btrim(COALESCE(p_title, ''));
  v_body text := btrim(COALESCE(p_body, ''));
  v_role text := NULLIF(btrim(p_role), '');
  v_channel text := COALESCE(NULLIF(btrim(p_channel), ''), 'in_app');
  v_hash text;
  v_campaign public.broadcast_notifications%ROWTYPE;
  v_campaign_id uuid := gen_random_uuid();
  v_matched integer := 0;
  v_created integer := 0;
  v_push_queued integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_actor AND u.role = 'admin'
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ) INTO v_is_admin;
  IF v_actor IS NULL OR NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'broadcast idempotency key is required';
  END IF;
  IF length(v_title) < 1 OR length(v_title) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'broadcast title must be between 1 and 100 characters';
  END IF;
  IF length(v_body) < 1 OR length(v_body) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'broadcast body must be between 1 and 1000 characters';
  END IF;
  IF v_role IS NOT NULL AND v_role NOT IN ('customer','merchant','delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid broadcast audience';
  END IF;
  IF v_channel NOT IN ('in_app','push') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid broadcast channel';
  END IF;

  v_hash := md5(concat_ws(E'\x1f', v_title, v_body, COALESCE(v_role, 'all'), v_channel));

  INSERT INTO public.broadcast_notifications (
    id, title, body, target_audience, status, sent_at, created_by,
    idempotency_key, request_hash, channel
  ) VALUES (
    v_campaign_id, v_title, v_body, COALESCE(v_role, 'all'), 'processing', now(), v_actor,
    p_idempotency_key, v_hash, v_channel
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING * INTO v_campaign;

  IF v_campaign.id IS NULL THEN
    SELECT b.* INTO v_campaign
    FROM public.broadcast_notifications b
    WHERE b.idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF v_campaign.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'broadcast idempotency key was reused with another payload';
    END IF;
    RETURN jsonb_build_object(
      'campaign_id', v_campaign.id,
      'matched', v_campaign.matched_count,
      'created', v_campaign.created_count,
      'push_queued', v_campaign.push_queued_count
    );
  END IF;

  WITH recipients AS MATERIALIZED (
    SELECT u.id
    FROM public.users u
    WHERE u.role IN ('customer','merchant','delivery')
      AND (v_role IS NULL OR u.role::text = v_role)
      AND COALESCE(u.is_active, true)
      AND NOT public.is_user_blocked(u.id)
  ), inserted AS (
    INSERT INTO public.notifications (
      user_id, title, body, type, data, is_read, channel, broadcast_id
    )
    SELECT r.id,
           v_title,
           v_body,
           'broadcast',
           jsonb_build_object('campaign_id', v_campaign.id, 'audience', COALESCE(v_role, 'all')),
           false,
           v_channel,
           v_campaign.id
    FROM recipients r
    ON CONFLICT (broadcast_id, user_id) WHERE broadcast_id IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM recipients), (SELECT count(*) FROM inserted)
  INTO v_matched, v_created;

  v_push_queued := CASE WHEN v_channel = 'push' THEN v_created ELSE 0 END;
  UPDATE public.broadcast_notifications
  SET status = 'sent',
      matched_count = v_matched,
      created_count = v_created,
      push_queued_count = v_push_queued,
      completed_at = now(),
      sent_at = now()
  WHERE id = v_campaign.id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'broadcast_campaign_created',
    'broadcast_notification',
    v_campaign.id,
    jsonb_build_object(
      'audience', COALESCE(v_role, 'all'),
      'channel', v_channel,
      'matched', v_matched,
      'created', v_created,
      'push_queued', v_push_queued,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object(
    'campaign_id', v_campaign.id,
    'matched', v_matched,
    'created', v_created,
    'push_queued', v_push_queued
  );
END;
$$;

-- Replace the legacy trigger with a safe search path and navigable payloads.
CREATE OR REPLACE FUNCTION public.notify_refund_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_merchant_user uuid;
  v_order_number text;
BEGIN
  SELECT mp.user_id, o.order_number
  INTO v_merchant_user, v_order_number
  FROM public.orders o
  JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
  WHERE o.id = NEW.order_id;

  IF TG_OP = 'INSERT' THEN
    IF v_merchant_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
      VALUES (
        v_merchant_user,
        'طلب استرداد جديد',
        'يوجد طلب استرداد للطلب ' || COALESCE(v_order_number, ''),
        'refund_request',
        jsonb_build_object('refund_request_id', NEW.id, 'order_id', NEW.order_id),
        false,
        'in_app'
      );
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, title, body, type, data, is_read, channel)
    SELECT participant_id,
           'تحديث طلب الاسترداد',
           CASE
             WHEN NEW.status = 'rejected' AND NEW.decision_reason IS NOT NULL
               THEN 'تم رفض طلب الاسترداد للطلب ' || COALESCE(v_order_number, '') || ': ' || NEW.decision_reason
             ELSE 'تم تحديث طلب الاسترداد للطلب ' || COALESCE(v_order_number, '') || ' إلى: ' || NEW.status
           END,
           'refund_update',
           jsonb_build_object('refund_request_id', NEW.id, 'order_id', NEW.order_id, 'status', NEW.status),
           false,
           'in_app'
    FROM (VALUES (NEW.customer_id), (v_merchant_user)) participants(participant_id)
    WHERE participant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges. Postgres grants PUBLIC execute by default; remove it
-- explicitly and expose only the authenticated API surface.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_refund_request(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_refund_request(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_refund_request(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_withdrawal_request(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_support_ticket(text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reply_support_ticket(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_support_ticket_status(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_refund_requests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_merchant_application(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_merchant_operational_status(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_delivery_application(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_delivery_online(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_broadcast_campaign(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_refund_participants() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_refund_request(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_refund_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund_request(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_request(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_support_ticket(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_refund_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_merchant_application(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_merchant_operational_status(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_delivery_application(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_delivery_online(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_broadcast_campaign(text,text,text,text,uuid) TO authenticated;
