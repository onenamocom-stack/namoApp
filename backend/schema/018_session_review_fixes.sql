-- Forward-only — never edit once applied.
-- Phase 6, follow-up. Four defects found by review of 014–017.

-- ── 1. THE ONE THAT LOSES MONEY: accept had no row lock ─────────────────────
-- `session_accept` read the session with a bare SELECT while `session_end`
-- used `for update`. Two concurrent accepts — a consultant double-tapping
-- Join, or the same account on two devices — both read `status = 'requested'`
-- under READ COMMITTED and both pass the guard. The second serialises on the
-- WALLET lock, then writes a SECOND order, a SECOND `order_items` line and a
-- SECOND full debit, and overwrites `sessions.order_id`. The settle refunds
-- only against the surviving order, so the first hold is taken and never
-- returned.
--
-- `sessions_one_live_per_consultant` does not catch it. That index guards
-- INSERTs, and this is two UPDATEs to the same row — unlike `book_session`,
-- which inserts a booking and therefore does hit its index. The lock is the
-- fix, and it is one clause.
--
-- With 017 removing the hold cap, the orphaned amount is the seeker's ENTIRE
-- balance. Worth stating plainly: the cap removal did not cause this bug, it
-- raised its price from a capped 30 minutes to everything they had.

-- ── 2. `requested` sessions piled up forever ────────────────────────────────
-- `status` allowed 'expired' and nothing ever wrote it; the sweeper only
-- looked at 'live'. Every tap of "Chat now" inserted another row, so a
-- consultant's waiting list accumulated duplicates and days-old dead requests,
-- and could push genuinely new ones out of the client's `limit(50)`.
--
-- Two changes: one open request per pair, enforced by an index rather than by
-- checking first, and the sweeper now expires anything nobody answered.
-- Fifteen minutes, because a request is somebody sitting there waiting — long
-- past that they have gone, and showing it to the consultant is a lie about
-- who is available.

create unique index sessions_one_open_request
  on public.sessions (seeker_id, consultant_id) where status = 'requested';

-- ── 3. A `booking` service could crash the request ──────────────────────────
-- `consultant_services.mode` permits 'booking'; `sessions.mode` does not.
-- `session_request` copied the mode straight across, so a per-minute service
-- saved as 'booking' raised an uncaught check violation and the seeker saw the
-- generic "Could not reach the consultant" instead of a reason. Guarded.

-- ── 4. `p_reason` was client-controllable and lands in the ledger ───────────
-- `session_end` is granted to `authenticated`, and its second parameter is
-- written verbatim into `ledger.note` — an append-only table. The client never
-- passes it, but any participant could call the RPC directly and write what
-- they liked into the money record. The reason is now ignored unless the
-- caller is the sweeper (which runs with no `auth.uid()`).

create or replace function public.session_request(
  p_consultant_id uuid,
  p_service_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_svc public.consultant_services%rowtype;
  v_id  uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to start a chat.');
  end if;
  if p_consultant_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'You cannot chat with yourself.');
  end if;

  select s.* into v_svc
    from public.consultant_services s
    join public.consultants c on c.profile_id = s.consultant_id
   where s.id = p_service_id
     and s.consultant_id = p_consultant_id
     and s.active
     and s.billing = 'per_minute'
     and c.status = 'approved';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'That consultant is not taking chats.');
  end if;
  if v_svc.price_paise <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'That session is not priced yet.');
  end if;
  -- Fix 3. A mode `sessions` cannot store is a refusal, not a crash.
  if v_svc.mode not in ('chat', 'call', 'live') then
    return jsonb_build_object('ok', false, 'reason', 'That service cannot be started live.');
  end if;

  if coalesce((select balance_paise from public.wallets where profile_id = v_uid), 0)
       < v_svc.price_paise then
    return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                              'rate_paise', v_svc.price_paise);
  end if;

  -- Fix 2. Asking twice is the same ask. The index is the guarantee and this
  -- returns the request already waiting rather than making a second one.
  insert into public.sessions (seeker_id, consultant_id, service_id, mode, rate_paise)
  values (v_uid, p_consultant_id, v_svc.id, v_svc.mode, v_svc.price_paise)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.sessions
     where seeker_id = v_uid and consultant_id = p_consultant_id and status = 'requested';
  end if;

  return jsonb_build_object('ok', true, 'session_id', v_id, 'rate_paise', v_svc.price_paise);
