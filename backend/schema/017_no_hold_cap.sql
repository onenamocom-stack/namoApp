-- Forward-only — never edit once applied.
-- Phase 6. Removes the 30-minute hold cap — decided 1 Sep 2026.
--
-- `014` held `min(balance ÷ rate, 30)` minutes at accept. The cap is gone: the
-- hold is now every minute the wallet can buy, so a session runs until the
-- money does and nothing cuts a reading short while there is still balance to
-- pay for it.
--
-- **The cost of this is visible and was accepted knowingly.** A seeker with
-- ₹10,000 talking to a ₹75/min consultant now has the whole ₹10,000 held for
-- the length of the session, and their wallet reads ₹0 until it ends. It all
-- comes back — the settle credits every unused minute the moment the session
-- closes, exactly as before — but mid-session the balance on screen is the
-- money still available to spend, and during a chat that is genuinely none of
-- it. Nothing else in the app can be bought while a chat is running.
--
-- The alternative considered and rejected was a ROLLING hold: take five
-- minutes, top up automatically as the session runs. It keeps the visible hold
-- small and still has no ceiling, at the price of one ledger row per top-up
-- and an extension path inside the heartbeat. If the ₹0-balance-mid-session
-- effect turns out to bother real seekers, that is the thing to build — the
-- shape is in this file's history and in HANDOFF §4.
--
-- Everything else about the meter is unchanged: the settle still refunds
-- unused minutes, `session_end` still clamps the billable minutes to what was
-- held, and the sweeper still closes anything abandoned.

create or replace function public.session_accept(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_s       public.sessions%rowtype;
  v_balance integer;
  v_minutes integer;
  v_hold    integer;
  v_thread  uuid;
  v_order   uuid;
  v_label   text;
  v_pro     text;
begin
  select * into v_s from public.sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'That request is gone.');
  end if;
  if v_s.consultant_id <> v_uid or v_s.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', 'That request is no longer open.');
  end if;

  select name into v_pro from public.profiles where id = v_s.consultant_id;
  v_label := coalesce(v_pro, 'Consultation') || ' · chat';

  begin
    select balance_paise into v_balance
      from public.wallets where profile_id = v_s.seeker_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'No wallet on that account.');
    end if;

    -- No cap. Every minute the wallet can buy, floored by integer division —
    -- a part-minute the seeker cannot afford is not held and not sold.
    v_minutes := v_balance / v_s.rate_paise;
    if v_minutes < 1 then
      raise exception using errcode = 'WB001', message = 'short balance';
    end if;
    v_hold := v_minutes * v_s.rate_paise;

    insert into public.orders (profile_id, total_paise) values (v_s.seeker_id, v_hold)
    returning id into v_order;
    insert into public.order_items (order_id, item_type, item_id, title, unit_price_paise)
    values (v_order, 'session', v_s.service_id, v_label, v_s.rate_paise);

    insert into public.threads (seeker_id, consultant_id)
    values (v_s.seeker_id, v_s.consultant_id)
    on conflict (seeker_id, consultant_id) do update set seeker_id = excluded.seeker_id
    returning id into v_thread;

    update public.sessions
       set status = 'live',
           started_at = now(),
           expires_at = now() + make_interval(mins => v_minutes),
           heartbeat_at = now(),
           hold_paise = v_hold,
           thread_id = v_thread,
           order_id = v_order
     where id = p_session_id;

    insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id)
    values (v_s.seeker_id, -v_hold, v_label || ' · ' || v_minutes || ' min held',
            'order', v_order);

  exception
    when unique_violation then
      return jsonb_build_object('ok', false,
                                'reason', 'You are already in a live session.');
    when sqlstate 'WB001' then
      return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                                'balance_paise', v_balance);
  end;

  return jsonb_build_object('ok', true, 'session_id', p_session_id, 'thread_id', v_thread,
                            'minutes_held', v_minutes, 'hold_paise', v_hold,
                            'expires_at', (select expires_at from public.sessions
                                            where id = p_session_id));
end;
$$;

revoke execute on function public.session_accept(uuid) from public, anon;
grant  execute on function public.session_accept(uuid) to authenticated;
