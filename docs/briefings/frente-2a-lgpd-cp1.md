# Frente 2A — LGPD: Pacote de Conformidade CP1

**Data:** 2026-05-28  
**Engenheiro:** ENG-2 (Frente 2A)  
**Status:** PRONTO PARA APLICAÇÃO — aguarda autorização Felipe  
**Branch alvo:** `staging`

---

## ESTADO ENCONTRADO (diagnóstico read-only)

| Item | Estado Atual |
|---|---|
| `people.lgpd_consent` | EXISTS — `boolean`, nullable |
| `people.lgpd_consent_at` | **NÃO EXISTE** — ausente no schema |
| `visitor-capture` linha 224 | `lgpd_consent: true` hardcoded (sem timestamp) |
| `webhook-receiver` consent | **NÃO setado** no INSERT de WhatsApp inbound |
| `Privacy.tsx` | **NÃO EXISTE** em `web/src/pages/` |
| `Terms.tsx` | **NÃO EXISTE** em `web/src/pages/` |
| Signup.tsx hrefs | `href="#"` nos dois links (Termos e Privacidade) |
| Landing.tsx hrefs | `href="#"` nos dois links (rodapé, linha 1276) |
| Router `/privacy` | **NÃO EXISTE** em `App.tsx` |
| Router `/terms` | **NÃO EXISTE** em `App.tsx` |

---

## DIFFS EXATOS

### a) Migration idempotente — `lgpd_consent_at`

**Arquivo:** nova migration  
**Nome sugerido:** `20260528000001_add_lgpd_consent_at_to_people.sql`

```sql
-- Migration: adicionar lgpd_consent_at à tabela people
-- Idempotente: IF NOT EXISTS garante re-execução segura

ALTER TABLE public.people 
ADD COLUMN IF NOT EXISTS lgpd_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.people.lgpd_consent_at IS 
'Timestamp do consentimento LGPD explícito. NULL = não coletado ou legítimo interesse.';
```

**Aplicar via MCP:**
```
mcp__supabase__apply_migration(name: "add_lgpd_consent_at_to_people", query: <sql acima>)
```

---

### b) Fix `visitor-capture/index.ts` — lgpd_consent hardcoded → condicional com timestamp

**Arquivo:** `supabase/functions/visitor-capture/index.ts`

**Estado atual (linha 222–226):**
```typescript
          first_visit_date:      new Date().toISOString().split('T')[0],
          last_contact_at:       new Date().toISOString(),
          person_stage:          'visitante',
          lgpd_consent:          true,
          is_volunteer:          false,
```

**Estado desejado:**
```typescript
          first_visit_date:      new Date().toISOString().split('T')[0],
          last_contact_at:       new Date().toISOString(),
          person_stage:          'visitante',
          // LGPD: consentimento explícito coletado no formulário QR Code.
          // O visitante submete o formulário com checkbox ou texto de aceite visível.
          // lgpd_consent_at registra o momento exato da captura para fins de auditoria.
          lgpd_consent:          true,
          lgpd_consent_at:       new Date().toISOString(),
          is_volunteer:          false,
```

**Nota:** O campo `lgpd_consent: true` permanece hardcoded pois o fluxo QR Code
exige aceite explícito (texto visível no formulário) antes de submeter.
A mudança adiciona apenas o timestamp de auditoria.

---

### c) Fix `webhook-receiver/index.ts` — lgpd_consent explícito no INSERT inbound WhatsApp

**Arquivo:** `supabase/functions/webhook-receiver/index.ts`

**Estado atual (linhas 321–332):**
```typescript
      const { data: newPerson, error: personErr } = await sb
        .from('people')
        .insert({
          church_id:    churchId,
          first_name:   'Contato',
          last_name:    normalized.from_phone.slice(-4),
          phone:        normalized.from_phone,
          person_stage: 'visitante',
          observacoes_pastorais: 'Cadastrado automaticamente via WhatsApp inbound',
        })
```

