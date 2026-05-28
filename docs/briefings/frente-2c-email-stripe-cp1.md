# Frente 2C — Email Stripe: Migração inviteUserByEmail → generateLink + SMTP
**CP1 — Checkpoint de Mapeamento (read-only)**
**Data:** 2026-05-28
**Engenheiro:** ENG-4
**Status:** PRONTO PARA REVISÃO — NÃO APLICAR

---

## 1. CONTEXTO E MOTIVAÇÃO

`inviteUserByEmail` é o método do Supabase JS SDK que chama `POST /auth/v1/admin/invite` internamente. O GoTrue usa o mailer interno para disparar o email. Se o EVE (Email Validation Extended) estiver ativo, ele intercepta **antes** de qualquer envio — inclusive via Admin API.

**Padrão canônico provado em produção:**
- `send-recovery-email` (PR #180): `generateLink({type:'recovery'})` + denomailer SMTP Gmail
- `send-welcome-email`: denomailer SMTP Gmail direto

**Objetivo desta frente:** substituir `inviteUserByEmail` nos 5 fluxos identificados por `generateLink({type:'invite'})` + envio via SMTP Google (denomailer) para consistência e imunidade ao EVE.

---

## 2. MAPEAMENTO DOS 5 FLUXOS

### Fluxo 1 — handleCaminhoACheckout (stripe-webhook)
**Arquivo:** `supabase/functions/stripe-webhook/index.ts`
**Linha:** 539
**Função envolvente:** `handleCaminhoACheckout(session, eventId)`
**Trigger:** `session.metadata?.source === 'caminho_a'` (compra direta Stripe, landing Caminho A)

```typescript
// LINHA 539 — código atual
const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`,
  data: { full_name: pastorName },
})
```

**Opções passadas:**
- `redirectTo`: `${ALLOWED_ORIGIN}/auth/set-password` ✓
- `data.full_name`: `pastorName` (string, pode ser vazia)
- SEM `emailRedirectTo`

**Profile criado após invite:** SIM — linhas 587–598, `upsert` em `profiles` com `onConflict: 'user_id,church_id'`

**Template de email:** nenhum (usa mailer GoTrue built-in)

**Contexto church_id/email:**
- `email` vem de `session.customer_email ?? session.customer_details?.email ?? session.metadata?.email`
- `church_id` (`churchId`) é retornado pela RPC `process_stripe_checkout_completed` APÓS o invite — portanto o invite ocorre ANTES de `churchId` existir
- `app_metadata` é atualizado com `churchId` após a RPC (linhas 578–583)

**Criticidade:** ALTA — fluxo principal de aquisição Caminho A

---

### Fluxo 2 — handleLandingPageCheckout (stripe-webhook)
**Arquivo:** `supabase/functions/stripe-webhook/index.ts`
**Linha:** 749
**Função envolvente:** `handleLandingPageCheckout(session, eventId)` (referenciada como `[F6]` nos logs)
**Trigger:** `session.metadata?.source === 'landing_page'`

```typescript
// LINHA 749 — código atual
const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { full_name: pastorName },
})
```

**Opções passadas:**
- `redirectTo`: `${ALLOWED_ORIGIN}/auth/set-password` ✓
- `data.full_name`: `pastorName`

**Profile criado após invite:** NÃO — handleLandingPageCheckout NÃO tem bloco de insert em `profiles` (diferença em relação ao Fluxo 1). Isso é uma inconsistência existente.

**Template de email:** nenhum

**Contexto:**
- Mesma lógica de resolução de email que Fluxo 1
- `churchId` também vem da RPC após o invite
- Igreja criada via `churchName`/`churchSlug` com `custom_fields` do Stripe (campo `church_name`)

**Criticidade:** ALTA — fluxo landing page

---

### Fluxo 3 — handleCockpitCheckout (stripe-webhook)
**Arquivo:** `supabase/functions/stripe-webhook/index.ts`
**Linha:** 820
**Função envolvente:** `handleCockpitCheckout(session, churchId)`
**Trigger:** checkout Stripe onde a church já existe (resolve via `resolveChurchId`)

```typescript
// LINHA 820 — código atual
const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(pastorEmail, {
  redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { full_name: session.metadata?.pastor_name ?? '' },
})
```

**Opções passadas:**
- `redirectTo`: `${ALLOWED_ORIGIN}/auth/set-password` ✓
- `data.full_name`: `session.metadata?.pastor_name ?? ''`

**Profile criado após invite:** SIM — linhas 828–838, `upsert` em `profiles` com `onConflict: 'user_id,church_id'`

**Template de email:** nenhum

**Contexto:**
- `pastorEmail` vem de `session.metadata?.pastor_email ?? session.customer_email ?? session.customer_details?.email`
- `churchId` já existe (resolvido antes da chamada à função)
- `app_metadata` atualizado imediatamente após o invite (linha 825)
- Fluxo dentro de bloco `try/catch` — falha é non-fatal (apenas loga warn)

**Criticidade:** MÉDIA — cockpit já existente, less frequente

---

### Fluxo 4 — admin-church-create (Caminho B)
**Arquivo:** `supabase/functions/admin-church-create/index.ts`
**Linha:** 226
**Trigger:** Admin Ekthos cria igreja manualmente via cockpit (trial manual 7 dias)

```typescript
// LINHA 226 — código atual
const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
  pastorEmail,
  {
    redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`,
    data: {
      church_id:    church.id,
      invited_as:   'admin',
      church_name:  churchName,
    },
  },
)
```

**Opções passadas:**
- `redirectTo`: `${ALLOWED_ORIGIN}/auth/set-password` ✓
- `data.church_id`: `church.id` (disponível — church já criada no passo 2)
- `data.invited_as`: `'admin'`
- `data.church_name`: `churchName`

**Profile criado após invite:** SIM — linhas 280–293, `upsert` em `profiles` com `onConflict: 'user_id,church_id'`

**Template de email:** nenhum

**Contexto:**
- `pastorEmail` vem do body da requisição (validado antes)
- `church.id` já existe (criada nos passos anteriores da função)
- Falha no invite PROVOCA ROLLBACK: `deleteGrant + deleteSub + deleteChurch` (ao contrário dos fluxos Stripe que são non-fatal)
- `user_roles` e `app_metadata` são populados após o invite

**Criticidade:** ALTA — único fluxo com rollback real; falha de invite impede a criação da church

---

### Fluxo 5 — church-invite-user (convite avulso)
**Arquivo:** `supabase/functions/church-invite-user/index.ts`
**Linha:** 128
**Trigger:** Admin da igreja convida um usuário (pastor assistente, líder de célula, voluntário)

```typescript
// LINHA 128 — código atual
const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
  email,
  { redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { name: name ?? '' } },
)
```

**Opções passadas:**
- `redirectTo`: `${ALLOWED_ORIGIN}/auth/set-password` ✓
- `data.name`: `name ?? ''` (nome do usuário, opcional)

**Profile criado após invite:** SIM — linhas 164–173, `upsert` em `profiles` com `onConflict: 'user_id'`

**Template de email:** nenhum

**Contexto:**
- `email` e `churchId` validados via JWT do usuário autenticado (admin da church)
- Falha no invite retorna 500 imediatamente (sem rollback — não há o que reverter)
- Guard anti cross-church: verifica se email já pertence a outra church antes de convidar
- `user_roles` e `app_metadata` são populados após o invite

**Criticidade:** BAIXA-MÉDIA — fluxo isolado, mais seguro para testar primeiro

---

## 3. RESUMO COMPARATIVO

| # | Fluxo | Arquivo | Linha | redirectTo | data extra | Profile? | Rollback? |
|---|-------|---------|-------|-----------|------------|----------|-----------|
| 1 | handleCaminhoACheckout | stripe-webhook | 539 | /auth/set-password | full_name | SIM | NÃO (non-fatal) |
| 2 | handleLandingPageCheckout | stripe-webhook | 749 | /auth/set-password | full_name | NÃO ⚠️ | NÃO (non-fatal) |
| 3 | handleCockpitCheckout | stripe-webhook | 820 | /auth/set-password | full_name | SIM | NÃO (non-fatal) |
| 4 | admin-church-create | admin-church-create | 226 | /auth/set-password | church_id, invited_as, church_name | SIM | SIM ⚠️ |
| 5 | church-invite-user | church-invite-user | 128 | /auth/set-password | name | SIM | NÃO |

**⚠️ Observação Fluxo 2:** handleLandingPageCheckout não cria profile — inconsistência pré-existente, independente desta migração.

**⚠️ Observação Fluxo 4:** é o único onde falha de invite faz rollback completo (deleteGrant + deleteSub + deleteChurch). A migração para generateLink+SMTP muda o comportamento de falha: o link é gerado mas o email pode falhar silenciosamente (SMTP error) sem impedir a criação da church. Isso pode ser desejável (melhor UX) mas precisa de decisão explícita.

---

## 4. ESTADO DO _SHARED E TEMPLATES

- **`supabase/functions/_shared/`**: VAZIO — não existe nenhum helper de email
- **`invite.html`**: NÃO EXISTE em nenhum lugar do repositório
- **Templates existentes:** apenas inline (`buildRecoveryHtml` em send-recovery-email, `buildWelcomeHtml` em send-welcome-email)

---

## 5. PACOTE DE MIGRAÇÃO PROPOSTO

### 5a. Helper: `supabase/functions/_shared/email/generate-invite-link.ts`

```typescript
// generateInviteLink — wraps POST /auth/v1/admin/generate_link type='invite'
// Bypassa EVE (igual a generateLink type='recovery' em send-recovery-email)
//
// Parâmetros:
//   email:          destinatário do invite
//   redirectTo:     URL pós-clique (ex: /auth/set-password)
//   supabaseUrl:    Deno.env.get('SUPABASE_URL')
//   serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
//
// Retorna: action_link (string) ou lança erro

export async function generateInviteLink(
  email: string,
  redirectTo: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<string> {
  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      type: 'invite',
      email,
      redirect_to: redirectTo,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`generateInviteLink failed ${resp.status}: ${errText}`)
  }

  const data = await resp.json() as { action_link?: string; user?: { id: string } }
  if (!data.action_link) {
    throw new Error('generateInviteLink: action_link ausente na resposta')
  }

  return data.action_link
}

// NOTA: generate_link type='invite' retorna o user.id no campo data.user.id
// Use para capturar o userId sem precisar de inviteUserByEmail:
//   const { action_link, user_id } = await generateInviteLinkWithUserId(...)
//
// Versão estendida para quando precisar do user.id:
export async function generateInviteLinkWithUserId(
  email: string,
  redirectTo: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ actionLink: string; userId: string }> {
  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      type: 'invite',
      email,
      redirect_to: redirectTo,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`generateInviteLink failed ${resp.status}: ${errText}`)
  }

  const data = await resp.json() as { action_link?: string; user?: { id: string } }
  if (!data.action_link) throw new Error('generateInviteLink: action_link ausente')
  if (!data.user?.id)    throw new Error('generateInviteLink: user.id ausente')

  return { actionLink: data.action_link, userId: data.user.id }
}
```

---

### 5b. Helper: `supabase/functions/_shared/email/smtp-sender.ts`

```typescript
// smtp-sender — wraps denomailer para envio via Google SMTP
// Extrai padrão canônico de send-recovery-email
//
// Secrets necessários: GMAIL_SMTP_USER, GMAIL_APP_PASSWORD
// Opcional: GMAIL_SMTP_FROM (default: GMAIL_SMTP_USER)

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

export interface SendEmailOptions {
  to:      string | string[]
  subject: string
  html:    string
  from?:   string  // default: "Ekthos <GMAIL_SMTP_USER>"
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const GMAIL_SMTP_USER    = Deno.env.get('GMAIL_SMTP_USER')    || ''
  const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') || ''
  const FROM_EMAIL         = Deno.env.get('GMAIL_SMTP_FROM')    || GMAIL_SMTP_USER || 'noreply@ekthosai.net'

  if (!GMAIL_SMTP_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_SMTP_USER ou GMAIL_APP_PASSWORD não configurados')
  }

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
    from:    opts.from ?? `Ekthos <${FROM_EMAIL}>`,
    to:      Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html:    opts.html,
  })

  await client.close()
}
```

---

### 5c. Template: `invite.html` PT-BR

**Arquivo sugerido:** `supabase/functions/_shared/email/templates/invite.html`

**Assunto:** `Seu acesso ao Ekthos está pronto`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Seu acesso ao Ekthos está pronto</title>
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
                      {{GREETING}}
                    </p>
                    <p style="margin:0 0 16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#444444;line-height:1.7;">
                      Sua conta foi criada em <strong>{{CHURCH_NAME}}</strong> com o papel de
                      <strong>{{ROLE_LABEL}}</strong>. Para acessar a plataforma, clique no botão
                      abaixo e configure sua senha.
                    </p>
                    <p style="margin:0 0 32px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#777777;line-height:1.7;">
                      O link é válido por <strong>24 horas</strong>.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                      style="margin:0 auto 40px;">
                      <tr>
                        <td align="center" style="border-radius:8px;background-color:#e13500;">
                          <a href="{{ACTION_LINK}}"
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
                            <strong>Não reconhece este convite?</strong><br>
                            Se você não esperava este acesso, ignore este e-mail com segurança.
                            Nenhuma ação é necessária.
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
                Recebeu este e-mail porque foi convidado para acessar o Ekthos Church.
                Se não reconhece o convite, pode ignorar com segurança.
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
                <span style="color:#888888;">{{RECIPIENT_EMAIL}}</span>
              </p>
            </td>
          </tr>
          <tr><td style="height:40px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Variáveis do template:**
| Variável | Descrição | Valor default sugerido |
|----------|-----------|----------------------|
| `{{ACTION_LINK}}` | URL gerada por generateLink | obrigatório |
| `{{RECIPIENT_EMAIL}}` | Email do destinatário | obrigatório |
| `{{CHURCH_NAME}}` | Nome da igreja | `nossa comunidade` |
| `{{GREETING}}` | Saudação personalizada | `Olá! Você foi convidado para acessar o Ekthos.` |
| `{{ROLE_LABEL}}` | Label do role em PT-BR | `Administrador` / `Líder de Célula` / `Voluntário` |

---

### 5d. Diff por fluxo (antes/depois)

#### Fluxo 5 — church-invite-user (piloto recomendado)

**ANTES (linha 128):**
```typescript
const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
  email,
  { redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { name: name ?? '' } },
)
if (inviteErr) {
  console.error('[church-invite-user] inviteUserByEmail error:', inviteErr.message)
  return jsonErr(inviteErr.message, 500)
}
const newUserId = inviteData.user.id
```

**DEPOIS:**
```typescript
// Step 1: generateLink via Admin REST (bypassa EVE — igual a send-recovery-email)
let actionLink: string
let newUserId: string
try {
  const genResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      type:        'invite',
      email,
      redirect_to: `${ALLOWED_ORIGIN}/auth/set-password`,
    }),
  })
  if (!genResp.ok) {
    const errText = await genResp.text()
    console.error(`[church-invite-user] generateLink failed ${genResp.status}: ${errText}`)
    return jsonErr('Falha ao gerar link de convite', 500)
  }
  const genData = await genResp.json() as { action_link?: string; user?: { id: string } }
  if (!genData.action_link) return jsonErr('generateLink: action_link ausente', 500)
  if (!genData.user?.id)    return jsonErr('generateLink: user.id ausente', 500)
  actionLink = genData.action_link
  newUserId  = genData.user.id
} catch (e) {
  console.error('[church-invite-user] generateLink exception:', (e as Error).message)
  return jsonErr('Erro interno ao processar convite', 500)
}

// Step 2: Enviar email via SMTP Gmail (denomailer — igual a send-recovery-email)
// Non-fatal: usuário foi criado, admin pode reenviar manualmente
try {
  const smtpClient = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true,
      auth: { username: GMAIL_SMTP_USER, password: GMAIL_APP_PASSWORD } },
  })
  const roleLabelMap: Record<string, string> = {
    admin:       'Administrador',
    cell_leader: 'Líder de Célula',
    volunteer:   'Voluntário',
  }
  const roleLabel = roleLabelMap[role] ?? role
  await smtpClient.send({
    from:    `Ekthos <${FROM_EMAIL}>`,
    to:      [email],
    subject: 'Seu acesso ao Ekthos está pronto',
    html:    buildInviteHtml(actionLink, email, roleLabel, name),
  })
  await smtpClient.close()
  console.log(`[church-invite-user] SMTP invite OK → ${email} (${role})`)
} catch (smtpErr) {
  console.error('[church-invite-user] SMTP exception (non-fatal):', smtpErr)
  // Continua: usuário criado, app_metadata e user_roles ainda serão setados
}
```

#### Fluxo 4 — admin-church-create

**ANTES (linha 226):**
```typescript
const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
  pastorEmail,
  {
    redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`,
    data: { church_id: church.id, invited_as: 'admin', church_name: churchName },
  },
)
if (inviteErr || !inviteData?.user) {
  // ROLLBACK: deleteGrant + deleteSub + deleteChurch
  return json({ error: 'Falha ao enviar invite: ...' }, 500)
}
const pastorId = inviteData.user.id
```

**DEPOIS:**
```typescript
// generateLink + SMTP — church_id já disponível (criado nos passos anteriores)
let actionLink: string
let pastorId: string
try {
  const genResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      type:        'invite',
      email:       pastorEmail,
      redirect_to: `${ALLOWED_ORIGIN}/auth/set-password`,
    }),
  })
  if (!genResp.ok) {
    const errText = await genResp.text()
    console.error(`[admin-church-create] generateLink failed ${genResp.status}: ${errText}`)
    await deleteGrant(church.id)
    await deleteSub(church.id)
    await deleteChurch(church.id)
    return json({ error: 'Falha ao criar link de convite' }, 500)
  }
  const genData = await genResp.json() as { action_link?: string; user?: { id: string } }
  if (!genData.action_link || !genData.user?.id) {
    await deleteGrant(church.id); await deleteSub(church.id); await deleteChurch(church.id)
    return json({ error: 'generateLink: resposta incompleta' }, 500)
  }
  actionLink = genData.action_link
  pastorId   = genData.user.id
} catch (e) {
  await deleteGrant(church.id); await deleteSub(church.id); await deleteChurch(church.id)
  return json({ error: 'Erro ao gerar convite: ' + (e as Error).message }, 500)
}

