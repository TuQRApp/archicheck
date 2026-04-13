-- ============================================================
-- PRC Ñuñoa — Schema + seed data
-- Fuente: Texto Refundido Abril 2025
-- ============================================================

-- Registro maestro de comunas con normativa cargada
CREATE TABLE IF NOT EXISTS comunas (
  id VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  region VARCHAR(100),
  prc_nombre VARCHAR(200),
  prc_version VARCHAR(200),
  activa BOOLEAN DEFAULT TRUE,
  fecha_carga TIMESTAMPTZ DEFAULT NOW(),
  fuente TEXT
);

-- Zonas de cada comuna
CREATE TABLE IF NOT EXISTS zonas (
  id VARCHAR(20),
  comuna_id VARCHAR(50) REFERENCES comunas(id),
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(30),
  activa BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (id, comuna_id)
);

-- Normas de edificación por zona
CREATE TABLE IF NOT EXISTS normas_edificacion (
  id SERIAL PRIMARY KEY,
  zona_id VARCHAR(20),
  comuna_id VARCHAR(50),
  uso VARCHAR(30) DEFAULT 'general',
  condicion VARCHAR(100),
  subdivision_predial_minima_m2 NUMERIC(10,2),
  coef_ocupacion_suelo NUMERIC(4,3),
  coef_ocupacion_suelo_pisos_superiores NUMERIC(4,3),
  coef_constructibilidad NUMERIC(5,2),
  densidad_bruta_maxima_hab_ha NUMERIC(8,1),
  altura_maxima_m NUMERIC(6,2),
  altura_maxima_pisos INTEGER,
  altura_max_continua_m NUMERIC(6,2),
  altura_max_continua_pisos INTEGER,
  altura_max_aislada_sobre_continua_m NUMERIC(6,2),
  altura_max_aislada_sobre_continua_pisos INTEGER,
  antejardín_general_m NUMERIC(5,2),
  antejardín_1a3_pisos_m NUMERIC(5,2),
  antejardín_4_pisos_mas VARCHAR(100),
  rasante_grados INTEGER,
  agrupamiento_continuo BOOLEAN DEFAULT FALSE,
  agrupamiento_aislado BOOLEAN DEFAULT FALSE,
  agrupamiento_pareado BOOLEAN DEFAULT FALSE,
  porcentaje_max_pareo_pct NUMERIC(4,1),
  dist_min_deslindes_hasta_3p VARCHAR(100),
  dist_min_deslindes_4p_mas_m NUMERIC(5,2),
  dist_min_deslindes_aislada_sobre_continua_m NUMERIC(5,2),
  retranqueo_aislada_sobre_continua_m NUMERIC(5,2),
  cuerpos_salientes_antejardín_m NUMERIC(4,2),
  prof_max_edificacion_continua_pct NUMERIC(4,1),
  subterraneo_dist_min_deslinde_m NUMERIC(4,2),
  subterraneo_ocupacion_max_pct NUMERIC(4,1),
  area_libre_esparcimiento_pct NUMERIC(4,1),
  observaciones TEXT,
  FOREIGN KEY (zona_id, comuna_id) REFERENCES zonas(id, comuna_id)
);

-- Estacionamientos (Art. 14 PRC Ñuñoa)
CREATE TABLE IF NOT EXISTS estacionamientos_reglas (
  id VARCHAR(80),
  comuna_id VARCHAR(50) REFERENCES comunas(id),
  categoria VARCHAR(80) NOT NULL,
  destino VARCHAR(200) NOT NULL,
  formula_vehiculos TEXT NOT NULL,
  formula_bicicletas TEXT,
  descripcion TEXT,
  referencia_legal TEXT,
  PRIMARY KEY (id, comuna_id)
);

-- Patrimonio por comuna
CREATE TABLE IF NOT EXISTS patrimonio (
  id VARCHAR(20),
  comuna_id VARCHAR(50) REFERENCES comunas(id),
  tipo VARCHAR(10),
  nombre VARCHAR(200),
  ubicacion TEXT,
  decreto TEXT,
  subdivision_predial_minima_m2 NUMERIC(10,2),
  tipo_agrupamiento VARCHAR(100),
  altura_maxima_m NUMERIC(6,2),
  altura_maxima_pisos INTEGER,
  coef_ocupacion_suelo NUMERIC(4,3),
  coef_constructibilidad NUMERIC(5,2),
  antejardín TEXT,
  densidad_bruta_maxima_hab_ha NUMERIC(8,1),
  estacionamientos TEXT,
  observaciones TEXT,
  PRIMARY KEY (id, comuna_id)
);

-- ============================================================
-- SEED: Ñuñoa
-- ============================================================

INSERT INTO comunas (id, nombre, region, prc_nombre, prc_version, activa, fuente) VALUES
('nunoa', 'Ñuñoa', 'Metropolitana', 'PRC Ñuñoa', 'Texto Refundido Abril 2025', TRUE,
 'Municipalidad de Ñuñoa — MPRCÑ-18 D.O. 30.08.2019 + Fallo CA Santiago D.O. 26.11.2024 + Enmienda N°1 D.A. 2582 del 17.12.2024')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zonas (id, comuna_id, nombre, tipo) VALUES
