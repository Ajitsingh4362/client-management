-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- General/team notes — a shared notepad not tied to any specific client.

create table if not exists team_notes (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  author text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_notes_created_at_idx on team_notes (created_at desc);
