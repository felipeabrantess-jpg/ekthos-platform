// ============================================================
// Edge Function: send-recovery-email v2
//
// Workaround para EVE (Email Validation Extended) do Supabase
// que bloqueia domínios "não-reputados" como ekthosai.net.
//
// Estratégia:
//   1. Admin API generateLink({type:'recovery'}) → gera link JWT
//      sem disparar o mailer GoTrue (bypassa EVE)
//   2. Envia email via Google Workspace SMTP (denomailer port 465)
//
// POST /send-recovery-email
// Body: { email: string }
// Returns: SEMPRE 200 { success: true } — anti-enumeração
//
// verify_jwt: false — endpoint público (igual /auth/v1/recover)
// Secrets necessários: GMAIL_SMTP_USER, GMAIL_APP_PASSWORD
// Opcional: GMAIL_SMTP_FROM (padrão: GMAIL_SMTP_USER)
// ============================================================

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_SMTP_USER           = Deno.env.get('GMAIL_SMTP_USER')     || ''
const GMAIL_APP_PASSWORD        = Deno.env.get('GMAIL_APP_PASSWORD')   || ''
const FROM_EMAIL                = Deno.env.get('GMAIL_SMTP_FROM')      || GMAIL_SMTP_USER || 'noreply@ekthosai.net'
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const REDIRECT_TO               = `${ALLOWED_ORIGIN}/auth/reset-password`

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonOk(): Response {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function buildRecoveryHtml(confirmationURL: string, recipientEmail: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Redefinir sua senha do Ekthos</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f0eb;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:#f4f0eb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <img src="https://ekthos-platform.vercel.app/logo-ekthos-200.png"
                alt="Ekthos Church" width="56" height="56"
                style="display:block;border:0;outline:none;">
              <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#161616;letter-spacing:0.5px;">
                Ekthos Church
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.07);overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#e13500;height:5px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 48px 32px;">
                    <p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#161616;line-height:1.3;">
                      Redefinir sua senha
                    </p>
                    <p style="margin:0 0 16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      Recebemos uma solicitação para criar uma nova senha para a sua conta no Ekthos.
                    </p>
                    <p style="margin:0 0 32px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      Clique no botão abaixo para escolher uma nova senha. O link é válido por <strong>1 hora</strong>.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                      style="margin:0 auto 40px;">
                      <tr>
                        <td align="center" style="border-radius:8px;background-color:#e13500;">
                          <a href="${confirmationURL}"
                            target="_blank"
                            style="display:inline-block;padding:16px 40px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                            Criar nova senha
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                      style="margin-bottom:28px;">
                      <tr>
                        <td style="border-top:1px solid #eeeeee;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                      style="margin-bottom:32px;">
                      <tr>
                        <td style="background-color:#FDE8E0;border-left:3px solid #e13500;border-radius:4px;padding:14px 18px;">
                          <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#C42E00;line-height:1.6;">
                            <strong>Não solicitou isso?</strong><br>
                            Se você não pediu para redefinir sua senha, ignore este e-mail.
                            Sua senha atual continua a mesma e nenhuma alteração foi feita.
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;color:#444444;line-height:1.7;">
                      Que Deus abençoe você e o ministério da sua igreja.
                    </p>
                    <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#161616;font-weight:700;">
                      Felipe Abrantes
                    </p>
                    <p style="margin:2px 0 0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">
                      Fundador — Ekthos
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:24px;">&nbsp;</td></tr>
          <tr>
            <td style="background-color:#161616;border-radius:12px;padding:28px 48px;">
              <p style="margin:0 0 12px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#888888;text-align:center;line-height:1.6;">
                Se você não solicitou a redefinição de senha, pode ignorar este e-mail
                com segurança — sua senha permanece inalterada.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="margin:12px 0;">
                <tr>
                  <td style="border-top:1px solid #2e2e2e;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#555555;text-align:center;line-height:1.6;">
                Ekthos Tecnologia LTDA · Brasil<br>
                Este e-mail foi enviado para
                <span style="color:#888888;">${recipientEmail}</span>
              </p>
            </td>
          </tr>
          <tr><td style="height:40px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return jsonOk() // silencioso — anti-enumeração

  // ── Parse body ────────────────────────────────────────────
  let body: { email?: string }
  try { body = await req.json() } catch { return jsonOk() }

  const email = body.email?.trim().toLowerCase()
  if (!email) return jsonOk()

  // ── Guard: SMTP credentials necessárias ──────────────────
  if (!GMAIL_SMTP_USER || !GMAIL_APP_PASSWORD) {
    console.error('[send-recovery-email] GMAIL_SMTP_USER ou GMAIL_APP_PASSWORD não configurados')
    return jsonOk()
  }

  // ── Step 1: generateLink via Admin REST (bypassa EVE) ─────
  // Usamos REST direto para controlar redirect_to no top-level.
  let actionLink: string
  try {
    const genResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        type: 'recovery',
        email,
        redirect_to: REDIRECT_TO,
      }),
    })

    if (!genResp.ok) {
      const errText = await genResp.text()
      console.error(`[send-recovery-email] generateLink failed ${genResp.status}: ${errText}`)
      return jsonOk() // anti-enumeração
    }

    const genData = await genResp.json() as { action_link?: string }
    if (!genData.action_link) {
      console.error('[send-recovery-email] action_link ausente na resposta')
      return jsonOk()
    }

    actionLink = genData.action_link
  } catch (err) {
    console.error('[send-recovery-email] generateLink exception:', err)
    return jsonOk()
  }

  // ── Step 2: Enviar email via Google SMTP (denomailer) ─────
  try {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_SMTP_USER,
          password: GMAIL_APP_PASSWORD,
        },
      },
    })

    await client.send({
      from: `Ekthos <${FROM_EMAIL}>`,
      to: [email],
      subject: "Redefinir sua senha do Ekthos",
      html: buildRecoveryHtml(actionLink, email),
    })

    await client.close()
    console.log(`[send-recovery-email] SMTP OK → ${email}`)
  } catch (err) {
    console.error('[send-recovery-email] SMTP exception:', err)
  }

  return jsonOk()
})
