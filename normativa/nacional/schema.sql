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
--
-- CORREGIDO 2026-09-21: este bloque es una copia duplicada de
-- normativa/nacional/reglas_verificacion.json, que se auditó y corrigió hoy
-- (8 de 12 citas estaban mal -- ver Fase 2/Convenciones_BIM.md seccion E y
-- memoria project_archicheck_normativa_auditoria_integridad para el detalle
-- completo de cada hallazgo, verificado contra el texto real de oguc_pdf.json/
-- lguc_pdf.json, no contra un resumen). Este INSERT tenia `ON CONFLICT DO
-- NOTHING`, por lo que si ya se corrio una vez contra la base real, las filas
-- YA INSERTADAS con las citas viejas NO se corrigen solo con el fix del texto
-- de este archivo -- se cambio a `ON CONFLICT (id) DO UPDATE SET ...` abajo
-- (correccion de fraseo 2026-09-21, Revision Ing SW Paso 2/DeepSeek: esto
-- decia antes "se agrega un UPDATE explicito abajo", pero no hay un UPDATE
-- separado, es el mismo INSERT con DO UPDATE en vez de DO NOTHING) para que
-- el UPSERT aplique la correccion tambien a filas existentes, idempotente
-- (seguro correrlo mas de una vez).
--
-- NOTA APARTE (no corregida en este mismo commit, solo documentada): los
-- total_articulos de normativa_nacional (OGUC 644, LGUC 234) NO coinciden
-- con la extraccion mas completa que se uso para curar estas correcciones
-- hoy (normativa/nacional/oguc_pdf.json: 770 articulos; lguc_pdf.json: 245).
-- 644/234 corresponden a normativa/nacional/Fuentes/oguc.json y lguc.json,
-- la fuente que hoy usa indexar_normativa.mjs -- una extraccion mas vieja e
-- incompleta que oguc_pdf.json. Esto significa que la base Supabase viva
-- probablemente esta indexada desde la version incompleta (770-644=126
-- articulos OGUC de diferencia). Pendiente de re-indexar desde oguc_pdf.json/
-- lguc_pdf.json en vez de Fuentes/oguc.json -- ver item 4 de
-- Proyecto/Backlog_Macro.md (completar cobertura normativa).

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
 'LGUC Art. 145 (corregido 2026-09-21; el 118 anterior regula el plazo de la DOM para pronunciarse sobre permisos, no la recepción final -- texto real: "Ninguna obra podrá ser habitada o destinada a uso alguno antes de su recepción definitiva...")',
 ARRAY['obra_nueva','ampliacion'],
 'Confirmar que expediente incluye tramitación de recepción final'),

('accesibilidad_universal',
 'Todo edificio de uso público debe cumplir condiciones de accesibilidad universal',
 'OGUC Art. 4.1.7 (precisado 2026-09-21; el rango 4.1.1-4.1.7 anterior sobrestimaba -- 4.1.1-4.1.6 son altura/ventilación/acústica, temas distintos)',
 ARRAY['equipamiento','comercio','servicios','educacion','salud','cultura'],
 'Verificar rampas, ancho de pasillos accesibles (ver Fase 2/reglas_normativas.py OGUC_REGLAS[''pasillo''] -- valor SIN VERIFICAR hoy, corregido 2026-09-21: 1.5m no tenia respaldo en el texto de OGUC), baños accesibles, estacionamientos discapacidad'),

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
 'OGUC Art. 4.2.1 y siguientes (corregido 2026-09-21; el 4.3.4-4.3.5 anterior son las tablas de TIPO de resistencia al fuego, no vías de evacuación -- ver Art. 4.2.3/4.2.5/4.2.10/4.2.18 para los anchos específicos)',
 ARRAY['todos'],
 'Verificar ancho mínimo de pasillos, escaleras y distancia máxima a salida'),

