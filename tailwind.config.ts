import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "grove-bg": "#f5efe4",
        "grove-surface": "#faf6f0",
        "grove-border": "#d4c4a8",
        "grove-text": "#5a4632",
        "grove-text-muted": "#9a8570",
        "grove-text-dim": "#b8956a",
        "grove-accent": "#c4935a",
        "grove-accent-deep": "#6b5744",
        "grove-green": "#7a8b6a",
        "grove-green-deep": "#5a7a4a",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
