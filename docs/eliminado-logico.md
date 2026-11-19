# Eliminado lógico («Eliminar» que no borra)

**Estado:** fase 1 hecha (productos y categorías del menú, migración 026). Solo el **gerente** puede eliminar y restaurar.

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
   - Categoría: no si tiene productos vigentes.
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

## Fases siguientes (pendientes)

2. **Usuarios**: además de la marca, la API debe rechazar de inmediato la sesión de un usuario eliminado o desactivado
   (hoy el token dura 8 h y no se vuelve a consultar la base).
3. **Clientes**: requiere una pantalla de clientes para el gerente (hoy no existe).
4. **Mesas, secciones, características, canales, métodos de pago y sus categorías.**

Para cada fase: migración nueva (columnas + triggers de auditoría + `init.sql`), filtro «vigente» en las consultas vivas,
rutas `DELETE` y `restaurar`, y la interfaz («Eliminar», «Eliminados», «Restaurar»).
