/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SF Mono',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        bg: {
          DEFAULT: '#0a0a0a',
          1: '#111111',
          2: '#161616',
          3: '#1c1c1c',
          hover: '#1f1f1f',
        },
        border: {
          DEFAULT: '#1f1f1f',
          strong: '#2a2a2a',
          focus: '#3a3a3a',
        },
        fg: {
          DEFAULT: '#ededed',
          dim: '#a1a1a1',
          muted: '#6e6e6e',
          faint: '#4a4a4a',
        },
        priority: {
          urgent: '#e5484d',
          high: '#e9a23b',
          medium: '#3e63dd',
          low: '#6e6e6e',
        },
        success: '#30a46c',
        danger: '#e5484d',
        warning: '#e9a23b',
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        lg: '10px',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