// SMTP — non-fatal (pastor criado; email pode ser reenviado manualmente)
try {
  const smtpClient = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true,
      auth: { username: GMAIL_SMTP_USER, password: GMAIL_APP_PASSWORD } },
  })
  await smtpClient.send({
    from:    `Ekthos <${FROM_EMAIL}>`,
    to:      [pastorEmail],
    subject: 'Seu acesso ao Ekthos está pronto',
    html:    buildInviteHtml(actionLink, pastorEmail, 'Administrador', pastor_name),
  })
  await smtpClient.close()
  console.log(`[admin-church-create] SMTP invite OK → ${pastorEmail}`)
} catch (smtpErr) {
  console.warn('[admin-church-create] SMTP invite (non-fatal):', smtpErr)
}
```

> **Decisão necessária (Fluxo 4):** O rollback atual é acionado quando `inviteUserByEmail` falha (ex: email já existe no sistema). Com `generateLink`, o comportamento muda: se o email já tem conta, `generate_link type='invite'` **NÃO falha** — ele simplesmente regenera um link. Isso remove o rollback de "email já cadastrado" mas pode ser desejável (admin pode querer reenviar convite para pastor já cadastrado). Confirmar com Felipe antes de aplicar.

#### Fluxos 1, 2, 3 — stripe-webhook (non-fatal, padrão idêntico)

**ANTES (linhas 539, 749, 820 — idênticos):**
```typescript
const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`, data: { full_name: pastorName },
})
if (inviteErr) console.warn('[F] inviteUserByEmail (non-fatal):', inviteErr.message)
else userId = invited?.user?.id ?? null
```

