/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        retro: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
          yellow: '#FBBF24',
          'yellow-hover': '#F59E0B',
          'yellow-dark': '#D97706',
          dark: '#0F172A',
          'dark-surface': '#1E293B',
          muted: '#64748B',
          text: '#0F172A',
        },
        badge: {
          'green-bg': '#DCFCE7',
          'green-text': '#166534',
          'yellow-bg': '#FEF3C7',
          'yellow-text': '#B45309',
          'red-bg': '#FEE2E2',
          'red-text': '#991B1B',
        }
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
