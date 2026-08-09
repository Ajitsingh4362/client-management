const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');
const { logActivity } = require('./lib/activity');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  try {
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
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { data: existing } = await supabase.from('employees').select('username').eq('id', id).single();
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      await logActivity(user.username, 'removed employee', 'employee', existing ? existing.username : id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
