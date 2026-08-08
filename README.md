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
- **Clients** — add/edit/delete, search (name/phone), filter by category, CSV export
- **Client detail page** — full info + follow-up notes with optional due dates (mark done/pending)
- **Activity log** — who did what, when (client/note/employee changes)
- **Employees** — admin can add/remove staff logins with role (admin/staff); staff can't manage employees

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
