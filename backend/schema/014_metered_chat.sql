-- Forward-only — never edit once applied.
-- Phase 6 (docs/06-IMPLEMENTATION.md). Chat per docs/05-BACKEND-SCHEMA.md §4.9,
-- the meter per docs/01-PRD.md §5.1, RLS per §7.
--
-- Chat is PER-MINUTE and LIVE (01-PRD.md §5.1, decided 1 Sep). Not a booking
-- with a duration, not a thread with a quota. That answer is why the meter is
-- here rather than in phase 11: metered chat cannot ship without one, and video
-- then inherits a meter that real sessions have already exercised.
--
-- ── HOW THE MONEY MOVES, AND WHY IT IS TWO ROWS AND NOT FIFTY ───────────────
-- The obvious design is a debit per minute. It is worse in every way that
-- matters: fifty chances to fail inside one session, a scheduled job on the
-- critical path, and a wallet that can go negative between two ticks.
--
-- This holds and settles.
--
--   accept  lock the wallet, work out how many minutes it can afford, DEBIT
--           THE WHOLE HOLD, and stamp expires_at = now + those minutes
--   end     work out the real duration from the server's own timestamps and
--           CREDIT BACK the minutes that were not used
--
-- The wallet can never go negative, because the money is already gone. The
-- cutoff is a timestamp rather than a countdown, so a client with a broken
-- clock, a paused tab or no heartbeat at all cannot buy itself a free minute.
-- And a statement reads as two lines a human can explain, not fifty.
--
-- The client says "I am joining" and "I am leaving". It never sends a duration,
-- a rate or a minute count — every one of those is a number the user benefits
-- from, which is rule 3.

-- ── The four product constants, named once ──────────────────────────────────
-- All four are defaults chosen on 1 Sep and all four are cheap to change here.
-- They are constants in one function rather than a settings table because a
-- table implies somebody is tuning them, and nobody is yet.
--
--   grace       60s. A dropped connection stops the meter, but not instantly —
--               a train tunnel should not end a paid reading.
--   rounding    UP to the whole minute, minimum one. The industry convention,
--               and the one a seeker expects when the price says "per minute".
--   hold cap    30 minutes. At the top band that is ₹3,300; without a cap one
--               session could lock an entire wallet.
--   accept      A session is REQUESTED and then ACCEPTED. The clock starts on
--               the consultant's join, never on the seeker's request, because
--               charging for a consultant who never turned up is the thing
--               01-PRD.md §5.4 already refuses to do.

create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  seeker_id      uuid not null references public.profiles(id),
  consultant_id  uuid not null references public.consultants(profile_id),
  service_id     uuid not null references public.consultant_services(id),
  thread_id      uuid,                      -- set on accept, references threads below
  order_id       uuid references public.orders(id),
  mode           text not null check (mode in ('chat','call','live')),
  -- Frozen copy of the band rate, exactly as bookings freeze their amount. A
  -- consultant changing tier must not re-price a session already under way.
  rate_paise     integer not null check (rate_paise > 0),
  status         text not null default 'requested'
                 check (status in ('requested','live','ended','declined','expired')),
  requested_at   timestamptz not null default now(),
  started_at     timestamptz,               -- the consultant joined; the clock starts
  expires_at     timestamptz,               -- started_at + the minutes held
  ended_at       timestamptz,
  heartbeat_at   timestamptz,
  hold_paise     integer,                   -- taken at accept
  charged_paise  integer,                   -- worked out at end
  created_at     timestamptz not null default now()
);

create index sessions_seeker_idx     on public.sessions (seeker_id, requested_at desc);
create index sessions_consultant_idx on public.sessions (consultant_id, requested_at desc);
-- The sweeper's query, and the only index it needs.
create index sessions_live_idx on public.sessions (expires_at) where status = 'live';

-- One live session per consultant, the same way the booking slot claim works:
-- the conflict check is an index, not application logic. A consultant cannot be
-- in two paid conversations at once, and the second request loses on 23505.
create unique index sessions_one_live_per_consultant
  on public.sessions (consultant_id) where status = 'live';

