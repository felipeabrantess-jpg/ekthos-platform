// ============================================================
// Edge Function: send-welcome-email
// Envia email de boas-vindas para novo visitante cadastrado.
// Chamada internamente por dispatch-person-event (fire-and-forget).
//
// POST /send-welcome-email
// Body: { person_id: string }
// Returns: SEMPRE 200 { success: true } — idempotente
//
// verify_jwt: false — chamada interna via service_role Bearer
// Secrets: GMAIL_SMTP_USER, GMAIL_APP_PASSWORD
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GMAIL_SMTP_USER           = Deno.env.get('GMAIL_SMTP_USER')   || ''
const GMAIL_APP_PASSWORD        = Deno.env.get('GMAIL_APP_PASSWORD') || ''
const FROM_EMAIL                = Deno.env.get('GMAIL_SMTP_FROM')    || GMAIL_SMTP_USER || 'noreply@ekthosai.net'

function jsonOk(): Response {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────
// Template HTML de boas-vindas
// ─────────────────────────────────────────────────────────────
function buildWelcomeHtml(
  personName:      string,
  churchName:      string,
  recipientEmail:  string,
): string {
  const firstName = personName.split(' ')[0] || 'visitante'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Bem-vindo(a) à ${churchName}</title>
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
                alt="${churchName}" width="56" height="56"
                style="display:block;border:0;outline:none;">
              <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#161616;letter-spacing:0.5px;">
                ${churchName}
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
                      Que alegria ter você conosco! 🙏
                    </p>
                    <p style="margin:0 0 16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      Oi, <strong>${firstName}</strong>! Foi um prazer ter você na <strong>${churchName}</strong>.
                      Ficamos muito felizes com a sua visita e queremos que você saiba que
                      as portas desta casa estão sempre abertas para você.
                    </p>
                    <p style="margin:0 0 32px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      Nos próximos dias, nossa equipe pastoral pode entrar em contato pelo WhatsApp
                      para saber como você está e responder qualquer dúvida. Sinta-se à vontade
                      para responder — estamos aqui para você.
                    </p>
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
                            <strong>Já conhece nossas células?</strong><br>
                            Nossos grupos de vida são a melhor forma de se conectar com nossa comunidade
                            e crescer na fé junto com outros irmãos. Pergunte para a equipe quando nos visitar de novo!
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;color:#444444;line-height:1.7;">
                      Que Deus abençoe você e sua família.
                    </p>
                    <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#161616;font-weight:700;">
                      Equipe Pastoral
                    </p>
                    <p style="margin:2px 0 0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:13px;color:#999999;">
                      ${churchName}
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
                Recebeu este email porque você se cadastrou em ${churchName}.
                Se não foi você, pode ignorar com segurança.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="margin:12px 0;">
                <tr>
                  <td style="border-top:1px solid #2e2e2e;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#555555;text-align:center;line-height:1.6;">
                Powered by Ekthos Church · Brasil<br>
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

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') return jsonOk()

  // Guard: SMTP credentials
  if (!GMAIL_SMTP_USER || !GMAIL_APP_PASSWORD) {
    console.error('[send-welcome-email] GMAIL_SMTP_USER ou GMAIL_APP_PASSWORD não configurados')
    return jsonOk()
  }

  // Parse body
  let body: { person_id?: string }
  try { body = await req.json() } catch { return jsonOk() }

  const personId = body.person_id?.trim()
  if (!personId) return jsonOk()

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Buscar pessoa
  const { data: person, error: personErr } = await sb
    .from('people')
    .select('name, email, church_id')
    .eq('id', personId)
    .single()

  if (personErr || !person) {
    console.warn(`[send-welcome-email] Pessoa não encontrada: ${personId}`)
    return jsonOk()
  }

  const email = person.email?.trim().toLowerCase()
  if (!email) {
    console.log(`[send-welcome-email] Pessoa sem email: ${personId}`)
    return jsonOk()
  }

  // Buscar nome da igreja
  const { data: church } = await sb
    .from('churches')
    .select('name')
    .eq('id', person.church_id as string)
    .single()

  const churchName = (church?.name as string | undefined) || 'nossa comunidade'
  const personName = (person.name as string | undefined) || 'Visitante'

  // Enviar via Google SMTP
  try {
    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_SMTP_USER,
          password: GMAIL_APP_PASSWORD,
        },
      },
    })

    await client.send({
      from:    `${churchName} <${FROM_EMAIL}>`,
      to:      [email],
      subject: `Bem-vindo(a) à ${churchName}! 🙏`,
      html:    buildWelcomeHtml(personName, churchName, email),
    })

    await client.close()
    console.log(`[send-welcome-email] SMTP OK → ${email} (${churchName})`)
  } catch (err) {
    console.error('[send-welcome-email] SMTP exception:', err)
  }

  return jsonOk()
})
