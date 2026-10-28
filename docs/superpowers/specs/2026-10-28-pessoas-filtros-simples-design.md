# Pessoas — filtros simples e números que sempre fecham (design)

Data: 2026-10-28 · Cliente: IGV (`6c127559-874a-4748-8fce-55d4079613a5`) · Projeto Supabase `mlqjywqnchilvgkbvicd`
Rascunho aprovado pelo Felipe: `.superpowers/brainstorm/355-1793199752/content/pessoas-simples-v5.html`

## 1. Por que

A tela Pessoas tem seis blocos de filtro que contam com réguas diferentes (abas de **etapa**, bloco de
**classificação** "total da unidade", **status** "da lista atual", alerta, faixa amarela, filtro Contato).
Cada número está certo isoladamente, mas eles não se encaixam: "Visitante 308" (etapa) ≠ "Visitantes 325"
(classificação) ≠ soma do status. A IGV está sendo homologada por um engenheiro que confere números; número que
não fecha é tratado como erro do sistema. O Felipe decidiu: **a partir de agora a tela é assim e não muda mais.**

## 2. Objetivos

1. Uma tela simples, para quem não é técnico.
2. **Todo número obedece aos mesmos filtros ligados** — não existe mais "total da unidade" convivendo com "lista atual".
3. **Fechamento obrigatório**: fileira "Quem" soma o total; fileira "Atendimento" soma o botão escolhido em "Quem".
4. **Mesmos números de hoje**: a reorganização não muda nenhuma contagem nem dado.
5. Ordenação crescente **e** decrescente correta em todas as colunas, em todas as páginas, com qualquer filtro.
6. Garantia por teste automático com os **dados reais**, rodado antes de qualquer publicação.

## 3. Não-objetivos

- Não muda: regra de STATUS (`person_care_state`), alerta de 48h, contagem de **Contatos** (coluna e ordenação),
  acolhimento/agente v58/dispatcher/webhook/visitor-capture, QR Code, exclusão/recadastro, CSV (colunas existentes),
  seletor de unidade e a regra de unidade operacional (corte de 28/06 — decisão mantida: Trindade ainda não opera).
- Não há filtros salvos com nome (a equipe combina filtros na hora).
- Não há tela nova de relatórios.

## 4. Anti-objetivos (fracasso mesmo "funcionando")

