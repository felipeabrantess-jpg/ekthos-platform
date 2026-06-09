/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Novos tokens semânticos (mapeados para CSS vars de tokens.css) ──────
        'bg-primary':     'var(--bg-primary)',
        'bg-surface':     'var(--bg-surface)',
        'bg-sidebar':     'var(--bg-sidebar)',
        'bg-hover':       'var(--bg-hover)',
        'border-default': 'var(--border-default)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary':  'var(--text-tertiary)',
        primary:          'var(--color-primary)',
        'primary-text':   'var(--color-primary-text)',
        secondary:        'var(--color-secondary)',
        aurora:           'var(--color-aurora)',
        gold:             'var(--color-gold)',

        // ── Aliases legados — PRESERVADOS até Fase 2 substituir as 358 refs ──
        // NÃO remover antes da Fase 2 estar 100% concluída
        brand: {
          50:  '#FDE8E0',
          100: '#FCCFBF',
          200: '#F9A890',
          300: '#F58060',
          400: '#F25830',
          500: '#FF4D1A',
          600: '#e13500',
          700: '#C42E00',
          800: '#8B2000',
          900: '#5A1500',
        },
        wine: {
          DEFAULT: '#670000',
          light:   '#8B1A1A',
          bg:      '#F5E0E0',
        },
        cream: {
          DEFAULT: '#f9eedc',
          light:   '#FDF6EB',
          dark:    '#EDE0CC',
        },
        ekthos: {
          black:       '#161616',
          'black-lg':  '#2A2A2A',
          'black-soft':'#333333',
        },
        success: {
          DEFAULT: '#2D7A4F',
          bg:      '#E8F5E9',
        },
        warning: {
          DEFAULT: '#C4841D',
          bg:      '#FFF3E0',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bellRing: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%':      { transform: 'rotate(15deg)' },
          '75%':      { transform: 'rotate(-15deg)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.3s ease-out both',
        shimmer:      'shimmer 1.5s infinite linear',
        'bell-ring':  'bellRing 0.4s ease-in-out',
      },
    },
  },
  plugins: [],
}
