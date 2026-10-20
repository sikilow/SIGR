// Contrato de la capa de servicios del rol hostess (Salón y Reservaciones). Las vistas y stores dependen SOLO de esta
// interfaz; `services/index.ts` decide si se usa el mock o la API real.
// CAMBIO PROPUESTO: el backend aún no tiene rutas de hostess (ver docs/contrato-api-hostess.md).
import type {
  CambioEspera,
  CambioReservacion,
  EstadoEspera,
  Cliente,
  GrupoAsignacion,
  ListaEspera,
  MesaSalon,
  NuevaEspera,
  NuevaReservacion,
  NuevoCliente,
  Reservacion,
  ResultadoAsignacion,
} from '../../types'

export interface HostessService {
  /** GET /mesas. La hostess solo usa las columnas de `mesa`: nada de cuentas ni pedidos. */
  listarMesas(): Promise<MesaSalon[]>
  /**
   * GET /reservaciones?fecha=AAAA-MM-DD (CAMBIO PROPUESTO): las reservaciones de un día, de cualquier estado.
   * `dia` es «AAAA-MM-DD» en hora local; sin él, hoy.
   */
  listarReservaciones(dia?: string): Promise<Reservacion[]>
  /**
   * GET /lista-espera (CAMBIO PROPUESTO). Sin argumento, los grupos que siguen `esperando` (`?estado=esperando`).
   * `'todas'`: todos los estados de HOY más los que siguen esperando (la API omite `estado`).
   */
  listarEspera(estado?: EstadoEspera | 'todas'): Promise<ListaEspera[]>
  /**
   * POST /mesas/{id}/asignar (CAMBIO PROPUESTO, con `Idempotency-Key`). La mesa pasa a `ocupada`; si el grupo viene
   * de una reservación se llena `llegada_en` y su estado pasa a `llego`; si viene de la lista de espera pasa a
   * `asignada`. Fallos: `mesa_no_disponible` (la mesa ya está ocupada), `estado_invalido` (el grupo ya no se
   * puede asignar) y `no_encontrado`.
   */
  asignarMesa(idMesa: number, grupo: GrupoAsignacion, claveIdempotencia?: string): Promise<ResultadoAsignacion>

  /** GET /clientes?q= (CAMBIO PROPUESTO): clientes cuyo nombre o teléfono contiene `q` (hasta 20, por nombre). */
  buscarClientes(q: string): Promise<Cliente[]>
  /**
   * POST /clientes (CAMBIO PROPUESTO, con `Idempotency-Key`). Falla con `estado_invalido` si los datos no son
   * válidos o si ya existe un cliente con ese teléfono.
   */
  crearCliente(cliente: NuevoCliente, claveIdempotencia?: string): Promise<Cliente>
  /**
   * POST /reservaciones (CAMBIO PROPUESTO, con `Idempotency-Key`). Nace `pendiente`. Si trae mesa, la mesa pasa a
   * `reservada`. Fallos: `no_encontrado` (cliente o mesa), `mesa_no_disponible` (la mesa ya no está libre) y
   * `estado_invalido` (fecha pasada, personas fuera de 1 a 20, o mesa para una fecha que no es hoy).
   */
  crearReservacion(reservacion: NuevaReservacion, claveIdempotencia?: string): Promise<Reservacion>
  /**
   * PATCH /reservaciones/{id} (CAMBIO PROPUESTO). Solo una reservación `pendiente` o `confirmada`
   * (si no, `estado_invalido`). Confirmar: `{ estado: 'confirmada' }` desde `pendiente`. Cancelar:
   * `{ estado: 'cancelada' }`; la reservación pierde su mesa y, si la mesa estaba `reservada` y no queda otra
   * reservación vigente para ella, la mesa vuelve a `libre`. Editar: fecha, personas y mesa.
   */
  actualizarReservacion(id: number, cambio: CambioReservacion, claveIdempotencia?: string): Promise<Reservacion>
  /**
   * POST /reservaciones/{id}/llegada (CAMBIO PROPUESTO, con `Idempotency-Key`). Hace lo mismo que
   * `asignarMesa(idMesa, { tipo: 'reservacion', idReservacion })`: la reservación pasa a `llego` con `llegada_en`
   * y la mesa a `ocupada`. `idMesa` es obligatorio si la reservación no tiene mesa; si trae una distinta de la
   * que tenía, reemplaza a la anterior.
   */
  registrarLlegada(id: number, idMesa: number | null, claveIdempotencia?: string): Promise<ResultadoAsignacion>

  /**
   * POST /lista-espera (CAMBIO PROPUESTO, con `Idempotency-Key`). El grupo nace `esperando` con `registrado_en` = ahora.
   * Fallos: `no_encontrado` (cliente), `estado_invalido` (personas fuera de 1 a 20, o ese cliente ya está esperando).
   */
  crearEspera(espera: NuevaEspera, claveIdempotencia?: string): Promise<ListaEspera>
  /**
   * PATCH /lista-espera/{id} (CAMBIO PROPUESTO). Quitar de la lista: `{ estado: 'cancelada' }` solo desde `esperando`
   * (si no, `estado_invalido`). Nunca se borra la fila. Asignar mesa NO pasa por aquí: usa `asignarMesa`.
   */
  actualizarEspera(id: number, cambio: CambioEspera, claveIdempotencia?: string): Promise<ListaEspera>
}
