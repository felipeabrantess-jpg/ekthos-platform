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
              O serviço é prestado em regime de &quot;melhor esforço&quot;. A Ekthos não garante
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
                href="mailto:contato@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                contato@ekthosai.net
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
