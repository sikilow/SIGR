
-- ============================================
-- SIGR - MIGRACION 014
-- AUTENTICACION DE CLIENTES WEB
-- ============================================

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
);

-- Agregar indice unico al correo si no existe
-- y si no hay correos duplicados.
SET @indice_existe = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'cliente'
      AND index_name = 'uq_cliente_correo'
);

SET @sql = IF(
    @indice_existe = 0,
    'ALTER TABLE cliente ADD CONSTRAINT uq_cliente_correo UNIQUE (correo)',
    'SELECT ''El indice de correo ya existe'' AS mensaje'
);

PREPARE sentencia FROM @sql;
EXECUTE sentencia;
DEALLOCATE PREPARE sentencia;
