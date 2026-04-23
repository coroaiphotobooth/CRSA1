import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const envRaw = fs.readFileSync('.env', 'utf-8')
const envConfig = envRaw.split('\n').reduce((acc, line) => {
  const [key, ...values] = line.split('=')
  if(key && values.length) acc[key.trim()] = values.join('=').trim()
  return acc
}, {} as Record<string,string>)

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.SUPABASE_SERVICE_ROLE_KEY)

async function resetUser() {
  const { data: users, error } = await supabase.auth.admin.listUsers()
  if(error) {
    console.error(error)
    return;
  }
  
  const targetUser = users.users.find(u => u.email === 'coroaiphotobooth@gmail.com')
  if(targetUser) {
    const { data, error: updateError } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { user_metadata: { has_seen_onboarding: false, has_seen_tour_prompt: false } }
    )
    if(updateError) console.error(updateError)
    else console.log("User metadata reset for: " + targetUser.id)
  } else {
    console.log("User not found")
  }
}
resetUser()