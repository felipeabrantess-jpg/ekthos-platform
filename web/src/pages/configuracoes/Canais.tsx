/**
 * Canais.tsx — /configuracoes/canais
 *
 * Tela read-only do pastor para visualizar canais configurados pela Ekthos.
 * Sem controles de edição, criação ou exclusão.
 */

import CanaisIgrejaPastor from '@/components/configuracoes/CanaisIgrejaPastor'
import { useChurchChannelsForPastor } from '@/hooks/useChurchChannelsForPastor'

export function Canais() {
  const { data: channels = [], isLoading, isError, refetch } = useChurchChannelsForPastor()

  return (
    <div className="space-y-5 max-w-lg">
      {/* Header */}
      <div>
        <h2 className="font-display text-xl font-semibold text-ekthos-black">
          Canais de Comunicação
        </h2>
        <p className="text-sm text-ekthos-black/50 mt-1 leading-relaxed">
          Estes são os canais configurados pela equipe Ekthos para conectar
          os agentes da sua igreja aos meios de atendimento e automação.
        </p>
      </div>

      {/* Lista de canais */}
      <CanaisIgrejaPastor
        channels={channels}
        isLoading={isLoading}
        isError={isError}
        refetch={refetch}
      />
    </div>
  )
}
