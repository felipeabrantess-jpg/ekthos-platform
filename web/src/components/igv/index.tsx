/**
 * Design system do app público IGV (/igv): toda tela usa estes componentes e tokens.
 * Vidro: classe única .igv-glass (index.css). Ícones: Phosphor, "regular" e "fill" no ativo.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  CaretLeftIcon, CaretRightIcon, CheckIcon, CheckCircleIcon,
} from '@phosphor-icons/react'
import { ICON_SIZE } from '@/lib/icon-tokens'
import { BibleIcon, CalendarCrossIcon, ChurchIcon, CommunityIcon, PrayerHandsIcon, type IgvIconProps } from './icons'

export type AnyIcon = PhosphorIcon | ((p: IgvIconProps) => JSX.Element)

// ── Tokens de classe ─────────────────────────────────────────────────

export const IGV_FOCUS = 'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--igv-accent)]'
export const IGV_TEXT = {
  display: 'text-[2.5rem] leading-[1.08] tracking-tight text-[var(--igv-ink)]',
  title:   'text-[1.75rem] leading-tight tracking-tight text-[var(--igv-ink)]',
  heading: 'text-[1.375rem] leading-snug text-[var(--igv-ink)]',
  item:    'text-[1.0625rem] font-semibold leading-snug text-[var(--igv-ink)]',
  body:    'text-[1rem] leading-relaxed text-[var(--igv-ink)]',
  muted:   'text-[1rem] leading-snug text-[var(--igv-muted)]',
  label:   'block text-[1rem] font-medium mb-2 text-[var(--igv-muted)]',
  error:   'text-[1rem] leading-snug text-[var(--igv-danger)]',
} as const
export const IGV_INPUT = `w-full min-h-[52px] px-4 py-3 rounded-2xl bg-white border border-[var(--igv-line)] text-[1rem] text-[var(--igv-ink)] placeholder:text-[var(--igv-muted)] disabled:opacity-60 ${IGV_FOCUS}`

// ── Botões ───────────────────────────────────────────────────────────

interface GlassButtonProps {
  children: ReactNode
  to?: string
  href?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  variant?: 'default' | 'accent'
  Icon?: PhosphorIcon
  fullWidth?: boolean
  className?: string
  ariaLabel?: string
}

export function GlassButton({ children, to, href, onClick, type = 'button', disabled, variant = 'default', Icon, fullWidth, className = '', ariaLabel }: GlassButtonProps) {
  const cls = `igv-glass ${variant === 'accent' ? 'igv-glass--accent text-white font-semibold' : 'text-[var(--igv-ink)] font-medium'} ${IGV_FOCUS} inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-full text-[1rem] text-center active:scale-[0.98] transition-transform disabled:opacity-60 ${fullWidth ? 'w-full' : ''} ${className}`
  const inner = <>{Icon && <Icon size={ICON_SIZE.button} aria-hidden="true" />}{children}</>
  if (to) return <Link to={to} className={cls} aria-label={ariaLabel}>{inner}</Link>
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={ariaLabel}>{inner}</a>
  return <button type={type} onClick={onClick} disabled={disabled} className={cls} aria-label={ariaLabel}>{inner}</button>
}

interface GlassIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  Icon: PhosphorIcon
  label: string
  to?: string
  active?: boolean
}

export function GlassIconButton({ Icon, label, to, active, className = '', ...rest }: GlassIconButtonProps) {
  const cls = `igv-glass ${IGV_FOCUS} inline-flex items-center justify-center w-12 h-12 shrink-0 rounded-full text-[var(--igv-ink)] active:scale-[0.96] transition-transform ${className}`
  const icon = <Icon size={ICON_SIZE.list} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
  if (to) return <Link to={to} aria-label={label} className={cls}>{icon}</Link>
  return <button type="button" aria-label={label} className={cls} {...rest}>{icon}</button>
}

/** Seletor em pílula: texto escuro; selecionado na cor da IGV com marca de seleção. */
export function GlassChip({ selected, onClick, children, segmented }: { selected: boolean; onClick: () => void; children: ReactNode; segmented?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`igv-glass ${selected ? 'igv-glass--accent text-white font-semibold' : 'igv-glass--inset text-[var(--igv-ink)] font-medium'} ${IGV_FOCUS} inline-flex items-center justify-center gap-1.5 min-h-[48px] ${segmented ? "px-1 w-full" : "px-4"} rounded-full text-[1rem] active:scale-[0.98] transition-transform`}
    >
      {selected && !segmented && <CheckIcon size={ICON_SIZE.button} weight="bold" aria-hidden="true" />}
      {children}
    </button>
  )
}

/** Opção em linha (pessoa, horário) com o mesmo vidro e estado selecionado. */
export function GlassOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`igv-glass igv-glass--inset ${IGV_FOCUS} flex items-center gap-3 w-full min-h-[64px] p-3 rounded-2xl text-left text-[var(--igv-ink)] ${selected ? 'outline outline-2 outline-[var(--igv-accent)]' : ''}`}
    >
      {children}
      {selected && <CheckCircleIcon size={ICON_SIZE.list} weight="fill" className="ml-auto shrink-0 text-[var(--igv-accent)]" aria-hidden="true" />}
    </button>
  )
}

