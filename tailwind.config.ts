import type { Config } from 'tailwindcss'

const v = (nombre: string) => `var(--${nombre})`

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        fondo: v('fondo'),
        superficie: v('superficie'),
        'superficie-2': v('superficie-2'),
        borde: v('borde'),
        'borde-fuerte': v('borde-fuerte'),
        texto: v('texto'),
        'texto-2': v('texto-2'),
        'texto-3': v('texto-3'),
        marca: v('marca'),
        'marca-hover': v('marca-hover'),
        'marca-suave': v('marca-suave'),
        'sobre-marca': v('sobre-marca'),
        error: v('error'),
        'error-suave': v('error-suave'),
        'error-borde': v('error-borde'),
        aviso: v('aviso'),
        'aviso-suave': v('aviso-suave'),
        'aviso-borde': v('aviso-borde'),
        info: v('info'),
        'info-suave': v('info-suave'),
        'info-borde': v('info-borde'),
        exito: v('exito'),
        'exito-suave': v('exito-suave'),
        'exito-borde': v('exito-borde'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
