const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_TEMPLATE =
  'Namaste {name} ji! Main {business} ke liye website aur admin panel banane me help karta hoon — customers online se aapko contact kar sakein, records bhi easily manage ho jaayein. Interested? Bataiyega!';

const DEFAULT_TEMPLATE_FOREIGN =
  'Hi {name}! I help businesses like {business} build a professional website and admin panel — so customers can reach you online and your records are easy to manage. Interested? Let me know!';

const DEFAULT_INVOICE_COMPANY_NAME = 'Zentrycs';
const DEFAULT_INVOICE_COMPANY_CONTACT = '';
const DEFAULT_INVOICE_COMPANY_ADDRESS = '';

async function getSetting(key, fallback) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error || !data) return fallback;
  return data.value;
}

async function setSetting(key, value) {
  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key, value, updated_at: new Date().toISOString() }], { onConflict: 'key' });
  if (error) throw error;
}

module.exports = {
  getSetting, setSetting,
  DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_FOREIGN,
  DEFAULT_INVOICE_COMPANY_NAME, DEFAULT_INVOICE_COMPANY_CONTACT, DEFAULT_INVOICE_COMPANY_ADDRESS,
};
