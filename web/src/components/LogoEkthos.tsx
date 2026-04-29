/**
 * LogoEkthos — logo oficial nova (†Ekthos / CHURCH)
 * Cruz geométrica grossa + wordmark DM Sans 800
 * color="currentColor" adapta qualquer fundo.
 */

interface LogoEkthosProps {
  height?: number
  color?: string
  showChurch?: boolean
  className?: string
}

export default function LogoEkthos({
  height = 36,
  color = 'currentColor',
  showChurch = true,
  className = '',
}: LogoEkthosProps) {
  const VW = 190
  const VH = showChurch ? 56 : 42

  return (
    <svg
      width={(height / VH) * VW}
      height={height}
      viewBox={`0 0 ${VW} ${VH}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Ekthos Church"
      role="img"
      className={className}
    >
      {/* ── Cruz — 3 rects sobrepostos ── */}
      {/* Acento topo (pequeníssimo) */}
      <rect x="9.5" y="0" width="5" height="6" rx="2.5" fill={color} />
      {/* Eixo vertical */}
      <rect x="7"   y="4" width="10" height="38" rx="5" fill={color} />
      {/* Barra horizontal */}
      <rect x="0"   y="15" width="24" height="10" rx="5" fill={color} />

      {/* ── Wordmark ── */}
      <text
        x="32"
        y="36"
        fontFamily="'DM Sans', system-ui, sans-serif"
        fontSize="36"
        fontWeight="800"
        letterSpacing="-0.5"
        fill={color}
      >
        Ekthos
      </text>

      {showChurch && (
        <text
          x="32"
          y="52"
          fontFamily="'DM Sans', system-ui, sans-serif"
          fontSize="10"
          fontWeight="700"
          letterSpacing="4.5"
          fill={color}
          opacity="0.6"
        >
          CHURCH
        </text>
      )}
    </svg>
  )
}
