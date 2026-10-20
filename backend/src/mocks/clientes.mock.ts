/**
 * Datos falsos de clientes para probar la API sin tocar la base de datos real.
 * Salen de `database/init.sql` y `database/seed_demo.sql`. NO se usan en producción.
 */
export interface ClienteMock {
  id_cliente: number;
  nombre: string;
  telefono: string; // 10 dígitos, sin espacios ni guiones
  correo: string | null;
}

export const clientesMock: ClienteMock[] = [
  { id_cliente: 1, nombre: "Cliente Prueba", telefono: "3111234567", correo: "cliente@correo.com" },
  { id_cliente: 2, nombre: "Carlos Medina", telefono: "3115550201", correo: "carlos.medina@correo.test" },
  { id_cliente: 3, nombre: "Patricia Ruiz", telefono: "3115550202", correo: null },
  { id_cliente: 4, nombre: "Familia González", telefono: "3115550203", correo: null },
  { id_cliente: 5, nombre: "Daniel Ortega", telefono: "3115550204", correo: "daniel.ortega@correo.test" },
  { id_cliente: 6, nombre: "Elena Castillo", telefono: "3115550205", correo: null },
  { id_cliente: 7, nombre: "Héctor Salas", telefono: "3115550206", correo: null },
  { id_cliente: 8, nombre: "Valeria Núñez", telefono: "3115550207", correo: null },
];
