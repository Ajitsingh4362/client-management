// index.js
// WhatsApp notifier for Zentrycs Client Management — Baileys-based, with a
// browser-friendly QR login (shown in the admin panel's WhatsApp tab instead
// of a terminal) and a manual /notify endpoint the admin panel can call.
//
// This is a completely separate, standalone Node.js service — it does NOT
// get built/deployed by Vercel along with the main website. It's meant to
// run continuously on its own (e.g. Render's free web service tier), since
// WhatsApp needs a long-lived connection.
//
// FIRST TIME SETUP:
//   1. npm install
//   2. Set the ADMIN_PASSWORD env var to the EXACT SAME value as the main
//      app's Vercel ADMIN_PASSWORD env var (this is what lets the admin
//      panel's existing login token be trusted here too, with no separate
//      login system).
//   3. node index.js
//   4. Open the admin panel's WhatsApp tab — a QR image will appear there.
//      Scan it with WhatsApp (Settings -> Linked Devices -> Link a Device).
//   5. Once connected, the session is saved in ./auth — no need to scan
//      again unless you log out or delete that folder.
//
// Endpoints (default port 3001):
//   GET  /status  -> { connected: true/false }                         [public]
//   GET  /qr      -> { qr: "data:image/png;base64,...", connected }    [admin only]
//   POST /logout  -> disconnects WhatsApp                              [admin only]
//   POST /notify  -> { "number": "919999999999", "message": "..." }    [logged-in admin/staff, rate-limited]
//
// "admin only" / "logged-in" = the caller sends an
// `x-admin-token: <token>` header — the SAME token the admin panel already
// holds in sessionStorage after logging in via /api/login on the main site.
// This service verifies it with the identical HMAC scheme as
// api/lib/auth.js in the main repo, using the shared ADMIN_PASSWORD secret
// — no separate database or login needed here.

const crypto = require('crypto')
const makeWASocket = require('@whiskeysockets/baileys').default
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const QRCode = require('qrcode')
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const pino = require('pino')

const PORT = process.env.PORT || 3001
let sock = null
let isReady = false
let currentQrDataUrl = null // base64 PNG data URL of the latest QR
const pendingSends = {} // messageId -> { resolve } — waiting for delivery ack
let sendQueue = Promise.resolve() // serializes outgoing sends so they're spaced out, not bursty

// ─── Shared admin-token verification (mirrors api/lib/auth.js) ──────────
function authSecret() {
  return process.env.ADMIN_PASSWORD || 'fallback-secret'
}

function verifyAdminToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const parts = decoded.split('|')
    if (parts.length !== 3) return null
    const [username, role, sig] = parts
    const expected = crypto.createHmac('sha256', authSecret()).update(`${username}|${role}`).digest('hex')
    if (sig !== expected) return null
    return { username, role }
  } catch (e) {
    return null
  }
}

function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  const user = verifyAdminToken(token)
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  req.adminUser = user
  next()
}

// Only admins may connect/disconnect the WhatsApp account itself.
function requireAdminRole(req, res, next) {
  requireAdminAuth(req, res, () => {
    if (req.adminUser.role !== 'admin') return res.status(403).json({ ok: false, error: 'You do not have permission for this action' })
    next()
  })
}

// ─── WhatsApp connection ─────────────────────────────────
async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()
  console.log('Using WhatsApp Web version:', version.join('.'))

  sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'error' }),
    markOnlineOnConnect: true,
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      currentQrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 })
      console.log('New QR generated — open the admin panel WhatsApp tab to scan it.')
    }

    if (connection === 'close') {
      isReady = false
      currentQrDataUrl = null
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log('Disconnect reason:', lastDisconnect?.error?.message || lastDisconnect?.error, '| statusCode:', statusCode)
      console.log(shouldReconnect ? 'Reconnecting...' : 'Logged out — delete ./auth folder and restart to re-link.')
      if (shouldReconnect) setTimeout(startWhatsApp, 3000)
    } else if (connection === 'open') {
      isReady = true
      currentQrDataUrl = null
      console.log('WhatsApp connected and ready.')
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // Track delivery status (2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ) vs
  // silently dropped (stays at 1 = PENDING).
  sock.ev.on('messages.update', (updates) => {
    for (const u of updates) {
      const id = u.key?.id
      if (id && pendingSends[id]) {
        const status = u.update?.status
        if (status >= 2) {
          pendingSends[id].resolve(status)
          delete pendingSends[id]
        }
      }
    }
  })
}

