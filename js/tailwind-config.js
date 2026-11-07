tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Noto Serif SC"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        parchment: {
          50: '#FBF9F5',
          100: '#F5EFEB',
          200: '#EAE1D7',
          300: '#DACBBC',
          700: '#5C4F43',
          800: '#3D332A',
          900: '#211B16',
        },
        obsidian: {
          800: '#1C1D24',
          850: '#16171D',
          900: '#111216',
          950: '#0B0C0E',
        },
        accentGold: {
          300: '#F0D488',
          400: '#E5C07B',
          500: '#D4A346',
          600: '#B88628',
          700: '#8C6316',
        }
      }
    }
  }
};
