import { cn } from '@/utils/cn'
export function Avatar({ src, alt, fallback, className, size=40 }: { src?: string | null; alt?: string; fallback: string; className?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size }} className={cn("rounded-full bg-surface-700 flex items-center justify-center text-white font-semibold overflow-hidden shrink-0", className)}>
      {src ? <img src={src} alt={alt} className="w-full h-full object-cover" /> : <span style={{ fontSize: size*0.4 }}>{fallback.slice(0,2).toUpperCase()}</span>}
    </div>
  )
}
