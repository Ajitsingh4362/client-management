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
    const { count: totalClients, error: countErr } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;

    const { data: categories, error: catErr } = await supabase.from('categories').select('id, name');
    if (catErr) throw catErr;

    const { data: clients, error: clientErr } = await supabase.from('clients').select('category_id');
    if (clientErr) throw clientErr;

    const categoryBreakdown = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      count: clients.filter(c => c.category_id === cat.id).length
    }));
    const uncategorized = clients.filter(c => !c.category_id).length;

    const today = new Date().toISOString().slice(0, 10);
    const { count: dueTodayCount } = await supabase
      .from('client_notes')
      .select('*', { count: 'exact', head: true })
      .not('due_date', 'is', null)
      .eq('done', false)
      .lte('due_date', today);

    return res.status(200).json({
      totalClients: totalClients || 0,
      categoryBreakdown,
      uncategorized,
      dueFollowUps: dueTodayCount || 0
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
