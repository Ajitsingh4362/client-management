# Client Management Dashboard

Node.js (Vercel serverless functions) + Supabase (Postgres) — client CRUD admin panel.

## Database (already created)

Supabase project: `client-dashboard` (project ref: `setcpjldvktjixigiken`, region: ap-south-1 / Mumbai)

Tables:
- **categories**: `id, name`
- **clients**: `id, name, phone_number, address, category_id (FK -> categories), created_at, updated_at`

RLS enabled — API service-role key hi data access karta hai, browser se direct nahi.

## Local setup

```bash
npm install
cp .env.example .env
# .env me apna SUPABASE_SERVICE_ROLE_KEY aur ADMIN_PASSWORD daalein
```

Service role key yahan se milegi: Supabase Dashboard → Project Settings → API → `service_role` key (secret hai, kabhi frontend me use na karein).

Local run ke liye Vercel CLI use karein (kyunki ye serverless functions hain):

```bash
npm install -g vercel
vercel dev
```

Browser me `http://localhost:3000` kholein → admin password se login karein.

## Deploy to Vercel

```bash
vercel --prod
```

Deploy se pehle Vercel dashboard me ye Environment Variables add karein (Project → Settings → Environment Variables):

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://setcpjldvktjixigiken.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | apni Supabase service_role key |
| `ADMIN_PASSWORD` | apna admin panel password |

## Features

- **Dashboard** — total clients, category-wise breakdown, today's & overdue follow-up reminders
- **Clients** — add/edit/delete, search (name/phone), filter by category/status, CSV export
- **Client pipeline status** — every client is New → In Progress → Completed, or Declined (client ne mana kiya → 30 din auto-message pause)
- **Auto WhatsApp message every 2 days** — Vercel Cron hits `/api/auto-notify` daily; it messages every client who isn't Completed/currently-paused and hasn't been messaged in the last 2 days. Message template is editable from the WhatsApp tab (admin only)
- **Client detail page** — full info + status controls + follow-up notes with optional due dates (mark done/pending)
- **Activity log** — who did what, when (client/note/employee changes, auto-message runs)
- **Employees** — admin can add/remove staff logins with role (admin/staff); staff can't manage employees

## Setting up the 2-day auto-message

1. Run `supabase/migration_pipeline.sql` once in Supabase Dashboard → SQL Editor (adds `status`, `declined_until`, `last_message_at` columns + an `app_settings` table).
2. Run `supabase/migration_deal_progress.sql` once too (adds `deal_status`, `payment_status`, `amount_paid`, `progress_percent` columns — used on the client profile page's "Deal & Progress" card).
3. Deploy the `whatsapp-notifier/` service separately (see its own README) and connect it once via the admin panel's WhatsApp tab (scan QR).
4. In Vercel → Project → Settings → Environment Variables, add:

| Key | Value |
|---|---|
| `WHATSAPP_NOTIFIER_URL` | URL of your deployed `whatsapp-notifier` service |
| `CRON_SECRET` | Any random long string — Vercel automatically sends it as `Authorization: Bearer <value>` on cron runs, so `/api/auto-notify` can verify the request is really from Vercel Cron |

5. `vercel.json` already schedules the cron (`30 4 * * *` = 10:00 AM IST daily). Vercel checks this endpoint once a day; the endpoint itself only messages clients whose last auto-message was 2+ days ago, so each client still gets messaged roughly every 2 days.
5. Edit the message text anytime from the admin panel's WhatsApp tab — use `{name}` and `{business}` as placeholders.

## Structure

```
api/
  login.js       -> admin password check
  clients.js     -> GET/POST/PUT/DELETE clients
  categories.js  -> GET/POST categories
public/
  index.html     -> admin dashboard UI (login + client form + table)
```

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` sirf server (Vercel env var) me rahegi, kabhi client-side code me nahi.
- Admin panel simple shared-password auth use karta hai (`x-admin-token` header). Zyada users/roles chahiye ho to Supabase Auth add kiya ja sakta hai.
- **Important:** Aapne apna GitHub token isi chat me paste kiya tha — usko turant GitHub settings se revoke/regenerate kar dijiye agar abhi tak nahi kiya.
