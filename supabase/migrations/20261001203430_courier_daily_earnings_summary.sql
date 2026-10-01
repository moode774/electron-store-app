-- Aggregate daily KPIs independently of the latest 50 history records.
-- Net earnings restate earning-day income using actual posted courier refund reversals.
CREATE OR REPLACE FUNCTION public.get_delivery_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_profile public.delivery_profiles%ROWTYPE;
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Aden') AT TIME ZONE 'Asia/Aden';
  v_count bigint;
  v_today_count bigint;
  v_today_net numeric;
BEGIN
  IF v_user IS NULL OR NOT public.is_current_user_operational('delivery') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'delivery account is not operational';
  END IF;
  SELECT * INTO v_profile FROM public.delivery_profiles WHERE user_id = v_user;
  IF NOT FOUND OR v_profile.is_approved IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'approved delivery profile required';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE e.created_at >= v_today AND e.created_at < v_today + interval '1 day'),
    COALESCE(sum(GREATEST(COALESCE(e.total_earning, 0) - COALESCE((
      SELECT sum(le.amount) FROM public.marketplace_ledger_entries le
      WHERE le.order_id = e.order_id AND le.entry_type = 'refund_delivery_reversal'
        AND le.debit_owner_id = v_user AND le.debit_account = 'delivery_wallet'
    ), 0), 0)) FILTER (WHERE e.created_at >= v_today AND e.created_at < v_today + interval '1 day'), 0)
  INTO v_count, v_today_count, v_today_net
  FROM public.delivery_earnings e WHERE e.delivery_id = v_profile.id;
  RETURN jsonb_build_object('delivery_id', v_profile.id, 'user_id', v_user,
    'balance', COALESCE(v_profile.wallet_balance, 0),
    'total_deliveries', COALESCE(v_profile.total_deliveries, 0),
    'recorded_count', v_count, 'today_deliveries', v_today_count,
    'today_earnings', v_today_net, 'timezone', 'Asia/Aden');
END;
$function$;
REVOKE ALL ON FUNCTION public.get_delivery_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_wallet_summary() TO authenticated;
