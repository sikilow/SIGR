import { defineStore } from 'pinia'
import { nextTick, ref } from 'vue'

const DURACION_MS = 5000

/**
 * Avisos breves ("Pedido #5 cancelado", "Pedido #8, mesa 5: listo"). El layout los muestra en un
 * aviso visible y los anuncia en una región aria-live="polite"; no roban el foco y se descartan solos.
 */
export const useAnunciosStore = defineStore('anuncios', () => {
  const texto = ref('')
  let temporizador: ReturnType<typeof setTimeout> | undefined

  async function anunciar(mensaje: string) {
    clearTimeout(temporizador)
    // Se vacía un instante para que un mensaje idéntico al anterior se vuelva a anunciar.
    texto.value = ''
    await nextTick()
    texto.value = mensaje
    temporizador = setTimeout(() => (texto.value = ''), DURACION_MS)
  }

  return { texto, anunciar }
})
