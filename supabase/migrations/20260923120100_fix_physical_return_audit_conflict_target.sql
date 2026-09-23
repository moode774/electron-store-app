-- admin_complete_return wrote its audit rows with `ON CONFLICT (event_key)`,
-- but order_operation_audit and order_tracking are only unique on
-- (order_id, event_key) (20260713164458). With no matching unique index
-- Postgres raises 42P10 as soon as the statement runs, so completing an
-- accepted physical return (wallet refund + restock + settlement reversal)
-- always failed and rolled back.
--
-- A global unique index on event_key is not safe: generic keys repeat across
-- orders. This is the 20260713164535 definition with only the conflict
-- targets corrected. CREATE OR REPLACE keeps the existing grants.

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
    ) ON CONFLICT (order_id, event_key) DO NOTHING;
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
    ) ON CONFLICT (order_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
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
  ) ON CONFLICT (order_id, event_key) DO NOTHING;
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
