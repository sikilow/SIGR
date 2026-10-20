import "dotenv/config";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../services/db";

const usuarios = [
  { rol: "Gerente",  nombre: "Ana Gerente",  correo: "gerente@sigr.com",  user: "gerente",  pass: "1234" },
  { rol: "Mesero",   nombre: "Luis Mesero",  correo: "mesero@sigr.com",   user: "mesero",   pass: "1234" },
  { rol: "Cocinero", nombre: "Pedro Cocina", correo: "cocinero@sigr.com", user: "cocinero", pass: "1234" },
  { rol: "Cajero",   nombre: "Marta Caja",   correo: "cajero@sigr.com",   user: "cajero",   pass: "1234" },
  { rol: "Hostess",  nombre: "Sofía Hostess", correo: "hostess@sigr.com", user: "hostess",  pass: "1234" },
];

async function main() {
  for (const u of usuarios) {
    const [existe] = await pool.query<RowDataPacket[]>(
      "SELECT 1 FROM credenciales WHERE nombre_usuario = ?", [u.user]
    );
    if (existe.length) { console.log(`Ya existe: ${u.user}`); continue; }

    const [rol] = await pool.query<RowDataPacket[]>(
      "SELECT id_rol FROM rol WHERE nombre = ?", [u.rol]
    );
    const idRol = rol[0]?.id_rol;
    if (!idRol) throw new Error(`No existe el rol ${u.rol}. ¿Corriste database/init.sql?`);
    const [ins] = await pool.query<ResultSetHeader>(
      "INSERT INTO usuario (id_rol, nombre, correo) VALUES (?, ?, ?)",
      [idRol, u.nombre, u.correo]
    );
    const hash = await bcrypt.hash(u.pass, 10);
    await pool.query(
      "INSERT INTO credenciales (id_usuario, nombre_usuario, password_hash) VALUES (?, ?, ?)",
      [ins.insertId, u.user, hash]
    );
    await pool.query("INSERT INTO perfil_usuario (id_usuario) VALUES (?)", [ins.insertId]);
    console.log(`Creado: ${u.user} (${u.rol})`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });