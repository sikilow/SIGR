import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { SEGUNDOS_AVISO, useInactividad } from './useInactividad'

// Un «window» y un «document» mínimos: la prueba corre en node, sin navegador.
function instalarNavegadorFalso() {
  const oyentes = new Map<string, Set<() => void>>()
  const objetivo = {
    addEventListener: (tipo: string, fn: () => void) => {
      if (!oyentes.has(tipo)) oyentes.set(tipo, new Set())
      oyentes.get(tipo)!.add(fn)
    },
    removeEventListener: (tipo: string, fn: () => void) => oyentes.get(tipo)?.delete(fn),
  }
  vi.stubGlobal('window', objetivo)
  vi.stubGlobal('document', objetivo)
  return { tocar: () => oyentes.get('pointerdown')?.forEach((fn) => fn()), oyentes }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('cierre de sesión por inactividad (pantalla)', () => {
  it('avisa un minuto antes y cierra la sesión al llegar al límite', async () => {
    instalarNavegadorFalso()
    const alVencer = vi.fn()
    const minutos = ref<number | null>(15)
    const { faltan, avisoVisible } = useInactividad({ minutos, avisarActividad: async () => undefined, alVencer })
    await nextTick()

    vi.advanceTimersByTime((15 * 60 - SEGUNDOS_AVISO - 5) * 1000)
    expect(avisoVisible.value).toBe(false)

    vi.advanceTimersByTime(6 * 1000)
    expect(avisoVisible.value).toBe(true)
    expect(faltan.value).toBeLessThanOrEqual(SEGUNDOS_AVISO)
    expect(alVencer).not.toHaveBeenCalled()

    vi.advanceTimersByTime(SEGUNDOS_AVISO * 1000)
    expect(alVencer).toHaveBeenCalledTimes(1)
    expect(avisoVisible.value).toBe(false)
  })

  it('tocar la pantalla reinicia la cuenta y le avisa a la API', async () => {
    const { tocar } = instalarNavegadorFalso()
    const avisar = vi.fn(async () => undefined)
    const alVencer = vi.fn()
    useInactividad({ minutos: ref(15), avisarActividad: avisar, alVencer })
    await nextTick()

    vi.advanceTimersByTime(10 * 60 * 1000)
    tocar()
    expect(avisar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10 * 60 * 1000) // 20 min en total, pero solo 10 desde que tocó
    expect(alVencer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(6 * 60 * 1000)
    expect(alVencer).toHaveBeenCalledTimes(1)
  })

  it('no manda un aviso a la API por cada toque: como mucho uno cada 30 segundos', async () => {
    const { tocar } = instalarNavegadorFalso()
    const avisar = vi.fn(async () => undefined)
    useInactividad({ minutos: ref(15), avisarActividad: avisar, alVencer: vi.fn() })
    await nextTick()
    vi.advanceTimersByTime(60 * 1000)
    for (let i = 0; i < 20; i++) tocar()
    expect(avisar).toHaveBeenCalledTimes(1)
  })

  it('con el aviso a la vista, «Seguir aquí» mantiene la sesión', async () => {
    instalarNavegadorFalso()
    const alVencer = vi.fn()
    const avisar = vi.fn(async () => undefined)
    const { avisoVisible, seguirAqui } = useInactividad({ minutos: ref(15), avisarActividad: avisar, alVencer })
    await nextTick()
    vi.advanceTimersByTime((15 * 60 - 30) * 1000)
    expect(avisoVisible.value).toBe(true)
    seguirAqui()
    expect(avisoVisible.value).toBe(false)
    expect(avisar).toHaveBeenCalled()
    vi.advanceTimersByTime(14 * 60 * 1000)
    expect(alVencer).not.toHaveBeenCalled()
  })

  it('sin límite (0) no vigila nada', async () => {
    const { oyentes } = instalarNavegadorFalso()
    const alVencer = vi.fn()
    const { avisoVisible } = useInactividad({ minutos: ref(0), avisarActividad: async () => undefined, alVencer })
    await nextTick()
    vi.advanceTimersByTime(24 * 3600 * 1000)
    expect(alVencer).not.toHaveBeenCalled()
    expect(avisoVisible.value).toBe(false)
    expect(oyentes.size).toBe(0)
  })

  it('al cambiar el límite (otra persona inicia sesión) se reinicia la vigilancia', async () => {
    instalarNavegadorFalso()
    const alVencer = vi.fn()
    const minutos = ref<number | null>(0)
    useInactividad({ minutos, avisarActividad: async () => undefined, alVencer })
    await nextTick()
    minutos.value = 1
    await nextTick()
    vi.advanceTimersByTime(61 * 1000)
    expect(alVencer).toHaveBeenCalledTimes(1)
  })

  it('con un límite muy corto (1 minuto) el aviso es de 30 segundos, no de todo el minuto', async () => {
    instalarNavegadorFalso()
    const { avisoVisible } = useInactividad({ minutos: ref(1), avisarActividad: async () => undefined, alVencer: vi.fn() })
    await nextTick()
    vi.advanceTimersByTime(20 * 1000)
    expect(avisoVisible.value).toBe(false)
    vi.advanceTimersByTime(11 * 1000)
    expect(avisoVisible.value).toBe(true)
  })
})
