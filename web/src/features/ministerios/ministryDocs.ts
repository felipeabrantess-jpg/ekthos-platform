// ─────────────────────────────────────────────────────────────────────────────
// Documentação dos Ministérios — link externo por igreja (item 14 da ata IGV)
//
// O botão "Documentação" em /ministerios só aparece para igrejas listadas aqui.
// A URL NÃO fica no código: vem de variável de ambiente do build (Vercel),
// para poder ser trocada sem mexer em código.
//   IGV → VITE_IGV_MINISTERIOS_DOCS_URL = link da pasta no OneDrive
// Sem URL configurada o botão aparece desabilitado, avisando que falta o link.
// ─────────────────────────────────────────────────────────────────────────────

const DOCS_URL_BY_CHURCH: Record<string, string | undefined> = {
  // Igreja Gerando Vencedores — pasta de documentação no OneDrive
  '6c127559-874a-4748-8fce-55d4079613a5': import.meta.env.VITE_IGV_MINISTERIOS_DOCS_URL as string | undefined,
}

export interface MinistryDocsLink {
  /** A igreja tem o botão "Documentação" habilitado */
  enabled: boolean
  /** URL https válida, ou null quando ainda não foi configurada */
  url: string | null
}

export function getMinistryDocsLink(churchId: string | null | undefined): MinistryDocsLink {
  if (!churchId || !(churchId in DOCS_URL_BY_CHURCH)) return { enabled: false, url: null }
  const raw = (DOCS_URL_BY_CHURCH[churchId] ?? '').trim()
  // Só aceita link https — nunca abre esquema arbitrário
  return { enabled: true, url: /^https:\/\/\S+$/i.test(raw) ? raw : null }
}
