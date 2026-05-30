# FAQ — Segurança e Privacidade dos Dados da Igreja

> **Público:** Equipe comercial (para responder objeções), pastores, conselhos  
> **Data:** 2026-05-30  
> **Referência técnica:** `docs/product/SECURITY_SUMMARY_LANE_B.md`

---

## Perguntas mais frequentes

### "Onde ficam os dados da minha igreja?"

Os dados da sua igreja ficam armazenados no Brasil, em servidores da **Supabase** — infraestrutura em conformidade com SOC 2 Tipo II. A Ekthos não armazena dados em servidores próprios; toda a infraestrutura usa provedores auditados.

---

### "Outro pastor pode ver os dados dos membros da minha igreja?"

**Nunca.** A Ekthos usa isolamento completo por tenant (multi-tenancy seguro). Cada igreja tem seu próprio espaço de dados, protegido por políticas de banco de dados que impedem qualquer cruzamento de informações entre igrejas, mesmo que compartilhem a mesma infraestrutura. Esse isolamento é garantido pelo banco de dados — não apenas pelo código.

---

### "Os dados dos membros serão usados para treinar IA?"

Não. Os dados dos membros da sua igreja **não são usados para treinar modelos de IA**. Os modelos que alimentam os agentes são pré-treinados pela Anthropic (Claude) e não aprendem com conversas individuais das igrejas clientes.

---

### "A Ekthos tem acesso às conversas dos meus membros no WhatsApp?"

A equipe Ekthos não acessa conversas de membros como rotina operacional. Em caso de suporte técnico, qualquer acesso é feito com consentimento da liderança, registrado em log de auditoria, e limitado ao necessário para resolver o problema.

---

### "O que acontece com os dados se eu cancelar minha assinatura?"

Você tem direito de exportar todos os dados da sua igreja a qualquer momento via painel. Após o cancelamento, os dados ficam disponíveis por 30 dias para exportação. Após esse período, são removidos conforme nossa política de retenção.

---

### "A Ekthos está em conformidade com a LGPD?"

Sim. A Ekthos processa dados de pessoas físicas (membros de igrejas) e está em conformidade com a **Lei Geral de Proteção de Dados (Lei 13.709/2018)**:

- Coleta apenas dados necessários para o serviço
- Membros têm direito de acesso, correção e exclusão dos seus dados
- Tratamento baseado em legítimo interesse e consentimento
- Dados sensíveis (saúde, religião) tratados com cuidado adicional

Para detalhes completos, ver `docs/gtm/LGPD_COMPLIANCE_STATEMENT.md`.

---

### "As mensagens do WhatsApp são criptografadas?"

As mensagens transitam pela infraestrutura da **Z-API** (integração WhatsApp Business) usando HTTPS. O conteúdo das conversas é armazenado criptografado no banco de dados.

---

### "Existe controle de quem pode acessar o sistema dentro da minha equipe?"

Sim. A Ekthos tem **controle de acesso por papéis (RBAC)**:

- **Admin:** acesso total à igreja
- **Líder:** acesso às suas células e membros
- **Voluntário:** acesso limitado ao escopo definido pelo admin

O pastor pode definir exatamente o que cada membro da equipe vê.

---

### "O que acontece se o sistema cair?"

A infraestrutura usa **alta disponibilidade** com múltiplas réplicas. Em caso de incidente, o time técnico é notificado automaticamente. O histórico de uptime e incidentes é publicado no status page da Ekthos.

---

### "Posso exportar todos os dados da minha igreja?"

Sim, a qualquer momento. A Ekthos garante **portabilidade total dos dados**. Você pode exportar membros, conversas, histórico financeiro e relatórios em formatos abertos (CSV, JSON).

---

### "A Ekthos vende dados de igrejas para terceiros?"

**Nunca.** Os dados da sua igreja são seus. A Ekthos não vende, compartilha ou monetiza dados de clientes para terceiros.

---

## Para o comercial: como responder sobre segurança sem travar a venda

Quando o pastor ou conselho questionar segurança, o caminho é:

1. **Validar a preocupação:** "Faz todo sentido proteger os dados dos membros da sua família."
2. **Explicar o isolamento:** "Cada igreja tem um cofre separado — ninguém da outra pode acessar."
3. **Reforçar conformidade:** "Estamos em conformidade com a LGPD e utilizamos infraestrutura com certificação internacional."
4. **Oferecer o documento:** "Posso te enviar nosso Statement de Privacidade LGPD para o conselho avaliar."
5. **Não entrar em detalhes técnicos desnecessários:** confiar no FAQ e escalar para o CS técnico se necessário.