-- ── Threads and messages ────────────────────────────────────────────────────
-- A thread is the TRANSCRIPT and it outlives every session. `booking_id` and
-- `open_until` from the §4.9 sketch are both gone: they encoded the two answers
-- to the chat-window question that 1 Sep rejected, and a column nothing writes
-- is a column somebody later reads.

create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  seeker_id       uuid not null references public.profiles(id),
  consultant_id   uuid not null references public.consultants(profile_id),
  last_message_at timestamptz,
  last_preview    text,                     -- cache, §1.3 exception by name
  legacy_id       text,
  created_at      timestamptz not null default now(),
  unique (seeker_id, consultant_id)
);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  -- sender_id ONLY. There is no role column: role is `sender_id =
  -- threads.consultant_id`, derived. Storing it is how a message comes to
  -- disagree with its own thread, which is exactly the bug the mock has.
  sender_id   uuid not null references public.profiles(id),
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index messages_thread_idx  on public.messages (thread_id, created_at desc);
create index messages_unread_idx  on public.messages (thread_id) where read_at is null;
create index threads_consultant_idx on public.threads (consultant_id, last_message_at desc);
create index threads_seeker_idx     on public.threads (seeker_id, last_message_at desc);

alter table public.sessions add constraint sessions_thread_fkey
  foreign key (thread_id) references public.threads(id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.sessions enable row level security;
alter table public.threads  enable row level security;
alter table public.messages enable row level security;

create policy "sessions_select_mine"
  on public.sessions for select
  using (seeker_id = auth.uid() or consultant_id = auth.uid());

create policy "threads_select_mine"
  on public.threads for select
  using (seeker_id = auth.uid() or consultant_id = auth.uid());

-- Reading the transcript is always allowed to its two participants. The money
-- gates writing, not remembering.
create policy "messages_select_participant"
  on public.messages for select
  using (exists (select 1 from public.threads t
                  where t.id = messages.thread_id
                    and (t.seeker_id = auth.uid() or t.consultant_id = auth.uid())));

-- **The one direct client write in v1** (§7), and the meter is what bounds it.
-- A message may be inserted only into a thread with a LIVE session on it, and
-- only as yourself. Outside a paid session the transcript is read-only — that
-- is what stops chat being free if you simply never press End.
--
-- Every column of the new row is qualified. Unqualified, `thread_id` resolves
-- to the inner table and the predicate becomes `s.thread_id = s.thread_id`,
-- which is true for every row — the phase 4 policy bug, in a policy that would
-- be giving away paid minutes.
create policy "messages_insert_in_a_live_session"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.sessions s
                 where s.thread_id = messages.thread_id
                   and s.status = 'live'
                   and s.expires_at > now()
                   and (s.seeker_id = auth.uid() or s.consultant_id = auth.uid())));

-- Marking your own side read. The only UPDATE any client gets on messages, and
-- it is column-scoped below.
create policy "messages_mark_read"
  on public.messages for update
  using (exists (select 1 from public.threads t
                  where t.id = messages.thread_id
                    and (t.seeker_id = auth.uid() or t.consultant_id = auth.uid())))
  with check (exists (select 1 from public.threads t
                       where t.id = messages.thread_id
                         and (t.seeker_id = auth.uid() or t.consultant_id = auth.uid())));

revoke insert, update, delete on public.sessions from authenticated, anon;
revoke insert, update, delete on public.threads  from authenticated, anon;
revoke insert, update, delete on public.messages from authenticated, anon;
grant  insert on public.messages to authenticated;
grant  update (read_at) on public.messages to authenticated;

-- ── Ask for a session ───────────────────────────────────────────────────────
-- No money moves here. This is the knock on the door: it writes a `requested`
-- row and nothing else, so a consultant who never answers has cost the seeker
-- nothing at all. Compare `book_session`, which charges immediately — a
-- scheduled booking claims a slot somebody else could have had, and an unanswered
-- chat request claims nothing.

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

  -- Refuse before anyone waits, if the wallet cannot buy a single minute. The
  -- balance is re-checked under a lock at accept; this is only so a seeker is
  -- told now rather than after a consultant answers.
  if coalesce((select balance_paise from public.wallets where profile_id = v_uid), 0)
       < v_svc.price_paise then
    return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                              'rate_paise', v_svc.price_paise);
  end if;

  insert into public.sessions (seeker_id, consultant_id, service_id, mode, rate_paise)
  values (v_uid, p_consultant_id, v_svc.id, v_svc.mode, v_svc.price_paise)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'session_id', v_id, 'rate_paise', v_svc.price_paise);
