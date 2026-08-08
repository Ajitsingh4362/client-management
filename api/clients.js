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
      const { search, category_id, status } = req.query;
      let query = supabase
        .from('clients')
        .select('id, name, phone_number, address, status, declined_until, last_message_at, deal_status, payment_status, amount_paid, progress_percent, created_at, updated_at, categories(id, name)')
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      }
      if (category_id) {
        query = query.eq('category_id', category_id);
      }
      if (status) {
        query = query.eq('status', status);
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
      const {
        id, name, phone_number, address, category_id, status, decline,
        deal_status, payment_status, amount_paid, progress_percent
      } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required hai' });

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

      if (payment_status !== undefined) {
        if (!['unpaid', 'partial', 'paid'].includes(payment_status)) {
          return res.status(400).json({ error: 'Invalid payment_status' });
        }
        update.payment_status = payment_status;
      }

      if (amount_paid !== undefined) {
        const amt = Number(amount_paid);
        if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'amount_paid valid number hona chahiye' });
        update.amount_paid = amt;
      }

      if (progress_percent !== undefined) {
        const p = Number(progress_percent);
        if (isNaN(p) || p < 0 || p > 100) return res.status(400).json({ error: 'progress_percent 0-100 ke beech hona chahiye' });
        update.progress_percent = p;
      }

      const { data, error } = await supabase
        .from('clients')
        .update(update)
        .eq('id', id)
        .select('id, name, phone_number, address, status, declined_until, last_message_at, deal_status, payment_status, amount_paid, progress_percent, created_at, updated_at, categories(id, name)');
      if (error) throw error;

      if (decline) {
        await logActivity(user.username, 'client declined (30 din pause)', 'client', data[0] ? data[0].name : id);
      } else if (status !== undefined) {
        await logActivity(user.username, `status → ${status}`, 'client', data[0] ? data[0].name : id);
      } else if (deal_status !== undefined) {
        await logActivity(user.username, `deal → ${deal_status}`, 'client', data[0] ? data[0].name : id);
      } else if (payment_status !== undefined || amount_paid !== undefined || progress_percent !== undefined) {
        await logActivity(user.username, 'updated deal/progress', 'client', data[0] ? data[0].name : id);
      } else {
        await logActivity(user.username, 'updated client', 'client', name);
      }
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
