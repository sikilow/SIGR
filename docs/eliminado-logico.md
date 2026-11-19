# Eliminado lógico («Eliminar» que no borra)

**Estado:** fase 1 hecha (productos y categorías del menú, migración 026) fase 2 hecha (usuarios, migración 027), fase 3 hecha (clientes, migración 028) y fase 4 hecha (mesas, secciones, características, canales y métodos de pago, migración 029). Solo el **gerente** puede eliminar y restaurar.

## Idea

«Eliminar» no borra la fila: pone `eliminado_en = NOW()` y `eliminado_por = <gerente>`. Vacío = vigente. Así los pedidos,
ventas y reportes viejos siguen mostrando el nombre del producto, y se puede restaurar.

| Estado | Qué es | Quién lo ve |
|---|---|---|
| Activo | Normal | Todos |
| Inactivo («Desactivar», ya existía) | Pausado | El gerente, marcado; el personal no |
| Eliminado | Fuera de uso, conservado | Solo el gerente en «Eliminados» y los reportes históricos |

## Reglas

1. **Pantallas «vivas»** (menú del mesero, listas, selectores): excluyen lo eliminado (`eliminado_en IS NULL`).
2. **Historial y reportes** (pedidos, ventas, cortes): **nunca** lo excluyen; usan `JOIN` sin filtro.
3. **Lo eliminado no se puede usar**: no aparece en el menú, `productosPorId` lo marca no disponible y no se puede editar ni crear algo dentro de una categoría eliminada.
4. **Cuándo se puede eliminar**
   - Producto: no si está en un pedido sin entregar (registrado, enviado, en preparación o listo).
   - Categoría: elimina **también sus productos vigentes** (ver «Eliminar en cascada»); no si alguno está en un pedido sin entregar.
5. **Datos únicos**: el nombre de categoría y la combinación categoría + nombre + presentación del producto siguen siendo únicos *aunque estén eliminados*. Si intentas crear uno igual, el sistema avisa «hay uno eliminado, restáuralo».
6. **Restaurar**: un producto no se restaura si su categoría está eliminada (restaura primero la categoría).
7. **Auditoría**: los triggers `trg_aud_producto_*` y `trg_aud_categoria_menu_*` registran `eliminado_en` y `eliminado_por`.

## API (solo gerente)

| Ruta | Qué hace |
|---|---|
| `GET /api/catalogo/productos[?eliminados=1]` | Vigentes (por omisión) o solo los eliminados |
| `DELETE /api/catalogo/productos/:id` | Elimina (lógico) y devuelve el producto |
| `POST /api/catalogo/productos/:id/restaurar` | Restaura |
| `GET /api/catalogo/categorias[?eliminados=1]` | Vigentes o solo las eliminadas |
| `DELETE /api/catalogo/categorias/:id` | Elimina (lógico) |
| `POST /api/catalogo/categorias/:id/restaurar` | Restaura |

Respuestas de producto y categoría incluyen `eliminado_en` (`null` = vigente).

## Fase 2: usuarios

- `DELETE /api/usuarios/:id` elimina (lógico) y deja al usuario **inactivo**; `POST /api/usuarios/:id/restaurar` lo
  devuelve vigente pero **inactivo** (el gerente lo reactiva). `GET /api/usuarios[?eliminados=1]`.
- No se puede eliminar: a uno mismo, al primer gerente (también lo impide un trigger) ni al último gerente activo.
- Correo, usuario y teléfono siguen ocupados por un usuario eliminado: crear otro igual avisa «restáuralo».
- Un usuario eliminado no se edita ni se le manda restablecer contraseña; no puede iniciar sesión.
- **Sesión:** `requiereAuth` consulta la base en CADA petición (usuario activo, no eliminado, rol actual). Desactivar o
  eliminar a alguien cierra su sesión al instante (`401` con `motivo: "cuenta_inactiva"`; el frontend lo manda a
  `/login?motivo=desactivada`), y un cambio de rol se aplica también al instante. Esto cubre además a los usuarios
  simplemente desactivados, que antes seguían hasta 8 horas.

## Fase 3: clientes

- Pantalla nueva **Gerente → Clientes** (`/gerente/clientes`): lista con búsqueda, corregir datos (nombre, lada y
  teléfono, correo), eliminar y restaurar («Eliminados»).
- API (solo gerente): `GET /api/clientes/gestion[?eliminados=1]`, `PATCH /api/clientes/:id` (la hostess sigue pudiendo
  corregir solo el correo), `DELETE /api/clientes/:id`, `POST /api/clientes/:id/restaurar`.
