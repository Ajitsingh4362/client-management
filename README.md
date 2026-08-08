# Client Management Dashboard

Node.js (Vercel serverless functions) + Supabase (Postgres) — client CRUD admin panel.

## Database (already created)

Supabase project: `client-dashboard` (project ref: `setcpjldvktjixigiken`, region: ap-south-1 / Mumbai)

Tables:
- **categories**: `id, name`
- **clients**: `id, name, phone_number, address, category_id (FK -> categories), created_at, updated_at`

RLS enabled — only the API's service-role key can access data, never directly from the browser.

## Local setup

```bash
npm install
cp .env.example .env
# Put your SUPABASE_SERVICE_ROLE_KEY and ADMIN_PASSWORD in .env
```

Get the service role key here: Supabase Dashboard → Project Settings → API → `service_role` key (this is a secret — never use it in frontend code).

Use the Vercel CLI to run locally (since these are serverless functions):

```bash
npm install -g vercel
vercel dev
```

Open `http://localhost:3000` in your browser → log in with the admin password.

## Deploy to Vercel

```bash
vercel --prod
```

Before deploying, add these Environment Variables in the Vercel dashboard (Project → Settings → Environment Variables):

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://setcpjldvktjixigiken.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
| `ADMIN_PASSWORD` | your admin panel password |

## Features

- **Dashboard** — total clients, category-wise breakdown, today's & overdue follow-up reminders
- **Clients** — add/edit/delete, search (name/phone), filter by category/status, CSV export
- **Client pipeline status** — every client is New → In Progress → Completed, or Declined (client declined → 30-day auto-message pause)
- **Auto WhatsApp message every 2 days** — Vercel Cron hits `/api/auto-notify` daily; it messages every client who isn't Completed/currently-paused and hasn't been messaged in the last 2 days. Message template is editable from the WhatsApp tab (admin only)
- **Client detail/profile page** — full info + pipeline status controls + Deal & Progress tracking (deal status, payment received, work progress %) + follow-up notes with optional due dates (mark done/pending)
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
6. Edit the message text anytime from the admin panel's WhatsApp tab — use `{name}` and `{business}` as placeholders.

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

- `SUPABASE_SERVICE_ROLE_KEY` stays server-side only (Vercel env var), never in client-side code.
- The admin panel uses simple shared-password auth (`x-admin-token` header). If you need more users/roles, Supabase Auth can be added.
- **Important:** if you ever paste a GitHub token or other credential into a chat or share it elsewhere, revoke/regenerate it right away from GitHub settings.
