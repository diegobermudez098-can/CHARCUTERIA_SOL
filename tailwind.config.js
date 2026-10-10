/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { sol: { 50: '#fff8eb', 100: '#ffefc6', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 900: '#451a03' } },
    },
  },
  plugins: [],
}
