import { describe, expect, it } from 'vitest'
import { leerCuerpo, MENSAJE_SIN_SERVIDOR, mensajeDeError } from './respuestaApi'

const respuesta = (cuerpo: string, status: number) => new Response(cuerpo, { status })

describe('leerCuerpo', () => {
  it('devuelve el JSON del backend', async () => {
    expect(await leerCuerpo(respuesta('{"token":"abc"}', 200))).toEqual({ token: 'abc' })
  })

  it('un cuerpo vacío (502 del proxy) no lanza "Unexpected end of JSON input"', async () => {
    expect(await leerCuerpo(respuesta('', 502))).toEqual({})
  })

  it('un cuerpo que no es JSON tampoco lanza', async () => {
    expect(await leerCuerpo(respuesta('<html>Bad Gateway</html>', 502))).toEqual({})
  })
})

describe('mensajeDeError', () => {
  it('prefiere el mensaje del backend', () => {
    expect(mensajeDeError(respuesta('', 401), { mensaje: 'Correo o contraseña incorrectos.' }, 'x')).toBe('Correo o contraseña incorrectos.')
  })

  it('si el backend no contestó, lo dice', () => {
    expect(mensajeDeError(respuesta('', 502), {}, 'No se pudo iniciar sesión.')).toBe(MENSAJE_SIN_SERVIDOR)
    expect(mensajeDeError(respuesta('', 503), {}, 'No se pudo iniciar sesión.')).toBe(MENSAJE_SIN_SERVIDOR)
  })

  it('en otro caso usa el mensaje por defecto', () => {
    expect(mensajeDeError(respuesta('', 500), {}, 'No se pudo iniciar sesión.')).toBe('No se pudo iniciar sesión.')
  })
})
