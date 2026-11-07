# Documentación de SIGR

Índice de la documentación del sistema. El código y el esquema vigentes son la fuente de verdad: si un documento contradice una ruta, un tipo o una regla implementada, verifica el archivo enlazado y actualiza la documentación junto con el cambio.

## Empezar

| Necesitas… | Consulta |
|---|---|
| Entender qué hace el sistema, sus roles, alcance y requisitos | [README del proyecto](../README.md) |
| Instalar SIGR localmente, configurar variables y arrancar frontend y backend | [Instalación local en el README](../README.md#instalación-local) |
| Entender las capas, las carpetas y el flujo de una solicitud | [Arquitectura](arquitectura.md) |
| Encontrar el documento adecuado o saber por dónde estudiar | Esta página y la [guía de estudio del código](guia-codigo/00_INDICE_Y_RECURSOS.md) |

## Desarrollo

| Área | Documento | Alcance |
|---|---|---|
| Frontend | [Guía del frontend](frontend.md) | Arranque, rutas por rol, layouts, servicios, sesión, estado, actualización, errores, configuración y pruebas |
| Backend y base de datos | [Arquitectura](arquitectura.md) | Responsabilidad de rutas, controladores, modelos, servicios, configuración, persistencia y decisiones |
| API del mesero | [Contrato de API del mesero](contrato-api-mesero.md) | Operaciones de mesas, menú, pedidos y cuentas |
| API de Caja | [Contrato de API de Caja](contrato-api-caja.md) | Estado de caja, cortes, cobros y respuestas |
| API de Hostess | [Contrato de API de Hostess](contrato-api-hostess.md) | Salón, clientes, reservaciones, lista de espera y configuración |
| API de Gerencia | [Contrato de API de Gerencia](contrato-api-gerente.md) | Pedidos del gerente, permisos y alcance del historial |
| Integración frontend/API | [Integración con la API real](integracion-api.md) | Modo mock/API, proxy, CORS, secuencia y validación manual |
| Esquema y nombres | [Equivalencias frontend–BD](equivalencias-bd.md) | Correspondencia entre tablas, columnas, JSON y tipos TypeScript |
| Cambios de base de datos | [Actualizar la base](actualizar-base-datos.md) | Respaldo, orden, aplicación y verificación de migraciones |
| Seguridad y auditoría | [Protección de usuarios y auditoría](auditoria-seguridad.md) | Gerente inicial protegido, cambio de contraseña, triggers y consulta de auditoría |
| Correo de reservaciones | [Resend y SMTP](resend-reservaciones.md) | Configuración, cola, reintentos, plantillas y diagnóstico |
| Revisión de código | [Guía de estudio](guia-codigo/00_INDICE_Y_RECURSOS.md) | Recorrido pedagógico por áreas; identifica qué explicaciones de código línea por línea siguen pendientes |

## Operación por rol

| Rol | Pantallas y flujo | Contrato relacionado |
|---|---|---|
| Mesero | [Pantallas del mesero](pantallas-mesero.md) | [API del mesero](contrato-api-mesero.md) |
| Cocina | [Pantalla de Cocina](pantallas-cocinero.md) | Cambios de estado en [API del mesero/pedidos](contrato-api-mesero.md) |
| Caja | [Recorrido de Caja en frontend y backend](guia-codigo/caja_frontend_backend.md) | [API de Caja](contrato-api-caja.md) |
| Hostess | [Pantallas de Hostess](pantallas-hostess.md) | [API de Hostess](contrato-api-hostess.md) |
| Gerente | [Pantallas de Gerencia](pantallas-gerente.md) | [API de Gerencia](contrato-api-gerente.md) |

## Estado, alcance y diseño

| Documento | Para qué sirve |
|---|---|
| [Incrementos](incrementos.md) | Observaciones de revisión, avances relacionados y objetivos por entrega |
| [Transcripción del Incremento 1](incrementos_audios_transcritos/incremento-1-2026-10-31.md) | Transcripción automática con marcas de tiempo del audio de la presentación |
| [Pendientes y faltantes](PENDIENTES_Y_FALTANTES.md) | Hallazgos verificados, pendientes por confirmar y decisiones propuestas |
| [Diseño v2](diseno-v2.md) | Referencia del rediseño visual |
| [Capturas](capturas/) | Evidencia visual de pantallas en resoluciones documentadas |
| [Contexto para IA](../CONTEXTO_IA.md) | Resumen del proyecto para asistentes; no reemplaza contratos ni código |

## Convenciones para mantener la documentación

- Documenta el comportamiento observado y diferencia con claridad lo implementado, lo parcial y lo pendiente.
- Al cambiar una ruta, tipo público o permiso, actualiza el contrato de API y el documento de pantalla afectado.
- Al cambiar tablas o columnas, actualiza `database/init.sql`, agrega la migración necesaria para bases existentes y revisa [Equivalencias frontend–BD](equivalencias-bd.md).
- No incluyas contraseñas, tokens, API keys, datos de clientes ni archivos `.env` reales en documentación o capturas.
- Los datos de los usuarios de prueba y sus contraseñas son solo para desarrollo. No los uses en un despliegue real.
