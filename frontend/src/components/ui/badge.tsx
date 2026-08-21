import { cn } from '@/utils/cn'
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-akay-600 text-white", className)} {...props} />
}
