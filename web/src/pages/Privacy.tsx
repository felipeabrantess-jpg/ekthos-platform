// Privacy.tsx — Política de Privacidade Ekthos Church
// Controlador: F C Abrantes Ltda — CNPJ 60.940.150/0001-07
// DPO: Felipe Abrantes — felipe@ekthosai.net
// Versão: 1.0 — 28/05/2026

export default function Privacy() {
  return (
    <div className="min-h-screen px-4 py-16" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
          Política de Privacidade
        </h1>
        <p className="text-xs text-gray-400 mb-10">Última atualização: 28 de maio de 2026 — Versão 1.0</p>

        <section className="space-y-8 text-sm text-gray-700 leading-relaxed">

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">1. Identificação do Controlador</h2>
            <p>
              <strong>F C Abrantes Ltda.</strong>, inscrita no CNPJ&nbsp;60.940.150/0001-07,
              é a controladora dos dados pessoais coletados por meio da plataforma Ekthos Church,
              nos termos da Lei nº&nbsp;13.709/2018 (Lei Geral de Proteção de Dados — LGPD).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">2. Dados Coletados</h2>
            <p className="mb-2">Coletamos apenas os dados necessários à prestação do serviço contratado:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Nome completo</li>
              <li>Endereço de e-mail</li>
              <li>Número de telefone / WhatsApp (quando fornecido)</li>
              <li>Data de nascimento (quando fornecida)</li>
              <li>Participação em eventos, células e escalas da Igreja</li>
              <li>Histórico de interações iniciadas pelo próprio titular via WhatsApp</li>
              <li>Dados de acesso: IP, data/hora de login (logs de segurança)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">3. Finalidade do Tratamento</h2>
            <p>
              Os dados são utilizados exclusivamente para: (i) prestação dos serviços de gestão
              pastoral contratados pela Igreja; (ii) comunicação pastoral autorizada via WhatsApp;
              (iii) organização de eventos, escalas e células; (iv) relatórios de acompanhamento
              espiritual; e (v) envio de comunicações sobre o serviço contratado.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">4. Base Legal (Art. 7º da LGPD)</h2>
            <p>
              O tratamento de dados ocorre com fundamento em: (i) <strong>consentimento</strong> do titular,
              coletado no momento do cadastro ou via formulário de visitante (Art.&nbsp;7º, I);
              (ii) <strong>execução de contrato</strong>, quando necessário à prestação dos serviços
              contratados pela Igreja (Art.&nbsp;7º, V); e (iii) <strong>legítimo interesse</strong>,
              para fins de segurança, prevenção a fraudes e melhoria da plataforma (Art.&nbsp;7º, IX).
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">5. Retenção dos Dados</h2>
            <p>
              Os dados são mantidos pelo período de vigência do contrato entre a F C Abrantes Ltda.
              e a Igreja contratante, acrescido de <strong>5 (cinco) anos</strong> para fins de
              cumprimento de obrigações legais e defesa em processos judiciais ou administrativos.
              Após esse prazo, os dados são anonimizados ou definitivamente excluídos.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">6. Direitos do Titular (Art. 18 da LGPD)</h2>
            <p className="mb-2">O titular dos dados pode, a qualquer momento, solicitar:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Confirmação da existência de tratamento</li>
              <li>Acesso aos dados que possuímos sobre você</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados a outro fornecedor</li>
              <li>Revogação do consentimento, sem prejuízo da legalidade de tratamentos anteriores</li>
            </ul>
            <p className="mt-2">
              Solicitações devem ser enviadas para:{' '}
              <a
                href="mailto:felipe@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                felipe@ekthosai.net
              </a>
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">7. Encarregado de Proteção de Dados (DPO)</h2>
            <p>
              Encarregado: <strong>Felipe Abrantes</strong><br />
              Contato:{' '}
              <a
                href="mailto:felipe@ekthosai.net"
                className="underline"
                style={{ color: 'var(--color-primary)' }}
              >
                felipe@ekthosai.net
              </a>
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">8. Contato e Versão</h2>
            <p>
              Esta política pode ser atualizada periodicamente. A data de última atualização
              e o número de versão são sempre indicados no topo deste documento.
              Para dúvidas gerais:{' '}
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
