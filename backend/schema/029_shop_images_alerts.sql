-- Forward-only — never edit once applied.
-- Phase 10, what 028 left for a real launch: somewhere to put product photos,
-- and somebody being told an order was paid.

-- ── Product photos ──────────────────────────────────────────────────────────
-- Public-read for the reason 022 gives: `products` is already readable by
-- anon, so a signed URL per card buys nothing. NO write policy for anybody —
-- photos arrive through `backend/seed/catalogue.mjs` on the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── Telegram alert on a paid order ──────────────────────────────────────────
-- Fires when a shipment turns `ready`, which `shop_order_settle` does exactly
-- once per paid order, for wallet and card alike.
--
-- pg_net QUEUES the request inside this transaction and sends it after
-- commit, so a payment that rolls back sends nothing. And the whole body is
-- wrapped: a missing token, a Telegram outage or a bug in this function must
-- never fail a payment. The worst case is a missed message, and /orders plus
-- the `shipments` table are still the truth.
--
-- Configure once per project, in the SQL editor — never in a migration, which
-- is committed:
--   select vault.create_secret('<bot token>',  'telegram_bot_token');
--   select vault.create_secret('<chat id>',    'telegram_chat_id');
-- Unset means silent, which is the right default for dev.

create extension if not exists pg_net;

create or replace function public.shop_notify_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_chat  text;
  v_total integer;
  v_lines text;
  v_a     jsonb := new.address;
begin
  begin
    select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
    select decrypted_secret into v_chat  from vault.decrypted_secrets where name = 'telegram_chat_id';
    if v_token is null or v_chat is null then
      return new;
    end if;

    select total_paise into v_total from public.orders where id = new.order_id;
    select string_agg(qty || ' × ' || title, E'\n' order by title) into v_lines
      from public.order_items where order_id = new.order_id and item_type = 'product';

    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body    := jsonb_build_object('chat_id', v_chat, 'text',
                   'New paid order · ₹' || trim(to_char(v_total / 100.0, 'FM9999999990.00')) || E'\n\n'
                   || v_lines || E'\n\n'
                   || 'Deliver to ' || (v_a->>'name') || ' · ' || (v_a->>'phone') || E'\n'
                   || (v_a->>'line1') || coalesce(', ' || (v_a->>'line2'), '') || E'\n'
                   || (v_a->>'city') || ', ' || (v_a->>'state') || ' ' || (v_a->>'pincode') || E'\n\n'
                   || 'Order ' || new.order_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'shop_notify_paid: % (order %)', sqlerrm, new.order_id;
  end;
  return new;
end;
$$;

revoke execute on function public.shop_notify_paid() from public, anon, authenticated;

create trigger shipments_notify_paid
  after update of status on public.shipments
  for each row
  when (new.status = 'ready' and old.status is distinct from 'ready')
  execute function public.shop_notify_paid();
