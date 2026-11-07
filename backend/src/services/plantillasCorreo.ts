// Plantillas HTML de los correos de reservación. Usan tablas y estilos en línea porque los clientes
// de correo (Gmail, Outlook) ignoran hojas de estilo y muchas propiedades modernas. La composición
// imita una tarjeta impresa: papel cálido, marco verde agave y un acento distinto por tipo de aviso.
// El texto plano conserva el mismo contenido que antes para no romper pruebas ni lectores que lo prefieran.

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";

const MARCA = {
  agaveProfundo: "#183328",
  agave: "#1f4a2f",
  terracota: "#a63a1f",
  maiz: "#8a5a12",
  peligro: "#7a1818",
  neutro: "#5f6258",
  crema: "#fffaf2",
  panel: "#f5ecdf",
  texto: "#1e241f",
  muted: "#5d6459",
  borde: "#d8c7ae",
  bordeSuave: "#e7dccb",
  dorado: "#c58a24",
  pie: "#a9b8ac",
} as const;

export interface DatosReservacion {
  nombre: string;
  /** Fecha y hora en formato MySQL ("2026-11-01 19:30:00"), hora del restaurante. */
  fechaHora: string;
  personas: number;
  /** Número de mesa asignado; `null` si todavía no tiene. */
  mesaNumero: number | null;
  toleranciaMinutos: number;
}

