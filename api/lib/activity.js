const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function logActivity(actor, action, entity, entityLabel) {
  try {
    await supabase.from('activity_log').insert([{ actor, action, entity, entity_label: entityLabel }]);
  } catch (e) {
    // logging failure should never break the main request
  }
}

module.exports = { logActivity };
