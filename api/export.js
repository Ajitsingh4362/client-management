const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

module.exports = async (req, res) => {
  if (req.query.token && !req.headers['x-admin-token']) {
    req.headers['x-admin-token'] = req.query.token;
  }
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { category_id } = req.query;
    let query = supabase
      .from('clients')
      .select('name, phone_number, address, status, created_at, categories(name)')
      .order('created_at', { ascending: false });
    if (category_id) query = query.eq('category_id', category_id);

    const { data, error } = await query;
    if (error) throw error;

    const header = ['Name', 'Phone', 'Category', 'Status', 'Address', 'Added On'];
    const rows = data.map(c => [
      csvEscape(c.name),
      csvEscape(c.phone_number),
      csvEscape(c.categories ? c.categories.name : ''),
      csvEscape(c.status || 'new'),
      csvEscape(c.address),
      csvEscape(new Date(c.created_at).toLocaleDateString('en-IN'))
    ].join(','));

    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