end;
$$;

revoke execute on function public.session_request(uuid, uuid) from public, anon;
grant  execute on function public.session_request(uuid, uuid) to authenticated;

-- ── Accept, and start the meter ─────────────────────────────────────────────
-- The consultant's join. This is where the money moves, and it is one
-- transaction for the same reason booking is: a hold taken without a session
-- started is a charge for nothing.

create or replace function public.session_accept(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_minutes constant integer := 30;     -- the hold cap
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
  -- Only the consultant accepts, and only out of `requested`. The same edge as
  -- the booking policy: you cannot reach back into a session already resolved.
  if v_s.consultant_id <> v_uid or v_s.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', 'That request is no longer open.');
  end if;

  select name into v_pro from public.profiles where id = v_s.consultant_id;
  v_label := coalesce(v_pro, 'Consultation') || ' · chat';

  begin
    -- The lock, then the affordable minutes, computed from the LOCKED balance.
    select balance_paise into v_balance
      from public.wallets where profile_id = v_s.seeker_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'No wallet on that account.');
    end if;

    v_minutes := least(v_balance / v_s.rate_paise, c_max_minutes);   -- integer division floors
    if v_minutes < 1 then
      raise exception using errcode = 'WB001', message = 'short balance';
    end if;
    v_hold := v_minutes * v_s.rate_paise;

    insert into public.orders (profile_id, total_paise) values (v_s.seeker_id, v_hold)
    returning id into v_order;
    insert into public.order_items (order_id, item_type, item_id, title, unit_price_paise)
    values (v_order, 'session', v_s.service_id, v_label, v_s.rate_paise);

    -- The transcript. One per pair, forever — a second session between the same
    -- two people continues the same conversation.
    insert into public.threads (seeker_id, consultant_id)
    values (v_s.seeker_id, v_s.consultant_id)
    on conflict (seeker_id, consultant_id) do update set seeker_id = excluded.seeker_id
    returning id into v_thread;

    -- The claim. `sessions_one_live_per_consultant` refuses a second live
    -- session on 23505, caught below, exactly as the slot claim does.
    update public.sessions
       set status = 'live',
           started_at = now(),
           expires_at = now() + make_interval(mins => v_minutes),
           heartbeat_at = now(),
           hold_paise = v_hold,
           thread_id = v_thread,
           order_id = v_order
     where id = p_session_id;

    -- The hold. Earnings are NOT written here — the consultant earns what was
    -- used, and that is not known until the session ends.
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

-- ── End, and settle ─────────────────────────────────────────────────────────
-- Either party may end it, and the sweeper below ends the ones nobody does.
-- The duration comes from the SERVER'S OWN timestamps, clamped to what was
-- paid for. Nothing the client says is used.

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
begin
  select * into v_s from public.sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'No such session.');
  end if;
  -- Idempotent: a second End is the ordinary case (both sides press it), not
  -- an error, and it must not settle twice.
  if v_s.status <> 'live' then
    return jsonb_build_object('ok', true, 'already_ended', true,
                              'charged_paise', v_s.charged_paise);
  end if;
  -- auth.uid() is null when the sweeper calls this as its owner, which is how
  -- an abandoned session still settles.
  if v_uid is not null and v_uid not in (v_s.seeker_id, v_s.consultant_id) then
    return jsonb_build_object('ok', false, 'reason', 'That is not your session.');
  end if;

  -- Never past what was held. A tab left open overnight is charged for the
  -- minutes it bought and not one more.
  v_stop := least(now(), v_s.expires_at);

  -- ROUNDED UP, minimum one minute. "Per minute" means a part-minute is a
  -- minute; a seeker who reads ₹75/min and is charged ₹37.50 for 30 seconds is
  -- being surprised, even pleasantly.
  v_minutes := greatest(1, ceil(extract(epoch from (v_stop - v_s.started_at)) / 60.0)::integer);
  v_minutes := least(v_minutes, v_s.hold_paise / v_s.rate_paise);
  v_charged := v_minutes * v_s.rate_paise;
  v_refund  := v_s.hold_paise - v_charged;

  update public.sessions
     set status = 'ended', ended_at = now(), charged_paise = v_charged
   where id = p_session_id;

  -- The unused minutes come back. `ref_type = 'refund'`, and 013's unique index
  -- means one per order — which is exactly right here: one settle per session.
  -- An admin reversing a whole session later uses `adjustment`, not a second
  -- refund row.
  if v_refund > 0 then
    insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
    values (v_s.seeker_id, v_refund, 'Refund · unused minutes', 'refund',
            v_s.order_id, p_reason);
  end if;

  update public.orders set total_paise = v_charged where id = v_s.order_id;

  -- The consultant earns what was USED. This is why earnings are written here
  -- and not at accept: at accept nobody knows how long anyone will talk.
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

