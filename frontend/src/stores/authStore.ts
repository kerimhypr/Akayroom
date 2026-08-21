import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

type AuthState = {
  user: import('@supabase/supabase-js').User | null
  profile: Profile | null
  session: import('@supabase/supabase-js').Session | null
  loading: boolean
  initialized: boolean
  error: string | null
  setUser: (u: any) => void
  setProfile: (p: Profile | null) => void
  setSession: (s: any) => void
  setLoading: (v: boolean) => void
  setInitialized: (v: boolean) => void
  signOut: () => Promise<void>
  fetchProfile: (userId: string) => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  initialized: false,
  error: null,
  setUser: (u) => set({ user: u }),
  setProfile: (p) => set({ profile: p }),
  setSession: (s) => set({ session: s, user: s?.user ?? null }),
  setLoading: (v) => set({ loading: v }),
  setInitialized: (v) => set({ initialized: v }),
  signOut: async () => {
    try { localStorage.removeItem('akay_dev_token'); localStorage.removeItem('akay_dev_profile') } catch {}
    await supabase.auth.signOut()
    set({ user: null, profile: null, session: null })
  },
  fetchProfile: async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (!error && data) set({ profile: data as Profile })
    else set({ profile: null })
  },
  updateProfile: async (patch) => {
    const { profile } = get()
    if (!profile) return
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select().single()
    if (!error && data) set({ profile: data as Profile })
  },
}))

// Initialize auth listener (call once from App)
export function initAuthListener() {
  const { setSession, setLoading, setInitialized, fetchProfile, setUser, setProfile } = useAuthStore.getState()
  // dev bypass: restore dev profile if present
  try {
    const devToken = localStorage.getItem('akay_dev_token')
    const devProfileRaw = localStorage.getItem('akay_dev_profile')
    if (devToken && devProfileRaw) {
      const devProfile = JSON.parse(devProfileRaw)
      const devUser: any = { id: devProfile.id, email: `${devProfile.id}@dev.local` }
      setUser(devUser)
      setProfile(devProfile)
      useAuthStore.setState({ session: { user: devUser } as any, loading: false, initialized: true })
      return () => {}
    }
  } catch {}
  // initial session
  supabase.auth.getSession().then(async ({ data }) => {
    setSession(data.session)
    if (data.session?.user) await fetchProfile(data.session.user.id)
    setLoading(false)
    setInitialized(true)
  })
  const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
    setSession(session)
    if (session?.user) await fetchProfile(session.user.id)
    else useAuthStore.getState().setProfile(null)
    setLoading(false)
    setInitialized(true)
  })
  return () => sub.subscription.unsubscribe()
}
