-- ============================================
-- SIGR - MIGRACION 014
-- AUTENTICACION DE CLIENTES WEB
-- Puede volver a ejecutarse: si se detiene por correos repetidos,
-- corrigelos y ejecuta el archivo completo otra vez.
-- ============================================

USE SIGR;

-- Crear tabla para las contraseñas de clientes
CREATE TABLE IF NOT EXISTS cliente_credencial (
    id_credencial INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    CONSTRAINT fk_credencial_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES cliente(id_cliente)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Normalizar correos: vacios a NULL y el resto en minusculas sin espacios,
-- igual que los guarda el portal de clientes.
UPDATE cliente SET correo = NULL
WHERE correo IS NOT NULL AND TRIM(correo) = '';

UPDATE cliente SET correo = LOWER(TRIM(correo))
WHERE correo IS NOT NULL AND correo <> LOWER(TRIM(correo));

-- Correos que comparten dos o mas clientes. Si hay alguno,
-- el indice unico no se crea y se listan para corregirlos.
SET @correos_repetidos = (
    SELECT COUNT(*) FROM (
        SELECT correo
        FROM cliente
        WHERE correo IS NOT NULL
        GROUP BY correo
        HAVING COUNT(*) > 1
    ) AS repetidos
);

SET @indice_existe = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'cliente'
      AND index_name = 'uq_cliente_correo'
);

SET @sql = CASE
    WHEN @indice_existe > 0 THEN
        'SELECT ''El indice de correo ya existe'' AS mensaje'
    WHEN @correos_repetidos > 0 THEN
        'SELECT ''ATENCION: hay correos repetidos. Deja cada correo en un solo cliente (Hostess o UPDATE cliente SET correo = NULL ...) y vuelve a ejecutar 014.'' AS mensaje,
                correo, GROUP_CONCAT(id_cliente ORDER BY id_cliente) AS id_clientes
         FROM cliente
         WHERE correo IS NOT NULL
         GROUP BY correo
         HAVING COUNT(*) > 1'
    ELSE
        'ALTER TABLE cliente ADD CONSTRAINT uq_cliente_correo UNIQUE (correo)'
END;

PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;
