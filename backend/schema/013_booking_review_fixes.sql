-- Forward-only — never edit once applied.
-- Phase 5, follow-up. Four defects found by review of 012, all on the money
-- path. A separate migration rather than an edit to 012, which has run on both
-- projects; replaying the folder from nothing lands on the same behaviour.

-- ── 1. The reversal guard was a check-then-insert race ──────────────────────
-- `booking_reverse` read the ledger for an existing refund row and inserted if
-- it found none. That is an application-level "have I seen this?", which
-- backend/INSTRUCTIONS.md rule 6 bans by name, and for the usual reason: two
-- reversals of the same booking running at once — an admin calling
-- `booking_reverse` for a platform failure at the same moment the consultant
-- taps Decline and fires the trigger — both read no refund row and both credit.
-- The seeker is paid twice and the consultant's book gets two negative rows.
--
-- Phase 3 already had the right shape and this file borrows it: the guarantee
-- is a unique index, and the duplicate is caught rather than checked for. One
-- order, one reversal, enforced by the database.
--
-- ref_id is nullable and repeats freely as NULL, so the phase 2 hand-written
-- reversal and any future refund that is not against an order are unaffected.

create unique index ledger_one_refund_per_order
  on public.ledger (ref_id)
  where ref_type = 'refund' and ref_id is not null;

