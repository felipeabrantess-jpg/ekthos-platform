/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ekthos brand — vermelho (cor primaria)
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
        // Ekthos wine — profundidade espiritual
        wine: {
          DEFAULT: '#670000',
          light:   '#8B1A1A',
          bg:      '#F5E0E0',
        },
        // Ekthos cream — fundo geral
        cream: {
          DEFAULT: '#f9eedc',
          light:   '#FDF6EB',
          dark:    '#EDE0CC',
        },
        // Ekthos black — sidebar, textos
        ekthos: {
          black:       '#161616',
          'black-lg':  '#2A2A2A',
          'black-soft':'#333333',
        },
        // Semanticas
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
          to:   { opacity: '1', transform: 'translateY(0)' },
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
