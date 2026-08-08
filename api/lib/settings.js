const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_TEMPLATE =
  'Namaste {name} ji! Main aapke business {business} ke liye ek professional website aur admin panel bana raha hoon, jisse aapke customers aap tak online bhi aasani se pahunch sakein. Agar interested hain to bataiyega, main aapko details samjha dunga. Dhanyavaad!';

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
