-- Run this once in Supabase Dashboard -> SQL Editor (project setcpjldvktjixigiken)
-- Only needed if the table doesn't already exist.
create table if not exists whatsapp_session (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);
