// LGPD: logs da visitor-capture nunca recebem telefone ou IP completos (só usados em console.*).
//   +5521998765432 → +55*******5432 · 189.12.34.56 → 189.12.*.* · 2804:14c:65:1::1 → 2804:14c:*
export function maskPhone(p: string | null | undefined): string {
  const d = String(p ?? '').replace(/\D/g, '')
  if (d.length <= 6) return '****'
  return (String(p).startsWith('+') ? '+' : '') + d.slice(0, 2) + '*'.repeat(d.length - 6) + d.slice(-4)
}

export function maskIp(ip: string | null | undefined): string {
  const v = String(ip ?? '')
  if (v.includes('.')) return v.split('.').slice(0, 2).join('.') + '.*.*'
  if (v.includes(':')) return v.split(':').slice(0, 2).join(':') + ':*'
  return '*'
}
