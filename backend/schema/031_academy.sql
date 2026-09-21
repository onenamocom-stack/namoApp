-- Forward-only — never edit once applied.
-- Phase 10b, the Academy (docs/06-IMPLEMENTATION.md). Decided 16 Sep 2026:
--   · a course is ordered lessons, each a video LINK (unlisted YouTube/Vimeo),
--     readable only by someone enrolled. No progress tracking.
--   · PDF materials sit in a PRIVATE bucket, served by signed URL to the enrolled
--   · an event is a Meet/Zoom link, readable only by someone enrolled
--   · admin-only authoring (backend/seed/academy.mjs); nobody earns commission
--   · wallet or card, exactly like the shop; refunds by admin; cancelling an
--     event refunds every paid enrolment
--
-- The design in one paragraph. There is still ONE money path: 028's
-- `shop_order_settle`, generalised here to activate enrolments as well as
-- mark parcels ready. `academy_enrol` builds a pending order with one line and
-- a pending enrolment, then settles from the wallet, or leaves it for
-- `payment_capture` exactly as a shop card order does. Release, the sweeper,
-- the owner's cancel and the refund are 028's functions, generalised the same
-- way. A free (₹0) enrolment has no order and no ledger row at all — the
-- ledger refuses a zero delta, and there is nothing to record.
--
-- The access rule is one function, `academy_enrolled`, used by every gated
-- table and by the storage policy. Hiding a button is not the gate; this is.

-- ── Catalogue ───────────────────────────────────────────────────────────────

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,                  -- the importer's slug
  title        text not null,
  tutor        text not null,
  level        text check (level in ('Beginner','Intermediate','Advanced')),
  summary      text,
  cover_url    text,
  price_paise  integer not null check (price_paise >= 0),
  sort         smallint not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- The video link is the paid thing, so the table is gated. The outline (titles
-- and lengths) is public through `course_outline` below.
create table public.course_lessons (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  sort       smallint not null default 0,
  title      text not null,
  minutes    smallint check (minutes > 0),
  video_url  text not null check (video_url ~ '^https://')
);

create index course_lessons_course_idx on public.course_lessons (course_id, sort);

create table public.course_materials (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  sort          smallint not null default 0,
  title         text not null,
  storage_path  text not null unique,         -- object name in `course-materials`
  size_bytes    integer,
  created_at    timestamptz not null default now()
);

create table public.academy_events (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  title        text not null,
  host         text not null,
  kind         text not null default 'Webinar' check (kind in ('Webinar','Seminar','Workshop')),
  summary      text,
  starts_at    timestamptz not null,
  minutes      smallint not null default 60 check (minutes > 0),
  seats        integer not null check (seats > 0),
  -- The oversell guard is this CHECK, the same as `products.stock`. Enrol locks
  -- the row and checks first so a refusal has a reason; the CHECK is what holds
  -- if that code is ever wrong.
  seats_left   integer not null check (seats_left between 0 and seats),
  price_paise  integer not null check (price_paise >= 0),
  status       text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.academy_event_links (
  event_id  uuid primary key references public.academy_events(id) on delete cascade,
  join_url  text not null check (join_url ~ '^https://')
);

-- One row per person per thing. `order_id` is null for a free enrolment.
create table public.enrolments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id),
  item_type   text not null check (item_type in ('course','event')),
  item_id     uuid not null,                  -- no FK, same trade as order_items
  order_id    uuid references public.orders(id),
  status      text not null check (status in ('pending','active','refunded','cancelled')),
  created_at  timestamptz not null default now()
);

-- Enrolling twice is refused by this index, not by a check that races it.
create unique index enrolments_one_live
  on public.enrolments (profile_id, item_type, item_id)
  where status in ('pending','active');
create index enrolments_item_idx  on public.enrolments (item_type, item_id);
create index enrolments_order_idx on public.enrolments (order_id) where order_id is not null;

-- ── The access rule ─────────────────────────────────────────────────────────

create or replace function public.academy_enrolled(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.enrolments
                  where profile_id = auth.uid() and item_type = p_type
                    and item_id = p_id and status = 'active');
$$;

