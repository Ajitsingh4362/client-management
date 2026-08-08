-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Adds deal/payment/progress tracking to the client profile page.

alter table clients
  add column if not exists deal_status text not null default 'pending'
    check (deal_status in ('pending', 'confirmed'));

alter table clients
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid'));

alter table clients
  add column if not exists amount_paid numeric not null default 0;

alter table clients
  add column if not exists progress_percent int not null default 0
    check (progress_percent between 0 and 100);
