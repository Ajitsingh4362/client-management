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
- **India vs Foreign leads** — every client is tagged `lead_region` (`india` or `foreign`). Separate "Add Client"/"All Indian Leads" and "Add Foreign Client"/"All Foreign Leads" tabs. Foreign phone numbers are sent as-is (no automatic `91` country-code prefix like Indian 10-digit numbers get).
- **Client pipeline status** — every client is New → In Progress → Completed, or Declined (client declined → 30-day auto-message pause)
- **Auto WhatsApp message every 2 days** — Vercel Cron hits `/api/auto-notify` daily; it messages every client who isn't Completed/currently-paused and hasn't been messaged in the last 2 days. Message template is editable from the WhatsApp tab (admin only)
- **Client detail/profile page** — full info + pipeline status controls + Deal & Progress tracking (deal status, payment received, work progress %, deal amount, deadline) + downloadable Quotation/Invoice PDFs once a deal is Confirmed + follow-up notes with optional due dates (mark done/pending)
- **Activity log** — who did what, when (client/note/employee changes, auto-message runs)
- **Employees** — admin can add/remove staff logins with role (admin/staff); staff can't manage employees

## Setting up the 2-day auto-message

1. Run `supabase/migration_pipeline.sql` once in Supabase Dashboard → SQL Editor (adds `status`, `declined_until`, `last_message_at` columns + an `app_settings` table).
2. Run `supabase/migration_deal_progress.sql` once too (adds `deal_status`, `payment_status`, `amount_paid`, `progress_percent` columns — used on the client profile page's "Deal & Progress" card).
3. Run `supabase/migration_categories_reset.sql` if you want to replace the categories list with the default business types (Hospital, Gym, Restaurants, Coaching, School) — this clears the category off any existing clients, since it deletes and re-inserts categories.
4. Run `supabase/migration_lead_region.sql` once too (adds the `lead_region` column powering the Indian vs Foreign leads tabs).
5. Run `supabase/migration_deal_amount_deadline.sql` once too (adds `deal_amount` and `deal_deadline` — shown on the client profile once a deal is marked Confirmed, and rolled up into the dashboard's "Total Deal Value" and "Upcoming Deal Deadlines" cards).
6. Run `supabase/migration_set_templates.sql` if you want to set the Indian and Foreign auto-message templates directly via SQL instead of typing them into the WhatsApp tab. Indian and foreign clients now use **separate** templates (`auto_message_template` for India, `auto_message_template_foreign` for foreign — write this one in English) — both editable from the WhatsApp tab.
7. Deploy the `whatsapp-notifier/` service separately (see its own README) and connect it once via the admin panel's WhatsApp tab (scan QR).
8. In Vercel → Project → Settings → Environment Variables, add:

| Key | Value |
|---|---|
| `WHATSAPP_NOTIFIER_URL` | URL of your deployed `whatsapp-notifier` service |
| `CRON_SECRET` | Any random long string — Vercel automatically sends it as `Authorization: Bearer <value>` on cron runs, so `/api/auto-notify` can verify the request is really from Vercel Cron |

7. `vercel.json` schedules the cron at `30 5 * * *` = **11:00 AM IST daily**. This is a general best-practice window for reaching hospital/clinic admin staff in India — after the morning OPD rush settles and before the evening OPD rush picks up (roughly 10:30 AM–12:30 PM). Since Hospital is the default client category, the whole daily run is timed around that. Adjust the schedule in `vercel.json` if most of your clients are a different business type. Note: Vercel checks this endpoint once a day; the endpoint itself only messages clients whose last auto-message was 2+ days ago, so each client still gets messaged roughly every 2 days.
8. Messages are **not** sent all at once — `/api/auto-notify` hands the whole day's list to the `whatsapp-notifier` service in one call, and that service sends them one at a time, 5 minutes apart (see `BATCH_INTERVAL_MS` in `api/auto-notify.js`), so WhatsApp doesn't see a burst of near-identical messages and flag the number as spam. For 20 due clients, the last message goes out about 95 minutes after the cron fires — that's expected.
9. Edit the message text anytime from the admin panel's WhatsApp tab — use `{name}` and `{business}` as placeholders.

## Invoices & Quotations

Once a client's deal is marked **Confirmed** on their profile page, two buttons appear under "Deal & Progress": **Download Quotation** and **Download Invoice**. Both are generated on the fly as PDFs (via `pdfkit`, see `api/invoice.js`) using the client's Deal Amount, Amount Paid, and Deadline — no extra data entry needed. The company logo (`public/assets/logo.png`) is placed in the header automatically. The invoice shows Total / Amount Paid / Balance Due; the quotation just shows the total.

Set your company name, contact info, and address once from the WhatsApp tab's "Invoice / Quotation Details" card (admin only) — they show on every generated PDF.

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
