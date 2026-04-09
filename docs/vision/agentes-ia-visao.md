# Agentes IA — Visão de Produto

> Arquivo de visão. Não implementar — requer infraestrutura de agente IA inexistente.
> Para o catálogo com preços, ver: `docs/commercial/catalogo-agentes-ia.md`

---

## Princípio de design dos agentes

Cada agente entende o vocabulário eclesiástico nativamente.
Não usa termos genéricos de CRM — fala a língua da igreja.

```json
"agent_context": {
  "lead_term": "membro",
  "new_lead_term": "visitante",
  "company_term": "igreja",
  "action_term": "culto",
  "industry_keywords": [
    "célula", "consolidação", "EBD", "escola da fé", "louvor",
    "dízimo", "oferta", "batismo", "departamento", "congregação",
    "pastor", "líder", "voluntário", "retiro", "conferência",
    "intercessão", "discipulado", "multiplicação", "supervisão", "obreiro"
  ],
  "tone": "acolhedor, fraterno, respeitoso — linguagem cristã natural, nunca forçada"
}
```

---

## Agente de Agenda Pastoral — spec detalhado

O mais complexo do catálogo. Funciona 100% via WhatsApp (voz e texto).

### Funcionalidades
- **Briefing matinal** (6h30): compromissos do dia + aniversariantes + alertas do CRM
- **Lembretes 30min antes**: com contexto completo do CRM sobre a pessoa/evento
- **Mudança em tempo real**: cancel/reagendamento com sugestão de alternativas
- **Resumo noturno** (21h): o que foi feito + compromissos do dia seguinte
- **Comando por voz**: pastor manda áudio, agente interpreta e age

### Tipos de evento gerenciados
- Cultos regulares (com escala de louvor e pregador)
- Reuniões de liderança
- Visitas pastorais (com contexto do CRM: tempo de membro, célula, dizimista)
- Aconselhamentos (CONFIDENCIAL — só o pastor vê o histórico)
- Eventos especiais
- Compromissos pessoais (protegidos — não expostos para equipe)

### Integrações necessárias
- WhatsApp Business API
- Google Calendar API (sync bidirecional)
- Supabase (leitura do CRM para contexto)
- STT (Speech-to-Text) para comandos por voz

### Pré-requisitos técnicos
- [ ] WhatsApp Business API aprovada
- [ ] Google Calendar OAuth flow
- [ ] LLM com acesso a ferramentas (MCP ou function calling)
- [ ] Pipeline de STT para áudio do WhatsApp
- [ ] Tabela `pastoral_schedule` com campo confidencial separado
