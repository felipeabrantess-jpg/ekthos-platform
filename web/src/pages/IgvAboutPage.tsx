/**
 * IgvAboutPage — /igv/sobre  (Redesign v2)
 * Página pública "Sobre Nós" da IGV.
 * Sem auth. Sem dados de membros. Conteúdo institucional hardcoded.
 * TODO Fase 1: migrar para church_pastoral_profile + colunas semânticas.
 */

import { type ReactNode }                          from 'react'
import { ChatCircleIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IconTile, IgvContent, IgvPageShell, PageHeader, IGV_TEXT, type AnyIcon } from '@/components/igv'
import { ChurchIcon, CommunityIcon, HeartCrossIcon, OpenBookIcon, OpenHandsIcon } from '@/components/igv/icons'
import { IGV }                                     from '@/lib/igv-public-data'

// ── Card auxiliar ──────────────────────────────────────────────────

function Card({ label, Icon, children }: { label: string; Icon: AnyIcon; children: ReactNode }) {
  return (
    <GlassCard>
      <div className="flex items-center gap-3 mb-3">
        <IconTile Icon={Icon} />
        <h2 className={IGV_TEXT.heading}>{label}</h2>
      </div>
      {children}
    </GlassCard>
  )
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvAboutPage() {
  return (
    <IgvPageShell>
      <PageHeader title="Sobre Nós" />

      <IgvContent>

        {/* Identidade */}
        <GlassCard className="flex items-center gap-4">
          <IconTile Icon={ChurchIcon} />
          <div className="min-w-0">
            <h2 className={IGV_TEXT.heading}>{IGV.name}</h2>
            <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{IGV.pastor}</p>
          </div>
        </GlassCard>

        {/* Missão */}
        <Card label="Nossa missão" Icon={OpenHandsIcon}>
          <p className={IGV_TEXT.body}>{IGV.missao}</p>
        </Card>

        {/* Visão */}
        <Card label="Nossa visão" Icon={OpenBookIcon}>
          <p className={IGV_TEXT.body}>{IGV.visao}</p>
        </Card>

        {/* Valores */}
        <Card label="Nossos valores" Icon={HeartCrossIcon}>
          <ul className="flex flex-col gap-2.5 mb-4">
            {IGV.valores.map(v => (
              <li key={v} className={`flex items-start gap-2.5 ${IGV_TEXT.body}`}>
                <span className="mt-[0.6rem] w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--igv-accent)]" aria-hidden="true" />
                {v}
              </li>
            ))}
          </ul>
          <p className={`igv-serif border-t border-[var(--igv-line)] pt-3 ${IGV_TEXT.body}`}>
            "{IGV.valoresFrase}"
          </p>
        </Card>

        {/* Endereços e contato */}
        <Card label="Endereços e contato" Icon={CommunityIcon}>
          <p className={`whitespace-pre-line mb-4 ${IGV_TEXT.body}`}>{IGV.address}</p>
          <GlassButton
            href={`https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre a Igreja Gerando Vencedores.')}`}
            Icon={ChatCircleIcon}
          >
            Fale conosco
          </GlassButton>
        </Card>

        {/* CTA Seja Membro */}
        <GlassButton to="/igv/seja-membro" variant="accent" fullWidth>
          Quero fazer parte — Seja Membro
        </GlassButton>
      </IgvContent>
    </IgvPageShell>
  )
}