- Qualquer par de números na tela que não feche.
- Um filtro que muda uns números e não outros.
- Ordenação certa num sentido e errada no outro, ou errada ao trocar de página.
- Regressão em algo já homologado (#479–#489).
- Alterar dado real sem aprovação expressa da IGV.

## 5. A tela (decidido com o Felipe)

```
Pessoas                                  [🎂 Aniversariantes do dia N]  [Unidade ▾]
QUEM         [Todos 349] [Visitantes 325] [Membros 21] [Não classificados 3]
ATENDIMENTO  [Não atendida 254 · ⚠ 252 há 48h] [Em atendimento 93] [Atendida 0] [Cancelado 2]
             (ao clicar em Não atendida) Mostrar: [Não atendidas 254] [Sem atendimento há 48h 252]
[Buscar nome, telefone ou e-mail]  [Mais filtros ▾]  [CSV]
Nome ▲▼ | Telefone ▲▼ | Tipo | Atendimento ▲▼ | Contatos ▲▼ | Cadastro ▲▼ | Ações
```

- **Aniversariantes do dia**: atalho fixo no topo; mesma regra da aba Aniversários atual, recortada para o dia.
- **Quem**: Todos · Visitantes · Membros · Não classificados. Sem a linha de conta visível (o Felipe pediu para retirar).
- **Atendimento**: os quatro estados de `person_care_state`; "Não atendida" mostra o aviso de 48h e, ao clicar,
  oferece "Não atendidas" × "Sem atendimento há 48h" (= `sem_contato_48h` atual).
- **Mais filtros** (janela lateral, fechada por padrão; nada disso aparece na tela até ser aberta): Etapa (as etapas configuradas da igreja: Visitante, Reconciliado, Novo convertido, Connect,
  Membro, Voluntário, Líder, Membro afastado), Origem, Data de cadastro, Mês de aniversário, Etiqueta, Função
  (líder/voluntário). Combináveis. Filtros ligados aparecem como chips removíveis.
- **Sai da tela**: abas de etapa, bloco "Classificação (total da unidade)", filtro Contato, botão de alerta
  separado, faixa amarela "Aguardando nova tentativa".

## 6. Regra única de contagem

Todos os números vêm da **mesma** contagem existente (`get_care_status_counts`, sobre `people_filter_base`),
chamada com o mesmo conjunto de filtros (unidade, busca, mais filtros) para cada valor de "Quem" (todos, visitor,
member, none). Isso forma a matriz `Quem × Atendimento` + o recorte 48h. A tela só exibe recortes dessa matriz,
então o fechamento é por construção:

- `Todos = Visitantes + Membros + Não classificados`
- `Quem escolhido = Não atendida + Em atendimento + Atendida + Cancelado`
- A lista e o "N pessoas" do topo = célula da matriz correspondente aos botões escolhidos.
- Os números da fileira "Quem" respeitam os filtros de "Mais filtros" e da busca, mas **não** o botão de
  Atendimento escolhido (e vice-versa a fileira Atendimento respeita o "Quem" escolhido). Assim cada fileira sempre
  fecha com o total exibido acima dela.

A mesma base (`people_filter_base`) continua sendo a única fonte da lista, dos números, da ordenação e do CSV.

## 7. Fontes dos números (decisão do Felipe em 28/10: os números NÃO podem mudar)

- **Quem** = a classificação vigente de hoje (`person_classification_rows`, a mesma do filtro Classificação atual):
  Visitantes 757 · Membros 66 · Não classificados 4.541 (todas as unidades, 28/10). Nada é recalculado nem saneado.
- **Atendimento** = `person_care_state` (mesmos números de hoje), recorte 48h = `sem_contato_48h`.
- **Etapa** = `person_pipeline`, só como filtro dentro de "Mais filtros" (mesmos números das abas atuais).
- **Unidade** = regra operacional atual (corte 28/06) — inalterada.
- Nenhum dado é alterado; nenhuma etapa ou classificação é gravada por esta entrega.

## 8. Comprovação já feita (28/10, só leitura)

Botão × lista (`get_care_status_counts` / `get_people_stage_counts` × `get_people_page`, paginado de 1000 em 1000):
94/94 casos batem — 4 unidades × Quem (4) × Atendimento (5) + 8 etapas por unidade, sem repetidos. A planilha da IGV
(5.367) coincide com o banco às 10h57–11h57 de 28/10; a diferença para 5.364 são 3 pessoas marcadas "saiu" depois.

## 9. Garantia (o que impede regressão)

Suíte de verificação com dados reais (transação desfeita / só leitura), obrigatória antes de cada publicação:

1. Para cada unidade (Todas, Itaipu, Trindade, Sem unidade) × cada botão de Quem × cada botão de Atendimento
   (+ recorte 48h) × uma amostra de "Mais filtros": fechamentos da seção 6 e `contagem = linhas da lista`.
2. Ordenação: Nome, Telefone, Atendimento, Contatos, Cadastro, crescente e decrescente, com e sem filtros:
   a sequência completa (todas as páginas) é monotônica e sem pessoa repetida ou faltando; o primeiro da ordem
   decrescente = último da crescente.
3. CSV com os mesmos filtros = mesmas pessoas e mesma quantidade da tela.
4. Regressão: testes Playwright existentes de Pessoas e Atendimento (28 arquivos) + regressões SQL existentes.
5. Contatos: contagem por pessoa idêntica antes e depois.

Publicação só com tudo verde e autorização do Felipe; depois, roteiro fixo de homologação na tela real antes de
chamar a IGV.

## 10. Restrições

- Proteção da produção: branch isolada, PRs separados (banco / tela), migrations geradas a partir da definição de
  produção, rollback pronto, sem deploy/merge sem autorização.
- Edge Functions blindadas e acolhimento intocados.
- Front: React + Vite + TanStack Query; RPCs Postgres SECURITY DEFINER com `assert_church_access`.

## 11. Deixado ao builder

Reaproveitar as RPCs existentes (`get_care_status_counts`, `get_people_page`, `get_people_stage_counts`, `export_people_rows`) sem mudar suas regras; layout fino seguindo o padrão visual atual; organização interna da janela "Mais filtros".

## 12. Decisões de comportamento (minhas, para conferência)

- Atendimento sem botão escolhido = todos os estados (estado inicial); clicar de novo desmarca.
- "Sem atendimento há 48h" conta como escolha de Atendimento (a lista e o N pessoas mostram o recorte).
- Fileira Quem respeita unidade, busca e Mais filtros, não o botão de Atendimento; fileira Atendimento respeita o Quem escolhido.
- Aniversariantes do dia é um filtro (liga/desliga), respeita a unidade; a lista e os números passam a contar só os aniversariantes do dia.
- Filtros ligados aparecem como chips removíveis abaixo da busca; tudo fica na URL (link compartilhável, F5 preserva).
