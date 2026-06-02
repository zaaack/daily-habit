/** @type {import('tailwindcss').Config} */
const slateShades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const slateVar = (k) => `rgb(var(--c-slate-${k}) / <alpha-value>)`
const slateMap = Object.fromEntries(slateShades.map((k) => [k, slateVar(k)]))

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: slateMap,
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'scale-in': 'scale-in 120ms ease-out',
      },
    },
  },
  plugins: [],
}
