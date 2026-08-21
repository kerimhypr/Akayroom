import * as React from 'react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export function Button({ className, variant='primary', size='md', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none"
  const variants: Record<Variant,string> = {
    primary: "bg-akay-600 hover:bg-akay-500 text-white shadow",
    secondary: "bg-surface-800 hover:bg-surface-700 text-white",
    ghost: "hover:bg-surface-800 text-surface-200 hover:text-white",
    destructive: "bg-red-600 hover:bg-red-500 text-white",
    outline: "border border-surface-700 hover:bg-surface-800 text-white"
  }
  const sizes: Record<Size,string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 py-2",
    lg: "h-12 px-6 text-base",
    icon: "h-10 w-10"
  }
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}
