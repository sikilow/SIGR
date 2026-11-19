# Reglas de los campos de texto y número

Qué caracteres acepta cada campo. La regla vive en **dos archivos que deben decir lo mismo**:

- Frontend: `frontend/src/utils/campos.ts` (directiva `v-permitir`: quita al instante lo no permitido al escribir o pegar).
- Backend: `backend/src/utils/campos.ts` (zod: valida de verdad; el navegador se puede saltar).

| Tipo (`v-permitir`) | Acepta | Dónde se usa |
|---|---|---|
| `nombre` | Letras (con acentos y ñ), espacios y `. ' -` | Nombre de usuario/cliente/persona |
| `texto` | Letras, números, espacios y `. , - ' / & ( ) %` | Producto, presentación, categoría, sección, canal, método de pago, característica, referencia |
| `nota` | Letras, números, espacios, saltos de línea y `. , ; : ! ¡ ? ¿ ( ) ' " - / % & # +` | Descripción de producto, indicaciones del pedido, motivo de cancelación, notas |
| `digitos` | Solo números | Teléfono, mesa, capacidad, personas, existencia, stock, minutos de reservación |
| `decimal` | Números con un punto y máx. 2 decimales (la coma cuenta como punto) | Precio, fondo inicial, efectivo contado |
| `usuario` | `A-Z a-z 0-9 . _ -` | Nombre de usuario para iniciar sesión |
| `correo` | `A-Z a-z 0-9 @ . _ % + -`, un solo `@`, sin espacios | Correos |
| `busqueda` | Letras, números, espacios y `. @ _ ' + -` | Cuadros de búsqueda |

**Teléfono:** solo dígitos y la cantidad depende de la lada elegida (México y EE. UU./Canadá: 10; España: 9; Costa Rica: 8; China: 11; Alemania: de 10 a 13…). La tabla está en `frontend/src/utils/lada.ts` y `backend/src/utils/campos.ts` (`PAISES_LADA`); una prueba comprueba que sean iguales. Para agregar un país, agrégalo en los dos archivos. Una lada que no esté en la tabla (dato ya guardado) acepta de 6 a 14 dígitos.

Las contraseñas **no** se restringen (pueden llevar cualquier símbolo).

## Cómo agregar un campo nuevo

1. Frontend: `import { vPermitir } from '…/utils/campos'` y `<input v-permitir="'nombre'" … />`.
2. Backend: usa los esquemas de `utils/campos.ts` (`nombrePersona`, `textoCatalogo`, `nota`, `telefono`, `correo`, `importe`).
3. Si tocas una regla, cámbiala en los dos archivos y en sus pruebas (`campos.test.ts`).

Nota: la directiva retira el atributo `maxlength` del campo y aplica ese mismo límite ella misma, porque el navegador
recorta lo pegado *antes* de limpiarlo («(311) 555-0201» quedaría en «(311) 555-»).
