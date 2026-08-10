// Bulk-transfers leads from one Tele Caller to another. Used by the admin
// panel's "Task Distribution" page for the "swipe N leads" bulk-move
// action (moves the oldest N leads first, so long-pending ones move first).

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');
const { logActivity } = require('./lib/activity');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { from, to, count } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: 'from and to (usernames) are required' });
    if (from === to) return res.status(400).json({ error: 'from and to cannot be the same person' });

    const n = Number(count) || 0;
    if (n <= 0) return res.status(400).json({ error: 'count must be greater than 0' });

    // Confirm "to" is an actual Tele Caller (keeps leads only ever landing
    // on people set up to work them).
    const { data: toEmp, error: toErr } = await supabase
      .from('employees').select('username, role').eq('username', to).maybeSingle();
    if (toErr) throw toErr;
    if (!toEmp || toEmp.role !== 'tele_caller') {
      return res.status(400).json({ error: `${to} is not a Tele Caller` });
    }

    const { data: candidates, error: findErr } = await supabase
      .from('clients')
      .select('id, name')
      .eq('assigned_to', from)
      .order('created_at', { ascending: true })
      .limit(n);
    if (findErr) throw findErr;

    if (!candidates || !candidates.length) {
      return res.status(200).json({ moved: 0 });
    }

    const ids = candidates.map(c => c.id);
    const { error: updErr } = await supabase.from('clients').update({ assigned_to: to }).in('id', ids);
    if (updErr) throw updErr;

    await logActivity(user.username, `bulk-moved ${ids.length} lead(s) from ${from} to ${to}`, 'client', null);

    return res.status(200).json({ moved: ids.length, names: candidates.map(c => c.name) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