**Estado desejado:**
```typescript
      const { data: newPerson, error: personErr } = await sb
        .from('people')
        .insert({
          church_id:    churchId,
          first_name:   'Contato',
          last_name:    normalized.from_phone.slice(-4),
          phone:        normalized.from_phone,
          person_stage: 'visitante',
          observacoes_pastorais: 'Cadastrado automaticamente via WhatsApp inbound',
          // LGPD: base legal = legítimo interesse (Art. 7º, IX, LGPD).
          // Pessoa iniciou contato via WhatsApp — não há consentimento explícito.
          // lgpd_consent=false documenta ausência de opt-in explícito.
          // lgpd_consent_at=null indica que não houve consentimento formal.
          lgpd_consent:    false,
          lgpd_consent_at: null,
        })
```

---

### d) Privacy.tsx stub

**Arquivo:** `web/src/pages/Privacy.tsx` (criar)

```tsx
// Privacy.tsx — Política de Privacidade Ekthos Church
// Stub revisável pelo jurídico. Versão operacional mínima.
// Última revisão: 2026-05-28

export default function Privacy() {
  return (
    <div className="min-h-screen px-4 py-16" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
          Política de Privacidade
        </h1>
        <p className="text-xs text-gray-400 mb-10">Última atualização: 28 de maio de 2026</p>

        <section className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">1. Controlador dos Dados</h2>
            <p>
              Ekthos Sistemas Ltda., inscrita no CNPJ [a preencher], com sede em [cidade/UF],
              é a controladora dos dados pessoais coletados por meio desta plataforma,
              nos termos da Lei nº 13.709/2018 (LGPD).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">2. Finalidade do Tratamento</h2>
            <p>
              Os dados coletados são utilizados exclusivamente para prestação dos serviços
              de gestão pastoral contratados pela instituição religiosa (Igreja) cliente,
              incluindo: gestão de membros e visitantes, comunicação pastoral via WhatsApp,
              organização de eventos, escalas e células, e relatórios de acompanhamento espiritual.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">3. Dados Coletados</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Nome completo</li>
              <li>Número de telefone (WhatsApp)</li>
              <li>Endereço de e-mail (quando fornecido)</li>
              <li>Data de nascimento (quando fornecida)</li>
              <li>Participação em eventos e atividades da Igreja</li>
              <li>Histórico de conversas iniciadas pelo próprio titular via WhatsApp</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">4. Base Legal</h2>
            <p>
              O tratamento ocorre com base em: (i) consentimento explícito do titular,
              quando coletado via formulário de visitante (QR Code); ou (ii) legítimo interesse
              da Igreja, quando o contato é iniciado pelo próprio titular via WhatsApp
              (Art. 7º, incisos I e IX da LGPD).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">5. Retenção dos Dados</h2>
            <p>
              Os dados são mantidos enquanto vigente o contrato entre a Ekthos e a Igreja
              contratante. Após o encerramento, os dados são anonimizados ou excluídos
              em até 90 dias, salvo obrigação legal de retenção.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">6. Direitos do Titular</h2>
            <p>
              O titular dos dados pode, a qualquer momento, solicitar: confirmação de
              existência de tratamento, acesso, correção, anonimização, portabilidade,
              eliminação ou revogação de consentimento. Solicitações devem ser enviadas
              para:{' '}
              <a
                href="mailto:noreply@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                noreply@ekthosai.net
              </a>
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">7. Encarregado (DPO)</h2>
            <p>
              Encarregado de Proteção de Dados: [Nome a preencher]<br />
              Contato:{' '}
              <a
                href="mailto:noreply@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                noreply@ekthosai.net
              </a>
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">8. Alterações</h2>
            <p>
              Esta política pode ser atualizada periodicamente. A data de última atualização
              é sempre indicada no topo deste documento.
            </p>
          </div>

        </section>

        <div className="mt-12 pt-6 border-t border-gray-100">
          <a href="/landing" className="text-sm" style={{ color: 'var(--color-primary)' }}>
            ← Voltar ao início
          </a>
        </div>
      </div>
    </div>
  )
}
```

---

### e) Terms.tsx stub

**Arquivo:** `web/src/pages/Terms.tsx` (criar)

