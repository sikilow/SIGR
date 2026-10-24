import { describe, expect, it } from 'vitest'
import { categoriaAdmitePresentacion } from './presentacionProducto'

describe('categoriaAdmitePresentacion', () => {
  it.each(['Bebidas', ' bebidas ', 'POSTRES', 'Postrés'])('muestra el campo para la categoría %s', (nombre) => {
    expect(categoriaAdmitePresentacion(nombre)).toBe(true)
  })

  it.each(['Entradas', 'Platos fuertes', 'Postres especiales', ''])('oculta el campo para la categoría %s', (nombre) => {
    expect(categoriaAdmitePresentacion(nombre)).toBe(false)
  })
})
