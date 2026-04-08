# Command: /onboard-church

## Descrição

Inicia o fluxo completo de onboarding para uma nova igreja no Ekthos Platform. Conduz a coleta estruturada de informações, gera automaticamente o contexto do tenant, configura os módulos selecionados e prepara o ambiente para operação.

---

## Como Usar

```
/onboard-church
/onboard-church --nome="Igreja da Graça" --slug="igreja-graca" --pastor="João Silva"
/onboard-church --resume=igreja-graca    # Retoma onboarding interrompido
/onboard-church --dry-run                # Simula sem criar registros
```

---

## Fase 1 — Coleta de Informações Básicas

O sistema faz perguntas sequenciais para mapear a igreja:

```
Pergunta 1: Qual é o nome oficial da igreja?
Pergunta 2: Qual é o nome do pastor principal / líder responsável?
Pergunta 3: Em qual cidade e estado a igreja está localizada?
Pergunta 4: Qual é o fuso horário? (Padrão: America/Sao_Paulo)
Pergunta 5: Quantos membros aproximadamente a igreja tem?
  [ ] Menos de 100
  [ ] 100–500
  [ ] 500–2.000
  [ ] 2.000–10.000
  [ ] Mais de 10.000
```

---

## Fase 2 — Mapeamento de Terminologia

```
Pergunta 6: Como a igreja chama seus grupos de membros?
  Exemplos: células, GCs (grupos de conexão), casas, grupos de vida, famílias
  Sua resposta: ___

Pergunta 7: Como vocês se referem aos membros em geral?
  Exemplos: membros, irmãos, congregados, familiares, família
  Sua resposta: ___

Pergunta 8: Como é chamado o líder principal?
  Exemplos: pastor, apóstolo, presbítero, bispo, reverendo
  Sua resposta: ___

Pergunta 9: Como vocês chamam a reunião principal da semana?
  Exemplos: culto, reunião, serviço, encontro, assembleia
  Sua resposta: ___

Pergunta 10: A igreja tem um nome específico para o grupo de jovens?
  Exemplos: Juventude, JA (Jovens Adultos), Next, Geração, JOCA
  Sua resposta: ___
```

---

## Fase 3 — Tom e Linguagem

```
Pergunta 11: Como você descreveria o tom de comunicação da sua igreja?
  [ ] Formal e reverente
  [ ] Informal e próximo
  [ ] Carinhoso e acolhedor
  [ ] Jovem e descontraído

Pergunta 12: A comunicação usa emojis?
  [ ] Sim, bastante
  [ ] Moderadamente
  [ ] Raramente
  [ ] Não usa

Pergunta 13: Existe alguma palavra ou expressão que a igreja EVITA usar?
  (Ex: algumas igrejas não usam "missa", outras preferem não usar "religião")
  Sua resposta: ___
```

---

## Fase 4 — Canais e Módulos

```
Pergunta 14: Quais canais de comunicação a igreja usa? (selecionar todos)
  [ ] WhatsApp Business
  [ ] Instagram
  [ ] E-mail
  [ ] Telegram
  [ ] Site próprio

Pergunta 15: Quais módulos do Ekthos deseja habilitar? (selecionar todos)
  [ ] Atendimento automático via WhatsApp
  [ ] Atendimento automático via Instagram
  [ ] Marketing e campanhas
  [ ] Gestão de doações
  [ ] Pipeline de visitantes (jornada membro)
  [ ] Relatórios e analytics

Pergunta 16: Qual o horário de funcionamento da secretaria/atendimento?
  Seg-Sex: de ___ às ___
  Sábado: de ___ às ___ (ou "fechado")
  Domingo: de ___ às ___ (ou "fechado")
```

---

## Fase 5 — Contato para Escalada

```
Pergunta 17: Quando o sistema não souber responder, para qual número
             do WhatsApp deve escalar a conversa?
  Número: ___

Pergunta 18: Qual o e-mail do responsável técnico pela conta?
  E-mail: ___

Pergunta 19: Qual o nome do responsável pelo digital / comunicação?
  Nome: ___
```

---

## Fase 6 — Geração Automática dos Artefatos

Após coleta de informações, o sistema gera automaticamente:

### 6.1 Registro no banco

```sql
-- Inserção da church
INSERT INTO churches (
  name, slug, city, state, timezone, size_estimate,
  pastor_name, created_at
)
VALUES (
  '{nome}', '{slug}', '{cidade}', '{estado}',
  '{fuso}', '{tamanho}', '{pastor}', NOW()
)
RETURNING id;

-- Configurações do tenant
INSERT INTO church_settings (
  church_id, tone, terminology, enabled_modules,
  business_hours, escalation_contact, use_emojis
)
VALUES (
  '{church_id}',
  '{tom}',
  '{terminologia_json}',
  '{modulos_json}',
  '{horarios_json}',
  '{contato}',
  {usa_emojis}
);
```

### 6.2 Arquivo de contexto do tenant

Gera `context/tenants/{slug}.md` completo com todas as informações coletadas.

### 6.3 Configuração de integrações

Para cada canal selecionado, gera o registro em `integrations` com instruções de configuração.

---

## Fase 7 — Validação e Confirmação

```
Resumo do Onboarding:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Igreja: {nome}
Slug: {slug}
Pastor: {nome do pastor}
Localização: {cidade}/{estado}
Tamanho: {tamanho}
Tom: {tom}
Grupos chamados de: {terminologia}
Canais ativos: {lista}
Módulos habilitados: {lista}
Escalada para: {contato}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Confirmar e criar? [S/N]
```

---

## Fase 8 — Próximos Passos (pós-onboarding)

Após confirmação, o sistema entrega:

```
Onboarding concluído com sucesso!

Próximos passos:
1. Configure a integração WhatsApp:
   → Acesse as configurações → Integrações → WhatsApp
   → Cole o seu Phone Number ID e Token de Acesso

2. Configure a integração Instagram:
   → Acesse as configurações → Integrações → Instagram
   → Conecte sua conta comercial do Facebook

3. Teste o agente:
   → Envie uma mensagem para o número de teste
   → Verifique se o tom e terminologia estão corretos

4. Treine a equipe:
   → Acesse o guia de uso para líderes em: docs.ekthos.com.br

Dúvidas? suporte@ekthos.com.br | (11) 00000-0000
```

---

## Checklist de Conclusão do Onboarding

- [ ] Registro criado na tabela `churches`
- [ ] `church_settings` populado corretamente
- [ ] Arquivo `context/tenants/{slug}.md` gerado
- [ ] Primeiro usuário admin criado e email de convite enviado
- [ ] Integrações selecionadas registradas (pendentes de configuração)
- [ ] Auditoria inicial do tenant executada (`/audit-project --tenant={slug}`)
- [ ] Briefing enviado para o time Ekthos via n8n
