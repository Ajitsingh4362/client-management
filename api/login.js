const { createClient } = require('@supabase/supabase-js');
const { signToken } = require('./lib/auth');
const { logActivity } = require('./lib/activity');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'User id aur password required hain' });
  }

  // Super admin (env-based)
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = signToken(username, 'admin');
    await logActivity(username, 'login', 'auth', null);
    return res.status(200).json({ token, username, role: 'admin' });
  }

  // Employee login (from employees table)
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('username', username)
      .single();
    if (error || !data || data.password !== password) {
      return res.status(401).json({ error: 'Galat user id ya password' });
    }
    const token = signToken(username, data.role);
    await logActivity(username, 'login', 'auth', null);
    return res.status(200).json({ token, username, role: data.role });
  } catch (e) {
    return res.status(401).json({ error: 'Galat user id ya password' });
  }
};
