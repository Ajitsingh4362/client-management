const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
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
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
