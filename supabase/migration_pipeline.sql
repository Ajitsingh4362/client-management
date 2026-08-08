-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Adds client pipeline status + auto-WhatsApp-message tracking.

-- 1. Pipeline status on clients
alter table clients
  add column if not exists status text not null default 'new'
    check (status in ('new', 'in_progress', 'completed', 'declined'));

alter table clients
  add column if not exists declined_until date;

alter table clients
  add column if not exists last_message_at timestamptz;

-- 2. Simple key/value settings table (used to store the editable
--    auto-message template from the admin panel's WhatsApp tab)
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values (
  'auto_message_template',
  'Hi {name}! I build professional websites and admin panels for businesses like your business — {business} — so your customers can reach you online too, easily. If you''re interested, let me know and I''ll walk you through the details. Thank you!'
)
on conflict (key) do nothing;
