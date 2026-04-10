'use strict'
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

let raw = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', d => { raw += d })
process.stdin.on('end', () => {
  try { run(JSON.parse(raw)) } catch { process.exit(0) }
})

// ─── helpers ────────────────────────────────────────────────────────────────

function getStagedFiles() {
  try {
    return execSync('git diff --cached --name-only', { encoding: 'utf-8' })
      .split('\n').filter(Boolean)
  } catch { return [] }
}

function getStaged(file) {
  try {
    return execSync(`git show :${file.replace(/\\/g, '/')}`, { encoding: 'utf-8' })
  } catch { return '' }
}

function getDiff(file) {
  try {
    return execSync(`git diff --cached -- ${file.replace(/\\/g, '/')}`, { encoding: 'utf-8' })
  } catch { return '' }
}

// ─── main ────────────────────────────────────────────────────────────────────

function run(data) {
  const command = data.tool_input?.command || ''
  const filePath = data.tool_input?.file_path || ''

  const isGitCommit = command.includes('git commit')
  const isSqlWrite = filePath.endsWith('.sql')

  if (!isGitCommit && !isSqlWrite) process.exit(0)

  const errors = []
  const warnings = []

  // ── LAYER 5 — SECURITY (always, for git commit) ──────────────────────────
  if (isGitCommit) {
    const staged = getStagedFiles()

    // 5.3 env files staged
    const envFiles = staged.filter(f => /^\.env/.test(path.basename(f)))
    if (envFiles.length > 0) {
      errors.push(`[5.3 ENV] Arquivo de ambiente staged: ${envFiles.join(', ')} — remova antes de commitar`)
    }

    for (const file of staged) {
      const content = getStaged(file)
      const diff = getDiff(file)
      const ext = path.extname(file)
      const base = path.basename(file)
      const isTs = ext === '.ts' || ext === '.tsx'
      const isTsx = ext === '.tsx'
      const isTest = /\.(test|spec)\.(ts|tsx)$/.test(file)
      const isSql = ext === '.sql'

      // ── LAYER 5 — SECURITY (per file) ──────────────────────────────────
      const secretPatterns = [
        { re: /sk_live_/, label: 'sk_live_' },
        { re: /sb_secret_/, label: 'sb_secret_' },
        { re: /Bearer eyJ/, label: 'Bearer eyJ (JWT hardcoded)' },
        { re: /ghp_[a-z0-9]{36}/i, label: 'GitHub PAT (ghp_)' },
        { re: /gho_[a-z0-9]{36}/i, label: 'GitHub OAuth token (gho_)' },
        { re: /password\s*[:=]\s*['"][^'"]{4,}/, label: 'password hardcoded' },
      ]
      for (const { re, label } of secretPatterns) {
        if (re.test(content)) {
          errors.push(`[5.1 SECRETS] ${file}: ${label} detectado`)
        }
      }

      // 5.2 service_role in .tsx
      if (isTsx && content.includes('service_role')) {
        errors.push(`[5.2 SERVICE-ROLE] ${file}: uso de service_role no frontend — mover para Edge Function`)
      }

      // ── LAYER 1 — CODE (ts/tsx, excluding tests) ────────────────────────
      if (isTs && !isTest) {
        // 1.1 encoding
        if (/Ã§|Ã£|Ãª|Ã©|Ã­|Ãº/.test(content)) {
          errors.push(`[1.1 ENCODING] ${file}: caracteres com encoding duplo detectados — salve o arquivo como UTF-8`)
        }

        // 1.2 no-emoji
        if (/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{27FF}]/u.test(content)) {
          errors.push(`[1.2 EMOJI] ${file}: emoji detectado no código — use Lucide React`)
        }

        // 1.3 no-console
        if (/console\.(log|warn|error|debug)\(/.test(content)) {
          errors.push(`[1.3 CONSOLE] ${file}: console.log/warn/error/debug detectado — remova antes de commitar`)
        }

        // 1.4 no-any (new diff lines)
        const diffLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
        const newCode = diffLines.join('\n')
        if ((newCode.includes('as any') || newCode.includes(': any')) && !newCode.includes('eslint-disable')) {
          warnings.push(`[1.4 TYPE-SAFETY] ${file}: uso de 'as any' ou ': any' sem eslint-disable — considere tipagem explícita`)
        }

        // 1.5 unused imports
        const importMatches = [...content.matchAll(/import\s+\{([^}]+)\}/g)]
        for (const match of importMatches) {
          const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)
          const restOfFile = content.slice(content.indexOf(match[0]) + match[0].length)
          for (const name of names) {
            if (name && !restOfFile.includes(name)) {
              warnings.push(`[1.5 IMPORTS] ${file}: import possivelmente nao utilizado — '${name}'`)
            }
          }
        }

        // 1.6 naming conventions
        if (/src[/\\](components|pages|features)[/\\]/.test(file)) {
          if (!/[A-Z]/.test(base[0])) {
            warnings.push(`[1.6 NAMING] ${file}: arquivo em components/pages/features deve ser PascalCase`)
          }
        }
        if (/[/\\]hooks[/\\]/.test(file) && !base.startsWith('use')) {
          warnings.push(`[1.6 NAMING] ${file}: hook deve comecar com 'use'`)
        }
      }

      // ── LAYER 2 — VOCABULARY (tsx files) ───────────────────────────────
      if (isTsx) {
        // strip import lines and comments for vocabulary check
        const stripped = content
          .split('\n')
          .filter(l => !l.trim().startsWith('import ') && !l.trim().startsWith('//') && !l.trim().startsWith('*'))
          .join('\n')

        const FORBIDDEN = [
          { term: /\blead\b/gi, fix: "'membro' ou 'visitante'" },
          { term: /\bprospect\b/gi, fix: "'visitante'" },
          { term: /\bgrupo\b/gi, fix: "'celula'" },
          { term: /\bfollow[- ]up\b/gi, fix: "'consolidacao'" },
          { term: /\bfunil\b/gi, fix: "'caminho de discipulado'" },
          { term: /\bfilial\b/gi, fix: "'congregacao'" },
          { term: /\bchurn\b/gi, fix: "'afastamento'" },
          { term: /\bKPI\b/g, fix: "'indicador pastoral'" },
          { term: /\brevenue\b/gi, fix: "'dizimos'" },
          { term: /\bCEO\b/g, fix: "'pastor'" },
          { term: /\bclient\b/gi, fix: "'membro'" },
        ]

        for (const { term, fix } of FORBIDDEN) {
          if (term.test(stripped)) {
            warnings.push(`[2.1 VOCAB] ${file}: termo proibido detectado — use ${fix}`)
          }
        }

        // 2.2 i18n — PT hardcoded in JSX
        if (/>[^<{}\n]*[áéíóúãõç][^<{}\n]*</.test(content)) {
          warnings.push(`[2.2 i18n] ${file}: string PT hardcoded no JSX — usar t('chave')`)
        }
      }

      // ── LAYER 4 — DATABASE (sql files) ─────────────────────────────────
      if (isSql) {
        checkSqlContent(file, content, errors, warnings)
      }

      // ── LAYER 7 — BUSINESS RULES ────────────────────────────────────────
      const isBillingFile = /billing|subscription|plans|pricing/.test(file)
      const isAgentFile = /agent/.test(file)
      const isRoleFile = /role|permission|policy/.test(file)
      const isAuthFile = /auth|session/.test(file)

      // 7.1 pricing
      if (isBillingFile) {
        const OFFICIAL_PRICES = [38900, 69800, 101567, 9789, 6990]
        const numericMatches = [...diff.matchAll(/\b(\d{4,6})\b/g)]
        for (const m of numericMatches) {
          const val = parseInt(m[1], 10)
          if (val >= 1000 && val <= 999999 && !OFFICIAL_PRICES.includes(val)) {
            warnings.push(`[7.1 PRICING] ${file}: valor ${val} nao esta na tabela oficial — Chamado=38900, Missao=69800, Avivamento=101567`)
          }
        }
      }

      // 7.2 agent-tiers
      if (isAgentFile) {
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
        for (const line of addedLines) {
          if (/suporte/.test(line) && /always_paid/.test(line)) {
            errors.push(`[7.2 TIERS] ${file}: suporte + always_paid — verifique regra de tier`)
          }
          if (/(funil|agenda|cuidado|whatsapp)/.test(line) && /free/.test(line)) {
            errors.push(`[7.2 TIERS] ${file}: funcionalidade premium marcada como free — verifique regra de tier`)
          }
        }
      }

      // 7.3 roles
      if (isRoleFile) {
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
        for (const line of addedLines) {
          if (/GRANT.*financeiro.*authenticated/i.test(line)) {
            warnings.push(`[7.3 ROLES] ${file}: GRANT financeiro para authenticated — verifique se e intencional`)
          }
        }
      }

      // 7.4 suporte-gratis
      if (isBillingFile) {
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
        for (const line of addedLines) {
          if (/suporte/.test(line) && /(price|amount)/.test(line) && /[1-9]\d*/.test(line.replace(/0/g, ''))) {
            errors.push(`[7.4 SUPORTE] ${file}: suporte com price/amount nao-zero — suporte deve ser gratis`)
          }
        }
      }

      // 7.5 session-block
      if (isAuthFile) {
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
        for (const line of addedLines) {
          if (/single.?session|concurrent/.test(line) && /(false|disable)/.test(line)) {
            warnings.push(`[7.5 SESSION] ${file}: bloqueio de sessao unica desabilitado — verifique politica de seguranca`)
          }
        }
      }
    }
  }

  // ── LAYER 4 — DATABASE (Write to .sql) ─────────────────────────────────
  if (isSqlWrite) {
    const sqlContent = data.tool_input?.content || ''
    checkSqlContent(filePath, sqlContent, errors, warnings)
  }

  // ── output ────────────────────────────────────────────────────────────────
  if (errors.length === 0 && warnings.length === 0) process.exit(0)

  const lines = []
  lines.push('')
  lines.push('╔══════════════════════════════════════════════╗')
  lines.push('║     EKTHOS HOOKS — VERIFICACAO PRE-COMMIT    ║')
  lines.push('╚══════════════════════════════════════════════╝')
  lines.push('')

  if (errors.length > 0) {
    lines.push('[BLOCK] BLOQUEADO — Erros criticos:')
    for (const e of errors) lines.push(`  ${e}`)
    lines.push('')
  }

  if (warnings.length > 0) {
    lines.push('[WARN] Avisos (nao bloqueantes):')
    for (const w of warnings) lines.push(`  ${w}`)
    lines.push('')
  }

  process.stdout.write(lines.join('\n'))

  if (errors.length > 0) process.exit(2)
  process.exit(0)
}