**DEPOIS (mesmo padrão para os 3 fluxos, non-fatal):**
```typescript
// generateLink type='invite' via Admin REST (bypassa EVE)
let userId: string | null = null
let inviteActionLink: string | null = null
try {
  const genResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ type: 'invite', email, redirect_to: `${ALLOWED_ORIGIN}/auth/set-password` }),
  })
  if (genResp.ok) {
    const genData = await genResp.json() as { action_link?: string; user?: { id: string } }
    inviteActionLink = genData.action_link ?? null
    userId           = genData.user?.id    ?? null
  } else {
    console.warn(`[F] generateLink failed ${genResp.status}`)
  }
} catch (e) { console.warn('[F] generateLink exception:', (e as Error).message) }

// Enviar email via SMTP (non-fatal)
if (inviteActionLink && email) {
  try {
    const smtpClient = new SMTPClient({
      connection: { hostname: 'smtp.gmail.com', port: 465, tls: true,
        auth: { username: GMAIL_SMTP_USER, password: GMAIL_APP_PASSWORD } },
    })
    await smtpClient.send({
      from:    `Ekthos <${FROM_EMAIL}>`,
      to:      [email],
      subject: 'Seu acesso ao Ekthos está pronto',
      html:    buildInviteHtml(inviteActionLink, email, 'Administrador', pastorName),
    })
    await smtpClient.close()
    console.log(`[F] SMTP invite OK → ${email}`)
  } catch (smtpErr) { console.warn('[F] SMTP invite exception (non-fatal):', smtpErr) }
}
```