create or replace function public.booking_reverse(p_booking_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.bookings%rowtype;
  v_e public.earnings_ledger%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.order_id is null then
    -- A seeded booking carries no order because no money was ever taken for
    -- it. Nothing to reverse is not a failure.
    return jsonb_build_object('ok', true, 'reversed', false);
  end if;

  if not exists (select 1 from public.wallets where profile_id = v_b.seeker_id) then
    raise exception 'booking % has no seeker wallet to credit', p_booking_id;
  end if;

  -- No check. The insert IS the check: a second reversal violates
  -- ledger_one_refund_per_order, the handler below catches it, and plpgsql
  -- rolls the whole block back — including the earnings row that had already
  -- been written inside it. There is no window between deciding and crediting
  -- because there is no decision.
  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
  values (v_b.seeker_id, v_b.amount_paise, 'Refund · session', 'refund',
          v_b.order_id, p_reason);

  select * into v_e from public.earnings_ledger
   where booking_id = p_booking_id and gross_paise > 0
   order by created_at limit 1;
  if found then
    insert into public.earnings_ledger (consultant_id, booking_id, gross_paise,
                                        fee_bps, fee_paise, net_paise, kind)
    values (v_e.consultant_id, p_booking_id, -v_e.gross_paise,
            v_e.fee_bps, -v_e.fee_paise, -v_e.net_paise, 'Reversed · ' || p_reason);
  end if;

  update public.orders set status = 'refunded' where id = v_b.order_id;

  return jsonb_build_object('ok', true, 'reversed', true, 'amount_paise', v_b.amount_paise);

exception when unique_violation then
  -- Already reversed. The ordinary case on a retry, not an error.
  return jsonb_build_object('ok', true, 'reversed', false);
end;
$$;

revoke execute on function public.booking_reverse(uuid, text) from public, anon, authenticated;

-- ── 2, 3 and 4: book_session ────────────────────────────────────────────────
-- Three fixes, all small, all on the refusal paths:
--
--   2. `P0001` IS NOT A PRIVATE SENTINEL. It is the SQLSTATE of every bare
--      `raise exception` in PL/pgSQL — including `refuse_mutation()`, which
--      guards both ledgers. Nothing inside the block raises bare today, so it
--      was latent; the first trigger added on `orders`, `order_items`,
--      `bookings` or `earnings_ledger` that raises plainly would have surfaced
--      to a seeker as "Not enough balance", with a balance figure that has
--      nothing to do with the failure. A wrong refusal reason on a money path
--      is worse than a raw error, because it is believable. The short-balance
--      raise now carries its own code.
--
--   3. A zero-price service threw a raw error instead of refusing. `ledger` has
--      `check (delta_paise <> 0)` and `consultant_services.price_paise` allows
--      0, so a free service made the debit insert raise 23514 — uncaught, so
--      the whole function errored and the client showed "Could not reach the
--      diary", which is untrue and unactionable. Only reachable by an admin
--      write today, since the RLS policy pins price to a band, but it is one
--      band row away. Guarded before the block.
--
--   4. The earnings row was labelled with the CONSULTANT'S OWN NAME.
--      `earnings_ledger.kind` is what the consultant reads, and ProEarnings
--      renders it as the row title, so their book was a list of their own name
--      repeated. The seeker's name is the useful one there — it says who the
--      session was for. The seeker's own ledger keeps the consultant's name,
--      which is the same rule applied from the other side: each party's book
--      names the other party.

create or replace function public.book_session(
  p_consultant_id uuid,
  p_service_id    uuid,
  p_starts_at     timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_fee_bps constant smallint := 1800;
  v_uid     uuid := auth.uid();
  v_svc     public.consultant_services%rowtype;
  v_pro     text;
  v_seeker  text;
  v_label   text;
  v_balance integer;
  v_order   uuid;
  v_booking uuid;
  v_fee     integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to book a session.');
  end if;
  if p_consultant_id = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'You cannot book yourself.');
  end if;

  select s.* into v_svc
    from public.consultant_services s
    join public.consultants c on c.profile_id = s.consultant_id
   where s.id = p_service_id
     and s.consultant_id = p_consultant_id
     and s.active
     and c.status = 'approved';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'That session is not available any more.');
  end if;

  if v_svc.billing <> 'fixed' then
    return jsonb_build_object('ok', false, 'reason', 'Instant calls are not bookable yet.');
  end if;

  -- Fix 3. A price of zero is not a free session, it is a catalogue mistake,
  -- and it must not reach a ledger that refuses a zero delta.
  if v_svc.price_paise <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'That session is not priced yet.');
  end if;

  if not exists (
    select 1 from public.consultant_open_slots(
                   p_consultant_id,
                   (p_starts_at at time zone 'Asia/Kolkata')::date) o
     where o.starts_at = p_starts_at) then
    return jsonb_build_object('ok', false, 'reason', 'That time is no longer open. Pick another.');
  end if;

  select name into v_pro    from public.profiles where id = p_consultant_id;
  select name into v_seeker from public.profiles where id = v_uid;
  v_label := coalesce(v_pro, 'Consultation') || ' · ' || v_svc.duration_mins || ' min';
  v_fee   := round(v_svc.price_paise::numeric * c_fee_bps / 10000)::integer;

  begin
    select balance_paise into v_balance
      from public.wallets where profile_id = v_uid for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'No wallet on this account.');
    end if;
    if v_svc.price_paise > v_balance then
      -- Fix 2. Its own SQLSTATE, not PL/pgSQL's shared default.
      raise exception using errcode = 'WB001', message = 'short balance';
    end if;

    insert into public.orders (profile_id, total_paise)
    values (v_uid, v_svc.price_paise)
    returning id into v_order;

    insert into public.order_items (order_id, item_type, item_id, title, unit_price_paise)
    values (v_order, 'session', v_svc.id, v_label, v_svc.price_paise);

    insert into public.bookings (seeker_id, consultant_id, service_id, order_id,
                                 starts_at, duration_mins, amount_paise, mode, status)
    values (v_uid, p_consultant_id, v_svc.id, v_order,
            p_starts_at, v_svc.duration_mins, v_svc.price_paise, v_svc.mode, 'pending')
    returning id into v_booking;

    -- The seeker's book names the consultant.
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id)
    values (v_uid, -v_svc.price_paise, v_label, 'order', v_order);

    -- Fix 4. The consultant's book names the seeker.
    insert into public.earnings_ledger (consultant_id, booking_id, gross_paise,
                                        fee_bps, fee_paise, net_paise, kind)
    values (p_consultant_id, v_booking, v_svc.price_paise,
            c_fee_bps, v_fee, v_svc.price_paise - v_fee,
            coalesce(v_seeker, 'Session') || ' · ' || v_svc.duration_mins || ' min');

  exception
    when unique_violation then
      return jsonb_build_object('ok', false,
                                'reason', 'Someone just took that time. Pick another.');
    when sqlstate 'WB001' then
      return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                                'balance_paise', v_balance);
  end;

  return jsonb_build_object('ok', true, 'booking_id', v_booking, 'order_id', v_order,
                            'balance_paise', v_balance - v_svc.price_paise);
end;
$$;

revoke execute on function public.book_session(uuid, uuid, timestamptz) from public, anon;
grant  execute on function public.book_session(uuid, uuid, timestamptz) to authenticated;

-- ── Not fixed here, on purpose ──────────────────────────────────────────────
-- A consultant who never answers leaves the seeker's money held at `pending`
-- indefinitely, and leaves a positive earnings row that phase 12 would pay out
-- for a session that never happened. The remedy exists — an admin calls
-- `booking_reverse(booking, 'no answer')` — but there is no expiry and no
-- client-visible path, and inventing a deadline is a product decision, not a
-- review fix. Logged as an open question in 01-PRD.md §5.4 and HANDOFF §4.
