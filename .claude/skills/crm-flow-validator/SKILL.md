# Skill: crm-flow-validator

## Quando usar
Ao criar ou modificar qualquer fluxo do pipeline CRM de pessoas
(stages, transições, interações via WhatsApp/webhook).

## O que validar

### Pipeline de stages (person_pipeline)
- [ ] Toda transição de stage usa update com duplo filtro:
    .eq('person_id', personId).eq('church_id', churchId)
- [ ] Stage resolvido via person_pipeline[0].pipeline_stages — nunca hardcoded
- [ ] Badge de stage usa mapeamento slug → variante (não texto direto)
- [ ] PersonWithStage tem person_pipeline tipado em database.types.ts

### Interações (interactions)
- [ ] Inserção em interactions sempre inclui church_id, person_id, channel, direction
- [ ] Deduplicação de webhook: captura erro 23505 (unique constraint)
- [ ] direction: 'inbound' | 'outbound' — nunca valor fora desse enum
- [ ] channel: 'whatsapp' | 'email' | 'sms' | 'manual' — validar no insert

### Webhook WhatsApp → interação
- [ ] HMAC validado antes de qualquer leitura do payload
- [ ] churchId resolvido via tenant-loader antes do insert em interactions
- [ ] Resposta 200 enviada antes do processamento assíncrono
- [ ] Deduplicação: log de aviso + return sem erro em caso de 23505
- [ ] Novo contato: verifica se person existe antes de criar
  (busca por phone_number + church_id — nunca cria duplicata)

### onSuccess das mutations de pipeline
- [ ] Invalida ['people', churchId]
- [ ] Invalida ['dashboard-stats', churchId] (afeta contagens do dashboard)
- [ ] Se muda de stage: invalida também queries compostas de stage

## Output esperado
Fluxo validado passo a passo, item por item. ✅ ok ou ❌ problema
+ código incorreto + código corrigido.
Ao final: "Fluxo aprovado" ou lista de riscos identificados.
