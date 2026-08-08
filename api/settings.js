const { requireAuth } = require('./lib/auth');
const { getSetting, setSetting, DEFAULT_TEMPLATE } = require('./lib/settings');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const template = await getSetting('auto_message_template', DEFAULT_TEMPLATE);
      return res.status(200).json({ auto_message_template: template });
    }

    if (req.method === 'PUT') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'Is action ke liye permission nahi hai' });
      const { auto_message_template } = req.body || {};
      if (!auto_message_template || !auto_message_template.trim()) {
        return res.status(400).json({ error: 'Message template khali nahi ho sakta' });
      }
      await setSetting('auto_message_template', auto_message_template.trim());
      return res.status(200).json({ auto_message_template: auto_message_template.trim() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
