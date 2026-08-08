const { requireAuth } = require('./lib/auth');
const { getSetting, setSetting, DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FOREIGN } = require('./lib/settings');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const [template, templateForeign] = await Promise.all([
        getSetting('auto_message_template', DEFAULT_TEMPLATE),
        getSetting('auto_message_template_foreign', DEFAULT_TEMPLATE_FOREIGN),
      ]);
      return res.status(200).json({
        auto_message_template: template,
        auto_message_template_foreign: templateForeign,
      });
    }

    if (req.method === 'PUT') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'You do not have permission for this action' });
      const { auto_message_template, auto_message_template_foreign } = req.body || {};
      if (auto_message_template === undefined && auto_message_template_foreign === undefined) {
        return res.status(400).json({ error: 'Nothing to update' });
      }
      if (auto_message_template !== undefined) {
        if (!auto_message_template.trim()) return res.status(400).json({ error: 'Message template cannot be empty' });
        await setSetting('auto_message_template', auto_message_template.trim());
      }
      if (auto_message_template_foreign !== undefined) {
        if (!auto_message_template_foreign.trim()) return res.status(400).json({ error: 'Foreign message template cannot be empty' });
        await setSetting('auto_message_template_foreign', auto_message_template_foreign.trim());
      }
      return res.status(200).json({ auto_message_template, auto_message_template_foreign });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
