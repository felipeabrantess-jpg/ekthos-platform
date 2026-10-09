// ClassificationBadge — rótulo único da classificação (fonte: person_classification do banco).
// Prioridade visual: Líder > Voluntário > Membro. Nunca mostra Visitante e Membro ao mesmo tempo.
import { classificationBadge, ROLE_BASIS_LABEL, type PersonClassification } from '../classification'

export function ClassificationBadge({ value, showRoles = true, size = 'sm' }: { value: PersonClassification | null | undefined; showRoles?: boolean; size?: 'sm' | 'md' }) {
  const b = classificationBadge(value)
  const volunteerHidden = !!value?.is_leader && !!value?.is_volunteer   // Líder prevalece; Voluntário vai para o chip
  const roles = showRoles ? (value?.roles ?? []) : []
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="classificacao" data-classification={value?.classification ?? 'none'} data-label={b.label}>
      <span
        className={`inline-flex items-center rounded-full font-semibold ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`}
        style={{ color: b.color, background: b.bg }}
        title={roles.length ? roles.map(r => `${ROLE_BASIS_LABEL[r.basis] ?? r.role}${r.ref_name ? `: ${r.ref_name}` : ''}`).join(' · ') : undefined}
      >
        {b.label}
      </span>
      {volunteerHidden && (
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: '#5b21b6', background: '#ede9fe' }} data-testid="chip-voluntario">
          Voluntário
        </span>
      )}
      {value?.condition === 'afastado' && (
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: '#92400e', background: '#fef3c7' }}>
          afastado
        </span>
      )}
    </span>
  )
}
