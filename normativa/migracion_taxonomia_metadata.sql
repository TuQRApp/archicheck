-- ============================================================
-- ArchiCheck — Taxonomía multidimensional sobre normativa_chunks.metadata
-- 2026-09-21 (Proyecto/Backlog_Macro.md item 8, diseño previo; ejecutado hoy
-- a pedido del usuario en vez de dejarlo pendiente)
--
-- NO agrega columnas nuevas -- usa la columna `metadata jsonb` que ya existe
-- desde el schema original (ver supabase_schema.sql). Objetivo: que
-- match_normativa() pueda filtrar por estas dimensiones antes/junto con la
-- busqueda semantica, en vez de depender solo de similaridad de embeddings.
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor (mismo flujo que
-- supabase_schema.sql -- este archivo asume que esa tabla ya existe).
-- ============================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Forma del objeto `metadata` a partir de ahora (documentacion, no
--    aplica constraint -- jsonb es flexible por diseno, pero todo chunk
--    nuevo/re-indexado debe llenar estos campos; ver taxonomia_articulos.json
--    y la logica de clasificacion en indexar_normativa.mjs):
--
--   {
--     "tipo_edificacion": ["residencial", "educacion"],   -- array; ["todos"] si aplica a cualquier destino
--     "tipo_norma": ["accesibilidad", "evacuacion"],       -- array de materias (ver lista abajo)
--     "ambito": "nacional" | "comunal",
--     "comuna": null | "nunoa" | "santiago" | "providencia",  -- solo si ambito=comunal
--     "zona": null | "ZC3" | "ZE" | ...,                       -- solo si ambito=comunal, zona del PRC
--     "etapa_pipeline": ["OBS-N05", "OBS-N06"],            -- array de codigos OBS-G/E/V/M/N/INC/DF del producto
--     "vigencia": "vigente" | "derogada" | "modificada",
--     "vigencia_fecha": null | "2024-04-10",               -- fecha de la ultima modificacion conocida, si se sabe
--     "canal": "CAD" | "BIM" | "ambos",
--     "jerarquia": "piso_nacional_no_derogable"             -- ver enum completo abajo
--                 | "marco_nacional_ajustable_por_prc"
--                 | "exclusivo_comunal",
--     "clasificacion_metodo": "verificado" | "heuristica_no_verificada"
--     -- clasificacion_metodo es la unica adicion NO pedida explicitamente
--     -- por el usuario, agregada para que la taxonomia sea honesta sobre su
--     -- propia confiabilidad: los articulos ya leidos a fondo esta sesion
--     -- (ver Fase 2/cobertura_oguc.csv) llevan "verificado"; el resto (la
--     -- mayoria hoy) se llena por heuristica de capitulo/codigo, marcada
--     -- como tal -- mismo principio "SIN VERIFICAR" que el resto del
--     -- proyecto aplica a valores no confirmados contra el texto real.
--   }
--
--   tipo_norma (vocabulario controlado, agregar valores nuevos aca cuando
--   aparezcan, no como string libre sin registrar):
--     ventilacion, iluminacion, acustica, accesibilidad, evacuacion,
--     circulacion, resistencia_fuego, estructural, superficies_minimas,
--     urbanistica, estacionamientos, sanitario, termico, procedimiento,
--     definiciones, patrimonio, urbanizacion, ambiental, uso_suelo
--
--   jerarquia (3 valores, ver razonamiento):
--     - piso_nacional_no_derogable: seguridad/accesibilidad/evacuacion -- un
--       PRC NUNCA puede ser menos exigente que este piso (ej. OGUC 4.1.7
--       accesibilidad, OGUC 4.2.x evacuacion, OGUC 4.3.x incendio).
--     - marco_nacional_ajustable_por_prc: OGUC fija un rango/maximo y el PRC
--       define el valor especifico dentro de ese marco (ej. constructibilidad,
--       COS, altura maxima -- el PRC de cada comuna/zona decide el numero
--       real, siempre dentro de lo que OGUC permite).
--     - exclusivo_comunal: solo existe a nivel de PRC, sin equivalente en
--       OGUC (ej. zonificacion de uso de suelo especifica de una comuna,
--       zonas de conservacion historica LOCALES declaradas por ese PRC).

-- ────────────────────────────────────────────────────────────────
-- 2. Indice GIN sobre metadata -- necesario para que filtrar por estos
--    campos sea eficiente (sin esto, cada filtro por metadata escanea la
--    tabla completa). Seguro de correr en cualquier momento, no bloquea
--    escrituras largo tiempo en una tabla de este tamano (~1600 filas).
create index if not exists normativa_chunks_metadata_idx
  on normativa_chunks using gin (metadata);

