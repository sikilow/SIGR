// Contraste de color (WCAG 2.x) y la lista de pares texto/fondo que usan las pantallas de la hostess. Es TypeScript puro y
// sin imports para poder usarse desde las pruebas (`contraste.test.ts`) y desde `scripts/contraste.mjs` (`npm run contraste`).

/** Mínimo exigido según el tipo de par: texto normal 4.5:1; texto grande (≥ 24 px o ≥ 18.66 px en negrita) y no texto 3:1. */
export const MINIMO_POR_TIPO = { texto: 4.5, grande: 3, 'no-texto': 3 } as const
export type TipoPar = keyof typeof MINIMO_POR_TIPO

export interface ParContraste {
  /** Dónde se usa (para el informe). */
  uso: string
  /** Token de color del primer plano, sin `--` (p. ej. `color-listo-texto`). */
  texto: string
  /** Token de color del fondo. */
  fondo: string
  tipo: TipoPar
}

/** Cada par se usa en las pantallas de la hostess (insignias, botones, avisos, marcas, tarjetas y navegación). */
export const PARES_HOSTESS: readonly ParContraste[] = [
  // --- Insignias de estado (mesa, reservación, espera): texto oscuro de la paleta sobre blanco ---
  { uso: 'Insignia Libre / Llegó / Asignada (texto)', texto: 'color-libre-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Insignia Ocupada (texto)', texto: 'color-ocupada-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Insignia Reservada / Confirmada y hora de la reservación (texto)', texto: 'color-reservada-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Insignia Pendiente / Esperando y «hace 25 min» (texto)', texto: 'color-listo-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Insignia Cancelada y «hace…» de espera larga (texto)', texto: 'color-peligro-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Insignia sin estado conocido (texto)', texto: 'color-text', fondo: 'color-surface', tipo: 'texto' },
  // --- Íconos y bordes de las insignias (no texto) ---
  { uso: 'Ícono/borde Libre, Llegó, Asignada', texto: 'color-libre', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Ícono/borde Ocupada', texto: 'color-ocupada', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Ícono/borde Reservada, Confirmada', texto: 'color-reservada', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Ícono/borde Pendiente, Esperando', texto: 'color-listo', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Ícono/borde Cancelada y Espera larga', texto: 'color-peligro', fondo: 'color-surface', tipo: 'no-texto' },
  // --- Marcas y avisos ---
  { uso: 'Marca «Espera larga», resumen de errores y aviso de espera larga', texto: 'color-peligro-texto', fondo: 'color-peligro-fondo', tipo: 'texto' },
  { uso: 'Aviso de capacidad / mesa reservada («Aviso:»)', texto: 'color-listo-texto', fondo: 'color-listo-fondo', tipo: 'texto' },
  { uso: 'Mensaje de error bajo un campo y avisos de error', texto: 'color-error', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Cliente elegido y «Sugerida»', texto: 'color-libre-texto', fondo: 'color-surface', tipo: 'texto' },
  // --- Botones ---
  { uso: 'Botón primario (texto)', texto: 'color-on-primary', fondo: 'color-primary', tipo: 'texto' },
  { uso: 'Botón primario al pasar el puntero, chip activo (texto)', texto: 'color-on-primary', fondo: 'color-primary-dark', tipo: 'texto' },
  { uso: 'Botón secundario (texto)', texto: 'color-primary-dark', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Botón secundario al pasar el puntero y navegación activa (texto)', texto: 'color-primary-dark', fondo: 'color-bg', tipo: 'texto' },
  { uso: 'Botón destructivo (texto)', texto: 'color-on-primary', fondo: 'color-peligro', tipo: 'texto' },
  { uso: 'Botón destructivo al pasar el puntero (texto)', texto: 'color-on-primary', fondo: 'color-peligro-texto', tipo: 'texto' },
  { uso: 'Botón destructivo suave (texto)', texto: 'color-peligro-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Botón destructivo suave al pasar el puntero (texto)', texto: 'color-peligro-texto', fondo: 'color-peligro-fondo', tipo: 'texto' },
  { uso: 'Botón deshabilitado (texto)', texto: 'color-deshabilitado-texto', fondo: 'color-deshabilitado-fondo', tipo: 'texto' },
  { uso: 'Borde de botones y campos', texto: 'color-muted', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Borde de campos, chips y selectores (v2)', texto: 'color-borde-control', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Navegación activa y botón secundario al pasar el puntero (v2)', texto: 'color-primary-dark', fondo: 'color-primary-suave', tipo: 'texto' },
  { uso: 'Texto principal sobre avisos de información (v2)', texto: 'color-text', fondo: 'color-primary-suave', tipo: 'texto' },
  { uso: 'Texto de error sobre aviso de error (v2)', texto: 'color-error', fondo: 'color-peligro-fondo', tipo: 'texto' },
  { uso: 'Barra superior: texto claro sobre el extremo oscuro del degradado (v2)', texto: 'color-on-primary', fondo: 'color-primary-dark', tipo: 'texto' },
  // El borde de un botón deshabilitado (#c9bbaa, 1.88:1) NO se exige: WCAG 1.4.11 exime a los componentes inactivos.
  // Su texto sí se comprueba arriba (deshabilitado-texto sobre deshabilitado-fondo).
  // --- Texto general, tarjetas y navegación ---
  { uso: 'Aviso emergente («Mesa 4 asignada a …»)', texto: 'color-entregado-texto', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Texto principal sobre tarjetas y diálogos', texto: 'color-text', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Texto principal sobre el fondo de la página y tarjetas atenuadas', texto: 'color-text', fondo: 'color-bg', tipo: 'texto' },
  { uso: 'Texto secundario (capacidad, teléfono, detalle) sobre tarjetas', texto: 'color-muted', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Texto secundario sobre tarjetas atenuadas (Libre, Reservada, Llegó…)', texto: 'color-muted', fondo: 'color-bg', tipo: 'texto' },
  { uso: 'Número de mesa atenuado (texto grande en negrita)', texto: 'color-muted', fondo: 'color-bg', tipo: 'grande' },
  { uso: 'Navegación inferior (texto)', texto: 'color-muted', fondo: 'color-surface', tipo: 'texto' },
  { uso: 'Barra superior (texto)', texto: 'color-on-primary', fondo: 'color-primary', tipo: 'texto' },
  { uso: 'Anillo de foco sobre tarjetas', texto: 'color-primary-dark', fondo: 'color-surface', tipo: 'no-texto' },
  { uso: 'Anillo de foco sobre el fondo de la página', texto: 'color-primary-dark', fondo: 'color-bg', tipo: 'no-texto' },
]

/** Lee las variables `--nombre: #rrggbb;` de un CSS (solo colores hexadecimales). */
export function leerTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]!] = m[2]!
  return tokens
}

