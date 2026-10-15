import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { servicios } from '../services'
import type { Credenciales, Usuario } from '../types'

export const useSesionStore = defineStore('sesion', () => {
  const usuario = ref<Usuario | null>(null)
  /** `true` cuando ya se intentó recuperar la sesión existente (GET /auth/me). */
  const restaurada = ref(false)

  const rol = computed(() => usuario.value?.rol ?? null)

  /** Recupera la sesión al cargar la app; un fallo de red se trata como "sin sesión". */
  async function restaurar(): Promise<void> {
    try {
      usuario.value = await servicios.auth.obtenerSesion()
    } catch {
      usuario.value = null
    } finally {
      restaurada.value = true
    }
  }

  async function iniciarSesion(credenciales: Credenciales): Promise<void> {
    usuario.value = await servicios.auth.iniciarSesion(credenciales)
    restaurada.value = true
  }

  async function cerrarSesion(): Promise<void> {
    try {
      await servicios.auth.cerrarSesion()
    } finally {
      // Aunque la API falle, la interfaz queda sin sesión.
      usuario.value = null
    }
  }

  return { usuario, rol, restaurada, restaurar, iniciarSesion, cerrarSesion }
})
