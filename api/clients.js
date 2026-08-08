const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');
const { logActivity } = require('./lib/activity');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const { search, category_id } = req.query;
      let query = supabase
        .from('clients')
        .select('id, name, phone_number, address, created_at, updated_at, categories(id, name)')
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      }
      if (category_id) {
        query = query.eq('category_id', category_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { name, phone_number, address, category_id } = req.body || {};
      if (!name || !phone_number) {
        return res.status(400).json({ error: 'name aur phone_number required hain' });
      }
      const { data, error } = await supabase
        .from('clients')
        .insert([{ name, phone_number, address, category_id: category_id || null }])
        .select();
      if (error) throw error;
      await logActivity(user.username, 'created client', 'client', name);
      return res.status(201).json(data[0]);
    }

    if (req.method === 'PUT') {
      const { id, name, phone_number, address, category_id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required hai' });
      const { data, error } = await supabase
        .from('clients')
        .update({ name, phone_number, address, category_id: category_id || null })
        .eq('id', id)
        .select();
      if (error) throw error;
      await logActivity(user.username, 'updated client', 'client', name);
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required hai' });
      const { data: existing } = await supabase.from('clients').select('name').eq('id', id).single();
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      await logActivity(user.username, 'deleted client', 'client', existing ? existing.name : id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
