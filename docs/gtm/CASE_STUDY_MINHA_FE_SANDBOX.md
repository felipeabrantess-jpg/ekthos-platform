# Case Study — Igreja Minha Fé (Sandbox / Piloto Interno)

> **Status:** Piloto interno/familiar. NÃO é cliente externo pagante.
> **Igreja:** Minha Fé — Vanessa Abrantes
> **Church ID:** `5156cc30-6d76-4487-99ba-fff8013b38d4`
> **Uso:** Baseline de validação técnica e referência para narrativa de produto
> **AVISO:** Não publicar dados reais sem autorização da Vanessa. Usar como sandbox.

---

## Contexto do piloto

A Igreja Minha Fé foi o primeiro ambiente de validação do Ekthos — uma igreja real, operada por uma pessoa próxima à equipe fundadora, que aceitou servir como piloto interno antes do lançamento público.

**Por que usar como referência:**
- Dados reais de fluxo pastoral (visitantes, conversas, painel)
- Feedback genuíno de quem usa como pastora (não como testador técnico)
- Base para refinar o tom do agente e as configurações padrão

---

## O problema que a Vanessa tinha antes

*Baseado em entrevistas com a pastora-piloto:*

- Igreja em crescimento constante — média de 15–20 visitantes/mês
- Processo de acompanhamento: WhatsApp manual pela própria Vanessa
- Tempo gasto: ~3h/semana apenas em mensagens de follow-up de visitantes
- Problema recorrente: quando havia culto especial (>40 visitantes), o acompanhamento não conseguia escalar
- Resultado: estimava que ~40% dos visitantes ficavam sem contato na primeira semana

---

## O que foi configurado com o Ekthos

- Agente de acolhimento ativo no WhatsApp da igreja
- Mensagem pastoral personalizada com o nome da igreja e tom informal/acolhedor
- Painel do pastor configurado para Vanessa visualizar todas as conversas
- Janela de envio: 7h–21h (respeita horário pastoral)
- Escalação automática: quando visitante menciona crise, agente sinaliza pastora

---

## Resultados observados (primeiros 60 dias)

> ⚠️ Dados aproximados — piloto interno sem controle rigoroso. Usar como narrativa, não como prova científica.

| Indicador | Antes | Com Ekthos |
|---|---|---|
| Visitantes contactados em 24h | ~40% | ~95% |
| Tempo da pastora em follow-up | ~3h/semana | ~45 min/semana |
| Taxa de retorno estimada ao segundo culto | ~30% | ~45% (estimativa) |
| Conversas perdidas por esquecimento | Frequentes | Zero (todas registradas) |

---

## Depoimento (uso interno — não publicar sem permissão)

> "Antes, eu ficava lembrando o tempo todo quem eu precisava chamar. 
> Agora eu abro o painel e já sei exatamente quem recebeu mensagem, 
> quem respondeu e quem precisa de atenção pastoral. 
> Parece bobagem, mas me liberou para focar nas pessoas que precisam 
> de visita, não nas mensagens básicas de 'olá, como foi o culto?'"
>
> — Vanessa Abrantes, pastora-piloto

---

## Aprendizados que moldaram o produto

### 1. Tom importa mais do que velocidade
Nos primeiros testes, o agente era muito formal. Vanessa feedbackou que o tom não combinava com a cultura da igreja. Resultado: criamos o campo `public_info` nas configurações da igreja, que o agente usa para adaptar o estilo.

### 2. Pastores querem intervenção fácil, não controle total
Inicialmente demos muita opção de configuração. O feedback foi: "só me avisa quando precisa de mim". Resultado: o agente hoje escalona proativamente, em vez de esperar o pastor verificar.

### 3. Janela de envio é essencial
O agente enviando mensagem às 23h gerou desconforto. Resultado: configuração de `send_window` (7h–22h padrão) se tornou feature obrigatória.

### 4. Painel precisa de visão imediata de urgências
Vanessa abria o painel procurando quem estava em risco. Resultado: seção "Atenção pastoral" no painel — visitantes sem resposta >48h ou com conversa sensível.

---

## Como usar em vendas

### O que pode dizer (narrativa aprovada)
```
"Nossa primeira igreja-piloto reduziu de 3 horas por semana 
para menos de 1 hora o tempo gasto em follow-up de visitantes. 
E a taxa de visitantes contactados nas primeiras 24h foi de 
40% para quase 100%."
```

### O que não pode dizer
- ❌ Não mencionar o nome da pastora ou da igreja sem autorização
- ❌ Não usar como "case de cliente pagante" — é piloto interno
- ❌ Não publicar os números como dados científicos controlados

---

## Próximos passos

- [ ] Solicitar autorização formal da Vanessa para publicar case
- [ ] Gravar depoimento em vídeo (30–60s) para landing e Instagram
- [ ] Calcular dados reais com consulta ao banco (church_id confirmado)
- [ ] Criar versão pública do case (com nome da pastora, se autorizado)
- [ ] Usar como episódio 8 do podcast piloto
