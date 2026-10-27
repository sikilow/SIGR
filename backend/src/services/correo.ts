import nodemailer from "nodemailer";
import { Resend } from "resend";
import {
  CORREO_PROVEEDOR,
  CORREO_REMITENTE,
  RESEND_API_KEY,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_USER,
} from "../utils/config";

export interface CorreoEntrada {
  para: string;
  asunto: string;
  texto: string;
  html?: string;
  responderA?: string;
  idempotencyKey?: string;
}

let transporteSmtp: ReturnType<typeof nodemailer.createTransport> | undefined;
let clienteResend: Resend | undefined;
const erroresPorClave = new Map<string, string>();

export function esCorreoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
}

function enmascararCorreo(correo: string): string {
  const [usuario, dominio] = correo.split("@");
  if (!usuario || !dominio) return "***";
  return `${usuario[0]}***@${dominio}`;
}

function mensajeSeguro(error: unknown, destinatario: string): string {
  let mensaje = error instanceof Error ? error.message : String(error);
  for (const dato of [destinatario, SMTP_USER, SMTP_PASS, RESEND_API_KEY]) {
    if (dato) {
      const patron = new RegExp(dato.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      mensaje = mensaje.replace(patron, dato === destinatario ? enmascararCorreo(dato) : "[oculto]");
    }
  }
  return mensaje.slice(0, 500);
}

function guardarError(idempotencyKey: string | undefined, mensaje: string): void {
  if (!idempotencyKey) return;
  erroresPorClave.set(idempotencyKey, mensaje);
  if (erroresPorClave.size > 100) {
    const primeraClave = erroresPorClave.keys().next().value;
    if (primeraClave !== undefined) erroresPorClave.delete(primeraClave);
  }
}

export function consumirErrorEnvioCorreo(idempotencyKey: string): string | null {
  const mensaje = erroresPorClave.get(idempotencyKey) ?? null;
  erroresPorClave.delete(idempotencyKey);
  return mensaje;
}

function obtenerTransporteSmtp(): ReturnType<typeof nodemailer.createTransport> {
  if (!transporteSmtp) {
    transporteSmtp = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }
  return transporteSmtp;
}

function correoDelRemitente(remitente: string): string {
  const entreAngulos = /<([^<>]+)>/.exec(remitente)?.[1];
  return (entreAngulos ?? remitente).trim();
}

export async function enviarCorreo({
  para,
  asunto,
  texto,
  html,
  responderA,
  idempotencyKey,
}: CorreoEntrada): Promise<boolean> {
  if (!esCorreoValido(para)) {
    const mensaje = "El destinatario no tiene un formato de correo válido.";
    guardarError(idempotencyKey, mensaje);
    console.warn(`No se envió el correo a ${enmascararCorreo(para)}: formato inválido.`);
    return false;
  }
  if (idempotencyKey) erroresPorClave.delete(idempotencyKey);

  try {
    if (!CORREO_PROVEEDOR) {
      throw new Error("El correo está desactivado: configura Resend o SMTP.");
    }
    if (!CORREO_REMITENTE) {
      throw new Error("CORREO_REMITENTE no está configurado.");
    }

    if (CORREO_PROVEEDOR === "smtp") {
      if (!SMTP_USER || !SMTP_PASS) {
        throw new Error("SMTP no está configurado: faltan SMTP_USER o SMTP_PASS.");
      }
      if (
        SMTP_HOST.toLowerCase() === "smtp.gmail.com" &&
        correoDelRemitente(CORREO_REMITENTE).toLowerCase() !== SMTP_USER.toLowerCase()
      ) {
        throw new Error("Para Gmail SMTP, CORREO_REMITENTE debe coincidir con SMTP_USER.");
      }

      const opciones = {
        from: CORREO_REMITENTE,
        to: para.trim(),
        subject: asunto,
        text: texto,
        ...(html !== undefined ? { html } : {}),
        ...(responderA !== undefined ? { replyTo: responderA } : {}),
      };
      const respuesta = await obtenerTransporteSmtp().sendMail(opciones);
      if (
        Array.isArray(respuesta.rejected) &&
        respuesta.rejected.some((destinatario: unknown) =>
          String(destinatario).toLowerCase() === para.trim().toLowerCase(),
        )
      ) {
        throw new Error(String(respuesta.response ?? "SMTP rechazó el destinatario."));
      }
      return true;
    }

    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no está configurada.");
    clienteResend ??= new Resend(RESEND_API_KEY);
    const opciones = {
      from: CORREO_REMITENTE,
      to: para.trim(),
      subject: asunto,
      text: texto,
      ...(html !== undefined ? { html } : {}),
      ...(responderA !== undefined ? { replyTo: responderA } : {}),
    };
    const respuesta = idempotencyKey
      ? await clienteResend.emails.send(opciones, { idempotencyKey })
      : await clienteResend.emails.send(opciones);

    if (respuesta.error) throw new Error(respuesta.error.message);
    if (!respuesta.data) throw new Error("Resend no confirmó la aceptación del correo.");
    return true;
  } catch (error) {
    const mensaje = mensajeSeguro(error, para);
    guardarError(idempotencyKey, mensaje);
    console.error(`No se pudo enviar correo a ${enmascararCorreo(para)}: ${mensaje}`);
    return false;
  }
}
