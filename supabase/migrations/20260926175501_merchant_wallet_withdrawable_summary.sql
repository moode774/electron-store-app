-- Merchant-safe wallet summary used by the wallet UI.
create or replace function public.get_my_merchant_wallet_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_wallet numeric := 0;
  v_held numeric := 0;
begin
  if v_user is null or not public.is_current_user_operational('merchant') then
    raise exception using errcode='42501', message='merchant access required';
  end if;
  select coalesce(mp.wallet_balance,0) into v_wallet
  from public.merchant_profiles mp where mp.user_id=v_user;
  if not found then
    raise exception using errcode='42501', message='merchant wallet profile not found';
  end if;
  v_held := public.marketplace_cod_held_balance(v_user);
  return jsonb_build_object(
    'balance', round(v_wallet,2),
    'cod_held', round(v_held,2),
    'withdrawable', greatest(round(v_wallet-v_held,2),0)
  );
end;
$$;
revoke all on function public.get_my_merchant_wallet_summary() from public, anon;
grant execute on function public.get_my_merchant_wallet_summary() to authenticated;
