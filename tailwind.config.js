/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#06090e',
          900: '#0b111e',
          850: '#0f172a',
          800: '#152037',
          700: '#1e293b',
          600: '#334155',
        },
        chord: {
          blue: '#38bdf8', // bright sky blue for chords
          glow: '#60a5fa',
        },
        accent: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#3b82f6',
          dark: '#1e40af',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
