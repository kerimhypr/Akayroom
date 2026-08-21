import * as React from 'react'
export function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
  return <div className="group relative inline-flex"><div>{children}</div><div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-surface-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap border border-surface-700 z-50">{content}</div></div>
}
