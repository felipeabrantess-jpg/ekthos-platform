# Acolhimento IGV — boas-vindas somente texto (acolhimento_boasvindas_v2)

Decisão (15/10/2026): o acolhimento da IGV é feito exclusivamente por mensagens de texto. Sem vídeo, imagem ou mídia.
Estado: **preparado, NÃO submetido à Meta, NÃO aplicado no banco.** Canal e agente continuam inativos.

## 1. Template atual e onde é usado
| Item | Valor |
|---|---|
| Nome / id | `acolhimento_boasvindas` (`1349705204029703`) — APPROVED, MARKETING, pt_BR |
| Header | **VIDEO** (mídia presa ao número antigo; o media id `1770957757241974` expirou em 19/08) |
| Corpo | `Olá, {{1}}! 🙏 Que alegria ter você na Igreja Gerando Vencedores! O Pastor Valdir preparou uma mensagem especial pra você. Assista com carinho! 💙` |
| Quem usa | `agent-acolhimento` (v56) → `tryD0WelcomeTemplate` (toque D+0). Monta o template a partir de `church_whatsapp_channels.metadata` |
| Prioridade no código | 1º `metadata.meta_templates.acolhimento` (nome do template, **só corpo com {{1}} = primeiro nome, sem header**); 2º legado `metadata.meta_media_ids.acolhimento_boasvindas` (vídeo) |
| Histórico | 142 itens na fila entre 21/07 e 23/08/2026: 132 enviados, 10 falhas |
| Outras referências | Só `church_whatsapp_channels.metadata` da IGV e o arquivo de arquivamento de 14/10; nenhum prompt/config de agente |

O código já suporta o template de texto (nenhum deploy necessário): basta apontar `metadata.meta_templates.acolhimento`.

## 2. É preciso criar template novo?
**Sim.** O `acolhimento_boasvindas` tem header de vídeo e o corpo diz "Assista com carinho"; os outros aprovados
(`acolhimento_convite_culto`, `acolhimento_versiculo`, `lembrete_agenda_pastoral`) têm outra finalidade. Não existe
`acolhimento_boasvindas_v2` na WABA `1366820658900001`.

## 3. Texto proposto (corpo único, 1 variável, sem header/footer/botões)
Nome: `acolhimento_boasvindas_v2` · idioma `pt_BR` · categoria submetida: `UTILITY`

```
Olá, {{1}}! 🙏 Que alegria ter você na Igreja Gerando Vencedores! O Pastor Valdir quer te acolher de perto. Se precisar de qualquer coisa, é só chamar no WhatsApp: (21) 96690-0021. Deus abençoe você! 💙
```

- Mantém: saudação com o primeiro nome, o tom pastoral e o convite acolhedor do texto original.
- Remove: toda menção ao vídeo ("mensagem especial… Assista com carinho").
- Telefone do Pastor Valdir (55 21 96690-0021): decisão de Felipe de 21/08, mantida aqui — **confirmar** antes de submeter.
- Exemplo exigido pela Meta: `Maria`.

## 4. Payload para a Meta (preparado, não enviado)
`POST https://graph.facebook.com/v25.0/1366820658900001/message_templates`
```json
{
  "name": "acolhimento_boasvindas_v2",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Olá, {{1}}! 🙏 Que alegria ter você na Igreja Gerando Vencedores! O Pastor Valdir quer te acolher de perto. Se precisar de qualquer coisa, é só chamar no WhatsApp: (21) 96690-0021. Deus abençoe você! 💙",
      "example": { "body_text": [["Maria"]] }
    }
  ]
}
```
Alternativa sem API: WhatsApp Manager → Modelos de mensagem → Criar modelo → Utilidade → Português (BR) → colar o corpo.

## 5. Referências a atualizar APÓS a aprovação (preparado, não aplicado)
```sql
-- aplicar somente quando acolhimento_boasvindas_v2 estiver APPROVED
UPDATE church_whatsapp_channels
SET metadata = (
      COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('meta_templates',
           COALESCE(metadata->'meta_templates', '{}'::jsonb)
           || jsonb_build_object('acolhimento', 'acolhimento_boasvindas_v2'))
    ) #- '{meta_media_ids,acolhimento_boasvindas}'
WHERE id = 'b8a61922-7825-4a2c-8220-7e899a1f9484'
  AND church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND active = false;

-- rollback (estado de 15/10/2026)
UPDATE church_whatsapp_channels
SET metadata = '{"meta_media_ids":{"acolhimento_versiculo":null,"acolhimento_boasvindas":"1770957757241974","acolhimento_convite_culto":null}}'::jsonb
WHERE id = 'b8a61922-7825-4a2c-8220-7e899a1f9484';
```
Por que não agora: com o canal inativo nada é enviado, mas apontar para um template ainda não aprovado faria o
dispatcher falhar (Meta 132001) se alguém ativasse o canal antes da aprovação. E, sem `meta_templates.acolhimento`,
o código cai no legado de vídeo com o media id morto — por isso a troca é uma só, depois da aprovação.

## 6. Riscos
- A Meta pode **reclassificar** para MARKETING (texto de acolhimento/convite). Não bloqueia o uso; muda o custo por conversa.
- Reprovação: ajustar o texto (retirar emojis ou a frase do WhatsApp) e reenviar com outro nome (`_v3`).
- Janela de 24 h: para quem nunca interagiu só template funciona — por isso a aprovação é pré-requisito da ativação.
- O token do System User pode não ter permissão de criar template via API (a criação de número deu `#200`); se
  falhar, usar o WhatsApp Manager.
