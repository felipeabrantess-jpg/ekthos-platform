# Statement de Conformidade LGPD — Ekthos Church

> **Versão:** 1.0  
> **Data:** 2026-05-30  
> **Público:** Pastores, conselhos, advogados de igrejas clientes  
> **Referência legal:** Lei 13.709/2018 (LGPD)

---

## 1. Quem somos (Controlador dos dados)

A **Ekthos Tecnologia Ltda.** ("Ekthos") atua como **operadora** dos dados dos membros das igrejas clientes. A **igreja contratante** é a **controladora** desses dados — é ela quem define a finalidade do tratamento.

Em relação aos dados dos usuários administrativos do sistema (pastores, líderes), a Ekthos atua como controladora.

---

## 2. Quais dados tratamos

### Dados de membros de igrejas (operadora)
| Categoria | Dado | Base legal |
|---|---|---|
| Identificação | Nome completo | Legítimo interesse (gestão pastoral) |
| Contato | Número de WhatsApp, email | Legítimo interesse |
| Localização | Bairro, CEP | Legítimo interesse (alocação de célula) |
| Comportamento pastoral | Frequência, etapa no discipulado | Legítimo interesse |
| Comunicações | Histórico de conversas no WhatsApp | Consentimento tácito (art. 7, II) |

### Dados sensíveis (art. 11 LGPD)
A Ekthos pode processar dados de cunho religioso (vinculação a denominação, ministério, batismo) mediante orientação expressa da igreja controladora. O tratamento segue o art. 11, inciso II, alínea "a" (mediante consentimento específico e destacado).

### Dados de usuários admin (controladora)
| Dado | Finalidade |
|---|---|
| Nome, email, senha | Autenticação e acesso à plataforma |
| Logs de acesso e ações | Auditoria e segurança |
| Dados de cobrança | Processamento de pagamento (Stripe) |

---

## 3. Bases legais para tratamento

A Ekthos fundamenta o tratamento de dados nas seguintes bases legais do art. 7 da LGPD:

- **Legítimo interesse (inciso IX):** gestão pastoral e operacional da comunidade religiosa
- **Execução de contrato (inciso V):** dados necessários para a prestação do serviço contratado
- **Consentimento (inciso I):** para dados sensíveis ou comunicações de marketing
- **Cumprimento de obrigação legal (inciso II):** quando exigido por lei (ex: dados fiscais)

---

## 4. Direitos dos titulares dos dados

Os membros de igrejas cujos dados estão na Ekthos têm os seguintes direitos, exercíveis mediante solicitação à **igreja controladora**:

| Direito | Como exercer |
|---|---|
| Acesso (art. 18, I) | Solicitar à liderança da igreja |
| Correção (art. 18, III) | Solicitar à liderança da igreja |
| Eliminação (art. 18, VI) | Solicitar à liderança; a Ekthos executa em 30 dias |
| Portabilidade (art. 18, V) | A Ekthos fornece exportação em formato aberto |
| Revogação de consentimento (art. 18, IX) | Solicitar à liderança da igreja |
| Informação sobre compartilhamento (art. 18, VII) | Descrito neste documento |

Para solicitações de titulares, a Ekthos pode ser acionada diretamente em: **privacidade@ekthosai.com**

---

## 5. Compartilhamento de dados com terceiros

| Terceiro | Finalidade | País |
|---|---|---|
| **Supabase Inc.** | Banco de dados e infraestrutura | Brasil (região SA-East-1) |
| **Anthropic PBC** | Processamento de linguagem natural (agentes IA) | EUA (transferência internacional¹) |
| **Z-API Ltda.** | Integração WhatsApp Business | Brasil |
| **Stripe Inc.** | Processamento de pagamentos | EUA (dados de faturamento apenas) |
| **Vercel Inc.** | Hospedagem do frontend | EUA (sem dados de membros) |

¹ *Transferência internacional para Anthropic realizada sob as salvaguardas previstas no art. 33 da LGPD, com dados anonimizados antes da transmissão. Conversas de membros identificados não são enviadas à Anthropic com dados de identidade.*

---

## 6. Retenção e exclusão de dados

| Dado | Período de retenção | Critério |
|---|---|---|
| Dados de membros (conta ativa) | Enquanto a assinatura estiver ativa | Execução de contrato |
| Dados de membros (pós-cancelamento) | 30 dias para exportação, após exclusão | Política de retenção |
| Logs de auditoria | 12 meses | Segurança e conformidade |
| Conversas WhatsApp | 12 meses (configurável) | Configuração da igreja |
| Dados de faturamento | 5 anos | Obrigação legal fiscal |

---

## 7. Segurança dos dados

A Ekthos adota as seguintes medidas técnicas e organizacionais:

- **Isolamento multi-tenant:** dados de cada igreja isolados por Row Level Security (RLS) no banco de dados
- **Criptografia em trânsito:** TLS 1.2+ em todas as conexões
- **Criptografia em repouso:** banco de dados criptografado pela infraestrutura Supabase
- **Controle de acesso:** autenticação JWT com validação manual, RBAC por papel
- **Logs de auditoria:** todas as ações administrativas registradas com identificação do ator
- **Sem acesso cruzado entre igrejas:** garantido por políticas de banco de dados, não apenas por código

---

## 8. Encarregado de Proteção de Dados (DPO)

**Nome:** [A definir — registrar perante ANPD]  
**Email:** privacidade@ekthosai.com  
**Endereço:** [Endereço da sede — preencher]

---

## 9. Incidentes de segurança

Em caso de violação de dados que possa causar risco ou dano aos titulares, a Ekthos:

1. Notifica a ANPD em até 72 horas (art. 48 LGPD)
2. Notifica as igrejas controladores afetadas em até 24 horas
3. Registra o incidente e as medidas corretivas adotadas

---

## 10. Alterações neste documento

Este documento pode ser atualizado. A versão mais recente estará sempre disponível em **ekthosai.com/privacidade**. Igrejas serão notificadas por email em caso de mudanças materiais.

---

*Este documento é uma declaração de conformidade para uso comercial e jurídico. Não substitui assessoria jurídica especializada. Para análise legal do contrato de uso, consulte seu advogado.*