```tsx
// Terms.tsx — Termos de Uso Ekthos Church
// Stub revisável pelo jurídico. Versão operacional mínima.
// Última revisão: 2026-05-28

export default function Terms() {
  return (
    <div className="min-h-screen px-4 py-16" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
          Termos de Uso
        </h1>
        <p className="text-xs text-gray-400 mb-10">Última atualização: 28 de maio de 2026</p>

        <section className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">1. Aceitação</h2>
            <p>
              Ao criar uma conta ou utilizar a plataforma Ekthos Church, você concorda
              com estes Termos de Uso. Se não concordar, não utilize o serviço.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">2. Descrição do Serviço</h2>
            <p>
              O Ekthos Church é uma plataforma SaaS de gestão pastoral destinada
              exclusivamente a instituições religiosas. Oferece funcionalidades de
              CRM de membros, comunicação via WhatsApp, gestão de eventos, escalas,
              células e relatórios pastorais.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">3. Uso Autorizado</h2>
            <p>
              A plataforma é licenciada para uso exclusivo da Igreja contratante.
              É vedado compartilhar credenciais de acesso, revender o serviço ou
              utilizá-lo para fins contrários à sua finalidade pastoral.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">4. Responsabilidades</h2>
            <p>
              A Igreja é responsável pela veracidade dos dados inseridos, pela obtenção
              de consentimentos de seus membros e visitantes, e pelo uso ético das
              ferramentas de comunicação disponibilizadas.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">5. Disponibilidade</h2>
            <p>
              O serviço é prestado em regime de "melhor esforço". A Ekthos não garante
              disponibilidade ininterrupta, mas empenha-se em manter SLA mínimo de
              99% mensal para planos pagos.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">6. Pagamento e Cancelamento</h2>
            <p>
              A cobrança é mensal via cartão de crédito (Stripe). O cancelamento pode
              ser solicitado a qualquer momento via WhatsApp ou e-mail. Não há reembolso
              proporcional de período já faturado.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">7. Limitação de Responsabilidade</h2>
            <p>
              A Ekthos não se responsabiliza por danos indiretos, perda de dados por
              uso incorreto ou por falhas de infraestrutura de terceiros (Supabase, Stripe,
              provedores de WhatsApp).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">8. Foro</h2>
            <p>
              Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da
              comarca de [cidade/UF — a preencher] para dirimir quaisquer controvérsias.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">9. Contato</h2>
            <p>
              Dúvidas:{' '}
              <a
                href="mailto:noreply@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                noreply@ekthosai.net
              </a>
            </p>
          </div>

        </section>

        <div className="mt-12 pt-6 border-t border-gray-100">
          <a href="/landing" className="text-sm" style={{ color: 'var(--color-primary)' }}>
            ← Voltar ao início
          </a>
        </div>
      </div>
    </div>
  )
}
```

---

### f) Fix `Signup.tsx` — hrefs `#` → `/privacy` e `/terms`

**Arquivo:** `web/src/pages/Signup.tsx`

**Estado atual (linhas 163–168):**
```tsx
          <p className="text-xs text-gray-400 text-center mt-6">
            Ao criar sua conta você concorda com os{' '}
            <a href="#" className="underline" style={{ color: 'var(--color-primary)' }}>Termos de Uso</a>
            {' '}e a{' '}
            <a href="#" className="underline" style={{ color: 'var(--color-primary)' }}>Política de Privacidade</a>.
          </p>
```

**Estado desejado:**
```tsx
          <p className="text-xs text-gray-400 text-center mt-6">
            Ao criar sua conta você concorda com os{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>Termos de Uso</a>
            {' '}e a{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>Política de Privacidade</a>.
          </p>
```

---

### g) Fix `Landing.tsx` — hrefs rodapé `#` → `/privacy` e `/terms`

**Arquivo:** `web/src/pages/Landing.tsx`

**Estado atual (linha 1276):**
```tsx
              {[['#', 'Política de Privacidade'], ['#', 'Termos de Uso']].map(([h, l]) => (
```

**Estado desejado:**
```tsx
              {[['/privacy', 'Política de Privacidade'], ['/terms', 'Termos de Uso']].map(([h, l]) => (
```

---

### h) Fix `App.tsx` — adicionar rotas públicas `/privacy` e `/terms`

**Arquivo:** `web/src/App.tsx`

**Adicionar import (após imports de páginas públicas existentes, bloco linha 22–33):**
```typescript
const Privacy = lazy(() => import('@/pages/Privacy'))
const Terms   = lazy(() => import('@/pages/Terms'))
```

