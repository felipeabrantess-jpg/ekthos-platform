/**
 * LogoEkthos — replica fiel da logo oficial
 * Cruz estilizada (†) com terminais arredondados + wordmark Nunito 800 + CHURCH
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
  const VW = 200
  const VH = showChurch ? 60 : 44

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
      {/* ── Cruz estilizada ── */}
      {/* Acento topo — pequena barra horizontal no topo do eixo vertical */}
      <line x1="12" y1="3" x2="24" y2="3"
        stroke={color} strokeWidth="4" strokeLinecap="round" />
      {/* Eixo vertical */}
      <line x1="18" y1="0" x2="18" y2="40"
        stroke={color} strokeWidth="4" strokeLinecap="round" />
      {/* Barra horizontal principal */}
      <line x1="0" y1="14" x2="36" y2="14"
        stroke={color} strokeWidth="4" strokeLinecap="round" />

      {/* ── Wordmark ── */}
      <text
        x="44"
        y="40"
        fontFamily="'Nunito', 'Poppins', system-ui, sans-serif"
        fontSize="40"
        fontWeight="800"
        fill={color}
      >
        Ekthos
      </text>

      {/* ── CHURCH ── */}
      {showChurch && (
        <text
          x="100"
          y="56"
          textAnchor="middle"
          fontFamily="'Nunito', system-ui, sans-serif"
          fontSize="10"
          fontWeight="700"
          letterSpacing="4"
          fill={color}
          opacity="0.75"
        >
          CHURCH
        </text>
      )}
    </svg>
  )
}