---

## 6. SEQUÊNCIA DE MIGRAÇÃO RECOMENDADA

**Critério de priorização:** menor risco primeiro, maior isolamento, menor impacto em produção.

| Ordem | Fluxo | Motivo |
|-------|-------|--------|
| 1 | church-invite-user | Mais isolado, volume baixo, rollback simples, ideal para validar o padrão |
| 2 | admin-church-create | Crítico mas volume muito baixo (manual), rollback existente protege |
| 3 | stripe-webhook :820 (CockpitCheckout) | Non-fatal, volume menor, church já existe |
| 4 | stripe-webhook :539 (CaminhoACheckout) | Non-fatal, volume médio, fluxo Caminho A |
| 5 | stripe-webhook :749 (LandingPageCheckout) | Non-fatal, maior volume, por último |

**Nota sobre Fluxo 2 (F6/LandingPage):** além da migração de email, corrigir o profile ausente (inconsistência pré-existente). Fazer no mesmo PR.

**Nota sobre Frente 1:** onboarding-engineer já tocou redirectTo e profile — verificar colisão antes de abrir PR.

---

## 7. NOTA EVE — ANÁLISE TÉCNICA

**Pergunta:** `inviteUserByEmail` via Admin JS SDK é bloqueado pelo EVE?

**Análise:**
- `supabase.auth.admin.inviteUserByEmail()` do SDK chama `POST /auth/v1/admin/invite` internamente
- EVE intercepta chamadas GoTrue que usam o mailer interno — especificamente `/auth/v1/magiclink`, `/auth/v1/recover`, e o flow de invite que passa pelo mailer
- A Admin API `/auth/v1/admin/generate_link` **não dispara o mailer GoTrue** — apenas gera o JWT/link. EVE não tem onde interceptar
- `inviteUserByEmail` via Admin API (`/auth/v1/admin/invite`) PODE passar pelo mailer interno e SER bloqueado pelo EVE se o domínio não for reputado
- **Evidência histórica no projeto:** armadilha #27 do CLAUDE.md documenta que Magic Link e Recovery foram bloqueados pelo EVE para `ekthosai.net`. invite é outro endpoint mas usa o mesmo mailer pipeline

