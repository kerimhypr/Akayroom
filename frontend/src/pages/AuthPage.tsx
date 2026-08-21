import { LoginForm, RegisterForm, ResetForm } from '@/components/auth/AuthForm'

export function LoginPage() {
  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-950">
        <LoginForm />
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-akay-700 via-akay-600 to-surface-900 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-4xl font-bold font-display mb-4">Akayroom</h2>
          <p className="text-lg opacity-90">Modern, hızlı ve güvenli bir communication platform. Discord'dan ilham alan ama özgün tasarım.</p>
          <ul className="mt-6 space-y-2 text-sm opacity-80">
            <li>• Realtime chat & voice & video</li>
            <li>• Screen share & low latency SFU</li>
            <li>• Supabase auth & RLS secure</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
export function RegisterPage() {
  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-950">
        <RegisterForm />
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-akay-700 via-akay-600 to-surface-900 items-center justify-center p-12">
        <div className="max-w-md text-white">
          <h2 className="text-4xl font-bold font-display mb-4">Join Akayroom</h2>
          <p className="text-lg opacity-90">Create servers, chat, voice and video — all in browser.</p>
        </div>
      </div>
    </div>
  )
}
export function ResetPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-surface-950">
      <ResetForm />
    </div>
  )
}
