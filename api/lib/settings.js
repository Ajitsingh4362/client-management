const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_TEMPLATE =
  'Hi {name}! I build professional websites and admin panels for businesses like your business — {business} — so your customers can reach you online too, easily. If you\'re interested, let me know and I\'ll walk you through the details. Thank you!';

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

module.exports = { getSetting, setSetting, DEFAULT_TEMPLATE };