/** «#rrggbb» → [r, g, b] (0–255). */
export function hexARgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luminancia relativa de WCAG 2.x. */
export function luminancia(hex: string): number {
  const [r, g, b] = hexARgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Relación de contraste entre dos colores (de 1 a 21). */
export function relacionContraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number]
  return (claro + 0.05) / (oscuro + 0.05)
}

export interface ResultadoPar extends ParContraste {
  colorTexto: string
  colorFondo: string
  relacion: number
  minimo: number
  cumple: boolean
}

/** Evalúa cada par con los colores de `tokens`. Un token que no existe lanza un error (p. ej. por un nombre mal escrito). */
export function evaluarPares(tokens: Record<string, string>, pares: readonly ParContraste[] = PARES_HOSTESS): ResultadoPar[] {
  return pares.map((par) => {
    const colorTexto = tokens[par.texto]
    const colorFondo = tokens[par.fondo]
    if (!colorTexto || !colorFondo) throw new Error(`Falta el token ${!colorTexto ? par.texto : par.fondo} (${par.uso})`)
    const relacion = relacionContraste(colorTexto, colorFondo)
    const minimo = MINIMO_POR_TIPO[par.tipo]
    // Se compara con dos decimales de tolerancia hacia abajo (4.499 no cuenta como 4.5).
    return { ...par, colorTexto, colorFondo, relacion, minimo, cumple: relacion >= minimo }
  })
}
