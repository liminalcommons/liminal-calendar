import type { Config } from "tailwindcss";

function withOpacity(varName: string) {
  return `rgb(var(${varName}) / <alpha-value>)`;
}

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "grove-bg": withOpacity("--grove-bg"),
        "grove-surface": withOpacity("--grove-surface"),
        "grove-border": withOpacity("--grove-border"),
        "grove-text": withOpacity("--grove-text"),
        "grove-text-muted": withOpacity("--grove-text-muted"),
        "grove-text-dim": withOpacity("--grove-text-dim"),
        "grove-accent": withOpacity("--grove-accent"),
        "grove-accent-deep": withOpacity("--grove-accent-deep"),
        "grove-green": withOpacity("--grove-green"),
        "grove-green-deep": withOpacity("--grove-green-deep"),
        "grove-hour-golden": withOpacity("--grove-hour-golden"),
        "grove-hour-off": withOpacity("--grove-hour-off"),
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