('Z-1',    'nunoa', 'Zona Z-1',    'residencial'),
('Z-1A',   'nunoa', 'Zona Z-1A',   'residencial'),
('Z-1B',   'nunoa', 'Zona Z-1B',   'residencial'),
('Z-1C',   'nunoa', 'Zona Z-1C',   'mixta'),
('Z-1D',   'nunoa', 'Zona Z-1D',   'residencial'),
('Z-2',    'nunoa', 'Zona Z-2',    'residencial'),
('Z-3',    'nunoa', 'Zona Z-3',    'residencial'),
('Z-3A',   'nunoa', 'Zona Z-3A',   'residencial'),
('Z-4',    'nunoa', 'Zona Z-4',    'residencial'),
('Z-4m',   'nunoa', 'Zona Z-4m',   'residencial'),
('Z-4A',   'nunoa', 'Zona Z-4A',   'residencial'),
('Z-4B',   'nunoa', 'Zona Z-4B',   'residencial'),
('Z-4C',   'nunoa', 'Zona Z-4C',   'residencial'),
('Z-4C+R', 'nunoa', 'Zona Z-4C+R', 'residencial'),
('Z-4C+RB','nunoa', 'Zona Z-4C+RB','residencial'),
('Z-5',    'nunoa', 'Zona Z-5',    'residencial'),
('Z-5A',   'nunoa', 'Zona Z-5A',   'residencial'),
('Z-5B',   'nunoa', 'Zona Z-5B',   'residencial'),
('Z-6',    'nunoa', 'Zona Z-6',    'equipamiento'),
('Z-7',    'nunoa', 'Zona Z-7',    'residencial'),
('ZI-1',   'nunoa', 'Zona ZI-1',   'industrial'),
('ZT-6',   'nunoa', 'Zona ZT-6',   'patrimonial')
ON CONFLICT (id, comuna_id) DO NOTHING;

INSERT INTO normas_edificacion
(zona_id, comuna_id, subdivision_predial_minima_m2, coef_ocupacion_suelo, coef_constructibilidad,
 altura_maxima_m, altura_maxima_pisos, altura_max_continua_m, altura_max_continua_pisos,
 altura_max_aislada_sobre_continua_m, altura_max_aislada_sobre_continua_pisos,
 antejardín_general_m, rasante_grados, densidad_bruta_maxima_hab_ha,
 agrupamiento_continuo, agrupamiento_aislado, agrupamiento_pareado) VALUES
('Z-1',  'nunoa', 500,  0.60, 4.0,  44, 15, 17.5, 6, 25.5, 9,  7, 70, NULL, TRUE,  TRUE,  FALSE),
('Z-1A', 'nunoa', 500,  0.60, 3.6,  44, 15, 7,    2, 37,   13, 7, 70, 1800, TRUE,  TRUE,  FALSE),
('Z-1B', 'nunoa', 500,  0.60, 3.2,  30, 10, 7,    2, 23,   8,  7, 70, 1600, TRUE,  TRUE,  FALSE),
('Z-1C', 'nunoa', NULL, 0.60, 2.0,  7,  NULL, NULL, NULL, 10.5, NULL, NULL, 70, 1200, TRUE, TRUE, FALSE),
('Z-1D', 'nunoa', 500,  0.60, 2.4,  21, 7,  7,    2, 14,   5,  7, 70, 1400, TRUE,  TRUE,  FALSE),
('Z-2',  'nunoa', 500,  0.50, 2.0,  28, 10, NULL, NULL, NULL, NULL, 7, 60, 1600, FALSE, TRUE, TRUE),
('Z-3',  'nunoa', 300,  0.50, 1.8,  23, 8,  NULL, NULL, NULL, NULL, 7, 60, 1300, FALSE, TRUE, TRUE),
('Z-3A', 'nunoa', 300,  0.50, 1.8,  14, 5,  NULL, NULL, NULL, NULL, 7, 60, 1100, FALSE, TRUE, TRUE),
('Z-4',  'nunoa', 300,  0.40, 1.5,  14, 5,  NULL, NULL, NULL, NULL, 5, 60, 850,  FALSE, TRUE, FALSE),
('Z-4m', 'nunoa', 300,  0.40, 1.0,  8,  3,  NULL, NULL, NULL, NULL, 5, 60, 850,  FALSE, TRUE, TRUE),
('Z-4A', 'nunoa', 300,  0.50, 2.0,  17.5, NULL, NULL, NULL, NULL, NULL, 5, 60, 850, FALSE, TRUE, FALSE),
('Z-4B', 'nunoa', 300,  0.40, 1.8,  22, 8,  NULL, NULL, NULL, NULL, 5, 60, 1300, FALSE, TRUE, FALSE),
('Z-4C', 'nunoa', 300,  0.40, 1.5,  14, 5,  NULL, NULL, NULL, NULL, 5, 60, 800,  FALSE, TRUE, FALSE),
('Z-4C+R',  'nunoa', 300, 0.40, 1.5, 14, 5, NULL, NULL, NULL, NULL, 5, 60, 800,  FALSE, TRUE, FALSE),
('Z-4C+RB', 'nunoa', 300, 0.40, 1.5, 14, 5, NULL, NULL, NULL, NULL, 5, 60, 800,  FALSE, TRUE, FALSE),
('Z-5',  'nunoa', 300,  0.60, 1.5,  8,  3,  NULL, NULL, NULL, NULL, 5, NULL, 500, FALSE, TRUE, TRUE),
('Z-5A', 'nunoa', 300,  0.50, 1.5,  9,  3,  NULL, NULL, NULL, NULL, 5, 60, 500,  FALSE, TRUE, TRUE),
('Z-5B', 'nunoa', 300,  0.60, 1.5,  9,  3,  NULL, NULL, NULL, NULL, 5, 60, 1000, FALSE, TRUE, TRUE),
('Z-6',  'nunoa', 6500, 0.20, 1.0,  9,  3,  NULL, NULL, NULL, NULL, 5, 60, NULL, FALSE, TRUE, FALSE),
('Z-7',  'nunoa', 300,  0.60, 1.5,  8,  NULL, NULL, NULL, NULL, NULL, 5, NULL, NULL, FALSE, TRUE, TRUE),
('ZI-1', 'nunoa', 5000, 0.60, 1.5,  15, 5,  NULL, NULL, NULL, NULL, 7, 60, NULL, FALSE, TRUE, FALSE),
('ZT-6', 'nunoa', 300,  0.50, 1.5,  9,  3,  NULL, NULL, NULL, NULL, 5, 60, 500,  FALSE, TRUE, TRUE);

