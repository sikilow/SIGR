export function categoriaAdmitePresentacion(nombre: string): boolean {
  const normalizada = nombre.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
  return normalizada === 'bebidas' || normalizada === 'postres'
}
