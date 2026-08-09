# WhatsApp Notifier (Baileys)

Standalone Node.js service that connects to a WhatsApp account (via a QR
scan, like WhatsApp Web) and lets the Zentrycs admin panel send WhatsApp
messages to clients. This folder lives inside the main `client-management`
repo for convenience, but it's a **separate service** — Vercel does not
build or run it. It needs to stay running continuously on its own, which
is why it's meant to be deployed somewhere always-on (e.g. Render), not
run alongside the Vercel site.

## Deploy to Render (recommended — always-on, no PC needed)

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect this GitHub repo, and set **Root Directory** to `whatsapp-notifier`
   (important — this folder has its own `package.json`, separate from the
   main site).
3. Build command: `npm install` — Start command: `npm start`.
4. Add environment variables:
   | Key | Value |
   |---|---|
   | `ADMIN_PASSWORD` | **Exact same value** as the main app's `ADMIN_PASSWORD` env var on Vercel |
   | `SUPABASE_URL` | Same value as the main app's `SUPABASE_URL` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same value as the main app's `SUPABASE_SERVICE_ROLE_KEY` |

   `ADMIN_PASSWORD` is what lets the admin panel's existing login token be
   trusted by this service too. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
   are used to store the WhatsApp login session in the database instead of
   the local disk — see below for why that matters.
5. Deploy. Once it's live, copy the service URL (e.g.
   `https://your-service.onrender.com`) and paste it into
   `WHATSAPP_NOTIFIER_URL` near the top of `public/index.html`'s `<script>`
   section in the main repo, then redeploy the main site.
6. Open the admin panel's **WhatsApp** tab (logged in as an admin) → click
   **Generate QR** → scan it with the WhatsApp account you want messages to
   be sent from (Settings → Linked Devices → Link a Device).
7. **Stop the service from sleeping** (see next section) — this is the
   #1 cause of "WhatsApp keeps disconnecting."

### Why WhatsApp kept disconnecting — and the fix

Two separate Render free-tier behaviors caused this, both now fixed/handled:

1. **The service falls asleep.** Render's free tier stops the process
   after ~15 minutes with no incoming HTTP traffic — WhatsApp's connection
   dies with it. This has nothing to do with your laptop's internet; it
   just often *looked* related because you'd notice it after being away.
   **Fix:** keep the service awake with a free external pinger — go to
   [UptimeRobot](https://uptimerobot.com) (or
   [cron-job.org](https://cron-job.org)), add a new monitor hitting
   `https://your-service.onrender.com/status` every 5 minutes. That
   keeps Render from ever spinning the service down.
   (A paid Render instance never sleeps at all, if you'd rather skip this step.)

2. **The disk was wiped on every restart.** The WhatsApp session used to
   be saved in a local `./auth` folder, which Render's free tier erases on
   every restart/redeploy/sleep-wake cycle — forcing a fresh QR scan each
   time. **This is now fixed:** the session is saved to your Supabase
   database instead (see `use-supabase-auth-state.js`), which survives
   restarts. You should only need to scan the QR once, going forward.

Reconnects after a genuine network blip now also back off exponentially
(3s, 6s, 12s... up to 60s) instead of retrying every 3s, so a shaky
connection doesn't hammer WhatsApp's servers.

## Running on your own PC instead

If you'd rather run this locally (no monthly cost, but only works while
your PC is on and connected):

```bash
cd whatsapp-notifier
npm install
set ADMIN_PASSWORD=your-value-here            (Windows)
set SUPABASE_URL=your-value-here
set SUPABASE_SERVICE_ROLE_KEY=your-value-here
export ADMIN_PASSWORD=your-value-here         (Mac/Linux)
export SUPABASE_URL=your-value-here
export SUPABASE_SERVICE_ROLE_KEY=your-value-here
npm start
```

Then point `WHATSAPP_NOTIFIER_URL` in `public/index.html` at
`http://localhost:3001` (only works if you're using the admin panel from
that same computer, or you tunnel it e.g. with ngrok).

## First-time WhatsApp login

1. Make sure the notifier is running (Render or local).
2. Log into the admin panel as an **admin** → open the **WhatsApp** tab →
   click **Generate QR**.
3. On your phone: WhatsApp → Settings → Linked Devices → Link a Device →
   scan the QR shown in the browser.
4. Tab switches to "Connected" within a couple of seconds.

The session is now saved in your **Supabase database** (`whatsapp_session`
table), not the local `./auth` folder — so it survives Render restarts and
sleep/wake cycles. You should only need to scan the QR once.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/status` | none | `{ connected: true/false }` |
| GET | `/qr` | admin only | current QR code as a data URL |
| POST | `/logout` | admin only | disconnects WhatsApp |
| POST | `/notify` | any logged-in admin/staff | `{ number, message }` — sends one WhatsApp message |

Auth = send an `x-admin-token` header with the same token value the admin
panel already stores in `sessionStorage` after logging in.

## Important notes

- This uses **Baileys**, an unofficial WhatsApp Web automation library —
  it works by emulating a linked device, not through WhatsApp's official
  Business API. That's fine for internal team notifications and low-volume
  client updates, but carries a real risk of the linked number being
  rate-limited or banned by WhatsApp if used for bulk/marketing-style
  messaging. For high-volume patient/client messaging, the official
  WhatsApp Business API is the safer long-term option.
- If it disconnects and won't reconnect after several minutes, use the
  admin panel's WhatsApp tab → **Logout**, then **Generate QR** again to
  re-link. If it keeps happening frequently, double check the UptimeRobot
  monitor above is actually pinging `/status` — that's almost always the
  cause on Render's free tier.