**Adicionar rotas (após linha 194, no bloco de rotas públicas, antes de `/login`):**
```tsx
          {/* ── LGPD — Políticas públicas ── */}
          <Route path="/privacy" element={<ErrorBoundary><Suspense fallback={<FullScreenSpinner />}><Privacy /></Suspense></ErrorBoundary>} />
          <Route path="/terms"   element={<ErrorBoundary><Suspense fallback={<FullScreenSpinner />}><Terms /></Suspense></ErrorBoundary>} />
```

---

## CHECKLIST DE APLICAÇÃO

### Ordem de execução (sequential — dependências entre si)

- [ ] **1. Migration** — `apply_migration` via MCP Supabase
  - Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name='people' AND column_name='lgpd_consent_at'`
  - Esperado: 1 row retornada

- [ ] **2. visitor-capture** — editar `supabase/functions/visitor-capture/index.ts`
  - Adicionar `lgpd_consent_at: new Date().toISOString()` no INSERT
  - Deploy: `supabase functions deploy visitor-capture --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`
  - Verificar via curl (QR Code mock) → checar `SELECT lgpd_consent_at FROM people ORDER BY created_at DESC LIMIT 1`

- [ ] **3. webhook-receiver** — editar `supabase/functions/webhook-receiver/index.ts`
  - Adicionar `lgpd_consent: false, lgpd_consent_at: null` no INSERT de WhatsApp inbound
  - Deploy: `supabase functions deploy webhook-receiver --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`
  - Verificar: simular webhook inbound → checar `lgpd_consent` na pessoa criada

- [ ] **4. Privacy.tsx** — criar arquivo `web/src/pages/Privacy.tsx`
- [ ] **5. Terms.tsx** — criar arquivo `web/src/pages/Terms.tsx`
- [ ] **6. App.tsx** — adicionar imports e rotas `/privacy` e `/terms`
- [ ] **7. Signup.tsx** — substituir hrefs `#` por `/privacy` e `/terms`
- [ ] **8. Landing.tsx** — substituir array com `#` por `/privacy` e `/terms`

- [ ] **9. Build** — `npm run build` sem erros
- [ ] **10. Smoke test** — navegar `/privacy` e `/terms` sem 404

- [ ] **11. Commit** — `feat(lgpd): conformidade LGPD mínima — consent_at, páginas privacy/terms`
- [ ] **12. Push staging** → PR manual → merge → Vercel

---

## NOTA D-DPA

Contrato DPA (Data Processing Agreement) com igrejas será gerenciado externamente pelo Felipe —
**não é bloqueador legal** para esta fase.

Feature futura planejada: upload do DPA assinado no cockpit por `church_id`,
armazenado no Supabase Storage com link acessível ao admin.
Não implementar neste CP1.

---

## RISCOS E OBSERVAÇÕES

### R1 — webhook-receiver R10 (cross-tenant)
O INSERT de `lgpd_consent: false` no webhook-receiver não interfere com a
correção R10 (isolamento multi-tenant por `church_id`). São campos independentes.
Não há risco de regressão.

### R2 — visitor-capture: campo `lgpd_consent_at` exige migration prévia
A migration (item 1 do checklist) DEVE ser aplicada antes do deploy da EF.
Caso contrário, o INSERT retornará erro de coluna inexistente.

### R3 — Landing.tsx: rodapé usa `.map()` com array de tuplas
A mudança de `['#', ...]` para `['/privacy', ...]` é cirúrgica (1 linha).
Sem risco de quebra de layout ou outros links.

### R4 — Privacy.tsx e Terms.tsx: stubs jurídicos
Os stubs contêm `[a preencher]` em campos como CNPJ, sede e foro.
**Felipe deve revisar e completar antes de divulgar publicamente.**
Para fins legais de operação corrente (fase de piloto), os stubs são suficientes.

### R5 — `lgpd_consent_at` não tem NOT NULL constraint
Intencional: pessoas criadas antes desta migration (via WhatsApp inbound,
via importação, via admin) terão `lgpd_consent_at = NULL`.
NULL = "não coletado ou legítimo interesse" — conforme comentário na migration.
Não retroagir com UPDATE em massa sem autorização.