end;
$$;

revoke execute on function public.session_request(uuid, uuid) from public, anon;
grant  execute on function public.session_request(uuid, uuid) to authenticated;

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
  -- Fix 1. THE LOCK. Two accepts of one request now serialise here, and the
  -- second finds the status already moved off 'requested'.
  select * into v_s from public.sessions where id = p_session_id for update;
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

create or replace function public.session_end(p_session_id uuid, p_reason text default 'ended')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_fee_bps constant smallint := 1800;
  v_uid      uuid := auth.uid();
  v_s        public.sessions%rowtype;
  v_stop     timestamptz;
  v_minutes  integer;
  v_charged  integer;
  v_refund   integer;
  v_fee      integer;
  v_seeker   text;
  v_note     text;
begin
  select * into v_s from public.sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'No such session.');
  end if;
  if v_s.status <> 'live' then
    return jsonb_build_object('ok', true, 'already_ended', true,
                              'charged_paise', v_s.charged_paise);
  end if;
  if v_uid is not null and v_uid not in (v_s.seeker_id, v_s.consultant_id) then
    return jsonb_build_object('ok', false, 'reason', 'That is not your session.');
  end if;

  -- Fix 4. A caller with a jwt does not get to write the ledger's note. Only
  -- the sweeper, which runs as owner with no auth.uid(), supplies a reason.
  v_note := case when v_uid is null then p_reason else 'ended' end;

  v_stop := least(now(), v_s.expires_at);
  v_minutes := greatest(1, ceil(extract(epoch from (v_stop - v_s.started_at)) / 60.0)::integer);
  v_minutes := least(v_minutes, v_s.hold_paise / v_s.rate_paise);
  v_charged := v_minutes * v_s.rate_paise;
  v_refund  := v_s.hold_paise - v_charged;

  update public.sessions
     set status = 'ended', ended_at = now(), charged_paise = v_charged
   where id = p_session_id;

  if v_refund > 0 then
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
    values (v_s.seeker_id, v_refund, 'Refund · unused minutes', 'refund',
            v_s.order_id, v_note);
  end if;

  update public.orders set total_paise = v_charged where id = v_s.order_id;

  select name into v_seeker from public.profiles where id = v_s.seeker_id;
  v_fee := round(v_charged::numeric * c_fee_bps / 10000)::integer;
  insert into public.earnings_ledger (consultant_id, booking_id, gross_paise,
                                      fee_bps, fee_paise, net_paise, kind)
  values (v_s.consultant_id, null, v_charged, c_fee_bps, v_fee, v_charged - v_fee,
          coalesce(v_seeker, 'Session') || ' · ' || v_minutes || ' min chat');

  return jsonb_build_object('ok', true, 'minutes', v_minutes,
                            'charged_paise', v_charged, 'refunded_paise', v_refund);
end;
$$;

revoke execute on function public.session_end(uuid, text) from public, anon;
grant  execute on function public.session_end(uuid, text) to authenticated;

-- The sweeper now has two jobs: settle abandoned live sessions, and expire
-- requests nobody answered.
create or replace function public.session_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c_grace   constant interval := interval '60 seconds';
  c_unanswered constant interval := interval '15 minutes';
  v_id      uuid;
  v_n       integer := 0;
begin
  for v_id in
    select id from public.sessions
     where status = 'live'
       and (now() >= expires_at
            or coalesce(heartbeat_at, started_at) < now() - c_grace)
  loop
    perform public.session_end(
      v_id,
      case when (select now() >= expires_at from public.sessions where id = v_id)
           then 'time ran out' else 'connection lost' end);
    v_n := v_n + 1;
  end loop;

  -- No money is involved: a request never cost anything, so expiring it is a
  -- status change and nothing else.
  update public.sessions set status = 'expired'
   where status = 'requested' and requested_at < now() - c_unanswered;

  return v_n;
end;
$$;

revoke execute on function public.session_sweep() from public, anon, authenticated;
