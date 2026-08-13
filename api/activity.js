// This file handles THREE routes (merged to stay under Vercel's serverless
// function limit — see vercel.json, which rewrites /api/heartbeat and
// /api/employee-activity here with a `type` query param):
//   - /api/activity            (type=activity, default): recent activity log
//   - /api/employee-activity   (type=employee-activity): time-on-app stats
//   - /api/heartbeat           (type=heartbeat): time-on-app ping

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

async function handleActivityLog(req, res, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return res.status(200).json(data);
}

async function handleEmployeeActivity(req, res, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const date = todayIST();

  if (user.role === 'admin') {
    const [{ data: emps }, { data: today }] = await Promise.all([
      supabase.from('employees').select('username, role'),
      supabase.from('employee_activity').select('username, total_seconds, last_heartbeat').eq('activity_date', date),
    ]);
    const byUser = {};
    (today || []).forEach(t => { byUser[t.username] = t; });

    const roster = emps ? [...emps] : [];
    if (!roster.some(e => e.username === user.username)) {
      roster.unshift({ username: user.username, role: 'admin' });
    }

    const all = roster.map(e => ({
      username: e.username,
      role: e.role,
      total_seconds: byUser[e.username] ? byUser[e.username].total_seconds : 0,
      last_heartbeat: byUser[e.username] ? byUser[e.username].last_heartbeat : null,
    }));
    return res.status(200).json({ date, employees: all });
  }

  const { data } = await supabase
    .from('employee_activity')
    .select('total_seconds, last_heartbeat')
    .eq('username', user.username)
    .eq('activity_date', date)
    .maybeSingle();

  return res.status(200).json({ date, total_seconds: data ? data.total_seconds : 0 });
}

async function handleHeartbeat(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const type = (req.query && req.query.type) || 'activity';
    if (type === 'employee-activity') return await handleEmployeeActivity(req, res, user);
    if (type === 'heartbeat') return await handleHeartbeat(req, res, user);
    return await handleActivityLog(req, res, user);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
