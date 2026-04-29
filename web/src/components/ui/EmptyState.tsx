import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="h-12 w-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'var(--bg-hover)' }}
      >
        <Inbox size={24} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {description && (
        <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
