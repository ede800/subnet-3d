/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#01030a',
        abyss: '#030b1c',
        neon: {
          cyan: '#00e5ff',
          magenta: '#ff2bd6',
          green: '#00ffa3',
          amber: '#ffc400',
          orange: '#ff9100',
          red: '#ff1744',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'Orbitron', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 24px rgba(0, 229, 255, 0.18)',
        alert: '0 0 24px rgba(255, 23, 68, 0.35)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.6)', opacity: '0.9' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        scan: 'scan 7s linear infinite',
      },
    },
  },
  plugins: [],
};
