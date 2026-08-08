-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Sets the Indian auto-message template to the requested text, and adds a
-- separate English template used only for foreign clients.

insert into app_settings (key, value, updated_at) values
  (
    'auto_message_template',
    'Namaste {name} ji! Main {business} ke liye website aur admin panel banane me help karta hoon — customers online se aapko contact kar sakein, records bhi easily manage ho jaayein. Interested? Bataiyega!',
    now()
  ),
  (
    'auto_message_template_foreign',
    'Hi {name}! I help businesses like {business} build a professional website and admin panel — so customers can reach you online and your records are easy to manage. Interested? Let me know!',
    now()
  )
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
