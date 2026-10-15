import type { Usuario } from '../../types'
import { ErrorServicio } from '../errores'
import type { AuthService } from '../interfaces'
import { baseDatos } from './baseDatos'
import { conRetraso } from './utiles'

const CLAVE_SESION = 'sigr.mock.sesion'

/** Lee la sesión simulada; sessionStorage permite que sobreviva a recargar la página. */
export function usuarioActual(): Usuario | null {
  try {
    const guardado = sessionStorage.getItem(CLAVE_SESION)
    return guardado ? (JSON.parse(guardado) as Usuario) : null
  } catch {
    return null
  }
}

function guardarSesion(usuario: Usuario | null): void {
  try {
    if (usuario) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(usuario))
    else sessionStorage.removeItem(CLAVE_SESION)
  } catch {
    // Sin sessionStorage la sesión simulada dura solo hasta recargar.
  }
}

export function crearAuthMock(): AuthService {
  return {
    iniciarSesion(credenciales) {
      return conRetraso(() => {
        const encontrado = baseDatos.usuarios.find(
          (u) => u.activo !== false && u.usuario === credenciales.usuario && u.contrasena === credenciales.contrasena,
        )
        if (!encontrado) {
          throw new ErrorServicio('credenciales_invalidas', 'Usuario o contraseña incorrectos.', 401)
        }
        const usuario: Usuario = { id: encontrado.id, nombre: encontrado.nombre, rol: encontrado.rol }
        guardarSesion(usuario)
        return usuario
      })
    },

    cerrarSesion() {
      return conRetraso(() => {
        guardarSesion(null)
      })
    },

    obtenerSesion() {
      return conRetraso(() => usuarioActual())
    },
  }
}
