import { createRouter, createWebHistory } from 'vue-router'
import MeseroLayout from '../layouts/MeseroLayout.vue'
import { useSesionStore } from '../stores/sesion'
import type { Rol } from '../types'

declare module 'vue-router' {
  interface RouteMeta {
    /** Si se define, la ruta exige sesión y uno de estos roles. */
    roles?: Rol[]
    /** Título de las pantallas placeholder. */
    titulo?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/mesero/mesas' },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/mesero',
      component: MeseroLayout,
      meta: { roles: ['mesero'] },
      redirect: '/mesero/mesas',
      children: [
        {
          path: 'mesas',
          name: 'mesero-mesas',
          component: () => import('../views/mesero/MesasView.vue'),
        },
        {
          path: String.raw`mesas/:mesaId(\d+)/pedido`,
          name: 'mesero-pedido-mesa',
          component: () => import('../views/mesero/PedidoMesaView.vue'),
        },
        {
          path: String.raw`mesas/:mesaId(\d+)/cuenta`,
          name: 'mesero-cuenta-mesa',
          component: () => import('../views/mesero/CuentaMesaView.vue'),
        },
        {
          path: 'pedidos',
          name: 'mesero-pedidos',
          component: () => import('../views/mesero/PedidosView.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Guardia: sin sesión o con un rol que no corresponde, se redirige a /login.
router.beforeEach(async (to) => {
  const roles = to.matched.find((r) => r.meta.roles)?.meta.roles
  if (!roles) return true

  const sesion = useSesionStore()
  if (!sesion.restaurada) await sesion.restaurar()

  if (!sesion.usuario) {
    return { name: 'login', query: { redirigir: to.fullPath } }
  }
  if (!roles.includes(sesion.usuario.rol)) {
    return { name: 'login', query: { motivo: 'rol' } }
  }
  return true
})