// ─── SQL checks (reused for both git commit and Write) ───────────────────────

function checkSqlContent(file, content, errors, warnings) {
  const hasCreateTable = /CREATE TABLE/i.test(content)

  // 4.1 RLS
  if (hasCreateTable && !/ENABLE ROW LEVEL SECURITY/i.test(content)) {
    const systemTables = ['plans', 'agents_catalog', 'churches']
    const tableMatch = content.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?/i)
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : ''
    if (!systemTables.includes(tableName)) {
      errors.push(`[4.1 RLS] ${file}: CREATE TABLE sem ENABLE ROW LEVEL SECURITY`)
    }
  }

  // 4.2 church_id
  if (hasCreateTable && !/(church_id)/i.test(content)) {
    const tableMatch = content.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?/i)
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : ''
    const systemTables = ['plans', 'agents_catalog', 'churches', 'roles', 'migrations']
    if (!systemTables.includes(tableName)) {
      errors.push(`[4.2 TENANT] ${file}: CREATE TABLE sem coluna church_id — isolamento de tenant obrigatorio`)
    }
  }

  // 4.3 indexes for FKs
  const fkMatches = [...content.matchAll(/REFERENCES\s+\w+\s*\((\w+)\)/gi)]
  for (const m of fkMatches) {
    const col = m[1]
    if (!new RegExp(`CREATE INDEX.*${col}`, 'i').test(content)) {
      warnings.push(`[4.3 INDEX] ${file}: FK na coluna '${col}' sem CREATE INDEX correspondente`)
    }
  }

  // 4.4 naming
  const tableNameMatch = content.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?([A-Za-z_]\w*)["']?/i)
  if (tableNameMatch) {
    const tname = tableNameMatch[1]
    if (/[A-Z]/.test(tname[0]) && tname !== tname.toUpperCase()) {
      warnings.push(`[4.4 NAMING] ${file}: nome de tabela '${tname}' — usar snake_case`)
    }
  }
  if (/[a-z][A-Z]\w+\s+(?:UUID|TEXT|INT|BOOL|TIMESTAMP)/g.test(content)) {
    warnings.push(`[4.4 NAMING] ${file}: coluna com camelCase detectada — usar snake_case`)
  }

  // 4.5 sensitive data
  if (/dizimo|oferta|donation|amount|observac/i.test(content) && !/FOR SELECT/i.test(content)) {
    warnings.push(`[4.5 SENSITIVE] ${file}: dados sensiveis sem policy FOR SELECT explicita`)
  }
}
