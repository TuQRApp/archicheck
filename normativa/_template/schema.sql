-- ============================================================
-- Template para nueva comuna
-- Copiar este archivo a normativa/{slug_comuna}/schema.sql
-- y completar los INSERT con los datos reales del PRC.
-- ============================================================

-- Ejecutar primero normativa/nunoa/schema.sql para crear las tablas
-- (CREATE TABLE IF NOT EXISTS — idempotente)

-- 1. Registrar la comuna
INSERT INTO comunas (id, nombre, region, prc_nombre, prc_version, activa, fuente) VALUES
('slug_comuna', 'Nombre Comuna', 'Metropolitana', 'PRC Nombre', 'Versión YYYY', FALSE, 'Fuente legal')
ON CONFLICT (id) DO NOTHING;

-- 2. Registrar zonas
-- INSERT INTO zonas (id, comuna_id, nombre, tipo) VALUES
-- ('Z-X', 'slug_comuna', 'Zona Z-X', 'residencial')
-- ON CONFLICT (id, comuna_id) DO NOTHING;

-- 3. Cargar normas de edificación
-- INSERT INTO normas_edificacion (zona_id, comuna_id, ...) VALUES (...);

-- 4. Cargar patrimonio (si aplica)
-- INSERT INTO patrimonio (id, comuna_id, ...) VALUES (...);

-- 5. Activar la comuna cuando los datos estén completos
-- UPDATE comunas SET activa = TRUE WHERE id = 'slug_comuna';