- No se puede eliminar a un cliente con reservaciones **pendientes o confirmadas** ni mientras esté en la lista de espera.
- Un cliente eliminado: no sale en la búsqueda de la hostess, no se le hacen reservaciones ni se anota en la espera, y
  **no puede entrar al portal** (sesión rechazada al instante; el inicio de sesión dice «la cuenta ya no está activa»
  solo después de comprobar la contraseña, para no revelar qué correos existen). Se bloquean también registrarse de nuevo
  con su correo o teléfono.
- Teléfono y correo siguen ocupados por un cliente eliminado: la hostess recibe «pídele al gerente que lo restaure».
- La cuenta del portal (`cliente_credencial`) no se toca: al restaurar al cliente, vuelve a entrar con lo mismo.

## Fase 4: mesas, secciones, características, canales y métodos de pago

Migración 029: `eliminado_en` y `eliminado_por` en `mesa`, `seccion`, `caracteristica_mesa`, `canal_pedido`,
`categoria_metodo_pago` y `metodo_pago`. Pantallas: Gerente → Mesas (con los diálogos Secciones y Características),
Canales de pedido y Métodos de pago; todas con «Eliminar», la vista «Eliminados/Eliminadas» y «Restaurar».

- **Regla fija:** algo eliminado queda también **inactivo** (`activa`/`activo` = FALSE). Así las pantallas que ya filtran
  por «activo» (panel de mesas, salón, portal, caja, menú de canales) lo ocultan sin cambios. **Restaurar lo deja
  inactivo**: el gerente lo activa después.
- Nombres y números siguen ocupados por lo eliminado; la API responde «hay uno eliminado, restáuralo».
- Listas: `?eliminados=1` devuelve solo lo eliminado; por omisión, solo lo vigente. Los reportes e historial nunca filtran.
- **Mesa:** no se elimina si está ocupada o tiene cuenta abierta o reservaciones vigentes. No se restaura si su sección
  está eliminada.
- **Sección:** elimina **también sus mesas vigentes** (ver «Eliminar en cascada»); no si alguna está ocupada, con cuenta abierta o con
  reservaciones vigentes, ni la sección de sistema «Para llevar».
- **Característica:** no se elimina mientras la usen mesas vigentes o reservaciones vigentes.
- **Canal:** no se elimina mientras una cuenta sin cobrar lo use.
- **Categoría de método de pago:** elimina **también sus métodos vigentes** (ver «Eliminar en cascada»); no si contiene el método de
  efectivo o uno que una cuenta abierta tenga solicitado. **Método de pago:** el de efectivo no se puede eliminar (el cuadre de
  caja lo necesita); no se restaura si su categoría está eliminada.

### Eliminar en cascada (categoría de pago, sección y categoría del menú)

Lo que contiene otras cosas se elimina **con** ellas, no se obliga a eliminarlas una por una antes:

| Contenedor | Se elimina también | Qué lo frena |
|---|---|---|
| Categoría de método de pago (p. ej. «Digital») | Todos sus métodos vigentes (Tarjeta, Transferencia…) | El método de efectivo; un método que una cuenta abierta tiene solicitado |
| Sección de mesas | Todas sus mesas vigentes | Una mesa ocupada, con cuenta abierta o con reservaciones vigentes; la sección «Para llevar» |
| Categoría del menú | Todos sus productos vigentes | Un producto en un pedido sin entregar |

- **Todo o nada:** va en una sola transacción. Si algo de adentro no se puede eliminar, no se toca nada y el mensaje dice cuál
  («No se puede eliminar «Digital»: «Tarjeta» lo tienen solicitado 1 cuenta(s) abiertas…»).
- **Uno por uno sigue igual:** eliminar solo «Transferencia» elimina solo Transferencia; la categoría y los demás métodos no se tocan.
- **Misma hora:** la categoría y lo que se eliminó con ella llevan la misma hora de eliminación (`eliminado_en`). La API la adelanta
  1 s si hace falta para que nunca coincida con la de algo que ya se había eliminado por separado.
- **Restaurar el contenedor** devuelve también lo que se eliminó **con él** (misma hora); lo que ya estaba eliminado antes
  por separado se queda eliminado y se restaura aparte. Todo vuelve **inactivo**: las mesas no disponibles, los métodos
  desactivados (los productos conservan su estado), y Gerencia lo activa después.
- `DELETE /api/catalogo/categorias/:id` responde `{ ok: true, productos_eliminados }` y `DELETE /api/catalogo/secciones/:nombre`
  responde `{ ok: true, mesas_eliminadas }`.
- La característica de mesa no es un contenedor (es una etiqueta de las mesas): sigue sin poder eliminarse mientras algo la use.
- Orden al restaurar un elemento suelto: primero la sección/categoría, luego sus mesas/métodos/productos.

Para cada fase: migración nueva (columnas + triggers de auditoría + `init.sql`), filtro «vigente» en las consultas vivas,
rutas `DELETE` y `restaurar`, y la interfaz («Eliminar», «Eliminados», «Restaurar»).
