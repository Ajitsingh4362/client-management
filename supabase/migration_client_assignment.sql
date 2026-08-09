-- Adds an `assigned_to` column on `clients` so new leads can be
-- auto-distributed (round-robin / load-balanced) among Tele Caller employees.
--
-- Run this once in Supabase Dashboard -> SQL Editor.

alter table clients add column if not exists assigned_to text;

comment on column clients.assigned_to is 'username of the Tele Caller employee this client/lead is assigned to (auto-distributed on creation)';
