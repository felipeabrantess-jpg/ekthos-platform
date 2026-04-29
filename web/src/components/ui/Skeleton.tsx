interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      className={`rounded-lg animate-shimmer ${className}`}
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <Skeleton height={16} width="60%" />
      <Skeleton height={12} width="80%" />
      <Skeleton height={12} width="40%" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
      <Skeleton width={36} height={36} className="rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton height={14} width="45%" />
        <Skeleton height={11} width="30%" />
      </div>
      <Skeleton height={24} width={64} className="rounded-full" />
    </div>
  )
}

export function SkeletonMetricCard() {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <Skeleton height={11} width="50%" className="mb-3" />
      <Skeleton height={32} width="40%" className="mb-2" />
      <Skeleton height={11} width="60%" />
    </div>
  )
}
