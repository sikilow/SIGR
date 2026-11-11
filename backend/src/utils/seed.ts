import "dotenv/config";
import bcrypt from "bcryptjs";
import { ejecutar, filas, pool, transaccion } from "../services/db";

const usuarios = [
  { rol: "Gerente",  nombre: "Ana Gerente",  correo: "gerente@sigr.com",  user: "gerente",  pass: "1234" },
  { rol: "Mesero",   nombre: "Luis Mesero",  correo: "mesero@sigr.com",   user: "mesero",   pass: "1234" },
  { rol: "Cocinero", nombre: "Pedro Cocina", correo: "cocinero@sigr.com", user: "cocinero", pass: "1234" },
  { rol: "Cajero",   nombre: "Marta Caja",   correo: "cajero@sigr.com",   user: "cajero",   pass: "1234" },
  { rol: "Hostess",  nombre: "Sofía Hostess", correo: "hostess@sigr.com", user: "hostess",  pass: "1234" },
];

async function main() {
  for (const u of usuarios) {
    const [existe] = await filas(pool, "SELECT 1 FROM credenciales WHERE nombre_usuario = ?", [u.user]);
    if (existe) { console.log(`Ya existe: ${u.user}`); continue; }

    const [rol] = await filas(pool, "SELECT id_rol FROM rol WHERE nombre = ?", [u.rol]);
    const idRol = rol?.id_rol;
    if (!idRol) throw new Error(`No existe el rol ${u.rol}. ¿Corriste npm run db:migrar?`);
    const hash = await bcrypt.hash(u.pass, 10);
    await transaccion(async (cx) => {
      const { insertId } = await ejecutar(
        cx,
        "INSERT INTO usuario (id_rol, nombre, correo) VALUES (?, ?, ?) RETURNING id_usuario",
        [idRol, u.nombre, u.correo],
      );
      await ejecutar(cx, "INSERT INTO credenciales (id_usuario, nombre_usuario, password_hash) VALUES (?, ?, ?)", [insertId, u.user, hash]);
      await ejecutar(cx, "INSERT INTO perfil_usuario (id_usuario) VALUES (?)", [insertId]);
    });
    console.log(`Creado: ${u.user} (${u.rol})`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
