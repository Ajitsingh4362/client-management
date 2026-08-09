// use-supabase-auth-state.js
//
// Render's free tier has an EPHEMERAL disk — every time the service
// restarts (spin-down after inactivity, redeploy, crash), anything written
// to the local filesystem (like Baileys' default ./auth folder) is wiped.
// That forces a fresh QR scan every time the service restarts, which looks
// like "WhatsApp keeps disconnecting."
//
// This swaps local-file storage for Supabase rows, so the WhatsApp session
// survives restarts. Mirrors Baileys' own useMultiFileAuthState logic,
// just backed by a table instead of files.

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys')
const { createClient } = require('@supabase/supabase-js')

function makeSupabaseStore() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  async function readData(key) {
    const { data, error } = await supabase.from('whatsapp_session').select('value').eq('key', key).maybeSingle()
    if (error || !data) return null
    try {
      return JSON.parse(data.value, BufferJSON.reviver)
    } catch (e) {
      return null
    }
  }

  async function writeData(key, value) {
    const payload = JSON.stringify(value, BufferJSON.replacer)
    await supabase.from('whatsapp_session').upsert({ key, value: payload, updated_at: new Date().toISOString() })
  }

  async function removeData(key) {
    await supabase.from('whatsapp_session').delete().eq('key', key)
  }

  return { readData, writeData, removeData }
}

async function useSupabaseAuthState() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const store = makeSupabaseStore()

  let creds = (await store.readData('creds')) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          await Promise.all(
            ids.map(async (id) => {
              let value = await store.readData(`${type}-${id}`)
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value)
              }
              data[id] = value
            })
          )
          return data
        },
        set: async (data) => {
          const tasks = []
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const key = `${category}-${id}`
              tasks.push(value ? store.writeData(key, value) : store.removeData(key))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: () => store.writeData('creds', creds),
    // Call this on explicit logout so a stale session isn't reused next boot.
    clearAll: async () => {
      await supabase.from('whatsapp_session').delete().neq('key', '')
    },
  }
}

module.exports = { useSupabaseAuthState }
