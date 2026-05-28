// ============================================================
// Helper: sendEmail via Google SMTP (smtp.gmail.com:465)
//
// Usa denomailer@1.6.0 com TLS na porta 465.
// Secrets obrigatórios: GMAIL_SMTP_USER, GMAIL_APP_PASSWORD
// Opcional: GMAIL_SMTP_FROM (padrão: GMAIL_SMTP_USER)
//
// Padrão canônico: send-recovery-email (PR #180, provado em produção)
// ============================================================

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  /** Display name para o From. Ex: "Ekthos Church" → "Ekthos Church <user@gmail.com>" */
  fromName?: string
  /** Sobrescreve o endereço From completo (use com cuidado) */
  from?: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const smtpUser = Deno.env.get('GMAIL_SMTP_USER') || ''
  const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD') || ''
  const smtpFrom = Deno.env.get('GMAIL_SMTP_FROM') || smtpUser || 'noreply@ekthosai.net'

  if (!smtpUser || !smtpPass) {
    throw new Error('[smtp-sender] GMAIL_SMTP_USER ou GMAIL_APP_PASSWORD não configurados')
  }

  const fromAddr = params.from
    ?? (params.fromName ? `${params.fromName} <${smtpFrom}>` : `Ekthos <${smtpFrom}>`)

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: {
        username: smtpUser,
        password: smtpPass,
      },
    },
  })

  await client.send({
    from:    fromAddr,
    to:      [params.to],
    subject: params.subject,
    html:    params.html,
  })

  await client.close()
}