// ─── Helper: send a message ──────────────────────────────
// number format: country code + number, no + or spaces, e.g. "919999999999"
function sendWhatsAppMessage(number, message) {
  const task = sendQueue.then(() => sendOnce(number, message))
  sendQueue = task.catch(() => {}) // keep the queue alive even if this send fails
  return task
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function resolveJid(number) {
  if (number.includes('@')) return number // already a full JID
  const results = await sock.onWhatsApp(number)
  const match = results && results[0]
  if (!match || !match.exists) {
    throw new Error(`${number} does not appear to be a valid WhatsApp number`)
  }
  // Sending to the classic "<number>@s.whatsapp.net" form is the reliable
  // one — the @lid-form JID onWhatsApp() sometimes returns can silently
  // fail to deliver even though sendMessage() resolves without error.
  return `${number}@s.whatsapp.net`
}

async function sendOnce(number, message, isRetry = false) {
  if (!isReady) throw new Error('WhatsApp is not connected yet.')

  const jid = await resolveJid(number)

  // Simulate a human typing instead of blasting the message instantly —
  // cold-sends to unfamiliar numbers are more likely to get silently
  // dropped by WhatsApp's spam heuristics without this.
  await sock.presenceSubscribe(jid).catch(() => {})
  await wait(300)
  await sock.sendPresenceUpdate('composing', jid).catch(() => {})
  await wait(1200 + Math.random() * 1500)
  await sock.sendPresenceUpdate('paused', jid).catch(() => {})
  await wait(200)

  const sent = await sock.sendMessage(jid, { text: message })
  const msgId = sent?.key?.id

  // Wait up to 8s for WhatsApp's server to actually acknowledge the
  // message. If it never does, retry once — a second attempt a few
  // seconds later often goes through.
  if (msgId) {
    const status = await new Promise((resolve) => {
      pendingSends[msgId] = { resolve }
      setTimeout(() => {
        if (pendingSends[msgId]) {
          delete pendingSends[msgId]
          resolve(null)
        }
      }, 8000)
    })

    if (status === null && !isRetry) {
      console.log(`No delivery ack for message to ${jid}, retrying once...`)
      await wait(2000)
      return sendOnce(number, message, true)
    }
    if (status === null) {
      console.log(`Still no delivery ack for ${jid} after retry — WhatsApp may be silently blocking this number.`)
    }
  }

  await wait(800 + Math.random() * 700) // small gap before the next queued message
}

// For Indian numbers people often type just the 10-digit local number, so
// we prepend the 91 country code. Foreign numbers must NOT get this
// treatment — a 10-digit US/UK/etc number without its own country code
// would otherwise get a wrong "91" stuck on the front. Callers pass
// region: 'foreign' for foreign clients so we skip that assumption.
function cleanPhone(phone, region) {
  let p = (phone || '').replace(/[^\d]/g, '')
  if (region !== 'foreign' && p.length === 10) p = '91' + p
  return p
}

// ─── HTTP server the admin panel calls ───────────────────
const app = express()
app.use(cors()) // the admin panel runs on a different origin (Vercel vs this service)
app.use(express.json())

const notifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests — please wait a minute and try again.' },
})

app.get('/status', (req, res) => {
  res.json({ connected: isReady })
})

app.get('/qr', requireAdminRole, (req, res) => {
  res.json({ qr: currentQrDataUrl, connected: isReady })
})

app.post('/logout', requireAdminRole, async (req, res) => {
  try {
    if (sock) await sock.logout()
    isReady = false
    currentQrDataUrl = null
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Any logged-in admin or staff member can send a manual notification
// (e.g. from the admin panel's WhatsApp tab), not just admins — matches
// who can already see client phone numbers in the main app.
app.post('/notify', requireAdminAuth, notifyLimiter, async (req, res) => {
  const { number, message, region } = req.body || {}
  if (!number || !message) {
    return res.status(400).json({ ok: false, error: 'number and message are required' })
  }
  try {
    await sendWhatsAppMessage(cleanPhone(number, region), message)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Used by the daily auto-notify cron (api/auto-notify.js) to send many
// messages WITHOUT blasting them all at once — WhatsApp is much more
// likely to flag/block an account that sends a burst of near-identical
// messages back to back. Instead this responds immediately (so the
// short-lived Vercel cron function doesn't time out waiting), then keeps
// this long-running service sending one message every `intervalMs`
// (default 5 minutes) in the background.
app.post('/notify-batch', requireAdminRole, async (req, res) => {
  const { messages, intervalMs } = req.body || {}
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ ok: false, error: 'messages array is required' })
  }
  const gap = Number(intervalMs) > 0 ? Number(intervalMs) : 5 * 60 * 1000

  res.json({ ok: true, queued: messages.length, intervalMs: gap })

  ;(async () => {
    for (let i = 0; i < messages.length; i++) {
      const item = messages[i]
      if (!item || !item.number || !item.message) continue
      try {
        await sendWhatsAppMessage(cleanPhone(item.number, item.region), item.message)
        console.log(`Batch send ${i + 1}/${messages.length}: sent to ${item.number}`)
      } catch (err) {
        console.log(`Batch send ${i + 1}/${messages.length}: failed for ${item.number} — ${err.message}`)
      }
      if (i < messages.length - 1) await wait(gap) // no need to wait after the last one
    }
    console.log('Batch send complete.')
  })()
})

app.listen(PORT, () => {
  console.log(`WhatsApp notifier running on port ${PORT}`)
  console.log(`Open the admin panel's WhatsApp tab to see the QR and connect.`)
})

startWhatsApp()
