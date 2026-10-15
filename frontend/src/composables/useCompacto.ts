// Indica si la ventana es "compacta" (tablet vertical, ≤ 860 px). Sirve para decidir qué se
// renderiza (columna fija vs. barra inferior + diálogo), de modo que nunca haya contenido
// duplicado en el DOM.
import { onScopeDispose, ref } from 'vue'

export function useCompacto(consulta = '(max-width: 860px)') {
  const lista = window.matchMedia(consulta)
  const compacto = ref(lista.matches)

  function alCambiar(evento: MediaQueryListEvent) {
    compacto.value = evento.matches
  }

  lista.addEventListener('change', alCambiar)
  onScopeDispose(() => lista.removeEventListener('change', alCambiar))

  return compacto
}
