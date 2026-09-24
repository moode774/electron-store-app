-- Restore correctly encoded Arabic in live function bodies.
--
-- On the live project these 28 functions were applied with their UTF-8
-- Arabic literals mis-decoded as Windows-1256 (e.g. "ط§ظƒطھظ…ظ„" instead of
-- "اكتمل"), so every notification they send (order status, returns, refunds,
-- COD, withdrawals, support, chat) reached users as unreadable text.
--
-- After decoding, each live body was verified byte-for-byte identical to the
-- repository definition, so this migration only re-applies the repository
-- definitions. On a fresh database it is a no-op. CREATE OR REPLACE keeps
-- existing grants.

CREATE OR REPLACE FUNCTION public.admin_complete_return(p_request_id uuid, p_external_reference text, p_notes text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_reconcile_legacy_delivered_order(p_order_id uuid, p_confirm_order_number text, p_confirmed_delivered_at timestamp with time zone, p_gross_amount numeric, p_merchant_proceeds numeric, p_delivery_earning numeric, p_platform_commission numeric, p_tax_amount numeric, p_stats_state text, p_acknowledge_cod_custody boolean, p_evidence_reference text, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_review_cod_remittance(p_submission_id uuid, p_decision text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_review_product(p_product_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_decision text := lower(btrim(COALESCE(p_decision, '')));
  v_note text := NULLIF(btrim(p_note), '');
  v_product public.products%ROWTYPE;
  v_merchant_user uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin only';
  END IF;
  IF v_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'decision must be approved or rejected';
  END IF;
  IF v_decision = 'rejected' AND (v_note IS NULL OR length(v_note) < 3) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rejection reason is required';
  END IF;
  IF length(COALESCE(v_note, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product review note is too long';
  END IF;

  SELECT p.* INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'product not found';
  END IF;

  IF v_product.approval_status = v_decision
     AND (v_decision = 'approved' OR v_product.approval_note IS NOT DISTINCT FROM v_note) THEN
    RETURN jsonb_build_object(
      'id', v_product.id,
      'approval_status', v_product.approval_status,
      'is_approved', v_product.is_approved,
      'idempotent_replay', true
    );
  END IF;

  SELECT mp.user_id INTO v_merchant_user
  FROM public.merchant_profiles mp
  WHERE mp.id = v_product.merchant_id;
  IF v_merchant_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'product merchant is missing';
  END IF;

  UPDATE public.products
  SET approval_status = v_decision,
      is_approved = (v_decision = 'approved'),
      approved_by = v_actor,
      approved_at = now(),
      approval_note = CASE WHEN v_decision = 'rejected' THEN v_note ELSE NULL END
  WHERE id = p_product_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor,
    'product_' || v_decision,
    'product',
    p_product_id,
    jsonb_build_object(
      'previous_status', v_product.approval_status,
      'decision', v_decision,
      'note', v_note,
      'merchant_id', v_product.merchant_id
    )
  );

  INSERT INTO public.notifications (user_id, title, body, type, channel, data, event_key)
  VALUES (
    v_merchant_user,
    CASE WHEN v_decision = 'approved' THEN 'تم اعتماد المنتج' ELSE 'يحتاج المنتج إلى تعديل' END,
    CASE
      WHEN v_decision = 'approved' THEN 'أصبح منتجك متاحًا للعملاء.'
      ELSE 'راجع سبب الرفض وعدّل المنتج ثم سيعود إلى قائمة المراجعة.'
    END,
    'product_review',
    'in_app',
    jsonb_build_object('product_id', p_product_id, 'status', v_decision, 'reason', v_note),
    'product-review:' || p_product_id::text || ':' || v_decision || ':' || txid_current()::text
  );

  RETURN jsonb_build_object(
    'id', p_product_id,
    'approval_status', v_decision,
    'is_approved', v_decision = 'approved',
    'idempotent_replay', false
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_review_return_request(p_request_id uuid, p_decision text, p_approved_items jsonb, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_schedule_return_pickup(p_request_id uuid, p_delivery_profile_id uuid, p_scheduled_at timestamp with time zone, p_notes text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_cod_collection_dispute(p_collection_id uuid, p_disputed boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_delivery_online(p_profile_id uuid, p_online boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_return_request(p_request_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_refund_request_financial_only(p_order_id uuid, p_reason text, p_description text, p_refund_method text, p_evidence_images jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_return_request(p_order_id uuid, p_items jsonb, p_reason text, p_description text, p_evidence_images jsonb, p_pickup_method text, p_refund_method text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_support_ticket(p_subject text, p_category text, p_message text, p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delivery_update_return_status(p_request_id uuid, p_status text, p_proof_path text, p_latitude numeric, p_longitude numeric, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.inspect_return_request(p_request_id uuid, p_items jsonb, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.marketplace_notify_order_event(p_order_id uuid, p_event_key text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NULLIF(trim(COALESCE(p_event_key, '')), '') IS NULL THEN RETURN; END IF;
  BEGIN
    WITH order_context AS (
      SELECT o.*, mp.user_id AS merchant_user_id, dp.user_id AS delivery_user_id
      FROM public.orders AS o
      LEFT JOIN public.merchant_profiles AS mp ON mp.id = o.merchant_id
      LEFT JOIN public.delivery_profiles AS dp ON dp.id = o.delivery_id
      WHERE o.id = p_order_id
    ), recipients AS (
      SELECT oc.customer_id AS user_id, 'customer'::text AS recipient_role
      FROM order_context AS oc
      UNION
      SELECT oc.merchant_user_id, 'merchant'
      FROM order_context AS oc
      WHERE oc.merchant_user_id IS NOT NULL
        AND p_status IN ('pending', 'assigned', 'delivered', 'cancelled', 'failed_delivery', 'disputed')
      UNION
      SELECT oc.delivery_user_id, 'delivery'
      FROM order_context AS oc
      WHERE oc.delivery_user_id IS NOT NULL
        AND p_status IN ('assigned', 'cancelled', 'failed_delivery', 'rescheduled', 'delivered')
      UNION
      SELECT dp.user_id, 'delivery_offer'
      FROM public.delivery_profiles AS dp
      JOIN public.users AS u ON u.id = dp.user_id
      WHERE p_status = 'ready'
        AND COALESCE(dp.is_approved, false)
        AND COALESCE(dp.is_online, false)
        AND COALESCE(u.is_active, true)
        AND NOT public.is_user_blocked(u.id)
    )
    INSERT INTO public.notifications(user_id, title, body, type, data, event_key, channel)
    SELECT
      r.user_id,
      CASE
        WHEN r.recipient_role = 'merchant' AND p_status = 'pending' THEN 'طلب جديد'
        WHEN r.recipient_role = 'delivery_offer' THEN 'طلب جاهز للتوصيل'
        WHEN p_status = 'preparing' THEN 'جاري تجهيز طلبك'
        WHEN p_status = 'ready' THEN 'طلبك جاهز'
        WHEN p_status = 'assigned' THEN 'تم إسناد مندوب'
        WHEN p_status = 'picked_up' THEN 'استلم المندوب الطلب'
        WHEN p_status = 'on_the_way' THEN 'طلبك في الطريق'
        WHEN p_status = 'delivered' THEN 'تم تسليم الطلب'
        WHEN p_status = 'cancelled' THEN 'تم إلغاء الطلب'
        WHEN p_status = 'failed_delivery' THEN 'تعذر التسليم'
        ELSE 'تحديث على الطلب'
      END,
      CASE
        WHEN r.recipient_role = 'delivery_offer'
          THEN 'يوجد طلب جاهز ومتاح للقبول الآن'
        ELSE 'الطلب رقم ' || oc.order_number || ' حالته الآن: ' || p_status
      END,
      CASE WHEN r.recipient_role = 'delivery_offer' THEN 'delivery_offer' ELSE 'order' END,
      jsonb_build_object('order_id', p_order_id, 'status', p_status),
      p_event_key,
      'push'
    FROM recipients AS r
    CROSS JOIN order_context AS oc
    WHERE r.user_id IS NOT NULL
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Notification transport/data must never turn a committed business
    -- operation into a partially retried order operation.
    RETURN;
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.merchant_receive_return(p_request_id uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notify_refund_participants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.on_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conversation public.chat_conversations%ROWTYPE;
  v_recipient uuid;
BEGIN
  SELECT * INTO v_conversation FROM public.chat_conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND OR NEW.sender_id NOT IN (v_conversation.customer_id, v_conversation.merchant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invalid chat sender';
  END IF;
  IF NEW.sender_id = v_conversation.customer_id THEN
    v_recipient := v_conversation.merchant_id;
    UPDATE public.chat_conversations
    SET last_message = NEW.message, last_message_at = NEW.created_at,
        merchant_unread = COALESCE(merchant_unread, 0) + 1
    WHERE id = NEW.conversation_id;
  ELSE
    v_recipient := v_conversation.customer_id;
    UPDATE public.chat_conversations
    SET last_message = NEW.message, last_message_at = NEW.created_at,
        customer_unread = COALESCE(customer_unread, 0) + 1
    WHERE id = NEW.conversation_id;
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type, channel, data)
  VALUES (
    v_recipient,
    'رسالة جديدة',
    left(COALESCE(NEW.message, 'لديك رسالة جديدة'), 180),
    'chat_message',
    'in_app',
    jsonb_build_object('conversation_id', NEW.conversation_id)
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_withdrawal_request(p_request_id uuid, p_status text, p_notes text, p_external_reference text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reply_support_ticket(p_ticket_id uuid, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.respond_refund_request(p_request_id uuid, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.respond_return_request(p_request_id uuid, p_recommendation text, p_response text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_delivery_application(p_profile_id uuid, p_approved boolean, p_reason text, p_expected_revision bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_merchant_application(p_profile_id uuid, p_approved boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_merchant_operational_status(p_profile_id uuid, p_active boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.submit_cod_remittance(p_collection_id uuid, p_amount numeric, p_reference text, p_proof_path text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status(p_ticket_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
