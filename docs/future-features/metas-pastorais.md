# Metas Pastorais

> Feature futura — painel de metas com baseline e acompanhamento.
> Depende de: tabela `church_goals`, queries de progresso, widget no Dashboard.

---

## As 7 metas da vertical igrejas

| # | Métrica | Target | Baseline típico | Período | Widget relacionado |
|---|---------|--------|-----------------|---------|-------------------|
| 1 | Taxa de consolidação | 80% | 30% (média do mercado) | Mensal | Dashboard #2 |
| 2 | Crescimento de células | +10% | Baseline do tenant | Trimestral | Dashboard #7 |
| 3 | Batismos | 15 por trimestre | — | Trimestral | Dashboard #9 |
| 4 | Frequência em cultos | +5% mês a mês | — | Mensal | Dashboard #6 |
| 5 | Novas células (multiplicação) | 5 por semestre | — | Semestral | Dashboard #4 |
| 6 | Alunos por turma Escola da Fé | 30 por turma | — | Por turma | Dashboard #15 |
| 7 | Membros servindo em departamento | 60% dos membros ativos | — | Mensal | Dashboard #8 |

---

## Notas de implementação

- Metas são configuradas por tenant no onboarding (ou manualmente pelo admin)
- Valores de baseline devem ser coletados no onboarding ou estimados automaticamente
- O dashboard exibe progresso vs. meta em cada widget com indicador visual (verde/amarelo/vermelho)
- Alertas automáticos quando meta está em risco (ex: taxa de consolidação < 50% no mês)
- A meta #1 (80% de consolidação) é a mais crítica — a maioria das igrejas está em 20-40%
