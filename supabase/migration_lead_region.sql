-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Adds a lead_region column so clients can be split into
-- "All Indian Leads" vs "All Foreign Leads" tabs.

alter table clients
  add column if not exists lead_region text not null default 'india'
    check (lead_region in ('india', 'foreign'));
