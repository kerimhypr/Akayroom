import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, initAuthListener } from '@/stores/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage, RegisterPage, ResetPage } from '@/pages/AuthPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { initialized, loading, session } = useAuthStore()
  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-surface-700 border-t-akay-600 rounded-full animate-spin" />
          <div className="text-sm text-surface-400">Loading Akayroom…</div>
        </div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { initialized, loading, session } = useAuthStore()
  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-surface-700 border-t-akay-600 rounded-full animate-spin" />
      </div>
    )
  }
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  useEffect(() => {
    const unsub = initAuthListener()
    return () => unsub()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/reset" element={<PublicOnly><ResetPage /></PublicOnly>} />
        <Route path="/*" element={<Protected><AppShell /></Protected>} />
      </Routes>
    </BrowserRouter>
  )
}
