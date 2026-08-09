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
      const { client_id, upcoming, assigned_to } = req.query;
      if (upcoming) {
        // Today's & overdue follow-ups — across all clients, or scoped to
        // one Tele Caller's assigned clients when `assigned_to` is passed.
        const today = new Date().toISOString().slice(0, 10);
        let query = supabase
          .from('client_notes')
          .select(assigned_to ? 'id, note, due_date, done, client_id, clients!inner(name, assigned_to)' : 'id, note, due_date, done, client_id, clients(name)')
          .not('due_date', 'is', null)
          .eq('done', false)
          .lte('due_date', today)
          .order('due_date', { ascending: true });
        if (assigned_to) query = query.eq('clients.assigned_to', assigned_to);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (!client_id) return res.status(400).json({ error: 'client_id is required' });
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!['admin', 'tele_caller'].includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to add follow-up notes' });
      }
      const { client_id, note, due_date } = req.body || {};
      if (!client_id || !note) return res.status(400).json({ error: 'client_id and note are required' });
      const { data, error } = await supabase
        .from('client_notes')
        .insert([{ client_id, note, due_date: due_date || null }])
        .select();
      if (error) throw error;
      await logActivity(user.username, 'added note', 'note', note.slice(0, 40));
      return res.status(201).json(data[0]);
    }

    if (req.method === 'PUT') {
      if (!['admin', 'tele_caller'].includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to update follow-up notes' });
      }
      const { id, done } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { data, error } = await supabase.from('client_notes').update({ done }).eq('id', id).select();
      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    if (req.method === 'DELETE') {
      if (!['admin', 'tele_caller'].includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to delete follow-up notes' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('client_notes').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
