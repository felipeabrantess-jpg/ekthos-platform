/**
 * Ícones próprios do app IGV: traço fino único, tema cristão.
 * Mesma assinatura do Phosphor (size, weight, className); weight="fill" preenche de leve no item ativo.
 */
import type { ReactNode, SVGProps } from 'react'

export interface IgvIconProps extends Omit<SVGProps<SVGSVGElement>, 'weight'> {
  size?: number
  weight?: 'regular' | 'fill'
}

function base(children: ReactNode) {
  return function IgvIcon({ size = 24, weight = 'regular', ...rest }: IgvIconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill={weight === 'fill' ? 'currentColor' : 'none'}
        fillOpacity={weight === 'fill' ? 0.22 : undefined}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {children}
      </svg>
    )
  }
}

export const ChurchIcon = base(<>
  <path d="M16 2.5v5M13.5 4.7h5" />
  <path d="M16 7.5l4.5 5.5v4H11.5v-4z" />
  <path d="M11.5 17L5 21.5V29h22v-7.500L20.5 17" />
  <path d="M3 29h26" />
  <path d="M13.5 29v-4.500a2.5 2.5 0 0 1 5 0V29" />
  <circle cx="16" cy="13.5" r="1.2" />
</>)

export const BibleIcon = base(<>
  <path d="M8.5 3.500H25.500V24.500H8.500A2.5 2.5 0 0 0 6 27V6a2.5 2.5 0 0 1 2.5-2.500z" />
  <path d="M6 27a2.5 2.5 0 0 0 2.5 2.500H25.500V24.5" />
  <path d="M16 8v11M12 11.800h8" />
</>)

export const PrayerHandsIcon = base(<>
  <path d="M15.5 7.5C13.2 10.5 11.2 14.5 10.2 18L6.5 22.5 10.5 29l5-4.2z" />
  <path d="M16.5 7.5C18.8 10.5 20.8 14.5 21.800 18l3.700 4.500L21.500 29l-5-4.200z" />
  <path d="M16 2.500v2.500M10 4l1.300 2M22 4l-1.300 2" />
</>)

export const CalendarCrossIcon = base(<>
  <rect x="4.5" y="6.5" width="23" height="21" rx="3" />
  <path d="M4.5 12.500h23M10.5 3.500v5M21.5 3.500v5" />
  <path d="M16 15.500v8.500M12.8 18.600h6.4" />
</>)

export const CommunityIcon = base(<>
  <circle cx="16" cy="9" r="3.5" />
  <path d="M9.5 26v-3.500a6.5 6.5 0 0 1 13 0V26" />
  <circle cx="6.5" cy="13" r="2.5" />
  <path d="M2.5 26v-2.500a4.5 4.5 0 0 1 4-4.5" />
  <circle cx="25.5" cy="13" r="2.5" />
  <path d="M29.5 26v-2.500a4.5 4.5 0 0 0-4-4.5" />
  <path d="M16 18.500v5M14 20.300h4" />
</>)

export const PastorIcon = base(<>
  <circle cx="16" cy="8.5" r="5" />
  <path d="M5.5 29v-4.500c0-4.5 3.5-7.5 7.5-8l3 3 3-3c4 .5 7.5 3.5 7.5 8V29" />
  <path d="M16 21.500v5.500M14 23.400h4" />
</>)

export const HeartCrossIcon = base(<>
  <path d="M16 28S3.5 20.5 3.5 11.800A6.8 6.8 0 0 1 16 8.200a6.8 6.8 0 0 1 12.5 3.600C28.5 20.5 16 28 16 28z" />
  <path d="M16 12v10M12.5 15.500h7" />
</>)

export const OpenBookIcon = base(<>
  <path d="M16 9.500C13.5 7 9.5 6 4 6v18c5.5 0 9.5 1 12 3.5 2.5-2.5 6.5-3.5 12-3.500V6c-5.5 0-9.5 1-12 3.500z" />
  <path d="M16 9.500v18" />
  <path d="M16 2v3M14.5 3.200h3" />
</>)

export const OpenHandsIcon = base(<>
  <path d="M14.5 28v-4.500c0-1.6-.7-3-1.8-4L7.5 14.500c-1.3-1.2 0-3 1.5-2.200l3 2" />
  <path d="M5.5 18.500V10c0-1.8 2.5-1.8 2.5 0" />
  <path d="M17.5 28v-4.500c0-1.6.7-3 1.8-4l5.2-5c1.3-1.2 0-3-1.5-2.200l-3 2" />
  <path d="M26.5 18.500V10c0-1.8-2.5-1.8-2.5 0" />
  <path d="M16 3.500v5M11.5 5l1 2.500M20.5 5l-1 2.5" />
</>)

export const BusinessCrossIcon = base(<>
  <rect x="3.5" y="10" width="25" height="18" rx="3" />
  <path d="M11.5 10V7a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v3" />
  <path d="M16 14v9M12.5 17.500h7" />
</>)