**Conclusão:** o risco de bloqueio EVE em `inviteUserByEmail` para domínios como `ekthosai.net` (pastor@ekthosai.net) existe. Para `gmail.com`, `hotmail.com`, `yahoo.com` — provavelmente não bloqueado hoje. A migração é preventiva e de consistência.

**Teste empírico recomendado ANTES de migrar:**
```bash
# Testar inviteUserByEmail atual para domínio ekthosai.net
curl -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/church-invite-user" \
  -H "Authorization: Bearer <JWT_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test-invite@ekthosai.net", "role": "volunteer", "name": "Teste EVE"}'
# Verificar se email chegou — se não chegou, EVE está bloqueando
```

---

## 8. PLANO DE TESTE EMPÍRICO POR FLUXO

### Fluxo 5 — church-invite-user (piloto)
1. Deploy da versão migrada no staging
2. Convidar `test-invite@gmail.com` como `volunteer` na church piloto
3. Verificar: email recebido? Link funciona? `/auth/set-password` carrega?
4. Convidar `test-invite@ekthosai.net` — email chega? (valida EVE bypass)
5. Tentar convidar email já cadastrado — comportamento esperado?

### Fluxo 4 — admin-church-create
1. Criar church via cockpit com `pastorEmail = test@gmail.com`
2. Verificar: church criada, email recebido, link funciona, profile criado
3. Criar com `pastorEmail = test@ekthosai.net` — email chega?
4. Criar com email já existente — rollback ocorre? (mudança de comportamento!)

