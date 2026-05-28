// ============================================================
// Helper: generateInviteLink
//
// Gera link de invite via Supabase Admin API generateLink.
// Bypassa EVE (Email Validation Extended) — não dispara o mailer
// GoTrue, apenas devolve o action_link JWT.
//
// Padrão canônico: send-recovery-email (PR #180, provado em produção)
// ============================================================

export async function generateInviteLink(
  email: string,
  redirectTo: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      type: 'invite',
      email,
      options: { redirect_to: redirectTo },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[generateInviteLink] failed ${res.status}: ${errText}`)
    throw new Error(`generateInviteLink failed: ${res.status}`)
  }

  const data = await res.json() as {
    action_link?: string
    user?: { id?: string; email?: string }
  }

  if (!data.action_link) {
    throw new Error('generateInviteLink: action_link ausente na resposta')
  }

  return data.action_link
}

// ============================================================
// Helper: lookupUserByEmail
//
// Obtém o user.id de um usuário pelo email via Admin REST.
// Necessário após generateInviteLink, pois generate_link pode
// já criar o usuário (type=invite cria se não existe) e retorna
// o objeto user na response — mas usamos como fallback seguro.
// ============================================================

export async function lookupUserByEmail(
  email: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ id: string; email: string } | null> {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`,
    {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    },
  )

  if (!res.ok) return null

  const data = await res.json() as {
    users?: Array<{ id: string; email?: string }>
  }

  const found = data.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )

  return found ? { id: found.id, email: found.email! } : null
}
