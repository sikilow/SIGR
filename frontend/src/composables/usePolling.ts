// Ejecuta una tarea de forma periódica con estas garantías:
//  - nunca lanza una ejecución mientras la anterior sigue en curso (sin peticiones encimadas);
//  - se pausa cuando la pestaña está oculta y se reanuda (con una ejecución inmediata) al volver;
//  - se detiene sola al salir de la pantalla que la usa.
import { onScopeDispose } from 'vue'

const INTERVALO_POR_DEFECTO_MS = 10_000
const INTERVALO_MINIMO_MS = 1_000

/** Lee VITE_POLL_MS; si falta o es inválida, usa 10 s. */
export function intervaloDePollingMs(): number {
  const configurado = Number(import.meta.env.VITE_POLL_MS)
  return Number.isFinite(configurado) && configurado >= INTERVALO_MINIMO_MS
    ? configurado
    : INTERVALO_POR_DEFECTO_MS
}

export function usePolling(tarea: () => Promise<unknown>, intervaloMs: number = intervaloDePollingMs()) {
  let temporizador: ReturnType<typeof setTimeout> | null = null
  let activo = false
  let ejecutando = false

  function limpiarTemporizador() {
    if (temporizador !== null) {
      clearTimeout(temporizador)
      temporizador = null
    }
  }

  function programar() {
    limpiarTemporizador()
    if (activo && !document.hidden) temporizador = setTimeout(ejecutar, intervaloMs)
  }

  async function ejecutar() {
    limpiarTemporizador()
    // Si ya hay una en curso, esa misma reprogramará la siguiente al terminar.
    if (ejecutando) return
    ejecutando = true
    try {
      await tarea()
    } catch {
      // La tarea es responsable de mostrar sus errores; el ciclo no debe romperse.
    } finally {
      ejecutando = false
      programar()
    }
  }

  function alCambiarVisibilidad() {
    if (document.hidden) limpiarTemporizador()
    else if (activo) void ejecutar()
  }

  /** Inicia el ciclo con una ejecución inmediata. */
  function iniciar() {
    if (activo) return
    activo = true
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    void ejecutar()
  }

  function detener() {
    activo = false
    limpiarTemporizador()
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }

  onScopeDispose(detener)

  return { iniciar, detener, ejecutarAhora: ejecutar, intervaloMs }
}
