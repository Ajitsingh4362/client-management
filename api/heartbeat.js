// Called every ~60s from the frontend while the dashboard is open, to
// track how long each employee keeps the app open per day. Not perfectly
// precise (heartbeats can be missed on flaky connections/backgrounded
// tabs), but good enough for a rough "time on app today" figure.

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HEARTBEAT_INTERVAL_SECONDS = 60;
// If the gap since the last heartbeat is bigger than this, the tab was
// probably closed/asleep in between — don't count that gap as active time.
const MAX_GAP_SECONDS = 120;

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const date = todayIST();
    const now = new Date();

    const { data: existing } = await supabase
      .from('employee_activity')
      .select('*')
      .eq('username', user.username)
      .eq('activity_date', date)
      .maybeSingle();

    let addSeconds = 0;
    if (existing && existing.last_heartbeat) {
      const gap = (now.getTime() - new Date(existing.last_heartbeat).getTime()) / 1000;
      addSeconds = gap > 0 && gap <= MAX_GAP_SECONDS ? Math.round(gap) : HEARTBEAT_INTERVAL_SECONDS;
    } else {
      addSeconds = HEARTBEAT_INTERVAL_SECONDS;
    }

    const newTotal = (existing ? existing.total_seconds : 0) + addSeconds;

    await supabase.from('employee_activity').upsert({
      username: user.username,
      activity_date: date,
      total_seconds: newTotal,
      last_heartbeat: now.toISOString(),
    });

    return res.status(200).json({ ok: true, total_seconds: newTotal });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
