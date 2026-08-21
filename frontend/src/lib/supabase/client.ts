import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  console.warn('Missing Supabase env vars! Check .env')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return data.session.access_token
  // dev bypass fallback (only when no Supabase session)
  try {
    const dev = localStorage.getItem('akay_dev_token')
    if (dev) return dev
  } catch {}
  return null
}
