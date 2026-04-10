type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'wine' | 'ekthos' | 'premium'

const variants: Record<BadgeVariant, string> = {
  gray:    'bg-gray-100 text-gray-700',
  blue:    'bg-blue-100 text-blue-700',
  green:   'bg-success-bg text-success',
  yellow:  'bg-warning-bg text-warning',
  red:     'bg-brand-50 text-brand-700',
  purple:  'bg-purple-100 text-purple-700',
  wine:    'bg-wine-bg text-wine',
  ekthos:  'bg-brand-600 text-white',
  premium: 'bg-wine text-wine-bg',
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
}

export default function Badge({ label, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${variants[variant]}`}>
      {label}
    </span>
  )
}
