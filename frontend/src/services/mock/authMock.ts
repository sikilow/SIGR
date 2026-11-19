import type { Usuario } from '../../types'
import { ErrorServicio } from '../errores'
import type { AuthService } from '../interfaces'
import { baseDatos } from './baseDatos'
import { conRetraso } from './utiles'
import { crearEnlaceMock, usarEnlaceMock, usuarioDeEnlaceMock } from './restablecerMock'

const MENSAJE_GENERICO =
  'Si el usuario o correo pertenece a un empleado activo, le enviamos un enlace para crear una contraseña nueva. Revisa tu correo (también en spam).'

const CLAVE_SESION = 'sigr.mock.sesion'

/**
 * Lee la sesión simulada; sessionStorage permite que sobreviva a recargar la página. Una sesión guardada con
 * la forma anterior (`id` en lugar de `idUsuario`) se descarta: obliga a iniciar sesión de nuevo.
 */
export function usuarioActual(): Usuario | null {
  try {
    const guardado = sessionStorage.getItem(CLAVE_SESION)
    const usuario = guardado ? (JSON.parse(guardado) as Partial<Usuario>) : null
    return usuario && typeof usuario.idUsuario === 'number' ? (usuario as Usuario) : null
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
          (u) =>
            u.activo !== false && u.nombreUsuario === credenciales.nombreUsuario && u.contrasena === credenciales.contrasena,
        )
        if (!encontrado) {
          throw new ErrorServicio('credenciales_invalidas', 'Usuario o contraseña incorrectos.', 401)
        }
        // Al cliente solo llega el perfil: nunca el acceso (`nombreUsuario`, `contrasena`).
        const usuario: Usuario = {
          idUsuario: encontrado.idUsuario,
          idRol: encontrado.idRol,
          nombre: encontrado.nombre,
          correo: encontrado.correo,
          activo: encontrado.activo !== false,
          rol: encontrado.rol,
        }
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

    solicitarRecuperacion(usuarioOCorreo) {
      return conRetraso(() => {
        const buscado = usuarioOCorreo.trim().toLowerCase()
        if (buscado === '') throw new ErrorServicio('estado_invalido', 'Escribe tu usuario o tu correo.', 422)
        const u = baseDatos.usuarios.find(
          (x) => x.activo !== false && (x.nombreUsuario.toLowerCase() === buscado || x.correo.toLowerCase() === buscado),
        )
        const enlaceDemo = u ? crearEnlaceMock(u.idUsuario) : null
        return enlaceDemo ? { mensaje: MENSAJE_GENERICO, enlaceDemo } : { mensaje: MENSAJE_GENERICO }
      })
    },

    validarEnlaceRestablecer(token) {
      return conRetraso(() => {
        const usuario = usuarioDeEnlaceMock(token)
        return { nombreUsuario: usuario.nombreUsuario, nombre: usuario.nombre }
      })
    },

    restablecerContrasena(token, contrasena) {
      return conRetraso(() => {
        if (contrasena.length < 6) throw new ErrorServicio('estado_invalido', 'contrasena: mínimo 6 caracteres', 422)
        usarEnlaceMock(token, contrasena)
      })
    },

  }
}