('ventilacion_iluminacion',
 'Todo recinto habitable debe tener ventilación e iluminación natural mínima',
 'SIN VERIFICAR (corregido 2026-09-21; "OGUC Art. 4.2.5-4.2.6" era falso -- esos artículos son de vías de evacuación, no de ventanas. El artículo real, 4.1.2, es cualitativo, no fija un porcentaje. El 10% de abajo es convención de diseño, no cita OGUC -- ver Fase 2/reglas_normativas.py OGUC_REGLAS[''ventilacion_iluminacion_pct''])',
 ARRAY['residencial','equipamiento'],
 'Verificar superficies de ventana ≥ 10% superficie del recinto (umbral de convención, no normativo)'),

('altura_minima_pisos',
 'Altura mínima libre de piso a cielo: 2.30m en recintos habitables (2.20m en baños y cocinas -- SIN VERIFICAR, ver nota)',
 'OGUC Art. 4.1.1 (corregido 2026-09-21; el 4.2.7 anterior es sobre barandas/antepechos, no altura de piso a cielo. El 2,30 m real está en 4.1.1. El "2,20 m en baños y cocinas" no se encontró en ninguna de las 770 secciones de OGUC -- posible invención, sin confirmar)',
 ARRAY['residencial','equipamiento'],
 'Verificar cotas de altura en planos de corte'),

('seia_obligatorio',
 'Proyectos que superen umbrales de tamaño o impacto deben ingresar al SEIA',
 'Ley 19300 Art. 10',
 ARRAY['obra_nueva','ampliacion'],
 'Verificar si proyecto supera umbrales del Art. 10 Ley 19300'),

('cambio_destino',
 'El cambio de destino requiere cumplir normas del nuevo uso y tramitación ante DOM',
 'OGUC Art. 4.2.2 (corregido 2026-09-21; "LGUC Art. 57-59" era falso -- esos artículos son sobre patentes municipales y declaratoria de utilidad pública. El artículo real: "Para solicitar autorización de cambio de destino de una edificación... deberá adjuntarse un informe suscrito por profesional competente...")',
 ARRAY['cambio_destino'],
 'Verificar solicitud de cambio de destino con cumplimiento de nueva normativa'),

('urbanizacion_previa',
 'Todo proyecto que contemple nuevos lotes debe contar con urbanización completa previa',
 'OGUC Art. 3.2.1 – 3.2.3 (verificación parcial 2026-09-21; los 3 artículos son reales y del capítulo correcto -- agua potable/alcantarillado/electricidad a cargo del urbanizador -- pero no confirman explícitamente el requisito temporal "previa a la edificación")',
 ARRAY['loteo','subdivision'],
 'Verificar factibilidades de agua potable, alcantarillado, electricidad y pavimentación'),

('proteccion_patrimonio',
 'Intervenciones en inmuebles declarados Monumento Nacional requieren autorización del Consejo de Monumentos Nacionales (Ley 17.288); intervenciones en inmuebles o zonas de conservación histórica definidos por el Plan Regulador requieren autorización de la SEREMI de Vivienda y Urbanismo -- NO de la DOM',
 'OGUC Art. 2.1.43, 2.6.4 y 5.1.4 (corregido 2026-09-21; "LGUC Art. 60" era falso -- ese artículo es sobre zonas de riesgo/restricción. La descripción anterior también confundía SEREMI con DOM, que nunca autoriza intervención patrimonial)',
 ARRAY['patrimonio'],
 'Verificar si predio está declarado Monumento Nacional (autoriza CMN) o definido como conservación histórica por el PRC (autoriza SEREMI MINVU) -- son 2 categorías y 2 autoridades distintas')
ON CONFLICT (id) DO UPDATE SET
  descripcion  = EXCLUDED.descripcion,
  referencia   = EXCLUDED.referencia,
  aplica_a     = EXCLUDED.aplica_a,
  verificacion = EXCLUDED.verificacion;

-- El UPDATE explícito de arriba (cambiado de DO NOTHING a DO UPDATE) es lo
-- que realmente corrige las filas si este script ya se corrió antes contra
-- la base real -- sin este cambio, re-ejecutar el archivo no habría tocado
-- ninguna fila existente por el ON CONFLICT DO NOTHING original.
