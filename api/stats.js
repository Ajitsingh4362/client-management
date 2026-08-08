const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [catRes, clientsRes, followupRes] = await Promise.all([
      supabase.from('categories').select('id, name'),
      supabase.from('clients').select('category_id'),
      supabase
        .from('client_notes')
        .select('*', { count: 'exact', head: true })
        .not('due_date', 'is', null)
        .eq('done', false)
        .lte('due_date', today)
    ]);

    if (catRes.error) throw catRes.error;
    if (clientsRes.error) throw clientsRes.error;

    const categories = catRes.data;
    const clients = clientsRes.data;

    const categoryBreakdown = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      count: clients.filter(c => c.category_id === cat.id).length
    }));
    const uncategorized = clients.filter(c => !c.category_id).length;

    return res.status(200).json({
      totalClients: clients.length,
      categoryBreakdown,
      uncategorized,
      dueFollowUps: followupRes.count || 0
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
