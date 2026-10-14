// ============================================================
// Link da Documentação de Ministérios configurado DENTRO do sistema (item 14 da ata IGV).
//   leitura : church_settings.ministerios_docs_url (política de tenant existente)
//   escrita : RPC set_ministerios_docs_url (só admin/admin_departments; https; vazio limpa)
// Sem valor no banco, o botão cai no fallback atual (VITE_IGV_MINISTERIOS_DOCS_URL).
// ============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export function useMinistryDocsUrl(churchId: string | null | undefined) {
  return useQuery({
    queryKey: ['ministerios-docs-url', churchId],
    queryFn: async (): Promise<string | null> => {
      if (!churchId) return null
      const { data, error } = await sb
        .from('church_settings')
        .select('ministerios_docs_url')
        .eq('church_id', churchId)
        .maybeSingle()
      // Coluna ainda inexistente (front publicado antes da migration) ou sem permissão: usa o fallback.
      if (error) return null
      const v = (data?.ministerios_docs_url ?? '').trim()
      return v || null
    },
    enabled: !!churchId,
    staleTime: 60_000,
  })
}

/** Traduz o erro da RPC para uma mensagem que o administrador entende. */
export function docsUrlErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err)
  if (msg.includes('INVALID_URL')) return 'Informe um endereço válido que comece com https://'
  if (msg.includes('FORBIDDEN')) return 'Somente a administração pode alterar este link.'
  if (msg.includes('SETTINGS_NOT_FOUND')) return 'As configurações desta igreja ainda não foram criadas.'
  return 'Não foi possível salvar o link. Tente novamente.'
}

export function useSaveMinistryDocsUrl(churchId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (url: string): Promise<string | null> => {
      const { data, error } = await sb.rpc('set_ministerios_docs_url', { p_url: url })
      if (error) throw new Error(error.message)
      return (data as string | null) ?? null
    },
    onSuccess: (saved) => {
      qc.setQueryData(['ministerios-docs-url', churchId], saved)
    },
  })
}