### Fluxos 1/2/3 — stripe-webhook
1. Usar Stripe CLI para replay de evento `checkout.session.completed` com payload de teste
2. Verificar no Supabase: user criado? church criada? app_metadata correto?
3. Verificar email recebido
4. Checar logs da EF: `SMTP invite OK` ou `SMTP invite exception`

---

## 9. DEPENDÊNCIAS E RISCOS

### Dependências
- `GMAIL_SMTP_USER` e `GMAIL_APP_PASSWORD` já configurados como secrets (provado em produção — send-recovery-email funcionando)
- `ALLOWED_ORIGIN` já disponível em todas as EFs afetadas

### Riscos identificados
1. **Fluxo 4 — mudança de comportamento no rollback:** `generate_link type='invite'` não falha para email já existente — remove o trigger de rollback "email já cadastrado". Pode ser desejável, mas precisa de decisão explícita.
2. **Fluxo 2 — profile ausente:** a inconsistência (sem insert de profile) é pré-existente, mas ao migrar o email, é momento natural de corrigir junto.
3. **generate_link retorna user.id diferente de inviteUserByEmail?** Improvável, mas testar empiricamente — o user criado deve ser o mesmo.
4. **Rate limit SMTP Gmail:** 500 emails/dia no App Password. Para volumes altos (Caminho A/LandingPage em pico), monitorar.
5. **Denomailer import:** todas as EFs afetadas precisam importar `SMTPClient` de `denomailer@1.6.0`. Confirmar que o deploy não quebra (usar mesmo padrão de send-recovery-email).

---

## 10. ARQUIVOS A CRIAR/MODIFICAR (resumo)

| Ação | Arquivo | Observação |
|------|---------|------------|
| CRIAR | `supabase/functions/_shared/email/generate-invite-link.ts` | Helper generateLink |
| CRIAR | `supabase/functions/_shared/email/smtp-sender.ts` | Helper SMTP |
| CRIAR | `supabase/functions/_shared/email/templates/invite.html` | Template PT-BR |
| EDITAR | `supabase/functions/church-invite-user/index.ts` | Linha 128 |
| EDITAR | `supabase/functions/admin-church-create/index.ts` | Linha 226 |
| EDITAR | `supabase/functions/stripe-webhook/index.ts` | Linhas 539, 749, 820 |

**NÃO criar `_shared/` como diretório vazio** — Deno edge functions precisam de arquivos `.ts` válidos para import relativo funcionar corretamente. Criar junto com os helpers.

---

*Preparado por ENG-4 — Frente 2C — 2026-05-28*
*NÃO APLICAR sem autorização explícita de Felipe.*
