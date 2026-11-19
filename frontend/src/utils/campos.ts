// Qué caracteres acepta cada tipo de campo. Es la MISMA regla que aplica el servidor
// (backend/src/utils/campos.ts): si cambias una, cambia la otra.
//
// Uso en un formulario:   <input v-model="nombre" v-permitir="'nombre'" />
// La directiva quita al instante (al escribir o pegar) lo que el campo no admite. El servidor vuelve a validar.
import type { Directive } from 'vue'
import { LADA_PREDETERMINADA, rangoTelefono, textoDigitos } from './lada'

export type ModoCampo = 'nombre' | 'texto' | 'nota' | 'digitos' | 'decimal' | 'usuario' | 'correo' | 'busqueda'

/** Nombre de persona: letras (con acentos y ñ), espacios y . ' - */
export const REGEX_NOMBRE_PERSONA = /^\p{L}[\p{L}\p{M} .'-]*$/u
/** Nombre de producto, sección, categoría, canal…: letras, números, espacios y . , - ' / & ( ) % */
export const REGEX_TEXTO_CATALOGO = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} .,'\-/&()%]*$/u
/** Notas, descripciones, indicaciones: letras, números, espacios, saltos de línea y puntuación común. */
export const REGEX_NOTA = /^[\p{L}\p{N}\p{M} \n\r.,;:!¡?¿()'"\-/%&#+]*$/u
/** Usuario para iniciar sesión. */
export const REGEX_USUARIO = /^[A-Za-z0-9._-]+$/
/** Correo: caracteres normales de una dirección. */
export const REGEX_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

export const AYUDA_NOMBRE_PERSONA = 'Solo letras y espacios (también . \' -).'
export const AYUDA_TEXTO_CATALOGO = 'Solo letras, números y espacios (también . , - \' / & ( ) %).'
export const AYUDA_NOTA = 'Solo letras, números, espacios y puntuación común.'

const SOBRAN: Record<ModoCampo, RegExp> = {
  nombre: /[^\p{L}\p{M} .'-]/gu,
  texto: /[^\p{L}\p{N}\p{M} .,'\-/&()%]/gu,
  nota: /[^\p{L}\p{N}\p{M} \n\r.,;:!¡?¿()'"\-/%&#+]/gu,
  digitos: /\D/g,
  decimal: /[^\d.]/g,
  usuario: /[^A-Za-z0-9._-]/g,
  correo: /[^A-Za-z0-9@._%+-]/g,
  busqueda: /[^\p{L}\p{N}\p{M} .@_'+-]/gu,
}

/** Quita de `texto` lo que el modo no admite. Se puede llamar sin DOM (por ejemplo en pruebas). */
export function limpiarCampo(modo: ModoCampo, texto: string): string {
  // En «decimal» la coma es el punto decimal si no hay otro punto («12,5» → «12.5»); si ya hay punto, la coma es de
  // millares y se quita («1,250.50» → «1250.50»).
  const base = modo === 'decimal' ? (texto.includes('.') ? texto.replace(/,/g, '') : texto.replace(/,/g, '.')) : texto
  const t = base.replace(SOBRAN[modo], '')
  switch (modo) {
    case 'nombre':
      // Sin dobles espacios ni signos al inicio: el nombre empieza con una letra.
      return t.replace(/ {2,}/g, ' ').replace(/^[^\p{L}]+/u, '')
    case 'texto':
      return t.replace(/ {2,}/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '')
    case 'nota':
      return t.replace(/[ \t]{2,}/g, ' ')
    case 'busqueda':
      return t.replace(/ {2,}/g, ' ')
    case 'decimal': {
      const i = t.indexOf('.')
      if (i === -1) return t
      // Un solo punto y a lo más 2 decimales.
      return t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '').slice(0, 2)
    }
    case 'correo': {
      const i = t.indexOf('@')
      return i === -1 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/@/g, '')
    }
    default:
      return t
  }
}

type CampoTexto = HTMLInputElement | HTMLTextAreaElement
const alEscribir = new WeakMap<CampoTexto, (e: Event) => void>()
const bloqueadores = new WeakMap<CampoTexto, (e: Event) => void>()

function aplicar(el: CampoTexto, modo: ModoCampo, evento?: Event) {
  // Mientras se compone (teclado de acentos, IME) no se toca el texto: se limpia al terminar.
  if ((evento as InputEvent | undefined)?.isComposing) return
  const antes = el.value
  let despues = limpiarCampo(modo, antes)
  const maximo = Number(el.dataset.maximo) || 0
  if (maximo > 0 && despues.length > maximo) despues = despues.slice(0, maximo)
  if (antes === despues) return
  let cursor: number | null = null
  try {
    cursor = el.selectionStart
  } catch {
    cursor = null // type="email" no expone la selección
  }
  el.value = despues
  if (cursor !== null) {
    const nuevo = limpiarCampo(modo, antes.slice(0, cursor)).length
    try {
      el.setSelectionRange(nuevo, nuevo)
    } catch {
      /* sin selección en este tipo de campo */
    }
  }
}

/**
 * `v-permitir="'digitos'"`. Escucha en la fase de captura para limpiar el valor ANTES de que `v-model` lo lea.
 */
export const vPermitir: Directive<CampoTexto, ModoCampo> = {
  mounted(el, binding) {
    const campo = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null
    if (!campo) return
    // `maxlength` del navegador recorta el texto pegado ANTES de limpiarlo («(311) 555-0201» quedaría en «(311) 555-»).
    // Se retira y el límite se aplica aquí, ya con el texto limpio.
    if (campo.maxLength > 0) {
      campo.dataset.maximo = String(campo.maxLength)
      campo.removeAttribute('maxlength')
    }
    const manejador = (e: Event) => aplicar(campo, binding.value as ModoCampo, e)
    alEscribir.set(campo, manejador)
    campo.addEventListener('input', manejador, true)
    campo.addEventListener('compositionend', manejador, true)
    // Teclear un carácter que el campo no admite: se descarta antes de entrar (sin parpadeo ni saltos del cursor).
    // Lo demás (pegar, autocompletar, dobles espacios, segundo punto…) lo limpia el manejador de `input`.
    const bloquear = (e: Event) => {
      const ev = e as InputEvent
      // Solo una tecla a la vez. Un texto más largo (pegar, autocompletar) entra y se limpia en el evento `input`.
      if (ev.isComposing || ev.inputType !== 'insertText' || !ev.data || [...ev.data].length !== 1) return
      const modo = binding.value as ModoCampo
      const dato = modo === 'decimal' ? ev.data.replace(/,/g, '.') : ev.data
      if (dato.replace(SOBRAN[modo], '') !== dato) {
        ev.preventDefault()
        return
      }
      // Campo lleno: la tecla no entra (como haría `maxlength`), salvo que haya texto seleccionado que reemplazar.
      const maximo = Number(campo.dataset.maximo) || 0
      const seleccion = (campo.selectionEnd ?? 0) - (campo.selectionStart ?? 0)
      if (maximo > 0 && campo.value.length - seleccion >= maximo) ev.preventDefault()
    }
    bloqueadores.set(campo, bloquear)
    campo.addEventListener('beforeinput', bloquear)
    aplicar(campo, binding.value as ModoCampo)
  },
  // El límite puede cambiar mientras el campo está abierto (por ejemplo, al elegir otra lada): Vue vuelve a poner
  // `maxlength` y se retira de nuevo para que el navegador no recorte lo pegado.
  updated(el) {
    if (el.maxLength > 0) {
      el.dataset.maximo = String(el.maxLength)
      el.removeAttribute('maxlength')
    }
  },
  beforeUnmount(el) {
    const manejador = alEscribir.get(el)
    if (!manejador) return
    el.removeEventListener('input', manejador, true)
    el.removeEventListener('compositionend', manejador, true)
    const bloquear = bloqueadores.get(el)
    if (bloquear) el.removeEventListener('beforeinput', bloquear)
    bloqueadores.delete(el)
    alEscribir.delete(el)
  },
}

// ---------- Validadores (devuelven el mensaje de error o '') ----------

export function errorNombrePersona(texto: string, max = 100): string {
  const t = texto.trim()
  if (t === '') return 'Escribe el nombre.'
  if (t.length > max) return `El nombre es demasiado largo (máximo ${max} caracteres).`
  if (!REGEX_NOMBRE_PERSONA.test(t)) return 'El nombre solo puede llevar letras y espacios.'
  return ''
}

export function errorTextoCatalogo(texto: string, max: number, vacioPermitido = false): string {
  const t = texto.trim()
  if (t === '') return vacioPermitido ? '' : 'Este campo es obligatorio.'
  if (t.length > max) return `Máximo ${max} caracteres.`
  if (!REGEX_TEXTO_CATALOGO.test(t)) return 'Solo se permiten letras, números y espacios (también . , - \' / & ( ) %).'
  return ''
}

export function errorNota(texto: string, max: number): string {
  const t = texto.trim()
  if (t.length > max) return `Máximo ${max} caracteres.`
  if (!REGEX_NOTA.test(t)) return 'Solo se permiten letras, números, espacios y puntuación común.'
  return ''
}

/** Teléfono: solo dígitos y los que pide la lada (México: 10). */
export function errorTelefono(texto: string, obligatorio = true, lada: string = LADA_PREDETERMINADA): string {
  const t = texto.trim()
  if (t === '') return obligatorio ? 'Escribe el teléfono.' : ''
  const { min, max } = rangoTelefono(lada)
  if (!/^\d+$/.test(t) || t.length < min || t.length > max) return `Escribe un teléfono de ${textoDigitos(lada)}, solo números.`
  return ''
}

export function errorCorreo(texto: string, obligatorio = true): string {
  const t = texto.trim()
  if (t === '') return obligatorio ? 'Escribe el correo.' : ''
  if (t.length > 120) return 'El correo es demasiado largo (máximo 120 caracteres).'
  if (!REGEX_CORREO.test(t)) return 'Escribe un correo válido, por ejemplo nombre@correo.com.'
  return ''
}

/**
 * Para campos `type="number"` que no se pueden convertir a texto: impide teclear «e», «+» y «-», que el navegador
 * acepta en un campo numérico aunque no sirvan en un importe.
 */
export function bloquearTeclasNoNumericas(e: KeyboardEvent): void {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault()
}
