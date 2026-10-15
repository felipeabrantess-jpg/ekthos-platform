# Vídeo de boas-vindas da IGV por link estável (template acolhimento_boasvindas aprovado)

Estado: **preparado e testado; NÃO publicado.** Canal e agente continuam inativos; nenhuma mensagem foi enviada.

## Problema (diagnóstico de 15/10)
O agente enviava o vídeo por `video.id` (media id `1770957757241974`, upload no número antigo). A Meta expira a mídia
em ~30 dias e a prende ao número: usado sem erro de 21/07 a 16/08; primeira falha em 19/08 (`131009`). Ninguém era
avisado e parte das mensagens passou a sair em texto livre.

## Solução
| Peça | Onde | Estado |
|---|---|---|
| Vídeo original (cópia da Meta, sem alteração) no Storage público | `igv-media/acolhimento/boasvindas-igv.mp4` | **criado** (bucket + objeto) |
| URL estável | `https://mlqjywqnchilvgkbvicd.supabase.co/storage/v1/object/public/igv-media/acolhimento/boasvindas-igv.mp4` | no ar |
| Lógica sem media id | `supabase/functions/_shared/d0-welcome.ts` (novo) | branch |
| Ajuste no agente (v56 → v56 + vídeo por link) | `agent-acolhimento.index.v56+video-link.ts.txt` + `.patch` | **não deployado** |
| Bucket reproduzível | migration `20261015130000_igv_media_bucket.sql` (idempotente) | branch |
| Testes | `supabase/tests/d0-welcome.test.mjs` | 44/44 |

### Regras novas do D+0 (`tryD0WelcomeTemplate`)
1. `metadata.meta_media.acolhimento_boasvindas_video_url` (HTTPS) → template **`acolhimento_boasvindas`** aprovado, header
   `{"type":"video","video":{"link":URL}}`, corpo `{{1}}` = primeiro nome. Texto do template **inalterado**.
2. Antes de enfileirar, o agente verifica o link (HEAD; Range 0-0 se HEAD for recusado; sem redirecionamento): HTTPS,
   200/206, `video/mp4` (ou 3gpp), > 0 e ≤ 16 MB.
3. **Falha do vídeo = falha explícita**, nunca texto no lugar: nada é enfileirado, créditos não são debitados, a jornada
   não avança, volta a `pending` com `next_touchpoint_at = agora + 1 h` e grava em `agent_executions`
   `status='error'`, `error='d0_video_<motivo>:<detalhe>'` (`http_404`, `http_400`, `bad_content_type:…`, `too_large:…`,
   `timeout`, `network_error`, `invalid_url`, `redirect_3xx`, `enqueue_failed`).
4. Sem vídeo configurado: comportamento anterior (texto `meta_templates.acolhimento` → media id legado → Claude).
5. O nome do template de vídeo pode ser trocado por `metadata.meta_templates.acolhimento_video` (SQL, sem deploy).

### Consulta de monitoramento (falhas do vídeo)
```sql
-- falhas na verificação/enfileiramento (agente)
SELECT created_at, error FROM agent_executions
WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND error LIKE 'd0_video_%'
ORDER BY created_at DESC LIMIT 50;

-- falhas de envio pela Meta (131009, 131053 …) em mensagens com vídeo por link
SELECT created_at, status, left(error_message, 160) AS erro, left(content::text, 140) AS conteudo
FROM channel_dispatch_queue
WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND status = 'failed'
  AND content::text LIKE '%"link"%' ORDER BY created_at DESC LIMIT 50;
```

## Aplicação (SOMENTE com autorização) — nesta ordem
1. Deploy de `agent-acolhimento` com `_shared/d0-welcome.ts` (index corrigido). Função blindada: publicar com diff
   revisado e `verify_jwt=false`, como em produção. O `index.ts` do repositório está **atrás** da v56 publicada;
   o patch foi feito sobre o código **publicado**.
2. Configuração do canal (nada é enviado enquanto o canal estiver inativo):
```sql
UPDATE church_whatsapp_channels
SET metadata = (COALESCE(metadata,'{}'::jsonb)
      || jsonb_build_object('meta_media',
           COALESCE(metadata->'meta_media','{}'::jsonb)
           || jsonb_build_object('acolhimento_boasvindas_video_url',
              'https://mlqjywqnchilvgkbvicd.supabase.co/storage/v1/object/public/igv-media/acolhimento/boasvindas-igv.mp4')))
      #- '{meta_media_ids,acolhimento_boasvindas}'
WHERE id = 'b8a61922-7825-4a2c-8220-7e899a1f9484'
  AND church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND active = false;
-- rollback: restaurar {"meta_media_ids":{"acolhimento_versiculo":null,"acolhimento_boasvindas":"1770957757241974","acolhimento_convite_culto":null}}
```
3. Prova ponta a ponta: **1 envio** do template a um número controlado (autorização expressa), conferindo a
   entrega do vídeo no aparelho — é o único passo que valida a busca do link pela Meta.

## Limites do que foi provado
- Provado: arquivo servido é idêntico à cópia da Meta (sha256), `video/mp4`, 4,68 MB, HEAD/Range/GET 200/206,
  HTTPS direto, http→https por 301; lógica e falhas explícitas (44 testes).
- **Não provado sem envio:** que a Meta aceita buscar este link no cabeçalho do template aprovado. A documentação
  da Cloud API aceita `link` no parâmetro de mídia; se ela recusar (por exemplo `131053`), o erro aparece em
  `channel_dispatch_queue.error_message` — sem substituição por texto.
- O vídeo é público por desenho (a Meta precisa buscá-lo sem credencial).
