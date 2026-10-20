// Indica si la ventana es "compacta" (tablet vertical, ≤ 860 px, o con poca altura). Sirve para decidir qué se
// renderiza (columna fija vs. barra inferior + diálogo), de modo que nunca haya contenido
// duplicado en el DOM.
import { onScopeDispose, ref } from 'vue'

// Se usa `em` (no px) para que también se active cuando el usuario agranda el texto base del navegador
// (400% de zoom o "texto grande"): 53.75em = 860 px y 37.5em = 600 px con el texto en 16 px.
export const CONSULTA_COMPACTO = '(max-width: 53.75em), (max-height: 37.5em)'

export function useCompacto(consulta = CONSULTA_COMPACTO) {
  const lista = window.matchMedia(consulta)
  const compacto = ref(lista.matches)

  function alCambiar(evento: MediaQueryListEvent) {
    compacto.value = evento.matches
  }

  lista.addEventListener('change', alCambiar)
  onScopeDispose(() => lista.removeEventListener('change', alCambiar))

  return compacto
}
