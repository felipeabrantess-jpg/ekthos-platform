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
                href="mailto:privacidade@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                privacidade@ekthosai.net
              </a>
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">7. Encarregado (DPO)</h2>
            <p>
              Encarregado de Proteção de Dados: [Nome a preencher]<br />
              Contato:{' '}
              <a
                href="mailto:privacidade@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                privacidade@ekthosai.net
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
