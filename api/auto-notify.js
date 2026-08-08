// Triggered automatically by Vercel Cron (see vercel.json) once a day.
// For every client who is NOT completed/declined-and-still-paused, and who
// hasn't been auto-messaged in the last 2 days, sends the WhatsApp pitch
// message via the standalone whatsapp-notifier service, then stamps
// last_message_at so the next run knows to wait 2 more days.
//
// Protected by CRON_SECRET: set a CRON_SECRET env var in Vercel and Vercel
// will automatically send `Authorization: Bearer <CRON_SECRET>` on cron
// invocations — this file rejects any request that doesn't match, so the
// route can't be triggered by a random person hitting the URL.

const { createClient } = require('@supabase/supabase-js');
const { signToken } = require('./lib/auth');
const { logActivity } = require('./lib/activity');
const { getSetting, DEFAULT_TEMPLATE } = require('./lib/settings');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function fillTemplate(template, client) {
  return template
    .replace(/\{name\}/g, client.name || '')
    .replace(/\{business\}/g, (client.categories && client.categories.name) || 'aapke business');
}

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const notifierUrl = process.env.WHATSAPP_NOTIFIER_URL;
  if (!notifierUrl) {
    return res.status(500).json({ error: 'WHATSAPP_NOTIFIER_URL env var set nahi hai' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, phone_number, status, declined_until, last_message_at, categories(name)')
      .neq('status', 'completed')
      .or(`declined_until.is.null,declined_until.lte.${today}`);
    if (error) throw error;

    const now = Date.now();
    const due = (clients || []).filter(c => {
      if (!c.phone_number) return false;
      if (!c.last_message_at) return true;
      return now - new Date(c.last_message_at).getTime() >= TWO_DAYS_MS;
    });

    const template = await getSetting('auto_message_template', DEFAULT_TEMPLATE);
    const systemToken = signToken('auto-notify', 'admin');

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const client of due) {
      const message = fillTemplate(template, client);
      try {
        const resp = await fetch(`${notifierUrl}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': systemToken },
          body: JSON.stringify({ number: client.phone_number, message }),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok || !body.ok) throw new Error(body.error || `HTTP ${resp.status}`);

        await supabase.from('clients').update({ last_message_at: new Date().toISOString() }).eq('id', client.id);
        sent++;
      } catch (e) {
        failed++;
        errors.push({ client: client.name, error: e.message });
      }
    }

    await logActivity('auto-notify', 'sent auto WhatsApp messages', 'system', `${sent} sent, ${failed} failed`);
    return res.status(200).json({ ok: true, checked: due.length, sent, failed, errors });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
