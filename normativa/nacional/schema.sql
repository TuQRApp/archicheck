-- ============================================================
-- NORMATIVA NACIONAL CHILE
-- OGUC (D.S. 47/1992, última versión 29-03-2026)
-- LGUC (D.S. 458/1975, última versión 29-03-2026)
-- Ley 19300 (última versión 10-04-2024)
-- ============================================================

-- Registro de instrumentos legales nacionales
CREATE TABLE IF NOT EXISTS normativa_nacional (
    id VARCHAR(20) PRIMARY KEY,        -- 'oguc', 'lguc', 'ley19300'
    nombre VARCHAR(200) NOT NULL,
    decreto VARCHAR(50),
    numero_ley VARCHAR(20),
    ministerio VARCHAR(200),
    ultima_version DATE,
    total_articulos INTEGER,
    activo BOOLEAN DEFAULT TRUE
);

-- Artículos indexados para búsqueda
CREATE TABLE IF NOT EXISTS normativa_nacional_articulos (
    id SERIAL PRIMARY KEY,
    instrumento_id VARCHAR(20) REFERENCES normativa_nacional(id),
    numero VARCHAR(20) NOT NULL,
    tema VARCHAR(100),
    texto TEXT NOT NULL,
    UNIQUE(instrumento_id, numero)
);

-- Reglas de verificación transversal
CREATE TABLE IF NOT EXISTS reglas_verificacion_nacional (
    id VARCHAR(80) PRIMARY KEY,
    descripcion TEXT NOT NULL,
    referencia TEXT NOT NULL,
    aplica_a TEXT[],          -- array de tipos de proyecto
    verificacion TEXT,        -- qué revisar en el expediente
    activa BOOLEAN DEFAULT TRUE
);

-- ── DATOS ────────────────────────────────────────────────────────

INSERT INTO normativa_nacional VALUES
('oguc',     'Ordenanza General de Urbanismo y Construcciones', '47',  NULL,    'Ministerio de Vivienda y Urbanismo',                  '2026-03-29', 644, TRUE),
('lguc',     'Ley General de Urbanismo y Construcciones',       '458', NULL,    'Ministerio de Vivienda y Urbanismo',                  '2026-03-29', 234, TRUE),
('ley19300', 'Ley sobre Bases Generales del Medio Ambiente',    NULL,  '19300', 'Ministerio Secretaría General de la Presidencia',     '2024-04-10', 126, TRUE)
ON CONFLICT (id) DO UPDATE SET ultima_version = EXCLUDED.ultima_version, activo = TRUE;

INSERT INTO reglas_verificacion_nacional (id, descripcion, referencia, aplica_a, verificacion) VALUES
('permiso_construccion_obligatorio',
 'Todo proyecto de construcción nueva, reconstrucción, reparación, alteración, ampliación o demolición requiere permiso municipal',
 'LGUC Art. 116',
 ARRAY['obra_nueva','ampliacion','reparacion','alteracion','demolicion'],
 'Confirmar que expediente incluye solicitud de permiso DOM'),

('recepcion_final_obligatoria',
 'Toda edificación requiere recepción final antes de ser habitada o usada',
 'LGUC Art. 118',
 ARRAY['obra_nueva','ampliacion'],
 'Confirmar que expediente incluye tramitación de recepción final'),

('accesibilidad_universal',
 'Todo edificio de uso público debe cumplir condiciones de accesibilidad universal',
 'OGUC Art. 4.1.1 – 4.1.7',
 ARRAY['equipamiento','comercio','servicios','educacion','salud','cultura'],
 'Verificar rampas, pasillos mínimos 1.5m, baños accesibles, estacionamientos discapacidad'),

('carga_ocupacion',
 'Todo proyecto debe calcular la carga de ocupación para determinar salidas y estacionamientos',
 'OGUC Art. 4.2.4',
 ARRAY['todos'],
 'Confirmar que memoria incluye cálculo de carga de ocupación'),

('resistencia_al_fuego',
 'Los elementos estructurales deben cumplir resistencia al fuego según destino y altura',
 'OGUC Art. 4.3.3',
 ARRAY['todos'],
 'Verificar especificaciones técnicas de estructura y tabique'),

('vias_evacuacion',
 'Todo edificio debe contar con vías de evacuación y escaleras de emergencia',
 'OGUC Art. 4.3.4 – 4.3.5',
 ARRAY['todos'],
 'Verificar ancho mínimo de pasillos, escaleras y distancia máxima a salida'),

('ventilacion_iluminacion',
 'Todo recinto habitable debe tener ventilación e iluminación natural mínima',
 'OGUC Art. 4.2.5 – 4.2.6',
 ARRAY['residencial','equipamiento'],
 'Verificar superficies de ventana ≥ 10% superficie del recinto'),

('altura_minima_pisos',
 'Altura mínima libre de piso a cielo: 2.30m en recintos habitables, 2.20m en baños y cocinas',
 'OGUC Art. 4.2.7',
 ARRAY['residencial','equipamiento'],
 'Verificar cotas de altura en planos de corte'),

('seia_obligatorio',
 'Proyectos que superen umbrales de tamaño o impacto deben ingresar al SEIA',
 'Ley 19300 Art. 10',
 ARRAY['obra_nueva','ampliacion'],
 'Verificar si proyecto supera umbrales del Art. 10 Ley 19300'),

('cambio_destino',
 'El cambio de destino requiere cumplir normas del nuevo uso y tramitación ante DOM',
 'LGUC Art. 57 – 59',
 ARRAY['cambio_destino'],
 'Verificar solicitud de cambio de destino con cumplimiento de nueva normativa'),

('urbanizacion_previa',
 'Todo proyecto que contemple nuevos lotes debe contar con urbanización completa previa',
 'OGUC Art. 3.2.1 – 3.2.3',
 ARRAY['loteo','subdivision'],
 'Verificar factibilidades de agua potable, alcantarillado, electricidad y pavimentación'),

('proteccion_patrimonio',
 'Intervenciones en inmuebles o zonas de conservación histórica requieren autorización CMN o DOM',
 'LGUC Art. 60',
 ARRAY['patrimonio'],
 'Verificar si predio está en zona patrimonial y si cuenta con autorización correspondiente')
ON CONFLICT (id) DO NOTHING;
