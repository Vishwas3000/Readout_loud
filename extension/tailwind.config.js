/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './popup/**/*.{html,js}',
    './src/**/*.{html,js}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        kokoro: {
          indigo: '#4f46e5',
          cyan: '#06b6d4',
        }
      },
      animation: {
        'wave': 'wave-dance 0.8s ease-in-out infinite alternate',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'wave-dance': {
          '0%':   { height: '4px'  },
          '100%': { height: '20px' },
        }
      },
    },
  },
  plugins: [],
};