export interface CorreoReservacion {
  asunto: string;
  texto: string;
  html: string;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

interface PartesFecha {
  diaSemana: string;
  dia: string;
  mes: string;
  anio: string;
  hora: string;
}

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => {
    switch (caracter) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function capitalizar(texto: string): string {
  return texto === "" ? texto : texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Fecha legible en español sin convertir zonas horarias: la fecha de MySQL ya está en la hora
 * local del restaurante y solo se separan sus partes.
 */
function partesFecha(fechaHora: string): PartesFecha | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(fechaHora);
  if (!partes) return null;
  const [, anio = "", mes = "", dia = "", hora = "", minuto = ""] = partes;
  const indiceMes = Number(mes) - 1;
  const diaSemana =
    DIAS[new Date(Date.UTC(Number(anio), indiceMes, Number(dia))).getUTCDay()] ?? "";
  return {
    diaSemana,
    dia: String(Number(dia)),
    mes: MESES[indiceMes] ?? "",
    anio,
    hora: `${hora}:${minuto}`,
  };
}

export function fechaLegible(fechaHora: string): string {
  const partes = partesFecha(fechaHora);
  if (!partes) return fechaHora;
  return `${partes.diaSemana} ${partes.dia} de ${partes.mes} de ${partes.anio} · ${partes.hora}`;
}

function fechaTexto(fechaHora: string): string {
  return `${fechaHora.slice(0, 10)} a las ${fechaHora.slice(11, 16)}`;
}

function textoMesa(datos: DatosReservacion): string {
  return datos.mesaNumero == null ? "" : ` La mesa asignada es la ${datos.mesaNumero}.`;
}

function metaReservacion(
  datos: DatosReservacion,
  opciones: { mesa: boolean; tolerancia?: boolean },
): string {
  const partes = partesFecha(datos.fechaHora);
  const valores: string[] = [];
  if (partes) valores.push(partes.anio);
  valores.push(`${datos.personas} ${datos.personas === 1 ? "persona" : "personas"}`);
  if (opciones.mesa) {
    valores.push(datos.mesaNumero == null ? "Mesa por asignar" : `Mesa ${datos.mesaNumero}`);
  }
  if (opciones.tolerancia) valores.push(`Tolerancia ${datos.toleranciaMinutos} min`);
  return valores.join(" · ");
}

function panelReservacion(datos: DatosReservacion, acento: string, meta: string): string {
  const partes = partesFecha(datos.fechaHora);
  const hora = partes?.hora ?? "—";
  const fecha = partes
    ? `${capitalizar(partes.diaSemana)} ${partes.dia} de ${partes.mes}`
    : fechaTexto(datos.fechaHora);

  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background-color:${MARCA.panel};border-left:3px solid ${acento};">
                <tr>
                  <td class="correo-panel-izq" width="40%" style="padding:20px 0 20px 20px;vertical-align:middle;">
                    <div class="correo-hora" style="font-family:${SERIF};font-size:34px;line-height:1;color:${acento};letter-spacing:-.02em;">${escaparHtml(hora)}</div>
                    <div style="margin-top:7px;font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase;color:${MARCA.muted};">Hora local</div>
                  </td>
                  <td class="correo-panel-der" width="60%" style="padding:20px 20px 20px 18px;border-left:1px solid ${MARCA.borde};vertical-align:middle;">
                    <div style="font-family:${SERIF};font-size:17px;line-height:1.35;color:${MARCA.texto};">${escaparHtml(fecha)}</div>
                    <div style="margin-top:6px;font-family:${SANS};font-size:12px;line-height:1.55;color:${MARCA.muted};">${escaparHtml(meta)}</div>
                  </td>
                </tr>
              </table>`;
}

function bloqueNota(texto: string): string {
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;border-top:1px solid ${MARCA.bordeSuave};border-bottom:1px solid ${MARCA.bordeSuave};">
                <tr>
                  <td style="padding:14px 0;font-family:${SANS};font-size:13px;line-height:1.65;color:${MARCA.muted};">${escaparHtml(texto)}</td>
                </tr>
              </table>`;
}

interface Contenido {
  asunto: string;
  preheader: string;
  etiqueta: string;
  titulo: string;
  saludo: string;
  parrafo: string;
  panel: string;
  nota: string;
  cierre: string;
  acento: string;
}

function construirHtml(contenido: Contenido): string {
  const titulo = escaparHtml(contenido.titulo);
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escaparHtml(contenido.asunto)}</title>
  <style>
    body,table,td,p,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    body { margin:0 !important; padding:0 !important; width:100% !important; }
    @media only screen and (max-width:480px) {
      .correo-header { padding:28px 20px 24px !important; }
      .correo-padding { padding:30px 24px 28px !important; }
      .correo-titulo { font-size:27px !important; line-height:1.2 !important; }
      .correo-hora { font-size:30px !important; }
      .correo-panel-izq { padding-left:16px !important; }
      .correo-panel-der { padding:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${MARCA.agaveProfundo};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent;">${escaparHtml(contenido.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MARCA.agaveProfundo};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${MARCA.crema};">

          <!-- Encabezado de marca -->
          <tr>
            <td class="correo-header" align="center" style="padding:34px 30px 30px;background-color:${MARCA.agaveProfundo};border-top:3px solid ${MARCA.dorado};">
              <p style="margin:0;font-family:${SERIF};font-size:31px;font-weight:normal;line-height:1.15;letter-spacing:-.01em;color:#fffaf1;">La Madalena</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:14px auto 10px;">
                <tr>
                  <td style="width:36px;height:1px;background-color:${MARCA.dorado};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0;font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase;color:#c9b48b;">Cocina mexicana contemporánea</p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td class="correo-padding" style="padding:38px 42px 36px;background-color:${MARCA.crema};border-top:4px solid ${contenido.acento};border-left:1px solid ${MARCA.borde};border-right:1px solid ${MARCA.borde};border-bottom:1px solid ${MARCA.borde};">
              <p style="margin:0;font-family:${SANS};font-size:11px;font-weight:bold;line-height:1.4;letter-spacing:.14em;text-transform:uppercase;color:${contenido.acento};">${escaparHtml(contenido.etiqueta)}</p>
              <h1 class="correo-titulo" style="margin:12px 0 0;font-family:${SERIF};font-size:32px;font-weight:normal;line-height:1.18;letter-spacing:-.02em;color:${MARCA.texto};">${titulo}</h1>

              <p style="margin:20px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${MARCA.texto};">${escaparHtml(contenido.saludo)}</p>
              <p style="margin:8px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${MARCA.texto};">${escaparHtml(contenido.parrafo)}</p>

              ${contenido.panel}

              ${bloqueNota(contenido.nota)}

              <p style="margin:26px 0 0;font-family:${SERIF};font-size:20px;font-style:italic;line-height:1.4;color:${contenido.acento};">${escaparHtml(contenido.cierre)}</p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td align="center" style="padding:26px 24px 8px;background-color:${MARCA.agaveProfundo};">
              <p style="margin:0;font-family:${SERIF};font-size:15px;line-height:1.4;color:#f2e6d3;">La Madalena</p>
              <p style="margin:6px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${MARCA.pie};">Recibes este correo porque hiciste una reservación.<br>Este mensaje se envió automáticamente; no es necesario responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function plantillaConfirmacion(
  datos: DatosReservacion & { evento: "creada" | "confirmada" },
): CorreoReservacion {
  const confirmada = datos.evento === "confirmada";
  const asunto = confirmada ? "Reservación confirmada" : "Reservación registrada";
  const texto = `Hola ${datos.nombre}, tu reservación en La Madalena quedó ${confirmada ? "confirmada" : "registrada"} para el ${fechaTexto(datos.fechaHora)}, para ${datos.personas} persona(s).${textoMesa(datos)} ¡Te esperamos!`;
  const fecha = fechaLegible(datos.fechaHora);
  const mesa =
    datos.mesaNumero == null
      ? "Te asignaremos una mesa al llegar."
      : `Ya tienes la mesa ${datos.mesaNumero} asignada.`;

  return {
    asunto,
    texto,
    html: construirHtml({
      asunto,
      preheader: `Tu reservación para el ${fecha} quedó ${confirmada ? "confirmada" : "registrada"}.`,
      etiqueta: confirmada ? "Reservación confirmada" : "Reservación registrada",
      titulo: confirmada ? "Todo listo para tu visita" : "Tu mesa está apartada",
      saludo: `Hola ${datos.nombre},`,
      parrafo: `Tu reservación quedó ${confirmada ? "confirmada" : "registrada"}. Te guardamos los detalles.`,
      panel: panelReservacion(datos, MARCA.terracota, metaReservacion(datos, { mesa: true })),
      nota: `${mesa} Llega dentro de los ${datos.toleranciaMinutos} minutos de tolerancia.`,
      cierre: "Te esperamos.",
      acento: MARCA.terracota,
    }),
  };
}

export function plantillaRecordatorio(datos: DatosReservacion): CorreoReservacion {
  const asunto = "Recordatorio de tu reservación";
  const fechaLocal = new Date(datos.fechaHora).toLocaleString("es-MX");
  const texto = `Hola ${datos.nombre}, te recordamos tu reservación en La Madalena para el ${fechaLocal}, para ${datos.personas} persona(s).${textoMesa(datos)} ¡Te esperamos!`;
  const fecha = fechaLegible(datos.fechaHora);

  return {
    asunto,
    texto,
    html: construirHtml({
      asunto,
      preheader: `Tu mesa te espera el ${fecha}.`,
      etiqueta: "Recordatorio de tu visita",
      titulo: "Tu mesa te espera",
      saludo: `Hola ${datos.nombre},`,
      parrafo: "Falta poco para tu visita. Estos son los detalles de tu reservación.",
      panel: panelReservacion(datos, MARCA.maiz, metaReservacion(datos, { mesa: true })),
      nota: `Te recomendamos llegar unos minutos antes. La tolerancia es de ${datos.toleranciaMinutos} minutos.`,
      cierre: "Nos vemos pronto.",
      acento: MARCA.maiz,
    }),
  };
}

export function plantillaVencida(datos: DatosReservacion): CorreoReservacion {
  const asunto = "Tu reservación venció";
  const texto = `Hola ${datos.nombre}, no registramos tu llegada a La Madalena dentro de los ${datos.toleranciaMinutos} minutos de tolerancia. Tu reservación del ${fechaTexto(datos.fechaHora)} para ${datos.personas} persona(s) venció y la mesa quedó liberada. Si tienes dudas o deseas visitarnos, contacta al restaurante para consultar disponibilidad.`;
  return {
    asunto,
    texto,
    html: construirHtml({
      asunto,
      preheader: `Tu reservación del ${fechaLegible(datos.fechaHora)} venció y la mesa quedó liberada.`,
      etiqueta: "Reservación vencida",
      titulo: "La mesa quedó liberada",
      saludo: `Hola ${datos.nombre},`,
      parrafo: `No registramos tu llegada dentro de los ${datos.toleranciaMinutos} minutos de tolerancia de tu reservación.`,
      panel: panelReservacion(datos, MARCA.peligro, metaReservacion(datos, { mesa: false, tolerancia: true })),
      nota: "La mesa quedó disponible para otro grupo. Si deseas visitarnos, contacta al restaurante para consultar disponibilidad.",
      cierre: "Gracias por tu comprensión.",
      acento: MARCA.peligro,
    }),
  };
}

export function plantillaCancelacion(datos: DatosReservacion): CorreoReservacion {
  const asunto = "Tu reservación fue cancelada";
  const texto = `Hola ${datos.nombre}, tu reservación en La Madalena para el ${fechaTexto(datos.fechaHora)}, para ${datos.personas} persona(s), fue cancelada y la mesa quedó liberada. Si no reconoces esta cancelación o deseas reservar de nuevo, contacta al restaurante.`;
  return {
    asunto,
    texto,
    html: construirHtml({
      asunto,
      preheader: `Tu reservación del ${fechaLegible(datos.fechaHora)} fue cancelada.`,
      etiqueta: "Reservación cancelada",
      titulo: "Tu reservación fue cancelada",
      saludo: `Hola ${datos.nombre},`,
      parrafo: "La reservación quedó cancelada y la mesa fue liberada. Estos eran los detalles.",
      panel: panelReservacion(datos, MARCA.neutro, metaReservacion(datos, { mesa: false })),
      nota: "Si no reconoces esta cancelación o quieres reservar de nuevo, contacta al restaurante para revisar la disponibilidad.",
      cierre: "Gracias por avisarnos.",
      acento: MARCA.neutro,
    }),
  };
}
