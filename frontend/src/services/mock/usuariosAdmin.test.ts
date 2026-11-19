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

describe('mock: teléfono de usuarios', () => {
  const nuevo = (telefono?: string) => ({
    nombre: 'Prueba Teléfono',
    correo: `t${Math.random().toString(36).slice(2, 8)}@correo.com`,
    nombreUsuario: `tel${Math.random().toString(36).slice(2, 8)}`,
    contrasena: 'clave1234',
    rol: 'mesero' as const,
    telefono,
  })

  it('es opcional, acepta 10 dígitos con espacios o guiones y los guarda solo como dígitos', async () => {
    const { usuarios } = await nuevoMock()
    iniciarSesionGerente()
    expect((await resolver(usuarios.crear(nuevo()))).telefono).toBeNull()
    expect((await resolver(usuarios.crear(nuevo('311 555 0101')))).telefono).toBe('3115550101')
    expect((await resolver(usuarios.crear(nuevo('(311) 555-0102')))).telefono).toBe('3115550102')
  })

  it('rechaza teléfonos que no tienen 10 dígitos', async () => {
    const { usuarios } = await nuevoMock()
    iniciarSesionGerente()
    expect(await codigoDeError(usuarios.crear(nuevo('31155501')))).toBe('estado_invalido')
    expect(await codigoDeError(usuarios.crear(nuevo('311555010123')))).toBe('estado_invalido')
    expect(await codigoDeError(usuarios.crear(nuevo('311555abcd')))).toBe('estado_invalido')
  })

  it('no permite repetir el teléfono de otro usuario, pero sí conservar el propio', async () => {
    const { usuarios } = await nuevoMock()
    iniciarSesionGerente()
    const primero = await resolver(usuarios.crear(nuevo('3115550199')))
    expect(await codigoDeError(usuarios.crear(nuevo('311 555 0199')))).toBe('estado_invalido')
    expect((await resolver(usuarios.actualizar(primero.idUsuario, { telefono: '3115550199' }))).telefono).toBe('3115550199')
    const segundo = await resolver(usuarios.crear(nuevo('3115550198')))
    expect(await codigoDeError(usuarios.actualizar(segundo.idUsuario, { telefono: '3115550199' }))).toBe('estado_invalido')
  })
})

describe('mock: eliminar y restaurar usuarios (eliminado lógico)', () => {
  it('un usuario eliminado sale de la lista, no puede entrar y se restaura inactivo', async () => {
    const { usuarios, baseDatos } = await nuevoMock()
    iniciarSesionGerente()

    const eliminado = await resolver(usuarios.eliminar(1))
    expect(eliminado.eliminadoEn).toBeInstanceOf(Date)
    expect(eliminado.activo).toBe(false)
    expect(baseDatos.usuarios.find((u) => u.idUsuario === 1)?.activo).toBe(false) // ya no puede iniciar sesión

    expect((await resolver(usuarios.listar())).some((u) => u.idUsuario === 1)).toBe(false)
    expect((await resolver(usuarios.listar({ eliminados: true }))).map((u) => u.idUsuario)).toEqual([1])

    const restaurado = await resolver(usuarios.restaurar(1))
    expect(restaurado.eliminadoEn).toBeNull()
    expect(restaurado.activo).toBe(false) // vuelve inactivo
    expect((await resolver(usuarios.listar())).some((u) => u.idUsuario === 1)).toBe(true)

    const reactivado = await resolver(usuarios.actualizar(1, { activo: true }))
    expect(reactivado.activo).toBe(true)
  })

  it('no se elimina a uno mismo, ni al primer gerente, ni dos veces; ni se edita un eliminado', async () => {
    const { usuarios } = await nuevoMock()
    iniciarSesionGerente() // la sesión es el usuario 2 (primer gerente)

    expect(await codigoDeError(usuarios.eliminar(2))).toBe('estado_invalido')
    await resolver(usuarios.eliminar(1))
    expect(await codigoDeError(usuarios.eliminar(1))).toBe('estado_invalido')
    expect(await codigoDeError(usuarios.actualizar(1, { nombre: 'Otro Nombre' }))).toBe('estado_invalido')
    expect(await codigoDeError(usuarios.restaurar(3))).toBe('estado_invalido') // vigente
  })

  it('crear un usuario igual a uno eliminado avisa que hay que restaurarlo', async () => {
    const { usuarios } = await nuevoMock()
    iniciarSesionGerente()
    const original = (await resolver(usuarios.listar())).find((u) => u.idUsuario === 1)!
    await resolver(usuarios.eliminar(1))

    const intento = usuarios.crear({ nombre: 'Otra Persona', correo: 'otro@correo.com', nombreUsuario: original.nombreUsuario, contrasena: 'secreta123', rol: 'mesero' })
    await expect(resolver(intento)).rejects.toThrow(/eliminado/)
  })
})