// ── Cartões ──────────────────────────────────────────────────────────

const CARD_BASE = 'igv-glass igv-card rounded-[20px]'

export function GlassCard({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${CARD_BASE} p-5 ${className}`} {...rest}>{children}</div>
}

/** Cartão-link da lista: texto à esquerda, imagem ou ícone quadrado à direita. */
export function GlassLinkCard({ to, title, subtitle, Icon, image }: { to: string; title: string; subtitle?: string; Icon?: AnyIcon; image?: string }) {
  return (
    <Link to={to} className={`${CARD_BASE} ${IGV_FOCUS} flex items-center gap-4 min-h-[88px] p-4 pl-5`}>
      <div className="flex-1 min-w-0">
        <p className={IGV_TEXT.item}>{title}</p>
        {subtitle && <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{subtitle}</p>}
      </div>
      {image
        ? <img src={image} alt="" aria-hidden="true" className="w-[72px] h-[72px] rounded-2xl object-cover shrink-0" />
        : Icon
          ? <IconTile Icon={Icon} />
          : <CaretRightIcon size={ICON_SIZE.button} className="text-[var(--igv-muted)] shrink-0" aria-hidden="true" />}
    </Link>
  )
}

/** Quadrado de ícone dentro de cartões (data, tipo de item). */
export function IconTile({ Icon }: { Icon: AnyIcon }) {
  return <span className="igv-glass igv-glass--tile w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"><Icon size={ICON_SIZE.tile} className="text-[var(--igv-accent)]" aria-hidden="true" /></span>
}

// ── Estrutura da página ──────────────────────────────────────────────

/** Moldura única: fundo, largura, margens e espaço para a barra inferior. */
export function IgvPageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="igv-app min-h-[100svh] flex flex-col">
      <div className={`w-full max-w-[480px] mx-auto flex-1 flex flex-col ${className}`}>{children}</div>
    </div>
  )
}

export function IgvContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`flex-1 px-4 pb-[var(--igv-nav-space)] flex flex-col gap-3 ${className}`}>{children}</main>
}

export function PageHeader({ title, subtitle, backTo = '/igv', onBack }: { title: string; subtitle?: string; backTo?: string; onBack?: () => void }) {
  return (
    <header className="px-5 pb-5 pt-[calc(16px+env(safe-area-inset-top))]">
      {onBack
        ? <GlassIconButton Icon={CaretLeftIcon} label="Voltar" onClick={onBack} />
        : <GlassIconButton Icon={CaretLeftIcon} label="Voltar" to={backTo} />}
      <h1 className={`mt-5 ${IGV_TEXT.display}`}>{title}</h1>
      {subtitle && <p className={`mt-1.5 ${IGV_TEXT.muted}`}>{subtitle}</p>}
    </header>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={`mt-5 px-1 ${IGV_TEXT.title}`}>{children}</h2>
}

/** Estado vazio ou de erro, sempre igual. */
export function IgvNotice({ Icon, title, children, tone = 'default' }: { Icon?: PhosphorIcon; title: string; children?: ReactNode; tone?: 'default' | 'error' }) {
  return (
    <GlassCard className="flex flex-col items-center text-center gap-2 py-8">
      {Icon && <IconTile Icon={Icon} />}
      <p className={tone === 'error' ? `${IGV_TEXT.error} font-semibold` : IGV_TEXT.item}>{title}</p>
      {children && <div className={IGV_TEXT.muted}>{children}</div>}
    </GlassCard>
  )
}

// ── Navegação inferior ───────────────────────────────────────────────

const NAV = [
  { to: '/igv',         label: 'Início',  Icon: ChurchIcon },
  { to: '/igv/biblia',  label: 'Bíblia',  Icon: BibleIcon },
  { to: '/igv/agenda',  label: 'Agenda',  Icon: CalendarCrossIcon },
  { to: '/igv/oracao',  label: 'Oração',  Icon: PrayerHandsIcon },
  { to: '/igv/celulas', label: 'Células', Icon: CommunityIcon },
]

export function GlassNavBar() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Navegação principal"
      className="igv-glass fixed z-40 inset-x-3 max-w-[456px] mx-auto rounded-full p-1.5 flex"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      {NAV.map(({ to, label, Icon }) => {
        const ativo = pathname === to
        return (
          <Link
            key={to}
            to={to}
            aria-current={ativo ? 'page' : undefined}
            className={`${IGV_FOCUS} flex-1 min-w-0 min-h-[56px] rounded-full flex flex-col items-center justify-center gap-0.5 ${ativo ? 'bg-white/70 text-[var(--igv-accent)]' : 'text-[var(--igv-ink)]'}`}
          >
            <Icon size={ICON_SIZE.nav} weight={ativo ? 'fill' : 'regular'} aria-hidden="true" />
            <span className="text-[0.8125rem] font-semibold leading-none">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
