// Terms.tsx — Termos de Uso Ekthos Church
// Contratante: F C Abrantes Ltda — CNPJ 60.940.150/0001-07
// Versão: 1.0 — 28/05/2026

export default function Terms() {
  return (
    <div className="min-h-screen px-4 py-16" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
          Termos de Uso
        </h1>
        <p className="text-xs text-gray-400 mb-10">Última atualização: 28 de maio de 2026 — Versão 1.0</p>

        <section className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">1. Identificação</h2>
            <p>
              A plataforma Ekthos Church é desenvolvida e operada pela{' '}
              <strong>F C Abrantes Ltda.</strong>, inscrita no CNPJ&nbsp;60.940.150/0001-07
              (&quot;Ekthos&quot;). Ao criar uma conta ou utilizar a plataforma, a Igreja contratante
              (&quot;Cliente&quot;) aceita integralmente estes Termos de Uso.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">2. Objeto</h2>
            <p>
              O Ekthos Church é uma plataforma SaaS (Software as a Service) de gestão pastoral
              destinada exclusivamente a instituições religiosas. Oferece CRM de membros e visitantes,
              comunicação via WhatsApp, gestão de eventos, escalas, células, pipeline de discipulado
              e relatórios pastorais com auxílio de inteligência artificial.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">3. Responsabilidades da Ekthos</h2>
            <p>
              A Ekthos compromete-se a: (i) manter a plataforma disponível e funcional, com SLA
              mínimo de 99% ao mês para planos pagos; (ii) proteger os dados pessoais armazenados
              conforme a LGPD; (iii) comunicar ao Cliente, com antecedência razoável, qualquer
              manutenção programada ou alteração relevante de funcionalidades; e (iv) fornecer
              suporte técnico nos canais disponibilizados.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">4. Responsabilidades do Cliente (Igreja)</h2>
            <p>
              O Cliente é responsável por: (i) a veracidade dos dados inseridos na plataforma;
              (ii) a obtenção dos consentimentos necessários de seus membros e visitantes,
              conforme a LGPD; (iii) o uso ético e legal das ferramentas de comunicação
              disponibilizadas; e (iv) manter suas credenciais de acesso em sigilo.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">5. Vedações</h2>
            <p>
              É expressamente vedado ao Cliente: (i) compartilhar credenciais de acesso com
              terceiros não autorizados; (ii) revender, sublicenciar ou ceder o acesso à
              plataforma; (iii) utilizar a plataforma para fins distintos da gestão pastoral;
              (iv) realizar engenharia reversa, decompilação ou extração do código-fonte; e
              (v) enviar comunicações em massa não autorizadas (&quot;spam&quot;).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">6. Pagamento e Cancelamento</h2>
            <p>
              A cobrança é mensal, antecipada, via cartão de crédito processado pelo Stripe.
              O cancelamento pode ser solicitado a qualquer momento; o acesso permanece ativo
              até o fim do período já faturado. Não há reembolso proporcional de período
              parcialmente utilizado, salvo nos casos previstos no Código de Defesa do Consumidor.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">7. Limitação de Responsabilidade</h2>
            <p>
              A Ekthos não se responsabiliza por: (i) danos indiretos, lucros cessantes ou
              perda de dados decorrentes de uso incorreto da plataforma; (ii) falhas de
              infraestrutura de terceiros (Supabase, Stripe, provedores de WhatsApp); ou
              (iii) atos ou omissões do Cliente que resultem em violação de direitos de terceiros.
              Em qualquer hipótese, a responsabilidade máxima da Ekthos fica limitada ao valor
              pago pelo Cliente nos últimos 3 (três) meses de serviço.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">8. Foro e Lei Aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito
              o foro da comarca de <strong>São Paulo/SP</strong> para dirimir quaisquer controvérsias
              decorrentes deste instrumento, com renúncia expressa a qualquer outro, por mais
              privilegiado que seja.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">9. Vigência e Alterações</h2>
            <p>
              Estes Termos entram em vigor em <strong>28 de maio de 2026</strong> (Versão 1.0)
              e vigoram por prazo indeterminado. A Ekthos reserva-se o direito de atualizá-los
              mediante notificação prévia ao Cliente com antecedência mínima de 15 dias,
              por e-mail ou via plataforma. O uso continuado após a notificação implica
              aceitação das alterações.
            </p>
            <p className="mt-2">
              Contato:{' '}
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
