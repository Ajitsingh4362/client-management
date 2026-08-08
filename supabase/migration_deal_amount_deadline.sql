-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Adds deal value + deadline tracking, shown on the client profile page
-- once a deal is marked Confirmed.

alter table clients
  add column if not exists deal_amount numeric not null default 0;

alter table clients
  add column if not exists deal_deadline date;
