# Correo de reservaciones: Resend o Gmail SMTP

SIGR usa un único procesador y una sola cola (`notificacion_reservacion`) para confirmaciones, recordatorios, reservaciones vencidas y cancelaciones. El servicio `backend/src/services/correo.ts` es el único punto de envío y admite el SDK de Resend o Nodemailer con SMTP.

## Seguridad y configuración

No guardes la contraseña de Gmail, la contraseña de aplicación ni la API key de Resend en Git, en este documento, en capturas ni en comandos. Coloca credenciales únicamente en el archivo local ignorado `backend/.env` o en el gestor de secretos del despliegue. El repositorio solo contiene variables vacías en `backend/.env.example`.

Variables del backend:

| Variable | Uso |
| --- | --- |
| `CORREO_PROVEEDOR` | `resend` o `smtp`. Si queda vacía: elige Resend si hay `RESEND_API_KEY`, luego SMTP si hay `SMTP_USER` y `SMTP_PASS`; de otro modo, correo desactivado. |
| `CORREO_REMITENTE` | Remitente común para todos los mensajes. |
| `RESEND_API_KEY` | API key de Resend cuando se selecciona ese transporte. |
| `SMTP_HOST` | Servidor SMTP; por defecto `smtp.gmail.com`. |
| `SMTP_PORT` | Puerto SMTP; por defecto `465` (TLS seguro). También se puede usar `587` con STARTTLS. |
| `SMTP_USER` | Cuenta autenticada del servidor SMTP. |
| `SMTP_PASS` | Contraseña de aplicación de Gmail, no la contraseña normal. Se eliminan los espacios antes de autenticar. |

### Gmail SMTP

1. Activa la verificación en dos pasos en la cuenta de Google y crea una contraseña de aplicación de 16 caracteres. No uses la contraseña normal de Gmail.
2. En `backend/.env`, selecciona `smtp`; usa `smtp.gmail.com`, puerto `465`, la cuenta en `SMTP_USER` y la contraseña de aplicación en `SMTP_PASS`.
3. `CORREO_REMITENTE` debe ser exactamente la cuenta de `SMTP_USER` (puede incluir un nombre visible, por ejemplo `La Madalena <cuenta@gmail.com>`). Gmail reemplaza el remitente por la cuenta autenticada.
4. Reinicia el backend. Los timeouts de conexión, saludo y socket son de aproximadamente 10 segundos.

Una cuenta personal de Gmail permite aproximadamente 500 mensajes diarios y hasta 100 destinatarios por mensaje; Google puede aplicar límites adicionales. El error `550 5.4.5` se trata como reintentable y espera seis horas antes del siguiente intento. Para mayor volumen, usa un proveedor transaccional con dominio verificado.

### Resend

1. Verifica un dominio en Resend y crea una API key privada.
2. Selecciona `resend` (o deja el proveedor vacío y configura `RESEND_API_KEY`) y define `CORREO_REMITENTE` con una dirección autorizada por Resend.
3. No uses una dirección de prueba como remitente de producción. Resend puede limitar los destinatarios permitidos hasta que verifiques el dominio.

El cambio de transporte no requiere una lista blanca de destinatarios: cada aviso se envía al correo guardado para el cliente de esa reservación.

## Qué hace la cola

- Al registrar una reservación, se agrega el evento `confirmacion/creada`; al confirmar una reservación pendiente, se agrega `confirmacion/confirmada`. La fila se inserta dentro de la transacción de la reservación y el ciclo de envío se dispara inmediatamente después del commit, sin esperar al correo.
- Si el cliente no tiene correo, se permite guardar la reservación y no se agrega una confirmación.
- Al cancelar una reservación pendiente o confirmada desde hostess, se agrega `cancelacion/''` y se dispara el envío; la reservación se marca `cancelada` y su mesa se libera.
- Recordatorios se programan con `recordatorio_minutos` configurado por Gerencia.
- Al pasar `fecha_hora + tolerancia_minutos` sin llegada, el procesador revalida bajo bloqueo que el estado siga siendo `pendiente` o `confirmada`; luego la marca `vencida`, libera su mesa si corresponde y encola un único aviso. No encola si la reservación ya llegó o se canceló.
- El mensaje de vencimiento incluye la tolerancia vigente, la fecha y hora reservadas e invita a contactar al restaurante. El de cancelación incluye la fecha, las personas y la invitación a reservar de nuevo.
- Los fallos guardan un intento, el error y la fecha de reintento en la misma cola. Los errores habituales mantienen el backoff progresivo existente (hasta una hora); `550 5.4.5` espera seis horas.
- La migración 011 no crea confirmaciones para reservaciones anteriores. Solo las nuevas acciones de creación y confirmación producen esos eventos.
- Un correo fallido no revierte ni bloquea el cambio de estado de la reservación.

La unicidad de `(id_reservacion, tipo, evento)` evita duplicar `creada`, `confirmada`, recordatorio, vencimiento o cancelación. Recordatorios, vencimientos y cancelaciones usan `evento = ''`; las confirmaciones usan `creada` o `confirmada`.

