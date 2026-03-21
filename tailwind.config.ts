import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary:   { DEFAULT: 'hsl(var(--primary))',   foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted:     { DEFAULT: 'hsl(var(--muted))',     foreground: 'hsl(var(--muted-foreground))' },
        accent:    { DEFAULT: 'hsl(var(--accent))',    foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card:      { DEFAULT: 'hsl(var(--card))',      foreground: 'hsl(var(--card-foreground))' },
        popover:   { DEFAULT: 'hsl(var(--popover))',   foreground: 'hsl(var(--popover-foreground))' },
        // Finrok brand
        rok: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c0d4ff',
          400: '#7299f8',
          500: '#4a73f5',
          600: '#2f52d9',
          700: '#2440b0',
          800: '#1e338a',
          900: '#172568',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in':     { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in':    { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'fade-in':        'fade-in 0.25s ease-out',
        'slide-in':       'slide-in 0.3s ease-out',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
