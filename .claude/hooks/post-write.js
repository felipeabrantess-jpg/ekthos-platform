'use strict'
const fs = require('fs')
const path = require('path')

let raw = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', d => { raw += d })
process.stdin.on('end', () => {
  try { run(JSON.parse(raw)) } catch { process.exit(0) }
})

function run(data) {
  const filePath = data.tool_input?.file_path || ''
  if (!filePath) process.exit(0)

  let content = ''
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    process.exit(0)
  }

  const ext = path.extname(filePath)
  const base = path.basename(filePath)
  const isTsx = ext === '.tsx'
  const isPackageJson = base === 'package.json'

  const warnings = []

  // ── LAYER 3 — DESIGN (tsx files) ─────────────────────────────────────────
  if (isTsx) {
    // 3.1 colors — palette check
    const ALLOWED_COLORS = new Set([
      '#f9eedc','#e13500','#670000','#161616','#ffffff','#FFFFFF',
      '#FDE8E0','#FCCFBF','#F9A890','#F25830','#FF4D1A','#C42E00',
      '#8B2000','#8B1A1A','#F5E0E0','#FDF6EB','#EDE0CC','#2A2A2A',
      '#333333','#2D7A4F','#E8F5E9','#C4841D','#FFF3E0','#5A5A5A',
      '#8A8A8A','#4DA070','#D9A84F','#B85C00','#F5E8D4','#000000',
    ])
    const colorMatches = [...(content.matchAll(/#[0-9a-fA-F]{6}/g) || [])]
    for (const m of colorMatches) {
      const color = m[0]
      if (!ALLOWED_COLORS.has(color)) {
        warnings.push(`[3.1 CORES] ${filePath}: cor ${color} fora da paleta Ekthos`)
      }
    }

    // 3.2 typography
    if (/font-family:\s*['"]?(Inter|Roboto|Arial)/.test(content)) {
      warnings.push(`[3.2 TIPOGRAFIA] ${filePath}: font-family nao aprovada — use a tipografia definida no design system`)
    }

    // 3.3 spacing — isolated p-0, p-1, m-0, m-1 (not part of responsive prefix)
    if (/(?<![a-z]:)(?:^|\s)(p-0|p-1|m-0|m-1)(?:\s|"|'|`|{)/.test(content)) {
      warnings.push(`[3.3 SPACING] ${filePath}: classes p-0/p-1/m-0/m-1 detectadas — verifique consistencia com design tokens`)
    }

    // 3.4 icons — forbidden libraries
    if (/from\s+['"](@heroicons|feather-icons|react-icons|@fortawesome)/.test(content)) {
      warnings.push(`[3.4 ICONS] ${filePath}: biblioteca de icones nao aprovada — use Lucide React`)
    }
    // lucide icons without strokeWidth
    const lucideImports = content.match(/from\s+['"]lucide-react['"]/g)
    if (lucideImports) {
      const componentMatches = [...(content.matchAll(/<([A-Z][a-zA-Z]+)(?:\s[^>]*)?\s*\/?>/g) || [])]
      for (const m of componentMatches) {
        if (!m[0].includes('strokeWidth')) {
          // only warn for components that look like Lucide icons (likely from the import)
          const iconName = m[1]
          if (content.includes(`import { ${iconName}`) || content.includes(`, ${iconName}`) || content.includes(`${iconName},`)) {
            warnings.push(`[3.4 ICONS] ${filePath}: icone Lucide <${iconName}> sem strokeWidth`)
            break // warn once per file
          }
        }
      }
    }

    // 3.5 responsive — pages without breakpoints
    if (/[/\\]pages[/\\]/.test(filePath)) {
      if (!/(sm:|md:|lg:)/.test(content)) {
        warnings.push(`[3.5 RESPONSIVE] ${filePath}: pagina sem breakpoints (sm:|md:|lg:) — verifique responsividade`)
      }
    }

    // ── LAYER 6 — PERFORMANCE (tsx files) ─────────────────────────────────

    // 6.2 queries without church_id filter
    if (content.includes('.from(') && !content.includes(".eq('church_id'") && !content.includes('// EXEMPT')) {
      warnings.push(`[6.2 QUERY] ${filePath}: .from() sem .eq('church_id', ...) — adicione filtro de tenant ou marque com // EXEMPT`)
    }

    // 6.3 images — static imports
    if (/import\s+\w+\s+from\s+['"][^'"]+\.(png|jpg|jpeg|gif)['"]/.test(content)) {
      warnings.push(`[6.3 IMAGES] ${filePath}: import de imagem estatica — considere usar URL publica ou import via Vite`)
    }
  }

  // ── LAYER 6 — PERFORMANCE (package.json) ──────────────────────────────────
  if (isPackageJson) {
    const HEAVY = ['moment', 'lodash', 'rxjs', 'antd', '@mui/material']
    for (const pkg of HEAVY) {
      if (content.includes(`"${pkg}"`)) {
        warnings.push(`[6.1 BUNDLE] ${filePath}: pacote pesado '${pkg}' detectado — considere alternativa mais leve`)
      }
    }
  }

  // ── output ─────────────────────────────────────────────────────────────────
  if (warnings.length === 0) process.exit(0)

  const lines = []
  lines.push('')
  lines.push('╔══════════════════════════════════════════════╗')
  lines.push('║    EKTHOS HOOKS — VERIFICACAO POS-ESCRITA    ║')
  lines.push('╚══════════════════════════════════════════════╝')
  lines.push('')
  lines.push('[WARN] Avisos:')
  for (const w of warnings) lines.push(`  ${w}`)
  lines.push('')

  process.stdout.write(lines.join('\n'))
  process.exit(0)
}