## Diseño de los correos HTML

Las cuatro plantillas viven en `backend/src/services/plantillasCorreo.ts` y devuelven `asunto`, `texto` y `html`. El procesador `notificacionesReservacion.ts` envía los tres campos a `enviarCorreo`; Resend o SMTP entregan la versión HTML y el texto plano como alternativa. Si el cliente bloquea el HTML o prefiere texto, ve la misma información.

| Aviso | Función | Asunto | Acento | Título del correo |
| --- | --- | --- | --- | --- |
| Confirmación `creada` / `confirmada` | `plantillaConfirmacion` | `Reservación registrada` / `Reservación confirmada` | `#a63a1f` | Tu mesa está apartada / Todo listo para tu visita |
| Recordatorio | `plantillaRecordatorio` | `Recordatorio de tu reservación` | `#8a5a12` | Tu mesa te espera |
| Vencida | `plantillaVencida` | `Tu reservación venció` | `#7a1818` | La mesa quedó liberada |
| Cancelación | `plantillaCancelacion` | `Tu reservación fue cancelada` | `#5f6258` | Tu reservación fue cancelada |

La composición imita una tarjeta impresa:

- Lienzo verde agave `#183328`, tarjeta de papel cálido `#fffaf2`, filete dorado `#c58a24`, textos en `#1e241f` y `#5d6459`.
- Tipografía Georgia para títulos y hora; Arial/Helvetica para el cuerpo. No se cargan fuentes remotas ni imágenes.
- Un preheader oculto resume el aviso en la bandeja de entrada.
- Encabezado de marca con «La Madalena» y «Cocina mexicana contemporánea»; después vienen la etiqueta del aviso, el título, el saludo y una frase breve.
- Bloque destacado de detalles: la hora es el elemento principal; le siguen la fecha escrita en español y una línea con año, personas y mesa o tolerancia. En el panel, la fecha se separa del valor MySQL de hora local, sin convertir zonas horarias.
- Nota entre dos líneas finas, cierre en cursiva y pie con el aviso de que el mensaje es automático.
- Un acento distinto por tipo de aviso: confirmación terracota `#a63a1f`, recordatorio ámbar `#8a5a12`, vencida rojo profundo `#7a1818` y cancelación gris `#5f6258`.

El ancho máximo es de 600 px y el contenido se adapta a 480 px; el diseño se revisó también a 390 px. Para que Gmail y Outlook lo respeten, usa tablas, estilos en línea y `color-scheme: light`; no hay JavaScript, formularios ni enlaces de cancelación. Los nombres y datos de la reservación se escapan antes de insertarse en el HTML.

La versión de texto plano conserva el mismo contenido que antes y se envía en el mismo mensaje que el HTML. Los asuntos, la cola, los reintentos, la deduplicación y la lógica de negocio no cambian por el diseño. Las vistas previas locales se generaron a 600 px y 390 px y no forman parte del repositorio; no se envió un correo real.

## Comprobación

Para revisar la cola:

```sql
SELECT id_notificacion, id_reservacion, tipo, evento, destinatario, estado,
       intentos, ultimo_error, creada_en, enviada_en
FROM notificacion_reservacion
ORDER BY id_notificacion DESC
LIMIT 20;
```

En una base de desarrollo, registra dos clientes con correos distintos, crea una reservación para cada uno y comprueba que cada confirmación llega al correo correspondiente. Cancela una de ellas desde hostess y verifica el correo de cancelación. Después ajusta **Gerente → Reservas** a una tolerancia breve y crea una reservación de prueba sin registrar su llegada; verifica el aviso de vencimiento y el mensaje con los minutos configurados. No pruebes con datos de clientes reales ni compartas credenciales.

La migración debe aplicarse manualmente a una base de desarrollo con respaldo previo. Los comandos de respaldo, inspección del `CHECK`, aplicación y verificación están en [`actualizar-base-datos.md`](actualizar-base-datos.md), secciones «Migración 011» y «Migración 012». Aplica 011 antes que 012: la segunda amplía los CHECK que crea la primera.

## Pruebas y diagnóstico

Las 64 pruebas Vitest del backend (9 archivos) no usan red real; las de correo simulan Nodemailer y Resend. `backend/tests/plantillasCorreo.test.ts` comprueba la composición, los acentos, el escape de HTML y la fecha; `notificacionesReservacion.test.ts` verifica que el HTML llegue al transporte. Para comprobar el código:

```powershell
Push-Location backend
npm run build
npm test
Pop-Location
```

Si falla el envío:

- Comprueba `CORREO_PROVEEDOR`, `CORREO_REMITENTE` y la configuración del proveedor; reinicia el backend tras cambiar el entorno.
- En Gmail, confirma que la contraseña es una contraseña de aplicación y que `SMTP_USER` coincide con el correo de `CORREO_REMITENTE`.
- Revisa `ultimo_error`, `intentos` y `creada_en` de la notificación, además de los logs (los destinatarios se enmascaran).
- Nunca imprimas `SMTP_PASS` ni `RESEND_API_KEY`.
