const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-side only, never exposed to browser
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone_number, address, created_at, updated_at, categories(id, name)')
        .order('created_at', { ascending: false });
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
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required hai' });
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