revoke execute on function public.academy_enrolled(text, uuid) from public, anon;
grant  execute on function public.academy_enrolled(text, uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.courses             enable row level security;
alter table public.course_lessons      enable row level security;
alter table public.course_materials    enable row level security;
alter table public.academy_events      enable row level security;
alter table public.academy_event_links enable row level security;
alter table public.enrolments          enable row level security;

create policy "courses_read_active" on public.courses        for select using (active);
create policy "events_read_active"  on public.academy_events for select using (active);

create policy "course_lessons_enrolled" on public.course_lessons
  for select to authenticated using (public.academy_enrolled('course', course_lessons.course_id));
create policy "course_materials_enrolled" on public.course_materials
  for select to authenticated using (public.academy_enrolled('course', course_materials.course_id));
create policy "event_links_enrolled" on public.academy_event_links
  for select to authenticated using (public.academy_enrolled('event', academy_event_links.event_id));
create policy "enrolments_select_own" on public.enrolments
  for select using (profile_id = auth.uid());

revoke insert, update, delete on public.courses, public.course_lessons, public.course_materials,
  public.academy_events, public.academy_event_links, public.enrolments from anon, authenticated;
revoke all on public.course_lessons, public.course_materials, public.academy_event_links,
  public.enrolments from anon;

-- The outline anyone may read: no link. Runs as its owner, the
-- `consultants_public` pattern, because the table under it is gated.
create view public.course_outline as
  select l.id, l.course_id, l.sort, l.title, l.minutes
    from public.course_lessons l
    join public.courses c on c.id = l.course_id
   where c.active;

grant select on public.course_outline to anon, authenticated;

-- ── Materials bucket: private, PDFs, read by the enrolled ───────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

create policy "course_materials_read_enrolled" on storage.objects
  for select to authenticated
  using (bucket_id = 'course-materials'
         and exists (select 1 from public.course_materials m
                      where m.storage_path = objects.name
                        and public.academy_enrolled('course', m.course_id)));

-- ── 028's functions, generalised ────────────────────────────────────────────

-- Settle: the one way an order takes money. Now also names an Academy line and
-- activates its enrolment, in the same transaction as the debit.
create or replace function public.shop_order_settle(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o       public.orders%rowtype;
  v_balance integer;
  v_lines   integer;
  v_label   text;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found or v_o.status <> 'pending' then
    -- Already paid, or cancelled by the sweeper before the money landed. The
    -- second is not an error: the payment stays in the wallet.
    return jsonb_build_object('ok', true, 'settled', false, 'status', v_o.status);
  end if;

  select balance_paise into v_balance
    from public.wallets where profile_id = v_o.profile_id for update;
  if not found or v_balance < v_o.total_paise then
    raise exception using errcode = 'WB001', message = 'short balance';
  end if;

  select count(*), min(title) into v_lines, v_label
    from public.order_items where order_id = p_order_id and item_type = 'product';
  if v_lines > 0 then
    v_label := 'Shop · ' || case when v_lines = 1 then v_label else v_lines || ' items' end;
  else
    select 'Academy · ' || min(title) into v_label
      from public.order_items where order_id = p_order_id and item_type in ('course','event');
  end if;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id)
  values (v_o.profile_id, -v_o.total_paise, coalesce(v_label, 'Order'), 'order', p_order_id);

  update public.orders     set status = 'paid', expires_at = null where id = p_order_id;
  update public.shipments  set status = 'ready', updated_at = now() where order_id = p_order_id;
  update public.enrolments set status = 'active' where order_id = p_order_id and status = 'pending';

  return jsonb_build_object('ok', true, 'settled', true,
                            'balance_paise', v_balance - v_o.total_paise);
end;
$$;

revoke execute on function public.shop_order_settle(uuid) from public, anon, authenticated;

-- Release: a pending order's stock AND seats go back. Called by the owner's
-- cancel, the sweeper and enrol itself, so all three cover the Academy.
create or replace function public.shop_order_release(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.orders where id = p_order_id and status = 'pending' for update;
  if not found then
    return false;
  end if;

  -- Products locked in id order, the same order checkout takes them in.
  perform 1 from public.products
   where id in (select item_id from public.order_items
                 where order_id = p_order_id and item_type = 'product')
   order by id for update;

  update public.products p
     set stock = p.stock + i.qty
    from public.order_items i
   where i.order_id = p_order_id and i.item_type = 'product' and p.id = i.item_id;

  update public.academy_events e
     set seats_left = e.seats_left + i.qty
    from public.order_items i
   where i.order_id = p_order_id and i.item_type = 'event' and e.id = i.item_id;

  update public.orders     set status = 'cancelled', expires_at = null where id = p_order_id;
  update public.shipments  set status = 'cancelled', updated_at = now() where order_id = p_order_id;
  update public.enrolments set status = 'cancelled' where order_id = p_order_id and status = 'pending';
  return true;
end;
$$;

revoke execute on function public.shop_order_release(uuid) from public, anon, authenticated;

-- Refund: a paid shop OR Academy order, once, to the wallet. An event seat goes
-- back only while the event is still on; `p_restock` stays the shop's question.
create or replace function public.shop_order_refund(p_order_id uuid, p_reason text, p_restock boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o       public.orders%rowtype;
  v_academy text;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Only a paid shop or Academy order can be refunded.');
  end if;
  select min(title) into v_academy
    from public.order_items where order_id = p_order_id and item_type in ('course','event');
  if v_o.status <> 'paid'
     or not (v_academy is not null
             or exists (select 1 from public.shipments where order_id = p_order_id)) then
    return jsonb_build_object('ok', false, 'reason', 'Only a paid shop or Academy order can be refunded.');
  end if;

  insert into public.ledger (wallet_id, delta_paise, kind, ref_type, ref_id, note)
  values (v_o.profile_id, v_o.total_paise,
          case when v_academy is null then 'Refund · shop order' else 'Refund · ' || v_academy end,
          'refund', p_order_id, p_reason);

  if p_restock then
    perform 1 from public.products
     where id in (select item_id from public.order_items
                   where order_id = p_order_id and item_type = 'product')
     order by id for update;
    update public.products p
       set stock = p.stock + i.qty
      from public.order_items i
     where i.order_id = p_order_id and i.item_type = 'product' and p.id = i.item_id;
  end if;

  update public.academy_events e
     set seats_left = e.seats_left + i.qty
    from public.order_items i
   where i.order_id = p_order_id and i.item_type = 'event' and e.id = i.item_id
     and e.status = 'scheduled';

  update public.orders set status = 'refunded' where id = p_order_id;
  update public.shipments
     set status = case when status in ('shipped','delivered') then 'returned' else 'cancelled' end,
         updated_at = now()
   where order_id = p_order_id;
  update public.enrolments set status = 'refunded' where order_id = p_order_id and status = 'active';

  return jsonb_build_object('ok', true, 'refunded', true, 'amount_paise', v_o.total_paise);
exception when unique_violation then
  return jsonb_build_object('ok', true, 'refunded', false);
end;
$$;

revoke execute on function public.shop_order_refund(uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.shop_order_refund(uuid, text, boolean) to service_role;

-- 030's admin refund, audit-labelled by what was refunded.
create or replace function public.admin_order_refund(
  p_admin    uuid,
  p_order_id uuid,
  p_reason   text,
  p_restock  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'Say why — the buyer may ask.');
  end if;

  v_res := public.shop_order_refund(p_order_id, trim(p_reason), coalesce(p_restock, false));

  if (v_res->>'refunded')::boolean then
    insert into public.admin_actions (admin_id, action, target_type, target_id, detail)
    values (p_admin,
            case when exists (select 1 from public.shipments where order_id = p_order_id)
                 then 'shop.refund' else 'academy.refund' end,
            'order', p_order_id,
            jsonb_build_object('reason', trim(p_reason), 'restock', p_restock,
                               'amount_paise', v_res->'amount_paise'));
  end if;
  return v_res;
end;
$$;

revoke execute on function public.admin_order_refund(uuid, uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.admin_order_refund(uuid, uuid, text, boolean) to service_role;

-- ── Enrol ───────────────────────────────────────────────────────────────────
-- The client sends what, and how it pays. Never a price (rule 3). One
-- transaction (rule 5): a refusal leaves no order, no enrolment, no seat taken.

create or replace function public.academy_enrol(p_item_type text, p_item_id uuid, p_pay text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The same hold as a shop card checkout (028).
  c_hold    constant interval := interval '30 minutes';
  v_uid     uuid := auth.uid();
  v_ev      public.academy_events%rowtype;
  v_title   text;
  v_price   integer;
  v_order   uuid;
  v_settle  jsonb;
  v_balance integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'Sign in to enrol.');
  end if;
  if p_item_type is null or p_item_type not in ('course', 'event') then
    return jsonb_build_object('ok', false, 'reason', 'That is not something you can enrol in.');
  end if;
  if p_pay is null or p_pay not in ('wallet', 'razorpay') then
    return jsonb_build_object('ok', false, 'reason', 'Choose how you want to pay.');
  end if;

  -- Your own abandoned card checkout for this same thing goes back first, so
  -- tapping Enrol again is not refused by it.
  perform public.shop_order_release(e.order_id)
     from public.enrolments e
    where e.profile_id = v_uid and e.item_type = p_item_type and e.item_id = p_item_id
      and e.status = 'pending' and e.order_id is not null;

  begin
    if exists (select 1 from public.enrolments
                where profile_id = v_uid and item_type = p_item_type
                  and item_id = p_item_id and status = 'active') then
      raise exception using errcode = 'AC001', message = 'You are already enrolled.';
    end if;

    if p_item_type = 'course' then
      select title, price_paise into v_title, v_price
        from public.courses where id = p_item_id and active;
      if not found then
        raise exception using errcode = 'AC001', message = 'That course is not available.';
      end if;
    else
      -- The seat claim. Every enrolment in this event queues here.
      select * into v_ev from public.academy_events where id = p_item_id and active for update;
      if not found then
        raise exception using errcode = 'AC001', message = 'That event is not available.';
      elsif v_ev.status = 'cancelled' then
        raise exception using errcode = 'AC001', message = 'That event was cancelled.';
      elsif v_ev.starts_at <= now() then
        raise exception using errcode = 'AC001', message = 'That event has already started.';
      elsif v_ev.seats_left < 1 then
        raise exception using errcode = 'AC001', message = 'That one is full';
      end if;
      update public.academy_events set seats_left = seats_left - 1 where id = p_item_id;
      v_title := v_ev.title;
      v_price := v_ev.price_paise;
    end if;

    if v_price = 0 then
      insert into public.enrolments (profile_id, item_type, item_id, status)
      values (v_uid, p_item_type, p_item_id, 'active');
    else
      insert into public.orders (profile_id, status, total_paise, expires_at)
      values (v_uid, 'pending', v_price, now() + c_hold)
      returning id into v_order;

      -- Title and price are frozen copies: done-condition 3.
      insert into public.order_items (order_id, item_type, item_id, title, qty, unit_price_paise)
      values (v_order, p_item_type, p_item_id, v_title, 1, v_price);

      insert into public.enrolments (profile_id, item_type, item_id, order_id, status)
      values (v_uid, p_item_type, p_item_id, v_order, 'pending');

      if p_pay = 'wallet' then
        v_settle := public.shop_order_settle(v_order);   -- WB001 unwinds everything
      end if;
    end if;

  exception
    when sqlstate 'AC001' then
      return jsonb_build_object('ok', false, 'reason', sqlerrm);
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'You are already enrolled.');
    when sqlstate 'WB001' then
      select balance_paise into v_balance from public.wallets where profile_id = v_uid;
      return jsonb_build_object('ok', false, 'reason', 'Not enough balance',
                                'balance_paise', v_balance);
  end;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'status', case when v_price = 0 or p_pay = 'wallet' then 'active' else 'pending' end,
    'price_paise', v_price,
    'balance_paise', v_settle->'balance_paise');
end;
$$;

revoke execute on function public.academy_enrol(text, uuid, text) from public, anon;
grant  execute on function public.academy_enrol(text, uuid, text) to authenticated;

-- ── Cancel an event (admin) ─────────────────────────────────────────────────
-- Paid enrolments refunded, free ones cancelled, card checkouts still open
-- released — and one audit row, all in one transaction.

create or replace function public.admin_event_cancel(p_admin uuid, p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev       public.academy_events%rowtype;
  v_e        public.enrolments%rowtype;
  v_res      jsonb;
  v_refunded integer := 0;
  v_amount   integer := 0;
  v_freed    integer := 0;
  v_released integer := 0;
begin
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'Say why — everyone enrolled will ask.');
  end if;

  select * into v_ev from public.academy_events where id = p_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'No such event.');
  elsif v_ev.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'That event is already cancelled.');
  end if;

  update public.academy_events set status = 'cancelled' where id = p_event_id;

  -- Lock every order first, so a webhook settling one of them finishes before
  -- the loop reads its enrolment rather than after.
  -- ponytail: can deadlock with the sweeper releasing one of these orders in
  -- the same instant; Postgres aborts one side whole and Cancel is pressed again.
  perform 1 from public.orders
   where id in (select order_id from public.enrolments
                 where item_type = 'event' and item_id = p_event_id and order_id is not null)
   order by id for update;

  for v_e in
    select * from public.enrolments
     where item_type = 'event' and item_id = p_event_id and status in ('pending','active')
  loop
    if v_e.order_id is null then
      update public.enrolments set status = 'cancelled' where id = v_e.id;
      v_freed := v_freed + 1;
    elsif v_e.status = 'pending' then
      if public.shop_order_release(v_e.order_id) then
        v_released := v_released + 1;
      end if;
    else
      v_res := public.shop_order_refund(v_e.order_id, 'Event cancelled: ' || trim(p_reason), false);
      if (v_res->>'refunded')::boolean then
        v_refunded := v_refunded + 1;
        v_amount := v_amount + (v_res->>'amount_paise')::integer;
      end if;
    end if;
  end loop;

  insert into public.admin_actions (admin_id, action, target_type, target_id, detail)
  values (p_admin, 'academy.cancel_event', 'academy_event', p_event_id,
          jsonb_build_object('reason', trim(p_reason), 'refunded', v_refunded,
                             'amount_paise', v_amount, 'free_cancelled', v_freed,
                             'pending_released', v_released));

  return jsonb_build_object('ok', true, 'refunded', v_refunded, 'amount_paise', v_amount,
                            'free_cancelled', v_freed, 'pending_released', v_released);
end;
$$;

revoke execute on function public.admin_event_cancel(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_event_cancel(uuid, uuid, text) to service_role;
