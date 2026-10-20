// Informe de contraste (WCAG 2.x) de los pares texto/fondo de la hostess, con los tokens reales de src/styles/tokens.css.
// Uso: `npm run contraste` (Node 22.18+ ejecuta el .ts sin dependencias). Sale con código 1 si algún par no llega al mínimo.
import { readFileSync } from 'node:fs'
import { evaluarPares, leerTokens } from '../src/utils/contraste.ts'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const resultados = evaluarPares(leerTokens(css))

for (const r of resultados) {
  const marca = r.cumple ? 'OK  ' : 'FALLA'
  console.log(`${marca} ${r.relacion.toFixed(2).padStart(5)}:1 (mín ${r.minimo})  ${r.colorTexto} sobre ${r.colorFondo}  ·  ${r.uso}`)
}
const fallas = resultados.filter((r) => !r.cumple)
console.log(`\n${resultados.length - fallas.length} de ${resultados.length} pares cumplen.`)
process.exit(fallas.length > 0 ? 1 : 0)
