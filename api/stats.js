const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { count: totalClients, error: countErr } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;

    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .select('id, name');
    if (catErr) throw catErr;

    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('category_id');
    if (clientErr) throw clientErr;

    const categoryBreakdown = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      count: clients.filter(c => c.category_id === cat.id).length
    }));

    const uncategorized = clients.filter(c => !c.category_id).length;

    return res.status(200).json({
      totalClients: totalClients || 0,
      categoryBreakdown,
      uncategorized
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
