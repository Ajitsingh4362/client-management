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
4. Add an environment variable:
   | Key | Value |
   |---|---|
   | `ADMIN_PASSWORD` | **Exact same value** as the main app's `ADMIN_PASSWORD` env var on Vercel |

   This is what lets the admin panel's existing login token be trusted by
   this service too — there's no separate login here.
5. Deploy. Once it's live, copy the service URL (e.g.
   `https://your-service.onrender.com`) and paste it into
   `WHATSAPP_NOTIFIER_URL` near the top of `public/index.html`'s `<script>`
   section in the main repo, then redeploy the main site.
6. Open the admin panel's **WhatsApp** tab (logged in as an admin) → click
   **Generate QR** → scan it with the WhatsApp account you want messages to
   be sent from (Settings → Linked Devices → Link a Device).

### Important: Render's free tier has an ephemeral filesystem

The WhatsApp login session is saved in a local `./auth` folder. On Render's
**free** tier, that folder is wiped whenever the service restarts or
redeploys — meaning you'd have to re-scan the QR each time. Options:

- Add a Render **persistent disk** (paid, a few dollars/month) mounted at
  this service's working directory — session then survives restarts.
- Or accept re-scanning occasionally on the free tier if usage is low.

## Running on your own PC instead

If you'd rather run this locally (no monthly cost, but only works while
your PC is on and connected):

```bash
cd whatsapp-notifier
npm install
set ADMIN_PASSWORD=your-value-here     (Windows)
export ADMIN_PASSWORD=your-value-here  (Mac/Linux)
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

The session is saved in `./auth` (inside this folder) — you only scan
once (subject to the Render free-tier caveat above). **This `auth` folder
is git-ignored on purpose** — it holds a live WhatsApp login session and
must never be committed or shared.

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
- If it disconnects and won't reconnect, delete `./auth` and re-scan.
