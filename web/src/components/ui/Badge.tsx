type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'

const variants: Record<BadgeVariant, string> = {
  gray:   'bg-gray-100 text-gray-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red:    'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
}

export default function Badge({ label, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {label}
    </span>
  )
}
