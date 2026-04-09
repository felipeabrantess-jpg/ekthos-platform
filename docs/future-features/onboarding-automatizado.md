# Onboarding Automatizado

> Feature futura de alto impacto. Atualmente não existe nenhuma base técnica para isso.
> Depende de: runtime de agente IA, JSON builder, executor de steps com SSE/websocket.

---

## Conceito

O pastor responde 25 perguntas numa conversa natural.
As respostas são transformadas em JSON de configuração.
Um agente engenheiro executa 23 steps automaticamente.
Resultado: CRM 100% configurado em 28 segundos.

---

## Fluxo

```
Comercial fecha contrato
    ↓ [automático]
Sistema cria tenant + ativa suporte grátis + envia email de acesso
    ↓ [pastor faz login]
Agente conduz 25 perguntas via chat (15-25 min)
    ↓ [automático]
Prompt builder transforma respostas em JSON de configuração
    ↓ [automático]
Agente engenheiro executa 23 steps com progress em tempo real
    ↓
"Seu sistema está pronto!" — pastor acessa dashboard configurado
```

---

## As 25 perguntas (6 blocos)

### Bloco 1 — Identidade (5)
1. Nome completo da igreja
2. Quantas sedes/congregações e onde ficam
3. Cidade e estado da sede principal
4. Upload do logo
5. Cores da identidade visual

### Bloco 2 — Operação pastoral (6)
6. Departamentos/ministérios (lista completa)
7. Passo a passo desde o visitante até membro ativo (define pipeline)
8. Rede de células: quantidade, hierarquia
9. Cultos e eventos regulares (dias e horários)
10. Como gerenciam dízimos e ofertas hoje
11. Maior desafio pastoral atual

### Bloco 3 — Dados e membros (4)
12. Informações coletadas de cada membro hoje
13. Campos sugeridos pelo sistema (confirmação)
14. Como categorizam os membros
15. Base existente de membros (formato)

### Bloco 4 — Equipe e permissões (4)
16. Quem vai usar: nome, função, permissões necessárias
17. Quem precisa receber alertas automáticos e sobre o quê
18. Líderes de célula terão acesso individual?
19. Trabalham com metas?

### Bloco 5 — Agentes IA (4)
20. Recomendação personalizada baseada nos problemas relatados
21. Apresentação do catálogo adaptado ao plano contratado
22. Métricas prioritárias para acompanhamento semanal
23. Frequência e formato de relatórios (WhatsApp, PDF, dashboard)

### Bloco 6 — Canais e integrações (2)
24. Canais de comunicação com membros (WhatsApp, Instagram)
25. Ferramentas que precisam de integração (Google Agenda, planilhas)

---

## Os 23 steps do agente engenheiro

| # | Step | Tempo estimado |
|---|------|----------------|
| 1 | Criar tenant (nome, slug, branding, timezone) | 0.8s |
| 2 | Criar sedes vinculadas | 1.0s |
| 3 | Aplicar template nicho igrejas | 0.5s |
| 4 | Montar pipeline com stages e SLAs | 1.2s |
| 5 | Criar departamentos por sede | 1.5s |
| 6 | Estruturar rede de células e hierarquia | 2.1s |
| 7 | Criar campos customizados com lógica condicional | 1.8s |
| 8 | Criar categorias de membros | 0.7s |
| 9 | Criar usuários com roles e permissões | 3.2s |
| 10 | Configurar alertas personalizados por role | 1.1s |
| 11 | Ativar agente suporte + knowledge base | 1.4s |
| 12 | Ativar agentes do plano | 1.3s |
| 13 | Ativar agentes em trial | 1.0s |
| 14 | Treinar agentes com vocabulário eclesiástico | 2.0s |
| 15 | Criar automações configuradas | 2.5s |
| 16 | Montar dashboard com widgets | 1.8s |
| 17 | Criar templates de mensagem | 1.5s |
| 18 | Configurar calendário de cultos e eventos | 0.8s |
| 19 | Definir metas pastorais | 0.7s |
| 20 | Configurar relatórios (canal, formato, frequência) | 0.6s |
| 21 | Enviar convites para usuários cadastrados | 3.0s |
| 22 | Iniciar importação de base existente (async) | — |
| 23 | Marcar onboarding como concluído | 0.3s |

**Tempo total (síncronos): ~28 segundos**

---

## Pré-requisitos técnicos para implementar

- [ ] Endpoint de provisionamento de tenant (API interna)
- [ ] Runtime de agente IA conversacional (LLM com ferramentas)
- [ ] JSON schema de configuração de tenant validado
- [ ] SSE ou WebSocket para progresso em tempo real no frontend
- [ ] Tela `/onboarding/configuring` com step-by-step visual
- [ ] Importação assíncrona de planilha Excel de membros
