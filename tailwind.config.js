/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        'none': '0',
        DEFAULT: '0',
      },
      colors: {
        primary: {
          light: '#ffffff',
          dark: '#000000',
        },
        secondary: {
          light: '#f5f5f5',
          dark: '#1a1a1a',
        },
        hover: {
          light: '#e0e0e0',
          dark: '#333333',
        },
        border: {
          light: '#cccccc',
          dark: '#333333',
        },
      },
    },
  },
  plugins: [],
}