-- ── The heartbeat, and what it is NOT ───────────────────────────────────────
-- It does not advance the meter and it cannot extend anything. It records that
-- somebody is still there, so the sweeper can tell a live conversation from an
-- abandoned tab, and it hands back the remaining seconds so the room can show
-- them. A client that stops calling this loses nothing it paid for; it just
-- gets swept sooner.

create or replace function public.session_heartbeat(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   public.sessions%rowtype;
begin
  select * into v_s from public.sessions where id = p_session_id;
  if not found or v_uid not in (v_s.seeker_id, v_s.consultant_id) then
    return jsonb_build_object('ok', false, 'reason', 'That is not your session.');
  end if;
  if v_s.status <> 'live' then
    return jsonb_build_object('ok', true, 'live', false, 'seconds_left', 0);
  end if;

  update public.sessions set heartbeat_at = now() where id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'live', true,
    'seconds_left', greatest(0, floor(extract(epoch from (v_s.expires_at - now())))::integer),
    'rate_paise', v_s.rate_paise);
end;
$$;

revoke execute on function public.session_heartbeat(uuid) from public, anon;
grant  execute on function public.session_heartbeat(uuid) to authenticated;

-- ── The sweeper, which is not optional ──────────────────────────────────────
-- Without this, a session both sides walk away from never settles and the
-- seeker's hold sits taken for minutes they never used. That failure is
-- SILENT, which is the exact shape of the payment bug this project already
-- paid for once: money in the wrong place and nothing anywhere noticing.
--
-- Two reasons to sweep, and the 60-second grace is the drop policy: a
-- connection that blinks does not end a paid reading, one that is gone does.

create or replace function public.session_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c_grace constant interval := interval '60 seconds';
  v_id    uuid;
  v_n     integer := 0;
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
  return v_n;
end;
$$;

revoke execute on function public.session_sweep() from public, anon, authenticated;

-- pg_cron is not on by default. It is a real dependency of this phase rather
-- than a nicety: without a scheduler the sweep never runs, and a session both
-- parties abandon holds the seeker's money forever.
create extension if not exists pg_cron;

-- Every minute. The sweep is cheap — `sessions_live_idx` makes it an index scan
-- over the handful of live rows — and a minute is the smallest unit anyone is
-- billed in, so it cannot be late by more than one unit of the thing it guards.
select cron.schedule('session-sweep', '* * * * *', $cron$select public.session_sweep()$cron$);

-- ── The read side, for the same reason bookings_view exists ─────────────────
-- `profiles` is own-row-only, so a consultant reading their own thread list
-- would get a UUID and no name.

create view public.threads_view as
  select t.id, t.seeker_id, t.consultant_id, t.last_message_at, t.last_preview,
         t.created_at,
         s.name as seeker_name,
         c.name as consultant_name,
         (select count(*) from public.messages m
           where m.thread_id = t.id and m.read_at is null
             and m.sender_id <> auth.uid())                as unread,
         (select sx.id from public.sessions sx
           where sx.thread_id = t.id and sx.status = 'live'
           limit 1)                                        as live_session_id
    from public.threads t
    join public.profiles s on s.id = t.seeker_id
    join public.profiles c on c.id = t.consultant_id
   where t.seeker_id = auth.uid() or t.consultant_id = auth.uid();

grant select on public.threads_view to authenticated;
revoke select on public.threads_view from anon;
