# Auditoria de CTAs da Landing Page — Ekthos

> **Uso:** Revisão de copy e CTAs antes de qualquer atualização da landing.
> **Responsável:** Fundadores + designer
> **Frequência:** Revisão a cada 60 dias ou após mudança de pricing

---

## Hierarquia de CTAs aprovados

### CTA Primário (acima do fold)
```
TEXTO:  "Começar trial grátis — 7 dias sem cartão"
SUBTEXT: "Configure em 48 horas. Cancele quando quiser."
COR:    Vermelho Ekthos (#e13500) — botão grande, bem visível
LINK:   /signup
```

### CTA Secundário (logo abaixo do primário)
```
TEXTO:  "Ver demo de 2 minutos →"
COR:    Transparente com borda vermelha
LINK:   #demo ou link de vídeo
```

### CTA de Urgência (seção de pricing)
```
TEXTO:  "Ativar com 50% de desconto — cupom FUNDADOR50"
SUBTEXT: "Apenas para os primeiros 50 clientes"
COR:    Fundo creme com badge de urgência
LINK:   /signup?coupon=FUNDADOR50
```
→ Desativar quando FUNDADOR50 atingir 50 resgates.

### CTA de Footer
```
TEXTO:  "Falar com a equipe Ekthos"
LINK:   WhatsApp direto
```

---

## Textos de headline aprovados (testar A/B)

### Opção A (pergunta de abertura)
```
Headline: "Sua igreja cuida de centenas de pessoas."
Subhead:  "Mas quem cuida de cada visitante que chegou essa semana?"
```

### Opção B (dado de impacto)
```
Headline: "7 em cada 10 visitantes não voltam."
Subhead:  "Não porque não gostaram — porque ninguém entrou em contato."
```

### Opção C (solução direta)
```
Headline: "O agente pastoral que nunca esquece de acompanhar seus visitantes."
Subhead:  "Configure em 48 horas. Funciona enquanto você prega."
```

**Atual em produção:** Opção A
**Próximo teste:** Opção B

---

## O que NUNCA colocar na landing

### Palavras proibidas
- ❌ "IA" ou "Inteligência Artificial" sem contexto — usar "agente pastoral automatizado"
- ❌ "CRM" — usar "painel do pastor"
- ❌ "Bot" — usar "agente" ou "assistente pastoral"
- ❌ "Automação de marketing" — estamos no contexto pastoral, não corporativo
- ❌ Preços dos planos Missão e Avivamento — só mostrar Chamado R$ 290/mês

### Promessas proibidas
- ❌ Garantir número específico de conversões (varia por contexto da igreja)
- ❌ "Seu visitante nunca vai embora" — impossível garantir
- ❌ ROI em valores absolutos (R$ X por mês) — só percentuais

---

## Checklist de revisão de landing

### Copy
- [ ] Headline está na opção aprovada para o período?
- [ ] Subheadline responde "e daí?" para o headline?
- [ ] Seção de problema usa linguagem do pastor (não de tech)?
- [ ] Demo visual está atualizado com interface atual?
- [ ] Seção de prova social tem depoimento real (não placeholder)?
- [ ] Pricing mostra apenas o plano Chamado com preço claro?
- [ ] FUNDADOR50 está ativo ou desativado conforme status do cupom?

### CTAs
- [ ] CTA primário está vermelho e acima do fold?
- [ ] CTA de demo está visível sem scroll?
- [ ] CTA de urgência (fundador) tem contador ou indicador de vagas?
- [ ] Link de WhatsApp no footer está correto e ativo?
- [ ] Todos os links de /signup têm UTM para rastreamento?

### Técnico
- [ ] Página carrega < 3s em 3G (medir com PageSpeed)?
- [ ] Mobile first: CTA principal aparece sem scroll no celular?
- [ ] Form de signup tem no máximo 3 campos (email, nome, WhatsApp)?
- [ ] Meta tags (title, description, OG) estão atualizadas?
- [ ] Pixel do Meta está ativo para conversões?

---

## UTMs padrão por canal

```
WhatsApp outbound:  ?utm_source=whatsapp&utm_medium=outbound&utm_campaign=sdrs
Instagram DM:       ?utm_source=instagram&utm_medium=dm&utm_campaign=prosp
Cold email:         ?utm_source=email&utm_medium=cold&utm_campaign=outbound
Instagram Ads:      ?utm_source=instagram&utm_medium=paid&utm_campaign=top_of_funnel
Google Ads:         ?utm_source=google&utm_medium=paid&utm_campaign=search
Indicação:          ?utm_source=referral&utm_medium=pastor&utm_campaign=referral
```

---

## Seções obrigatórias na ordem

1. Hero (headline + subhead + CTA primário + demo secundário)
2. Problema (story dos visitantes perdidos — antes/depois)
3. Demo visual (screenshot/vídeo do fluxo completo)
4. Como funciona (3 passos simples)
5. Prova social (depoimento real ou métrica)
6. Pricing (só plano Chamado + FUNDADOR50 enquanto válido)
7. FAQ (5–7 perguntas da objeção mais comum)
8. CTA final (urgência + trial)

---

## Métricas da landing

Acompanhar semanalmente no Google Analytics / Meta Pixel:

| Métrica | Alvo |
|---|---|
| Sessões únicas/semana | > 500 |
| Taxa de bounce | < 60% |
| Scroll depth até pricing | > 40% |
| Clique no CTA primário | > 8% das sessões |
| Conversão sessão → signup | > 3% |
| Custo por signup (ads) | < R$ 25 |