INSERT INTO patrimonio (id, comuna_id, tipo, nombre, ubicacion, decreto, altura_maxima_m, altura_maxima_pisos, coef_ocupacion_suelo, coef_constructibilidad, antejardín, densidad_bruta_maxima_hab_ha, observaciones) VALUES
('MH-1',  'nunoa', 'MH',  'Estadio Nacional',                  'Av. Grecia 2001',          'Monumento Histórico', 30,   10, 0.20, 2.5, '15m',              NULL, NULL),
('MH-2',  'nunoa', 'MH',  'Casa Cultura Ñuñoa / Palacio Ossa', 'Irarrázaval 4055',         'Monumento Histórico', 15,   4,  0.20, 0.4, '60m',              NULL, 'Antejardín modificado de 78m a 60m por Enmienda N°1, D.A. Nº 2582 del 17.12.2024'),
('MH-3',  'nunoa', 'MH',  'Sitio José Domingo Cañas',          'José Domingo Cañas 1367',  'Monumento Histórico', 9,    3,  0.40, 1.0, '10m',              NULL, NULL),
('ZT-1',  'nunoa', 'ZT',  'Pobla. Suboficiales Caballería',    NULL, NULL,                                        7,    2,  0.70, 1.0, 'según loteo',      250,  NULL),
('ZT-2',  'nunoa', 'ZT',  'Pobla. Empleados Públicos Chile-España', NULL, NULL,                                   7,    2,  0.60, 1.2, 'según loteo',      250,  NULL),
('ZT-3',  'nunoa', 'ZT',  'Conjunto Empart',                   NULL, NULL,                                        14,   4,  0.40, 1.6, 'según loteo',      300,  NULL),
('ZT-4',  'nunoa', 'ZT',  'Villa Frei Sector 1',               NULL, NULL,                                        15,   4,  0.40, 2.5, NULL,               550,  NULL),
('ZT-5',  'nunoa', 'ZT',  'Villa Olímpica',                    NULL, NULL,                                        15,   4,  0.50, 2.0, 'según loteo',      700,  NULL),
('ZCH-1', 'nunoa', 'ZCH', 'Población Elías de la Cruz',        NULL, NULL,                                        8.5,  2,  0.60, 1.2, 'según loteo',      250,  NULL),
('ICH-1', 'nunoa', 'ICH', 'Palacio Ortuzar',                   'Irarrázaval 4250',         NULL,                  15,   4,  0.40, 1.0, 'según loteo',      NULL, NULL),
('ICH-2', 'nunoa', 'ICH', 'Palacio García',                    'Irarrázaval 4280',         NULL,                  15,   4,  0.40, 1.5, 'según loteo',      NULL, NULL),
('ICH-3', 'nunoa', 'ICH', 'Quinta Hamburgo',                   'Hamburgo 330–370',         NULL,                  8,    3,  0.40, 1.2, 'según loteo',      250,  NULL),
('ICH-4', 'nunoa', 'ICH', 'Palacio Torres',                    'Brown Norte 105',          NULL,                  12,   4,  0.40, 1.2, 'según loteo',      NULL, NULL),
('ICH-5', 'nunoa', 'ICH', 'Instituto Chileno Británico',       'Campos de Deportes 181',   NULL,                  9,    3,  0.70, 1.8, 'según loteo',      500,  NULL)
ON CONFLICT (id, comuna_id) DO NOTHING;
