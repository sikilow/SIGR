// Cierre de sesión por inactividad (RNF-011), del lado de la pantalla. La API cierra la sesión del personal si pasan N minutos
// sin actividad; aquí se hace lo mismo con la actividad REAL de la persona (tocar, teclear, mover el mouse), porque las
// consultas automáticas que se repiten solas no cuentan. Se avisa un minuto antes y se puede seguir con un toque.
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** Segundos de aviso antes de cerrar la sesión. */
export const SEGUNDOS_AVISO = 60
/** Cada cuánto como máximo se le avisa a la API que la persona sigue ahí. */
const SEGUNDOS_ENTRE_AVISOS = 30
const EVENTOS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const

export interface OpcionesInactividad {
  /** Minutos sin actividad tras los que se cierra la sesión; 0 o `null` = sin límite. */
  minutos: Ref<number | null | undefined>
  /** Le avisa a la API que la persona sigue ahí (`POST /auth/actividad`). */
  avisarActividad: () => Promise<unknown>
  /** Se llama cuando se acaba el tiempo: debe cerrar la sesión y mandar al inicio de sesión. */
  alVencer: () => void
}

export function useInactividad({ minutos, avisarActividad, alVencer }: OpcionesInactividad) {
  /** Segundos que faltan para cerrar la sesión (solo mientras se muestra el aviso); `null` si no hay aviso. */
  const faltan = ref<number | null>(null)
  const avisoVisible = computed(() => faltan.value !== null)

  let ultimaActividad = Date.now()
  let ultimoAviso = 0
  let reloj: ReturnType<typeof setInterval> | undefined

  const limiteSegundos = () => (minutos.value && minutos.value > 0 ? minutos.value * 60 : 0)

  function enviarAviso() {
    ultimoAviso = Date.now()
    // Si falla (sin red), no pasa nada: se reintenta con la siguiente actividad.
    void avisarActividad().catch(() => undefined)
  }

  /** La persona hizo algo: se reinicia la cuenta y, si hace rato que la API no sabe, se le avisa. */
  function actividad() {
    if (faltan.value !== null) return // con el aviso a la vista solo cuenta «Seguir aquí»
    ultimaActividad = Date.now()
    if (Date.now() - ultimoAviso > SEGUNDOS_ENTRE_AVISOS * 1000) enviarAviso()
  }

  function seguirAqui() {
    ultimaActividad = Date.now()
    faltan.value = null
    enviarAviso()
  }

  function revisar() {
    const limite = limiteSegundos()
    if (!limite) {
      faltan.value = null
      return
    }
    const inactivo = (Date.now() - ultimaActividad) / 1000
    if (inactivo >= limite) {
      detener()
      faltan.value = null
      alVencer()
    } else if (inactivo >= limite - Math.min(SEGUNDOS_AVISO, limite / 2)) {
      // (con límites muy cortos el aviso es de la mitad del tiempo, para no estar siempre a la vista)
      faltan.value = Math.max(1, Math.ceil(limite - inactivo))
    } else {
      faltan.value = null
    }
  }

  function iniciar() {
    detener()
    if (!limiteSegundos()) return
    ultimaActividad = Date.now()
    ultimoAviso = Date.now()
    for (const e of EVENTOS) window.addEventListener(e, actividad, { passive: true, capture: true })
    document.addEventListener('visibilitychange', revisar)
    reloj = setInterval(revisar, 1000)
  }

  function detener() {
    for (const e of EVENTOS) window.removeEventListener(e, actividad, { capture: true })
    document.removeEventListener('visibilitychange', revisar)
    clearInterval(reloj)
    reloj = undefined
  }

  // Si cambia el límite (otro usuario inició sesión, o se cerró la sesión), se reinicia la vigilancia.
  watch(minutos, iniciar, { immediate: true })
  onBeforeUnmount(detener)

  return { faltan, avisoVisible, seguirAqui, revisar }
}
