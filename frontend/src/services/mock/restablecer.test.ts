import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function nuevoMock() {
  vi.resetModules()
  const [{ crearAuthMock }, { crearUsuariosMock }, { baseDatos }] = await Promise.all([
    import('./authMock'),
    import('./adminMock'),
    import('./baseDatos'),
  ])
  return { auth: crearAuthMock(), usuarios: crearUsuariosMock(), baseDatos }
}

async function resolver<T>(promesa: Promise<T>): Promise<T> {
  const resultado = promesa.then(
    (valor) => ({ valor }),
    (error: unknown) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(400)
  const resuelto = await resultado
  if ('error' in resuelto) throw resuelto.error
  return resuelto.valor
}

async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await resolver(promesa)
  } catch (error) {
    return (error as { codigo?: string }).codigo ?? 'otro'
  }
  return 'sin error'
}

const tokenDe = (enlace: string | undefined) => new URLSearchParams(enlace?.split('?')[1]).get('token') ?? ''

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mock: recuperar contraseña con enlace', () => {
  it('responde lo mismo exista o no la cuenta', async () => {
    const { auth } = await nuevoMock()
    const existe = await resolver(auth.solicitarRecuperacion('mesero'))
    const noExiste = await resolver(auth.solicitarRecuperacion('nadie'))
    expect(existe.mensaje).toBe(noExiste.mensaje)
    expect(existe.enlaceDemo).toMatch(/^\/restablecer\?token=/)
    expect(noExiste.enlaceDemo).toBeUndefined()
  })

  it('el enlace sirve una sola vez y deja entrar con la contraseña nueva', async () => {
    const { auth } = await nuevoMock()
    const { enlaceDemo } = await resolver(auth.solicitarRecuperacion('ana.torres@lamadalena.example'))
    const token = tokenDe(enlaceDemo)

    expect(await resolver(auth.validarEnlaceRestablecer(token))).toEqual({ nombreUsuario: 'mesero', nombre: 'Ana Torres' })
    expect(await codigoDeError(auth.restablecerContrasena(token, '123'))).toBe('estado_invalido')
    await resolver(auth.restablecerContrasena(token, 'nueva123'))

    expect(await codigoDeError(auth.restablecerContrasena(token, 'otra456'))).toBe('enlace_invalido')
    expect(await codigoDeError(auth.iniciarSesion({ nombreUsuario: 'mesero', contrasena: '1234' }))).toBe('credenciales_invalidas')
    expect((await resolver(auth.iniciarSesion({ nombreUsuario: 'mesero', contrasena: 'nueva123' }))).nombre).toBe('Ana Torres')
  })

  it('pedir otro enlace invalida el anterior y caduca en 1 hora', async () => {
    const { auth } = await nuevoMock()
    const primero = tokenDe((await resolver(auth.solicitarRecuperacion('cajero'))).enlaceDemo)
    const segundo = tokenDe((await resolver(auth.solicitarRecuperacion('cajero'))).enlaceDemo)
    expect(await codigoDeError(auth.validarEnlaceRestablecer(primero))).toBe('enlace_invalido')
    expect(await codigoDeError(auth.validarEnlaceRestablecer(segundo))).toBe('sin error')

    vi.setSystemTime(Date.now() + 61 * 60_000)
    expect(await codigoDeError(auth.validarEnlaceRestablecer(segundo))).toBe('enlace_invalido')
  })

  it('el gerente manda el enlace, ve el correo enmascarado y hay límite por hora', async () => {
    const { usuarios } = await nuevoMock()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await resolver(usuarios.enviarRestablecimiento(3))).toMatch(/^c\*\*\*@/)
    await resolver(usuarios.enviarRestablecimiento(3))
    await resolver(usuarios.enviarRestablecimiento(3))
    expect(await codigoDeError(usuarios.enviarRestablecimiento(3))).toBe('estado_invalido')
    expect(await codigoDeError(usuarios.enviarRestablecimiento(999))).toBe('no_encontrado')
  })
})
