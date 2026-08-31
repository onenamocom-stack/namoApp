-- Applied to Supabase via MCP. Forward-only — never edit once applied.
--
-- 003 gave wallet_debit a defaulted `p_ref_type`. The function is granted to
-- `authenticated`, so any signed-in client could tag its own ledger rows
-- 'payment' or 'refund' — both values the table CHECK allows.
--
-- No money is gained: the amount is negated either way, so this only ever
-- spends the caller's own balance. What it corrupts is meaning.
-- `toLedgerRow` in src/store.jsx renders `ref_type = 'payment'` as method
-- "UPI", and phase 3's reconciliation will read those rows as settlements
-- against a provider that never saw them.
--
-- Phase 2 has exactly one caller and it never passed the third argument, so
-- the parameter comes out rather than being validated. A purchase is the only
-- thing this function writes; payments and refunds are written server-side,
-- by phase 3 and by an admin reversing entry respectively.

drop function if exists public.wallet_debit(integer, text, text);

create function public.wallet_debit(
  p_amount_paise integer,
  p_kind         text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to pay from your wallet.');
  end if;

  if p_amount_paise is null or p_amount_paise <= 0
     or coalesce(btrim(p_kind), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'That is not something we can charge for.');
  end if;

  -- The lock is the concurrency control. Two debits firing together serialise
  -- here rather than both reading the same balance and both passing.
  select balance_paise into v_balance
    from public.wallets
   where profile_id = v_uid
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'No wallet on this account.');
  end if;

  if p_amount_paise > v_balance then
    return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                              'balance_paise', v_balance);
  end if;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type)
  values (v_uid, -p_amount_paise, p_kind, 'order');

  return jsonb_build_object('ok', true, 'balance_paise', v_balance - p_amount_paise);
end;
$$;

revoke execute on function public.wallet_debit(integer, text) from public, anon;
grant  execute on function public.wallet_debit(integer, text) to authenticated;
