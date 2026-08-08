const { requireAuth } = require('./lib/auth');
const {
  getSetting, setSetting,
  DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FOREIGN,
  DEFAULT_INVOICE_COMPANY_NAME, DEFAULT_INVOICE_COMPANY_CONTACT, DEFAULT_INVOICE_COMPANY_ADDRESS,
} = require('./lib/settings');

// key -> [default value, required-on-save]
const SETTINGS = {
  auto_message_template: [DEFAULT_TEMPLATE, true],
  auto_message_template_foreign: [DEFAULT_TEMPLATE_FOREIGN, true],
  invoice_company_name: [DEFAULT_INVOICE_COMPANY_NAME, true],
  invoice_company_contact: [DEFAULT_INVOICE_COMPANY_CONTACT, false],
  invoice_company_address: [DEFAULT_INVOICE_COMPANY_ADDRESS, false],
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const keys = Object.keys(SETTINGS);
      const values = await Promise.all(keys.map(k => getSetting(k, SETTINGS[k][0])));
      const result = {};
      keys.forEach((k, i) => { result[k] = values[i]; });
      return res.status(200).json(result);
    }

    if (req.method === 'PUT') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'You do not have permission for this action' });
      const body = req.body || {};
      const updates = Object.keys(body).filter(k => SETTINGS[k] !== undefined);
      if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

      for (const key of updates) {
        const [, required] = SETTINGS[key];
        const value = (body[key] || '').toString().trim();
        if (required && !value) {
          return res.status(400).json({ error: `${key} cannot be empty` });
        }
        await setSetting(key, value);
      }

      const result = {};
      updates.forEach(k => { result[k] = (body[k] || '').toString().trim(); });
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
