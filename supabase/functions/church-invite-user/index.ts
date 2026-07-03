// ============================================================
// Edge Function: church-invite-user v10
// Convida um usuário para a igreja via generateLink + SMTP.
// Também suporta trocar papel e remover acesso de usuário existente.
//
// v10 (Fatia 1+2 — perfis de acesso):
//   - ALLOWED_ROLES expandido: treasurer, secretary, admin_departments
//   - action='change_role': atualiza user_roles + app_metadata
//   - action='remove': remove user_roles + limpa app_metadata
//
// POST /church-invite-user
// Headers: Authorization: Bearer <supabase-jwt>
//
// Convidar:  { email, role, name? }
// Trocar:    { action: 'change_role', user_id, role }
// Remover:   { action: 'remove', user_id }
//
// Returns: 201/200 { ... } ou 400/403/404/409/500 { error }
//
// verify_jwt: false — validação manual (padrão ES256)
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          GMAIL_SMTP_USER, GMAIL_APP_PASSWORD, ALLOWED_ORIGIN
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const GMAIL_SMTP_USER           = Deno.env.get('GMAIL_SMTP_USER')     || ''
const GMAIL_APP_PASSWORD        = Deno.env.get('GMAIL_APP_PASSWORD')   || ''
const FROM_EMAIL                = Deno.env.get('GMAIL_SMTP_FROM')      || GMAIL_SMTP_USER || 'noreply@ekthosai.net'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ALLOWED_ROLES = ['admin', 'cell_leader', 'volunteer', 'treasurer', 'secretary', 'admin_departments']

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Template HTML de invite ───────────────────────────────────
function buildInviteHtml(actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Acesso Ekthos</title>
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
                      Seu acesso ao Ekthos está pronto
                    </p>
                    <p style="margin:0 0 16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      Você foi convidado para acessar a plataforma de gestão pastoral Ekthos.
                      Clique no botão abaixo para configurar sua senha e acessar o sistema.
                    </p>
                    <p style="margin:0 0 32px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      O link é válido por <strong>24 horas</strong>.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                      style="margin:0 auto 40px;">
                      <tr>
                        <td align="center" style="border-radius:8px;background-color:#e13500;">
                          <a href="${actionLink}"
                            target="_blank"
                            style="display:inline-block;padding:16px 40px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                            Configurar minha senha
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
                            <strong>Não esperava este convite?</strong><br>
                            Se você não foi convidado para o Ekthos, ignore este e-mail com segurança.
                            Nenhuma ação será tomada.
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
                Recebeu este e-mail porque alguém do seu ministério configurou seu acesso ao Ekthos.
                Se não foi você, pode ignorar com segurança.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="margin:12px 0;">
                <tr>
                  <td style="border-top:1px solid #2e2e2e;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#555555;text-align:center;line-height:1.6;">
                Ekthos Tecnologia LTDA · Brasil<br>
                noreply@ekthosai.net
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
  if (req.method !== 'POST') return jsonErr('Method not allowed', 405)

  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonErr('Unauthorized', 401)
  const token = authHeader.slice(7)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  const churchId   = user.app_metadata?.church_id as string | undefined
  const callerRole = user.app_metadata?.role       as string | undefined

  if (!churchId)              return jsonErr('Church not found in token', 400)
  if (callerRole !== 'admin') return jsonErr('Apenas administradores podem realizar esta ação', 403)

  // ── Body ──────────────────────────────────────────────────
  let body: { email?: string; role?: string; name?: string; action?: string; user_id?: string }
  try { body = await req.json() } catch { return jsonErr('Invalid JSON body', 400) }

  const { email, role, name, action, user_id: targetUserId } = body

  // ── Action: change_role ───────────────────────────────────
  if (action === 'change_role') {
    if (!targetUserId || typeof targetUserId !== 'string') return jsonErr('user_id é obrigatório', 400)
    if (!role || !ALLOWED_ROLES.includes(role))            return jsonErr(`role deve ser um de: ${ALLOWED_ROLES.join(', ')}`, 400)
    if (targetUserId === user.id)                          return jsonErr('Não é possível alterar seu próprio papel', 400)

    const { data: existing } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!existing) return jsonErr('Usuário não encontrado nesta organização', 404)

    const { error: updateRoleErr } = await supabase
      .from('user_roles')
      .update({ role })
      .eq('user_id', targetUserId)
      .eq('church_id', churchId)
    if (updateRoleErr) {
      console.error('[church-invite-user] change_role user_roles error:', updateRoleErr.message)
      return jsonErr('Erro ao atualizar papel', 500)
    }

    const { data: targetUserData } = await supabase.auth.admin.getUserById(targetUserId)
    const mergedMeta = { ...targetUserData?.user?.app_metadata, role }
    await supabase.auth.admin.updateUserById(targetUserId, { app_metadata: mergedMeta })

    console.log(`[church-invite-user] change_role OK: ${targetUserId} → ${role} (church=${churchId})`)
    return jsonOk({ user_id: targetUserId, role })
  }

  // ── Action: remove ────────────────────────────────────────
  if (action === 'remove') {
    if (!targetUserId || typeof targetUserId !== 'string') return jsonErr('user_id é obrigatório', 400)
    if (targetUserId === user.id) return jsonErr('Não é possível remover seu próprio acesso', 400)

    const { data: existing } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId)
      .eq('church_id', churchId)
      .maybeSingle()
    if (!existing) return jsonErr('Usuário não encontrado nesta organização', 404)

    const { error: deleteErr } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', targetUserId)
      .eq('church_id', churchId)
    if (deleteErr) {
      console.error('[church-invite-user] remove user_roles error:', deleteErr.message)
      return jsonErr('Erro ao remover acesso', 500)
    }

    // Limpa app_metadata somente se church_id bater — preserva ekthos_roles e outros campos
    const { data: targetUserData } = await supabase.auth.admin.getUserById(targetUserId)
    if (targetUserData?.user?.app_metadata?.church_id === churchId) {
      const meta = { ...targetUserData.user.app_metadata }
      delete meta.church_id
      delete meta.role
      await supabase.auth.admin.updateUserById(targetUserId, { app_metadata: meta })
    }

    console.log(`[church-invite-user] remove OK: ${targetUserId} (church=${churchId})`)
    return jsonOk({ user_id: targetUserId, removed: true })
  }

  // ── Fluxo de convite (action ausente) ────────────────────
  if (!email || typeof email !== 'string') return jsonErr('email é obrigatório', 400)
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return jsonErr(`role deve ser um de: ${ALLOWED_ROLES.join(', ')}`, 400)
  }

  // ── Guard: SMTP credentials necessárias ──────────────────
  if (!GMAIL_SMTP_USER || !GMAIL_APP_PASSWORD) {
    console.error('[church-invite-user] GMAIL_SMTP_USER ou GMAIL_APP_PASSWORD não configurados')
    return jsonErr('Configuração de email incompleta no servidor', 500)
  }

  // ── Checar limite de assentos ─────────────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('extra_users, plan:plans(max_users)')
    .eq('church_id', churchId)
    .maybeSingle()

  const maxUsers = ((sub?.plan as { max_users?: number } | null)?.max_users ?? 2)
                 + (sub?.extra_users ?? 0)

  const { count: currentUsers } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('church_id', churchId)

  if ((currentUsers ?? 0) >= maxUsers) {
    return jsonErr(`Limite de ${maxUsers} usuários atingido. Faça upgrade do plano.`, 403)
  }

  // ── Verificar se email já pertence a outra organização ───
  const usersListResp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`,
    {
      headers: {
        apikey:        SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  if (usersListResp.ok) {
    const listData = await usersListResp.json() as {
      users?: Array<{ id: string; email?: string; app_metadata?: { church_id?: string } }>
    }
    const found = listData.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    )
    if (found) {
      const existingChurchId = found.app_metadata?.church_id
      if (existingChurchId && existingChurchId !== churchId) {
        console.warn(
          `[church-invite-user] 409 cross-church: ${email} já pertence à church ${existingChurchId}, tentativa da church ${churchId}`,
        )
        return jsonErr(
          'Este email já está vinculado a outra organização. Para transferir acesso, acione um admin Ekthos.',
          409,
        )
      }
    }
  }

  // ── Step 1: generateLink type='invite' via Admin REST ─────
  let actionLink: string
  let newUserId: string

  try {
    const genResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        type: 'invite',
        email,
        options: { redirect_to: `${ALLOWED_ORIGIN}/auth/set-password` },
      }),
    })

    if (!genResp.ok) {
      const errText = await genResp.text()
      console.error(`[church-invite-user] generateLink failed ${genResp.status}: ${errText}`)
      return jsonErr('Falha ao gerar link de acesso', 500)
    }

    const genData = await genResp.json() as {
      action_link?: string
      user?: { id?: string }
    }

    if (!genData.action_link) {
      console.error('[church-invite-user] action_link ausente na resposta de generateLink')
      return jsonErr('Falha ao gerar link de acesso: resposta inválida', 500)
    }

    actionLink = genData.action_link

    if (genData.user?.id) {
      newUserId = genData.user.id
    } else {
      const lookupResp = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      )
      if (!lookupResp.ok) {
        console.error('[church-invite-user] lookup fallback failed')
        return jsonErr('Falha ao localizar usuário após geração do link', 500)
      }
      const lookupData = await lookupResp.json() as {
        users?: Array<{ id: string; email?: string }>
      }
      const found = lookupData.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase(),
      )
      if (!found) {
        console.error('[church-invite-user] usuário não encontrado após generateLink')
        return jsonErr('Falha ao localizar usuário após geração do link', 500)
      }
      newUserId = found.id
    }
  } catch (err) {
    console.error('[church-invite-user] generateLink exception:', err)
    return jsonErr('Falha ao gerar link de acesso', 500)
  }

  // ── Step 2: Setar app_metadata — merge seguro ─────────────
  const { data: existingUserData } = await supabase.auth.admin.getUserById(newUserId)
  const mergedAppMetadata = {
    ...existingUserData?.user?.app_metadata,
    church_id: churchId,
    role,
  }
  const { error: updateErr } = await supabase.auth.admin.updateUserById(newUserId, {
    app_metadata: mergedAppMetadata,
  })
  if (updateErr) {
    console.error('[church-invite-user] updateUserById error:', updateErr.message)
  }

  // ── Step 3: Inserir user_role ──────────────────────────────
  await supabase.from('user_roles').upsert(
    { user_id: newUserId, church_id: churchId, role },
    { onConflict: 'user_id,church_id' },
  )

  // ── Step 4: Upsert perfil ─────────────────────────────────
  await supabase.from('profiles').upsert(
    {
      user_id:      newUserId,
      church_id:    churchId,
      name:         name ?? null,
      display_name: name ?? null,
    },
    { onConflict: 'user_id' },
  )

  // ── Step 5: Enviar email via Google SMTP ──────────────────
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
      from:    `Ekthos <${FROM_EMAIL}>`,
      to:      [email],
      subject: 'Seu acesso ao Ekthos está pronto',
      html:    buildInviteHtml(actionLink),
    })

    await client.close()
    console.log(`[church-invite-user] SMTP OK → ${email} (role=${role}, church=${churchId})`)
  } catch (err) {
    console.error('[church-invite-user] SMTP exception (user criado, roles OK):', err)
  }

  return jsonOk({ user_id: newUserId, email, role }, 201)
})
