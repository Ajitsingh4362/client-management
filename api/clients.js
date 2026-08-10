const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');
const { logActivity } = require('./lib/activity');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Picks the Tele Caller with the fewest currently-assigned clients and
// returns their username, so new leads stay evenly split (e.g. 50 leads /
// 5 tele callers -> 10 each). Returns null if there are no tele callers yet.
async function pickTeleCallerForAssignment() {
  const { data: teleCallers, error: empErr } = await supabase
    .from('employees')
    .select('username')
    .eq('role', 'tele_caller');
  if (empErr || !teleCallers || !teleCallers.length) return null;

  const { data: assignedClients, error: clientsErr } = await supabase
    .from('clients')
    .select('assigned_to')
    .not('assigned_to', 'is', null);
  if (clientsErr) return teleCallers[0].username;

  const counts = {};
  teleCallers.forEach(t => { counts[t.username] = 0; });
  (assignedClients || []).forEach(c => {
    if (counts[c.assigned_to] !== undefined) counts[c.assigned_to]++;
  });

  let chosen = teleCallers[0].username;
  let min = counts[chosen];
  for (const t of teleCallers) {
    if (counts[t.username] < min) {
      min = counts[t.username];
      chosen = t.username;
    }
  }
  return chosen;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const { search, category_id, status, id, lead_region, assigned_to } = req.query;
      let query = supabase
        .from('clients')
        .select('id, name, phone_number, address, status, declined_until, last_message_at, deal_status, deal_amount, deal_deadline, website_url, payment_status, amount_paid, progress_percent, lead_region, assigned_to, paid_at, created_at, updated_at, categories(id, name)')
        .order('created_at', { ascending: false });

      if (id) {
        query = query.eq('id', id);
        // Tele Callers can see the Indian/Foreign lead LISTS, but can only
        // open a full profile (View Profile) for leads assigned to them.
        if (user.role === 'tele_caller') {
          query = query.eq('assigned_to', user.username);
        }
      }
      if (search) {
        query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      }
      if (category_id) {
        query = query.eq('category_id', category_id);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (lead_region) {
        query = query.eq('lead_region', lead_region);
      }
      if (assigned_to) {
        query = query.eq('assigned_to', assigned_to);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      // Only Admin and Lead Generation can add new clients.
      if (!['admin', 'lead_generation'].includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to add clients' });
      }
      const { name, phone_number, address, category_id, lead_region } = req.body || {};
      if (!name || !phone_number) {
        return res.status(400).json({ error: 'name and phone_number are required' });
      }
      const region = lead_region === 'foreign' ? 'foreign' : 'india';
      const assigned_to = await pickTeleCallerForAssignment();
      const { data, error } = await supabase
        .from('clients')
        .insert([{ name, phone_number, address, category_id: category_id || null, lead_region: region, assigned_to }])
        .select();
      if (error) throw error;
      await logActivity(
        user.username,
        `created ${region} client${assigned_to ? ` (auto-assigned to ${assigned_to})` : ''}`,
        'client', name
      );
      return res.status(201).json(data[0]);
    }

    if (req.method === 'PUT') {
      const {
        id, name, phone_number, address, category_id, status, decline,
        deal_status, deal_amount, deal_deadline, payment_status, amount_paid, progress_percent, website_url
      } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });

      // Role-based field permissions:
      // - Core details (name/phone/address/category) -> Admin only
      // - Pipeline status / decline -> Admin, Tele Caller
      // - Deal & payment fields -> Admin, Tele Caller, Lead Generation
      const editingCoreFields = name !== undefined || phone_number !== undefined || address !== undefined || category_id !== undefined;
      const editingStatusFields = decline || status !== undefined;
      const editingDealFields = deal_status !== undefined || deal_amount !== undefined || deal_deadline !== undefined
        || payment_status !== undefined || amount_paid !== undefined || progress_percent !== undefined || website_url !== undefined;

      if (editingCoreFields && user.role !== 'admin') {
        return res.status(403).json({ error: 'You do not have permission to edit client details' });
      }
      if (editingStatusFields && !['admin', 'tele_caller'].includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to change client status' });
      }
      if (editingDealFields && !['admin', 'tele_caller', 'lead_generation'].includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to edit deal/payment details' });
      }

      const update = {};
      if (name !== undefined) update.name = name;
      if (phone_number !== undefined) update.phone_number = phone_number;
      if (address !== undefined) update.address = address;
      if (category_id !== undefined) update.category_id = category_id || null;

      if (decline) {
        // Client ne mana kar diya -> 30 din tak auto-message pause
        const pauseUntil = new Date();
        pauseUntil.setDate(pauseUntil.getDate() + 30);
        update.status = 'declined';
        update.declined_until = pauseUntil.toISOString().slice(0, 10);
      } else if (status !== undefined) {
        if (!['new', 'in_progress', 'completed', 'declined'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        update.status = status;
        if (status !== 'declined') update.declined_until = null; // pause hata do jab status manually change ho
      }

      if (deal_status !== undefined) {
        if (!['pending', 'confirmed'].includes(deal_status)) {
          return res.status(400).json({ error: 'Invalid deal_status' });
        }
        update.deal_status = deal_status;
      }

      if (deal_amount !== undefined) {
        const amt = Number(deal_amount);
        if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'deal_amount must be a valid number' });
        update.deal_amount = amt;
      }

      if (website_url !== undefined) {
        update.website_url = website_url || null;
      }

      if (deal_deadline !== undefined) {
        update.deal_deadline = deal_deadline || null;
      }

      if (payment_status !== undefined) {
        if (!['unpaid', 'partial', 'paid'].includes(payment_status)) {
          return res.status(400).json({ error: 'Invalid payment_status' });
        }
        update.payment_status = payment_status;
        if (payment_status === 'paid') {
          // Only stamp paid_at the moment it newly becomes 'paid', so re-saving
          // the Deal & Progress form later doesn't keep resetting the month
          // this payment counts towards (used for Tele Caller income).
          const { data: existingClient } = await supabase.from('clients').select('payment_status').eq('id', id).single();
          if (!existingClient || existingClient.payment_status !== 'paid') {
            update.paid_at = new Date().toISOString();
          }
        } else {
          update.paid_at = null;
        }
      }

      if (amount_paid !== undefined) {
        const amt = Number(amount_paid);
        if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'amount_paid must be a valid number' });
        update.amount_paid = amt;
      }

      if (progress_percent !== undefined) {
        const p = Number(progress_percent);
        if (isNaN(p) || p < 0 || p > 100) return res.status(400).json({ error: 'progress_percent must be between 0 and 100' });
        update.progress_percent = p;
      }

      const { data, error } = await supabase
        .from('clients')
        .update(update)
        .eq('id', id)
        .select('id, name, phone_number, address, status, declined_until, last_message_at, deal_status, deal_amount, deal_deadline, website_url, payment_status, amount_paid, progress_percent, lead_region, assigned_to, paid_at, created_at, updated_at, categories(id, name)');
      if (error) throw error;

      if (decline) {
        await logActivity(user.username, 'client declined (30-day pause)', 'client', data[0] ? data[0].name : id);
      } else if (status !== undefined) {
        await logActivity(user.username, `status → ${status}`, 'client', data[0] ? data[0].name : id);
      } else if (deal_status !== undefined) {
        await logActivity(user.username, `deal → ${deal_status}`, 'client', data[0] ? data[0].name : id);
      } else if (deal_amount !== undefined || deal_deadline !== undefined || website_url !== undefined) {
        await logActivity(user.username, 'updated deal amount/deadline/website', 'client', data[0] ? data[0].name : id);
      } else if (payment_status !== undefined || amount_paid !== undefined || progress_percent !== undefined) {
        await logActivity(user.username, 'updated deal/progress', 'client', data[0] ? data[0].name : id);
      } else {
        await logActivity(user.username, 'updated client', 'client', name);
      }
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'You do not have permission to delete clients' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
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
