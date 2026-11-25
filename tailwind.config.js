/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        serif: ['"Old Standard TT"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: '#ece2c6',
        paper2: '#e2d6b4',
        ink: '#1a1712',
        soft: '#5b5242',
        faint: '#cdbf9a',
        red: '#8c1d18',
        green: '#2f5d3a',
      },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'none' } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        stamp: { from: { opacity: 0, transform: 'rotate(-14deg) scale(2.2)' }, to: { opacity: 1, transform: 'rotate(-8deg) scale(1)' } },
        bulb: { '0%': { opacity: 0.95 }, '100%': { opacity: 0 } },
      },
      animation: {
        rise: 'rise 0.45s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fade 0.4s ease both',
        stamp: 'stamp 0.5s cubic-bezier(.2,.9,.3,1.2) 0.25s both',
        bulb: 'bulb 0.7s ease-out both',
      },
    },
  },
  plugins: [],
};
