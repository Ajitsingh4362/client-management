// This file handles TWO routes (merged to stay under Vercel's serverless
// function limit — see vercel.json, which rewrites /api/reassign-leads
// here with a `type=reassign-leads` query param):
//   - /api/employees        (default): employee CRUD
//   - /api/reassign-leads   (type=reassign-leads): bulk "swipe N leads"
//     transfer between Tele Callers, used by the Task Distribution page.

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');
const { logActivity } = require('./lib/activity');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handleReassignLeads(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  try {
    if ((req.query && req.query.type) === 'reassign-leads') {
      return await handleReassignLeads(req, res, user);
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('employees').select('id, username, role, created_at').order('created_at');
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { username, password, role } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
      const ALLOWED_ROLES = ['admin', 'lead_generation', 'tele_caller'];
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: 'role must be one of: admin, lead_generation, tele_caller' });
      }
      const { data, error } = await supabase
        .from('employees')
        .insert([{ username, password, role }])
        .select('id, username, role, created_at');
      if (error) throw error;
      await logActivity(user.username, 'added employee', 'employee', username);
      return res.status(201).json(data[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const { reassign_to } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { data: existing } = await supabase.from('employees').select('username').eq('id', id).single();
      if (!existing) return res.status(404).json({ error: 'Employee not found' });

      // Their leads shouldn't silently point at a username that no longer
      // exists (invisible, uncounted anywhere) — either hand them to
      // another Tele Caller, or clear the assignment so they show up in
      // the "Unassigned" pool on Task Distribution for the admin to sort out.
      const { data: theirLeads } = await supabase
        .from('clients').select('id').eq('assigned_to', existing.username);
      const leadCount = theirLeads ? theirLeads.length : 0;

      if (leadCount > 0) {
        if (reassign_to) {
          const { data: target } = await supabase
            .from('employees').select('username, role').eq('username', reassign_to).maybeSingle();
          if (!target || target.role !== 'tele_caller') {
            return res.status(400).json({ error: `${reassign_to} is not a Tele Caller` });
          }
          await supabase.from('clients').update({ assigned_to: reassign_to }).eq('assigned_to', existing.username);
        } else {
          await supabase.from('clients').update({ assigned_to: null }).eq('assigned_to', existing.username);
        }
      }

      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      await logActivity(
        user.username,
        `removed employee${leadCount > 0 ? ` (${leadCount} lead(s) ${reassign_to ? `moved to ${reassign_to}` : 'unassigned'})` : ''}`,
        'employee', existing.username
      );
      return res.status(200).json({ ok: true, leadsAffected: leadCount });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
