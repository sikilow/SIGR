import { createRouter, createWebHistory } from 'vue-router'
import GerenteLayout from '../layouts/GerenteLayout.vue'
import MeseroLayout from '../layouts/MeseroLayout.vue'
import { useSesionStore } from '../stores/sesion'
import type { Rol } from '../types'

declare module 'vue-router' {
  interface RouteMeta {
    /** Si se define, la ruta exige sesión y uno de estos roles. */
    roles?: Rol[]
  }
}

/** Pantalla de inicio de cada rol. Los roles que aún no tienen interfaz caen en el aviso "tu rol no tiene acceso". */
export function rutaInicial(rol: Rol): string {
  return rol === 'gerente' ? '/gerente/usuarios' : '/mesero/mesas'
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // "/" no tiene pantalla: la guardia de abajo manda a cada quien a la suya (según su rol).
    { path: '/', name: 'inicio', component: { render: () => null } },
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
          // Una sola ruta para la lista y el detalle: /mesero/pedidos y /mesero/pedidos/:pedidoId
          path: String.raw`pedidos/:pedidoId(\d+)?`,
          name: 'mesero-pedidos',
          component: () => import('../views/mesero/PedidosView.vue'),
        },
      ],
    },
    {
      path: '/gerente',
      component: GerenteLayout,
      meta: { roles: ['gerente'] },
      redirect: '/gerente/usuarios',
      children: [
        {
          path: 'usuarios',
          name: 'gerente-usuarios',
          component: () => import('../views/gerente/UsuariosView.vue'),
        },
        {
          path: 'productos',
          name: 'gerente-productos',
          component: () => import('../views/gerente/ProductosView.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Guardia: sin sesión o con un rol que no corresponde, se redirige a /login.
router.beforeEach(async (to) => {
  if (to.name === 'inicio') {
    const sesion = useSesionStore()
    if (!sesion.restaurada) await sesion.restaurar()
    return sesion.usuario ? rutaInicial(sesion.usuario.rol) : { name: 'login' }
  }

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
