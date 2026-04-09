import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ADORS Brand Palette
        brand: {
          DEFAULT: '#0072CE',
          50:  '#EBF5FF',
          100: '#D6EBFF',
          200: '#ADD7FF',
          300: '#84C3FF',
          400: '#5AAFFF',
          500: '#0072CE',
          600: '#005BA5',
          700: '#00437C',
          800: '#002C52',
          900: '#001429',
        },
        // Severity
        critical: {
          DEFAULT: '#EF4444',
          light:   '#FEE2E2',
          dark:    '#B91C1C',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light:   '#FEF3C7',
          dark:    '#B45309',
        },
        success: {
          DEFAULT: '#10B981',
          light:   '#D1FAE5',
          dark:    '#047857',
        },
        // Mission Control dark palette
        slate: {
          850: '#18202E',
          950: '#0C1220',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-in-out',
        'slide-up':   'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
