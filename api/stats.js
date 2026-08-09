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
    const { assigned_to } = req.query;

    let clientsQuery = supabase.from('clients').select('id, name, category_id, status, deal_status, deal_amount, deal_deadline, payment_status, amount_paid, paid_at, lead_region');
    if (assigned_to) clientsQuery = clientsQuery.eq('assigned_to', assigned_to);

    let followupQuery = supabase
      .from('client_notes')
      .select(assigned_to ? '*, clients!inner(assigned_to)' : '*', { count: 'exact', head: true })
      .not('due_date', 'is', null)
      .eq('done', false)
      .lte('due_date', today);
    if (assigned_to) followupQuery = followupQuery.eq('clients.assigned_to', assigned_to);

    const [catRes, clientsRes, followupRes] = await Promise.all([
      supabase.from('categories').select('id, name'),
      clientsQuery,
      followupQuery
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

    const count = (arr, pred) => arr.filter(pred).length;

    const statusBreakdown = {
      new: count(clients, c => (c.status || 'new') === 'new'),
      in_progress: count(clients, c => c.status === 'in_progress'),
      completed: count(clients, c => c.status === 'completed'),
      declined: count(clients, c => c.status === 'declined'),
    };

    const dealBreakdown = {
      pending: count(clients, c => (c.deal_status || 'pending') === 'pending'),
      confirmed: count(clients, c => c.deal_status === 'confirmed'),
    };

    const paymentBreakdown = {
      unpaid: count(clients, c => (c.payment_status || 'unpaid') === 'unpaid'),
      partial: count(clients, c => c.payment_status === 'partial'),
      paid: count(clients, c => c.payment_status === 'paid'),
    };

    const totalCollected = clients.reduce((sum, c) => sum + (Number(c.amount_paid) || 0), 0);
    const totalDealValue = clients
      .filter(c => c.deal_status === 'confirmed')
      .reduce((sum, c) => sum + (Number(c.deal_amount) || 0), 0);

    // A deadline only matters while payment is still pending — once a client
    // has fully paid, the deal is done and shouldn't clutter (or show as
    // "overdue" in) the upcoming-deadlines widget.
    const upcomingDeadlines = clients
      .filter(c => c.deal_status === 'confirmed' && c.deal_deadline && c.payment_status !== 'paid')
      .sort((a, b) => a.deal_deadline < b.deal_deadline ? -1 : 1)
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.name, deal_deadline: c.deal_deadline, deal_amount: c.deal_amount, overdue: c.deal_deadline < today }));

    const regionBreakdown = {
      india: count(clients, c => (c.lead_region || 'india') === 'india'),
      foreign: count(clients, c => c.lead_region === 'foreign'),
    };

    // Tele Caller income: 15% commission on Amount Paid, only for clients
    // marked Fully Paid. Only computed when viewing a specific person's
    // scope (assigned_to), since it's a per-person commission figure.
    let myIncome = null;
    if (assigned_to) {
      const now = new Date();
      let lifetime = 0;
      let currentMonth = 0;
      clients.forEach(c => {
        if (c.payment_status !== 'paid') return;
        const commission = (Number(c.amount_paid) || 0) * 0.15;
        lifetime += commission;
        if (c.paid_at) {
          const paidDate = new Date(c.paid_at);
          if (paidDate.getFullYear() === now.getFullYear() && paidDate.getMonth() === now.getMonth()) {
            currentMonth += commission;
          }
        }
      });
      myIncome = { lifetime: Math.round(lifetime), currentMonth: Math.round(currentMonth) };
    }

    return res.status(200).json({
      totalClients: clients.length,
      categoryBreakdown,
      uncategorized,
      dueFollowUps: followupRes.count || 0,
      statusBreakdown,
      dealBreakdown,
      paymentBreakdown,
      totalCollected,
      totalDealValue,
      upcomingDeadlines,
      regionBreakdown,
      myIncome,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
