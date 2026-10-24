import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})

import { router } from './index'

describe('ruta de configuración de reservaciones del gerente', () => {
  it('permite acceso al gerente y registra la pantalla bajo su sección', () => {
    const ruta = router.resolve({ name: 'gerente-reservaciones' })

    expect(ruta.path).toBe('/gerente/reservaciones')
    expect(ruta.matched.some((registro) => registro.meta.roles?.includes('gerente'))).toBe(true)
    expect(ruta.matched.some((registro) => registro.meta.roles?.includes('mesero'))).toBe(false)
  })
})
