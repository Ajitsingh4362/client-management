// Triggered automatically by Vercel Cron (see vercel.json) once a day.
// For every client who is NOT completed, NOT deal-confirmed, and NOT
// declined-and-still-paused, and who hasn't been auto-messaged in the last
// 2 days, this hands the whole list off to the standalone whatsapp-notifier
// service in one go, which then sends them one at a time with a gap
// between each (see BATCH_INTERVAL_MS) instead of firing them all at once —
// a burst of near-identical messages is much more likely to get an account
// flagged/blocked by WhatsApp.
//
// Protected by CRON_SECRET: set a CRON_SECRET env var in Vercel and Vercel
// will automatically send `Authorization: Bearer <CRON_SECRET>` on cron
// invocations — this file rejects any request that doesn't match, so the
// route can't be triggered by a random person hitting the URL.

const { createClient } = require('@supabase/supabase-js');
const { signToken } = require('./lib/auth');
const { logActivity } = require('./lib/activity');
const { getSetting, DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FOREIGN } = require('./lib/settings');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const BATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between each WhatsApp message

function fillTemplate(template, client) {
  return template
    .replace(/\{name\}/g, client.name || '')
    .replace(/\{business\}/g, (client.categories && client.categories.name) || 'your business');
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
    return res.status(500).json({ error: 'WHATSAPP_NOTIFIER_URL env var is not set' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, phone_number, status, deal_status, declined_until, last_message_at, lead_region, categories(name)')
      .neq('status', 'completed')
      .neq('deal_status', 'confirmed')
      .or(`declined_until.is.null,declined_until.lte.${today}`);
    if (error) throw error;

    const now = Date.now();
    const due = (clients || []).filter(c => {
      if (!c.phone_number) return false;
      if (!c.last_message_at) return true;
      return now - new Date(c.last_message_at).getTime() >= TWO_DAYS_MS;
    });

    if (!due.length) {
      await logActivity('auto-notify', 'checked for due WhatsApp messages', 'system', '0 due');
      return res.status(200).json({ ok: true, checked: 0, queued: 0 });
    }

    const [template, templateForeign] = await Promise.all([
      getSetting('auto_message_template', DEFAULT_TEMPLATE),
      getSetting('auto_message_template_foreign', DEFAULT_TEMPLATE_FOREIGN),
    ]);
    const messages = due.map(client => ({
      number: client.phone_number,
      message: fillTemplate(client.lead_region === 'foreign' ? templateForeign : template, client),
      region: client.lead_region,
    }));

    const resp = await fetch(`${notifierUrl}/notify-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': signToken('auto-notify', 'admin') },
      body: JSON.stringify({ messages, intervalMs: BATCH_INTERVAL_MS }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || !body.ok) throw new Error(body.error || `HTTP ${resp.status}`);

    // Mark all of them now — the actual sends trickle out over the next
    // ~(messages.length - 1) * 5 minutes in the background on the notifier
    // service. Good enough for a once-a-day 2-day gate.
    const ids = due.map(c => c.id);
    await supabase.from('clients').update({ last_message_at: new Date().toISOString() }).in('id', ids);

    await logActivity('auto-notify', 'queued auto WhatsApp messages', 'system', `${messages.length} queued, 5 min apart`);
    return res.status(200).json({ ok: true, checked: due.length, queued: messages.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
