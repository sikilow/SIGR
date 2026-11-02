import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function nuevoMock() {
  vi.resetModules()
  const [{ crearUsuariosMock }, { baseDatos }] = await Promise.all([import('./adminMock'), import('./baseDatos')])
  return { usuarios: crearUsuariosMock(), baseDatos }
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
    const codigo = (error as { codigo?: string }).codigo
    if (codigo) return codigo
    throw error
  }
  return 'sin error'
}

function iniciarSesionGerente(): void {
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((clave: string) =>
      clave === 'sigr.mock.sesion' ? JSON.stringify({ id: 2 }) : null,
    ),
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mock: protecciones de usuarios', () => {
  it('marca y no permite desactivar o cambiar el rol del primer gerente', async () => {
    const { usuarios } = await nuevoMock()
    iniciarSesionGerente()

    const lista = await resolver(usuarios.listar())
    expect(lista.find((usuario) => usuario.idUsuario === 2)?.esPrimerGerente).toBe(true)
    expect(await codigoDeError(usuarios.actualizar(2, { activo: false }))).toBe('estado_invalido')
    expect(await codigoDeError(usuarios.actualizar(2, { rol: 'mesero' }))).toBe('estado_invalido')
  })

  it('requiere la contraseña anterior del usuario aunque Gerencia inicie el cambio', async () => {
    const { usuarios, baseDatos } = await nuevoMock()
    iniciarSesionGerente()

    expect(await codigoDeError(usuarios.cambiarContrasena(2, 'nueva123', 'incorrecta'))).toBe('credenciales_invalidas')
    await resolver(usuarios.cambiarContrasena(2, 'nueva123', '1234'))
    expect(await codigoDeError(usuarios.cambiarContrasena(1, 'restablecida123', 'incorrecta'))).toBe('credenciales_invalidas')
    await resolver(usuarios.cambiarContrasena(1, 'restablecida123', '1234'))

    expect(baseDatos.usuarios.find((usuario) => usuario.idUsuario === 2)?.contrasena).toBe('nueva123')
    expect(baseDatos.usuarios.find((usuario) => usuario.idUsuario === 1)?.contrasena).toBe('restablecida123')
  })
})
