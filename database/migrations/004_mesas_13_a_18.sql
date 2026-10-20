-- MIGRACIÓN 04: agrega seis mesas nuevas (13-18) a una base SIGR existente.
-- Es segura para volver a ejecutar: solo inserta números que todavía no existen.
USE SIGR;

INSERT INTO mesa (numero, capacidad)
SELECT nuevas.numero, nuevas.capacidad
FROM (
  SELECT 13 AS numero, 2 AS capacidad
  UNION ALL SELECT 14, 2
  UNION ALL SELECT 15, 4
  UNION ALL SELECT 16, 4
  UNION ALL SELECT 17, 6
  UNION ALL SELECT 18, 8
) AS nuevas
LEFT JOIN mesa AS existente ON existente.numero = nuevas.numero
WHERE existente.id_mesa IS NULL;

SELECT numero, capacidad, estado
FROM mesa
WHERE numero BETWEEN 13 AND 18
ORDER BY numero;