-- ────────────────────────────────────────────────────────────────
-- 3. match_normativa() extendida -- mismo contrato que la funcion original
--    (mismos 3 parametros originales, mismas columnas de salida) MAS 6
--    parametros opcionales nuevos, todos default null (=sin filtrar por esa
--    dimension) para que el Worker actual que la llama sin estos parametros
--    siga funcionando exactamente igual sin cambios -- backward compatible,
--    no hace falta tocar el Worker para no romper nada, solo para
--    aprovechar el filtro nuevo cuando se actualice.
create or replace function match_normativa(
  query_embedding     vector(1536),
  match_count         int      default 25,
  fuentes             text[]   default null,
  p_tipo_edificacion  text     default null,  -- un valor; matchea si esta en el array tipo_edificacion (o si ese array contiene 'todos')
  p_tipo_norma        text     default null,  -- un valor; matchea si esta en el array tipo_norma
  p_ambito            text     default null,  -- 'nacional' | 'comunal'
  p_comuna            text     default null,
  p_canal             text     default null,  -- 'CAD' | 'BIM' -- matchea tambien si metadata.canal='ambos'
  p_solo_vigentes     boolean  default true   -- por defecto EXCLUYE derogadas -- el motivo real de esta dimension
)
returns table (
  id          uuid,
  fuente      text,
  codigo      text,
  titulo      text,
  texto       text,
  metadata    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    id, fuente, codigo, titulo, texto, metadata,
    1 - (embedding <=> query_embedding) as similarity
  from normativa_chunks
  where (fuentes is null or fuente = any(fuentes))
    and embedding is not null
    and (p_tipo_edificacion is null
         or metadata->'tipo_edificacion' ? p_tipo_edificacion
         or metadata->'tipo_edificacion' ? 'todos')
    and (p_tipo_norma is null or metadata->'tipo_norma' ? p_tipo_norma)
    and (p_ambito is null or metadata->>'ambito' = p_ambito)
    and (p_comuna is null or metadata->>'comuna' = p_comuna)
    and (p_canal is null or metadata->>'canal' = p_canal or metadata->>'canal' = 'ambos')
    -- SIN coalesce a 'vigente' (fix Revision Ing SW Paso 2, DeepSeek
    -- 2026-09-21): un metadata->>'vigencia' ausente o 'sin_verificar' debe
    -- EXCLUIRSE de "solo vigentes", no tratarse como si fuera vigente --
    -- mismo principio "dato ausente != cumple" que ya rige en el motor BIM
    -- (analizar_todos.py), aplicado aca a la capa de normativa.
    and (not p_solo_vigentes or metadata->>'vigencia' = 'vigente')
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ────────────────────────────────────────────────────────────────
-- 4. Funcion auxiliar para filtrar por etapa de pipeline (OBS-G/E/V/M/N) --
--    aparte de match_normativa() porque este filtro tiene un caso de uso
--    distinto: no es "busqueda semantica + filtro", es "dame los articulos
--    ya etiquetados para esta observacion puntual", sin necesitar un
--    embedding de consulta. Reemplaza la dependencia de similaridad
--    semantica para este caso, que es justo lo que pedia el punto 4 del
--    diseno original (recuperar el chunk exacto de cada chequeo).
create or replace function articulos_por_etapa(
  p_etapa       text,           -- ej. 'OBS-N05'
  p_solo_vigentes boolean default true
)
returns table (
  id       uuid,
  fuente   text,
  codigo   text,
  titulo   text,
  texto    text,
  metadata jsonb
)
language sql stable
as $$
  select id, fuente, codigo, titulo, texto, metadata
  from normativa_chunks
  where metadata->'etapa_pipeline' ? p_etapa
    -- mismo fix que match_normativa() arriba -- sin coalesce a 'vigente'.
    and (not p_solo_vigentes or metadata->>'vigencia' = 'vigente')
  order by codigo;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5. Nota de proceso: esta migracion NO hace backfill de `metadata` para
--    las filas ya cargadas (ver Proyecto/Backlog_Macro.md item 4/8:
--    OGUC 770, LGUC 244, Ley19300 128, DDU ~185, PRC Providencia 281 chunks
--    ya en la tabla). El backfill se hace aparte, corriendo de nuevo
--    indexar_normativa.mjs (ya actualizado para poblar metadata con la
--    logica de Fase 2/normativa/taxonomia_articulos.json) -- el upsert usa
--    on_conflict=codigo con merge-duplicates, asi que re-correrlo actualiza
--    metadata de las filas existentes sin duplicarlas ni tocar su
--    embedding si el texto no cambio.
