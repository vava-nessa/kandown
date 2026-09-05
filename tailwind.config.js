/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'Inter var',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        display: [
          'var(--font-display)',
          'var(--font-sans)',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SF Mono',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        bg: {
          DEFAULT: 'hsl(var(--background) / <alpha-value>)',
          1: 'hsl(var(--card) / <alpha-value>)',
          2: 'hsl(var(--secondary) / <alpha-value>)',
          3: 'hsl(var(--accent) / <alpha-value>)',
          hover: 'hsl(var(--accent) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'hsl(var(--border) / <alpha-value>)',
          strong: 'hsl(var(--border-strong) / <alpha-value>)',
          focus: 'hsl(var(--border-focus) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'hsl(var(--foreground) / <alpha-value>)',
          dim: 'hsl(var(--muted-foreground) / <alpha-value>)',
          muted: 'hsl(var(--muted-foreground) / <alpha-value>)',
          faint: 'hsl(var(--muted-foreground) / 0.55)',
        },
        priority: {
          urgent: '#e5484d',
          high: '#e9a23b',
          medium: '#3e63dd',
          low: '#6e6e6e',
        },
        success: 'hsl(var(--success) / <alpha-value>)',
        danger: 'hsl(var(--destructive) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        // 📖 BeautifulUI design system (beautifului.dev, MIT). The variables
        // live under `.bui` in styles/beautifului.css, so these resolve to the
        // BUI palette inside a .bui wrapper and fall back to the closest
        // Kandown token outside it.
        ink: 'hsl(var(--ink, var(--foreground)) / <alpha-value>)',
        'ink-2': 'hsl(var(--ink-2, var(--muted-foreground)) / <alpha-value>)',
        'ink-3': 'hsl(var(--ink-3, var(--muted-foreground)) / <alpha-value>)',
        canvas: 'hsl(var(--canvas, var(--background)) / <alpha-value>)',
        surface: 'hsl(var(--surface, var(--card)) / <alpha-value>)',
        inset: 'hsl(var(--inset, var(--card)) / <alpha-value>)',
        hover: 'hsl(var(--hover, var(--secondary)) / <alpha-value>)',
        'hover-2': 'hsl(var(--hover-2, var(--secondary)) / <alpha-value>)',
        field: 'hsl(var(--field, var(--secondary)) / <alpha-value>)',
        line: {
          DEFAULT: 'hsl(var(--line, var(--border)) / <alpha-value>)',
          strong: 'hsl(var(--line-strong, var(--border-strong)) / <alpha-value>)',
          soft: 'hsl(var(--line-soft, var(--border)) / <alpha-value>)',
        },
        'accent-ink': 'hsl(var(--accent-ink, var(--accent)) / <alpha-value>)',
        'accent-tint': 'hsl(var(--accent-tint, var(--accent)) / <alpha-value>)',
        green: {
          DEFAULT: 'hsl(var(--green, 144 72% 35%) / <alpha-value>)',
          tint: 'hsl(var(--green-tint, 143 39% 94%) / <alpha-value>)',
        },
        orange: {
          DEFAULT: 'hsl(var(--orange, 27 89% 49%) / <alpha-value>)',
          tint: 'hsl(var(--orange-tint, 30 87% 94%) / <alpha-value>)',
        },
        red: {
          DEFAULT: 'hsl(var(--red, 358 73% 58%) / <alpha-value>)',
          tint: 'hsl(var(--red-tint, 0 71% 96%) / <alpha-value>)',
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius, 6px)',
        sm: 'var(--radius-sm, 4px)',
        lg: 'var(--radius-lg, 10px)',
        xl: 'calc(var(--radius, 6px) * 2)',
        // 📖 BeautifulUI radii (scoped .bui tokens, see beautifului.css).
        control: 'var(--radius-control, 8px)',
        card: 'var(--radius-card, 10px)',
        chip: 'var(--radius-chip, 6px)',
        window: 'var(--radius-window, 14px)',
      },
      boxShadow: {
        hairline: 'var(--shadow-hairline, 0 0 0 1px var(--border))',
        btn: 'var(--shadow-btn, 0 0 0 1px var(--border-strong))',
        card: 'var(--shadow-card, 0 0 0 1px var(--border))',
        overlay: 'var(--shadow-overlay, 0 0 0 1px var(--border))',
        raised: 'var(--shadow-raised, 0 0 0 1px var(--border))',
      },
      spacing: {
        '4.5': '1.125rem',
      },
      maxWidth: {
        95: '23.75rem',
      },
      transitionDuration: {
        400: '400ms',
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
