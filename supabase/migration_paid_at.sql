-- Adds a `paid_at` timestamp on `clients`, set automatically whenever a
-- client's payment_status becomes 'paid'. Used to calculate each Tele
-- Caller's monthly income (15% commission on Amount Paid, counted the
-- month the client was marked Fully Paid).
--
-- Run this once in Supabase Dashboard -> SQL Editor.

alter table clients add column if not exists paid_at timestamptz;

comment on column clients.paid_at is 'timestamp when payment_status last became paid — used for monthly Tele Caller income calculation';
