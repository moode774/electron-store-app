-- Evidence-backed recovery for historical delivered orders that never received
-- an immutable settlement.  Nothing is inferred or backfilled automatically:
-- an active admin must explicitly confirm the delivery timestamp, every money
-- component, whether operational counters were already counted, and the source
-- evidence.  Any sign of a partial financial write fails closed for forensic
-- review instead of risking a second wallet credit.

CREATE TABLE IF NOT EXISTS public.legacy_order_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  settlement_id uuid UNIQUE REFERENCES public.order_settlements(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','completed')),
  confirmed_order_number text NOT NULL,
  confirmed_delivered_at timestamptz NOT NULL,
  gross_amount numeric NOT NULL CHECK (gross_amount >= 0),
  merchant_proceeds numeric NOT NULL CHECK (merchant_proceeds >= 0),
  delivery_earning numeric NOT NULL CHECK (delivery_earning >= 0),
  platform_commission numeric NOT NULL CHECK (platform_commission >= 0),
  tax_amount numeric NOT NULL CHECK (tax_amount >= 0),
  platform_amount numeric NOT NULL CHECK (platform_amount >= 0),
  stats_state text NOT NULL
    CHECK (stats_state IN ('already_counted','not_counted')),
  cod_custody_requires_review boolean NOT NULL DEFAULT false,
  evidence_reference text NOT NULL CHECK (
    length(btrim(evidence_reference)) BETWEEN 5 AND 1000
  ),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 2000),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (length(request_hash) = 32),
  reconciled_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT legacy_order_reconciliation_balance_check CHECK (
    abs(
      gross_amount
      - merchant_proceeds
      - delivery_earning
      - platform_amount
    ) <= 0.01
    AND abs(platform_amount - platform_commission - tax_amount) <= 0.01
  ),
  CONSTRAINT legacy_order_reconciliation_completion_check CHECK (
    (status = 'processing' AND settlement_id IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND settlement_id IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS legacy_order_reconciliations_admin_queue_idx
  ON public.legacy_order_reconciliations(status, created_at DESC);

ALTER TABLE public.legacy_order_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legacy_order_reconciliations_admin_select
  ON public.legacy_order_reconciliations;
CREATE POLICY legacy_order_reconciliations_admin_select
ON public.legacy_order_reconciliations
FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

REVOKE ALL PRIVILEGES ON TABLE public.legacy_order_reconciliations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.legacy_order_reconciliations TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.legacy_order_reconciliations TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_legacy_financial_reconciliation()
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
  WITH candidates AS (
    SELECT
      o.*,
      mp.store_name,
      mp.user_id AS merchant_user_id,
      dp.user_id AS delivery_user_id,
      du.full_name AS delivery_name,
      cu.role::text AS customer_role,
      mu.role::text AS merchant_user_role,
      du.role::text AS delivery_user_role,
      round(
        COALESCE(o.subtotal, 0)
          - COALESCE(o.discount_amount, 0)
          - COALESCE(o.platform_commission, 0),
        2
      ) AS expected_merchant_proceeds,
      round(COALESCE(o.delivery_fee, 0), 2) AS expected_delivery_earning,
      round(
        COALESCE(o.platform_commission, 0) + COALESCE(o.tax_amount, 0),
        2
      ) AS expected_platform_amount,
      EXISTS (
        SELECT 1 FROM public.wallet_transactions wt
        WHERE wt.reference_id = o.id
      ) AS has_wallet_transactions,
      EXISTS (
        SELECT 1 FROM public.delivery_earnings de
        WHERE de.order_id = o.id
      ) AS has_delivery_earning,
      EXISTS (
        SELECT 1 FROM public.marketplace_ledger_entries le
        WHERE le.order_id = o.id
      ) AS has_ledger_entries,
      EXISTS (
        SELECT 1 FROM public.delivery_cod_collections cc
        WHERE cc.order_id = o.id
      ) AS has_cod_collection,
      EXISTS (
        SELECT 1 FROM public.refund_requests refund
        WHERE refund.order_id = o.id
          AND (
            refund.status::text = 'completed'
            OR COALESCE(refund.reversal_amount, 0) > 0
            OR refund.reversal_applied_at IS NOT NULL
          )
      ) AS has_completed_refund_or_reversal,
      EXISTS (
        SELECT 1 FROM public.refund_requests refund
        WHERE refund.order_id = o.id
          AND refund.status::text IN ('pending','approved','processing')
      ) AS has_active_refund,
      EXISTS (
        SELECT 1 FROM public.return_requests physical_return
        WHERE physical_return.order_id = o.id
          AND physical_return.status IN (
            'requested','approved','pickup_scheduled','picked_up','received','inspected'
          )
      ) AS has_active_physical_return
    FROM public.orders o
    LEFT JOIN public.order_settlements os ON os.order_id = o.id
    LEFT JOIN public.merchant_profiles mp ON mp.id = o.merchant_id
    LEFT JOIN public.delivery_profiles dp ON dp.id = o.delivery_id
    LEFT JOIN public.users cu ON cu.id = o.customer_id
    LEFT JOIN public.users mu ON mu.id = mp.user_id
    LEFT JOIN public.users du ON du.id = dp.user_id
    WHERE o.status::text = 'delivered'
      AND os.id IS NULL
  ), evaluated AS (
    SELECT
      c.*,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN c.created_at >= timestamptz '2026-07-13 00:00:00+00'
          THEN 'new_order_requires_incident_investigation' END,
        CASE WHEN c.delivery_id IS NULL OR c.delivery_user_id IS NULL
          THEN 'delivery_assignment_missing' END,
        CASE WHEN c.merchant_user_id IS NULL THEN 'merchant_profile_missing' END,
        CASE WHEN c.customer_role IS DISTINCT FROM 'customer'
          THEN 'customer_role_relationship_invalid' END,
        CASE WHEN c.merchant_user_role IS DISTINCT FROM 'merchant'
          THEN 'merchant_role_relationship_invalid' END,
        CASE WHEN c.delivery_user_role IS DISTINCT FROM 'delivery'
          THEN 'delivery_role_relationship_invalid' END,
        CASE WHEN c.payment_status::text = 'refunded'
          THEN 'order_payment_already_refunded' END,
        CASE WHEN c.has_completed_refund_or_reversal
          THEN 'completed_refund_or_reversal_exists' END,
        CASE WHEN c.settled_at IS NOT NULL THEN 'settled_timestamp_without_settlement' END,
        CASE WHEN c.has_wallet_transactions THEN 'wallet_transactions_already_exist' END,
        CASE WHEN c.has_delivery_earning THEN 'delivery_earning_already_exists' END,
        CASE WHEN c.has_ledger_entries THEN 'ledger_entries_already_exist' END,
        CASE WHEN c.has_cod_collection THEN 'cod_collection_already_exists' END,
        CASE WHEN c.expected_merchant_proceeds < 0
          OR c.expected_delivery_earning < 0
          OR c.expected_platform_amount < 0
          OR abs(
            COALESCE(c.total_amount, 0)
              - c.expected_merchant_proceeds
              - c.expected_delivery_earning
              - c.expected_platform_amount
          ) > 0.01
          THEN 'order_financial_components_unbalanced' END
      ], NULL)::text[] AS conflict_reasons
    FROM candidates c
  )
  SELECT jsonb_build_object(
    'order_id', e.id,
    'order_number', e.order_number,
    'customer_id', e.customer_id,
    'merchant_id', e.merchant_id,
    'merchant_name', e.store_name,
    'delivery_id', e.delivery_id,
    'delivery_name', e.delivery_name,
    'status', e.status,
    'payment_method', e.payment_method,
    'payment_status', e.payment_status,
    'created_at', e.created_at,
    'stored_delivered_at', e.delivered_at,
    'gross_amount', round(COALESCE(e.total_amount, 0), 2),
    'merchant_proceeds', e.expected_merchant_proceeds,
    'delivery_earning', e.expected_delivery_earning,
    'platform_commission', round(COALESCE(e.platform_commission, 0), 2),
    'tax_amount', round(COALESCE(e.tax_amount, 0), 2),
    'platform_amount', e.expected_platform_amount,
    'stored_stats_counted', COALESCE(e.stats_counted, false),
    'has_active_refund', e.has_active_refund,
    'has_active_physical_return', e.has_active_physical_return,
    'has_completed_refund_or_reversal', e.has_completed_refund_or_reversal,
    'cod_custody_requires_review',
      lower(COALESCE(e.payment_method::text, 'cash')) IN ('cash','cod')
      AND COALESCE(e.total_amount, 0) > 0,
    'is_reconcilable', cardinality(e.conflict_reasons) = 0,
    'conflict_reasons', to_jsonb(e.conflict_reasons)
  )
  FROM evaluated e
  ORDER BY
    CASE WHEN cardinality(e.conflict_reasons) = 0 THEN 0 ELSE 1 END,
    e.created_at,
    e.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reconcile_legacy_delivered_order(
  p_order_id uuid,
  p_confirm_order_number text,
  p_confirmed_delivered_at timestamptz,
  p_gross_amount numeric,
  p_merchant_proceeds numeric,
  p_delivery_earning numeric,
  p_platform_commission numeric,
  p_tax_amount numeric,
  p_stats_state text,
  p_acknowledge_cod_custody boolean,
  p_evidence_reference text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_order public.orders%ROWTYPE;
  v_existing public.legacy_order_reconciliations%ROWTYPE;
  v_settlement public.order_settlements%ROWTYPE;
  v_reconciliation_id uuid;
  v_settlement_result jsonb;
  v_expected_merchant numeric;
  v_expected_delivery numeric;
  v_platform_amount numeric;
  v_gross numeric := round(COALESCE(p_gross_amount, -1), 2);
  v_merchant numeric := round(COALESCE(p_merchant_proceeds, -1), 2);
  v_delivery numeric := round(COALESCE(p_delivery_earning, -1), 2);
  v_commission numeric := round(COALESCE(p_platform_commission, -1), 2);
  v_tax numeric := round(COALESCE(p_tax_amount, -1), 2);
  v_order_number text := NULLIF(btrim(p_confirm_order_number), '');
  v_stats_state text := lower(NULLIF(btrim(p_stats_state), ''));
  v_evidence text := NULLIF(btrim(p_evidence_reference), '');
  v_reason text := NULLIF(btrim(p_reason), '');
  v_request_hash text;
  v_is_cod boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin authorization required';
  END IF;
  IF p_order_id IS NULL OR p_idempotency_key IS NULL
     OR p_confirmed_delivered_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'order, delivery timestamp and idempotency key are required';
  END IF;
  IF v_order_number IS NULL OR length(v_order_number) > 100
     OR v_stats_state NOT IN ('already_counted','not_counted')
     OR v_evidence IS NULL OR length(v_evidence) NOT BETWEEN 5 AND 1000
     OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'complete confirmation, statistics state, evidence and reason are required';
  END IF;
  IF LEAST(v_gross, v_merchant, v_delivery, v_commission, v_tax) < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reconciliation amounts cannot be negative';
  END IF;
  v_platform_amount := round(v_commission + v_tax, 2);
  IF abs(v_gross - v_merchant - v_delivery - v_platform_amount) > 0.01 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'confirmed reconciliation amounts are not balanced';
  END IF;

  v_request_hash := md5(concat_ws('|',
    p_order_id::text,
    v_order_number,
    p_confirmed_delivered_at::text,
    v_gross::text,
    v_merchant::text,
    v_delivery::text,
    v_commission::text,
    v_tax::text,
    v_stats_state,
    COALESCE(p_acknowledge_cod_custody, false)::text,
    v_evidence,
    v_reason
  ));

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('legacy-order-reconciliation:' || p_order_id::text, 0)
  );

  SELECT r.* INTO v_existing
  FROM public.legacy_order_reconciliations r
  WHERE r.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'reconciliation idempotency key payload conflict';
    END IF;
    RETURN jsonb_build_object(
      'reconciliation_id', v_existing.id,
      'order_id', v_existing.order_id,
      'settlement_id', v_existing.settlement_id,
      'status', v_existing.status,
      'cod_custody_requires_review', v_existing.cod_custody_requires_review,
      'idempotent_replay', true
    );
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'order not found';
  END IF;
  IF v_order.status::text <> 'delivered' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'only delivered orders can be reconciled';
  END IF;
  IF v_order.created_at >= timestamptz '2026-07-13 00:00:00+00' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'new orders require incident investigation, not legacy reconciliation';
  END IF;
  IF v_order.order_number IS DISTINCT FROM v_order_number THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'typed order number does not match';
  END IF;
  IF v_order.delivery_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.delivery_profiles dp
    JOIN public.users du ON du.id = dp.user_id AND du.role::text = 'delivery'
    WHERE dp.id = v_order.delivery_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.merchant_profiles mp
    JOIN public.users mu ON mu.id = mp.user_id AND mu.role::text = 'merchant'
    WHERE mp.id = v_order.merchant_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users cu
    WHERE cu.id = v_order.customer_id AND cu.role::text = 'customer'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'customer, merchant or delivery role relationship is invalid';
  END IF;
  IF v_order.payment_status::text = 'refunded'
     OR EXISTS (
       SELECT 1 FROM public.refund_requests refund
       WHERE refund.order_id = v_order.id
         AND (
           refund.status::text = 'completed'
           OR COALESCE(refund.reversal_amount, 0) > 0
           OR refund.reversal_applied_at IS NOT NULL
         )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'refunded or financially reversed order cannot be settled again';
  END IF;
  IF p_confirmed_delivered_at < v_order.created_at
     OR p_confirmed_delivered_at > now() + interval '5 minutes'
     OR (
       v_order.delivered_at IS NOT NULL
       AND abs(extract(epoch FROM (v_order.delivered_at - p_confirmed_delivered_at))) > 1
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'confirmed delivery timestamp conflicts with the order';
  END IF;

  SELECT s.* INTO v_settlement
  FROM public.order_settlements s
  WHERE s.order_id = v_order.id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'order already has a settlement';
  END IF;
  IF v_order.settled_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference_id = v_order.id)
     OR EXISTS (SELECT 1 FROM public.delivery_earnings de WHERE de.order_id = v_order.id)
     OR EXISTS (SELECT 1 FROM public.marketplace_ledger_entries le WHERE le.order_id = v_order.id)
     OR EXISTS (SELECT 1 FROM public.delivery_cod_collections cc WHERE cc.order_id = v_order.id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'partial financial artifacts exist; forensic review is required before reconciliation';
  END IF;

  v_expected_merchant := round(
    COALESCE(v_order.subtotal, 0)
      - COALESCE(v_order.discount_amount, 0)
      - COALESCE(v_order.platform_commission, 0),
    2
  );
  v_expected_delivery := round(COALESCE(v_order.delivery_fee, 0), 2);
  IF abs(v_gross - round(COALESCE(v_order.total_amount, 0), 2)) > 0.01
     OR abs(v_merchant - v_expected_merchant) > 0.01
     OR abs(v_delivery - v_expected_delivery) > 0.01
     OR abs(v_commission - round(COALESCE(v_order.platform_commission, 0), 2)) > 0.01
     OR abs(v_tax - round(COALESCE(v_order.tax_amount, 0), 2)) > 0.01 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'confirmed amounts do not match the immutable order components';
  END IF;

  v_is_cod := lower(COALESCE(v_order.payment_method::text, 'cash')) IN ('cash','cod')
    AND v_gross > 0;
  IF v_is_cod AND NOT COALESCE(p_acknowledge_cod_custody, false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'COD reconciliation requires explicit custody acknowledgement';
  END IF;

  INSERT INTO public.legacy_order_reconciliations(
    order_id, status, confirmed_order_number, confirmed_delivered_at,
    gross_amount, merchant_proceeds, delivery_earning,
    platform_commission, tax_amount, platform_amount, stats_state,
    cod_custody_requires_review, evidence_reference, reason,
    idempotency_key, request_hash, reconciled_by
  ) VALUES (
    v_order.id, 'processing', v_order_number, p_confirmed_delivered_at,
    v_gross, v_merchant, v_delivery,
    v_commission, v_tax, v_platform_amount, v_stats_state,
    v_is_cod, v_evidence, v_reason,
    p_idempotency_key, v_request_hash, v_actor
  )
  RETURNING id INTO v_reconciliation_id;

  -- These are the only historical fields changed before the normal, once-only
  -- settlement transaction. The statistics flag makes the admin's explicit
  -- evidence decision control whether counters are incremented or preserved.
  UPDATE public.orders
  SET delivered_at = p_confirmed_delivered_at,
      stats_counted = (v_stats_state = 'already_counted')
  WHERE id = v_order.id;

  v_settlement_result := public.marketplace_settle_order_once(
    v_order.id,
    v_actor,
    p_idempotency_key
  );

  UPDATE public.legacy_order_reconciliations
  SET status = 'completed',
      settlement_id = (v_settlement_result ->> 'settlement_id')::uuid,
      completed_at = now()
  WHERE id = v_reconciliation_id
  RETURNING * INTO v_existing;

  INSERT INTO public.admin_activity_logs(
    admin_id, action, target_type, target_id, details
  ) VALUES (
    v_actor,
    'legacy_order_financial_reconciled',
    'order',
    v_order.id,
    jsonb_build_object(
      'reconciliation_id', v_reconciliation_id,
      'settlement_id', v_existing.settlement_id,
      'stats_state', v_stats_state,
      'cod_custody_requires_review', v_is_cod,
      'evidence_reference', v_evidence,
      'reason', v_reason
    )
  );

  INSERT INTO public.notifications(
    user_id, title, body, type, data, is_read, channel, event_key
  )
  SELECT
    recipient.user_id,
    'تمت مطابقة التسوية المالية',
    CASE recipient.role
      WHEN 'merchant' THEN 'تم اعتماد مستحقات طلب قديم بعد مراجعة الإدارة للأدلة.'
      ELSE 'تم اعتماد مستحقات توصيل طلب قديم بعد مراجعة الإدارة للأدلة.'
    END,
    'financial_reconciliation',
    jsonb_build_object(
      'order_id', v_order.id,
      'reconciliation_id', v_reconciliation_id,
      'settlement_id', v_existing.settlement_id,
      'cod_custody_requires_review', v_is_cod
    ),
    false,
    'in_app',
    'legacy-financial-reconciliation:' || v_reconciliation_id::text || ':' || recipient.role
  FROM (
    SELECT mp.user_id, 'merchant'::text AS role
    FROM public.merchant_profiles mp WHERE mp.id = v_order.merchant_id
    UNION ALL
    SELECT dp.user_id, 'delivery'::text
    FROM public.delivery_profiles dp WHERE dp.id = v_order.delivery_id
  ) recipient
  WHERE recipient.user_id IS NOT NULL
  ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

  PERFORM public.marketplace_record_order_event(
    v_order.id,
    'legacy-financial-reconciliation:' || v_reconciliation_id::text,
    'legacy_financial_reconciliation',
    v_actor,
    'admin',
    'delivered',
    'delivered',
    v_reason,
    jsonb_build_object(
      'reconciliation_id', v_reconciliation_id,
      'settlement_id', v_existing.settlement_id,
      'cod_custody_requires_review', v_is_cod
    )
  );

  RETURN jsonb_build_object(
    'reconciliation_id', v_reconciliation_id,
    'order_id', v_order.id,
    'settlement_id', v_existing.settlement_id,
    'status', v_existing.status,
    'cod_custody_requires_review', v_is_cod,
    'settlement', v_settlement_result,
    'idempotent_replay', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_legacy_financial_reconciliation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reconcile_legacy_delivered_order(
  uuid, text, timestamptz, numeric, numeric, numeric, numeric, numeric,
  text, boolean, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_legacy_financial_reconciliation()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_legacy_delivered_order(
  uuid, text, timestamptz, numeric, numeric, numeric, numeric, numeric,
  text, boolean, text, text, uuid
) TO authenticated;
