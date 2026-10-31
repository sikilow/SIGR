# Rediseño visual v2 «Madalena»

Cambio solo de **aspecto**: no se tocó la lógica, los servicios, las rutas ni el texto de las pantallas. Las 560 pruebas del frontend, el build y la revisión de contraste (`npm run contraste`, 40 de 40 pares) siguen pasando.

## Qué cambió

| Área | Antes | Ahora |
| --- | --- | --- |
| Paleta | Naranja plano sobre crema | Chile (`#b83d0d`) con degradado, maíz (`#e9a23b`) como acento y crema cálida; mismas variables semánticas |
| Títulos | Sans en negrita | Serifa cálida (`--fuente-titulo`) en títulos de pantalla, números de mesa, hora de reservación y marca |
| Barra superior | Naranja sólido | Degradado con filete de maíz y sombra suave |
| Navegación | Línea superior en la pestaña activa | Píldora tintada + texto en negrita; en escritorio (≥ 1100 px) el gerente tiene navegación lateral |
| Tarjetas | Borde fino, esquinas de 16 px | Esquinas de 20 px, sombra suave y elevación al pasar el puntero; mesas con acento lateral y fondo tintado por estado |
| Controles | Bordes oscuros de 2 px | Borde de 1.5 px con `--color-borde-control` (contraste 3:1) |
| Diálogos | Sombra simple | Fondo desenfocado, esquinas amplias y asa en la hoja inferior (teléfono) |
| Inicio de sesión | Tarjeta centrada | Tablet y escritorio: panel de marca a la izquierda y formulario a la derecha |

## Variables nuevas (`frontend/src/styles/tokens.css`)

`--color-surface-2`, `--color-primary-suave`, `--color-acento`, `--color-borde-control`, `--radio-pill`, `--sombra-alta`, `--gradiente-marca` y `--fuente-titulo`. Se conservaron todos los nombres existentes.

## Cómo seguir

- Para cambiar la paleta, edita solo `tokens.css` y corre `npm run contraste` y `npm test`: las pruebas comprueban que cada par de colores cumpla WCAG AA.
- Los bloques «Rediseño v2» al final de cada `<style>` de un componente o layout son los que cambian su aspecto; se pueden ajustar sin tocar la plantilla.
- La navegación lateral del gerente está al final de `layouts/GerenteLayout.vue` (consulta de medios `min-width: 68.75em`).
