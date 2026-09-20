# Auditoría Fase 1 — Detalle: `normativa/` (scripts de indexación/clasificación)

> Anexo de detalle. Ver síntesis y priorización en [Auditoria_Fase1_Hallazgos.md](Auditoria_Fase1_Hallazgos.md).
> Generado por agente Explore dedicado (2026-09-21), lectura completa de los archivos listados. Reproducido casi verbatim por trazabilidad — cada afirmación cita archivo:línea.

## 1. `normativa/indexar_normativa.mjs` (329 líneas, leído completo)

**Qué hace:** pipeline "oficial" de indexación completa: lee JSONs de OGUC/LGUC/Ley19300/DDU/PRC, construye chunks vía `chunksLey()`/`chunksDDU()`/`chunksPRC()`, clasifica cada chunk con `clasificar()` de `clasificar_normativa.mjs`, genera embeddings OpenAI (`text-embedding-3-small`) y hace upsert a Supabase (`normativa_chunks`, `on_conflict=codigo`, `merge-duplicates`).

### Bug conocido — CONFIRMADO con líneas exactas
- Línea 253: `const oguc = leerJSON(join(__dir, 'nacional/Fuentes/oguc.json'));` — esquema `{articulos:[{numero,texto}]}`, `total_articulos:644` (confirmado leyendo el archivo).
- Línea 256: `procesarChunks(chunks, \`OGUC (${oguc.total_articulos} arts.)\`)` — usa esos 644.
- La base viva real fue poblada por **`_idx_oguc.mjs:32`**: `JSON.parse(readFileSync(join(__dir, 'nacional/oguc_pdf.json')))`, esquema **distinto** `{secciones:[{codigo,numero,texto}]}`, confirmado `secciones.length = 770`.
- Mismo patrón exacto en LGUC: línea 262 apunta a `nacional/Fuentes/lguc.json` (`articulos`, 234 arts.), mientras **`_idx_lguc.mjs:21`** pobló producción desde `nacional/lguc_pdf.json` (`secciones`, 245 secciones reales, confirmado `secciones.length=245`).
- Los códigos SÍ coinciden en formato (`OGUC-1.1.1`, generado igual en ambos esquemas), así que un re-run de `indexar_normativa.mjs` no fallaría silenciosamente: haría **upsert con merge-duplicates sobre codigo**, sobrescribiendo texto/embedding de las filas coincidentes con la versión vieja (644/234 arts.) y dejando huérfanas (sin tocar, pero tampoco borradas — el script nunca hace `DELETE`) las filas de `oguc_pdf.json`/`lguc_pdf.json` que no tengan correspondencia exacta de número en la fuente vieja.
- Ley 19.300 no tiene este problema: no existe un `_idx_ley19300.mjs` ni un `ley19300_pdf.json` alternativo; `Fuentes/ley19300.json` (126 arts.) parece ser la única fuente usada.

### Bug adicional real no mencionado en el enunciado — bloque PRC nunca se ejecuta, sin ningún warning
- Línea 304: `const comunasDir = join(__dir, 'comunas');` → `normativa/comunas/`. **Esa carpeta no existe** en el repo (confirmado con `find . -iname comunas -type d` → vacío). Las comunas reales viven directamente bajo `normativa/nunoa/`, `normativa/santiago/`, `normativa/providencia/`.
- Línea 305: `if (existsSync(comunasDir)) {` es siempre `false` → el bloque completo (líneas 303-316) nunca corre.
- A diferencia de los otros 5 bloques (OGUC/LGUC/Ley19300/DDU×3), que sí hacen `console.warn('SKIP: ...')` en el `else` (líneas 258, 267, 276, 284, 292, 300), el bloque PRC **no tiene ningún `else`** — no hay log, warning ni rastro de que los PRC se saltearon. Es 100% silencioso.
- Aunque se corrigiera la ruta, `chunksPRC()` (línea 140) lee `json.articulos || json.normas`, pero el archivo real `providencia/ordenanza_refundida.json` usa la clave `secciones` (mismo patrón que oguc_pdf/lguc_pdf) — el parser seguiría sin extraer nada. Además el PRC real de Providencia no es "un JSON por comuna" sino 4 fuentes distintas (ordenanza + normas_edificacion + usos_suelo + patrimonio), estructura que `chunksPRC()` no contempla. El script que realmente indexó `PRC-PRV` en producción es **`_idx_prc.mjs`** (lógica ad-hoc completamente distinta, no usa `clasificar()`).

### Bug adicional real, más grave — re-ejecutar el script regresionaría una limpieza de datos deliberada
- Líneas 296-301: si existe `nacional/ddu_libro.json`, indexa **todas** sus secciones vía `chunksDDU()`.
- Confirmé `nacional/ddu_libro.json`: **1144 secciones "crudas"** (chunking automático por página/circular de `extraer_ddu.mjs`/`dividirEnChunks()`, sin curar), con duplicados evidentes ya en las primeras 4 (`DDU-155-p1` aparece dos veces consecutivas).
- `_limpiar_ddu.mjs:9-10` documenta explícitamente que producción debe conservar **solo 10 prefijos**: `DDU-172-, 176-, 186-, 200-, 201-, 157-, 912-, 1022-, 351-, 447-`, y borra todo lo demás de la tabla.
- Un re-run de `indexar_normativa.mjs` insertaría esas 1144 secciones crudas (códigos tipo `DDU-155-pgN-M`, que no coinciden con los códigos curados `DDU-172-s1` de `ddu_libro_seleccion.json` ni con los de DDU 351/447 ya indexados) como **filas nuevas** (no sobrescriben nada al no colisionar codigo), regresionando permanentemente el trabajo de `_limpiar_ddu.mjs` e inflando la tabla con contenido no verificado. Esto es un riesgo real de magnitud mayor al de OGUC/LGUC y no estaba en el enunciado del bug conocido.

### Otros hallazgos en este script
- Línea 92 (`chunksLey`): `if (!texto || texto.length < 10) continue;`, línea 113 (`chunksDDU`): `if (texto.length <= 20) continue;`, línea 143 (`chunksPRC`): `if (!texto) continue;` — descartan artículos/secciones sin loguear cuántos ni cuáles. `procesarChunks()` no reporta ningún contador de "N omitidos por texto vacío/corto"; dato ausente o corto se pierde en silencio, sin rastro en consola.
- Línea 141: `const codigo = \`${prefijo}-${art.numero || art.id}\`;` — si el artículo no tiene ni `numero` ni `id`, el código queda literalmente `"...-undefined"` sin error ni warning (aplica si se corrige el bug de ruta `comunas/`).
- Líneas 49-61 (`deduplicar`): códigos repetidos dentro de una misma fuente se renombran en silencio con sufijo `-dupN` en vez de loguear que la fuente tiene números de artículo duplicados (síntoma de dato potencialmente corrupto).
- Las constantes `MAX_CHARS=6500`/`SOLAP=400` (líneas 36-37) están explícitamente documentadas (líneas 38-40) como intencionalmente distintas de las de `extraer_ddu.mjs` — no es inconsistencia accidental.

## 2. `normativa/clasificar_normativa.mjs` (142 líneas, leído completo)

**Qué hace:** función `clasificar(fuente, codigo, metadataExistente, taxonomia)`, declarada explícitamente (líneas 4-9) como fuente única de taxonomía, usada tanto por `indexar_normativa.mjs` (carga inicial) como por `backfill_metadata.mjs` (actualización posterior).

- Línea 26-32: cache de taxonomía por ruta (`Map`), con comentario explícito de que corrige un bug previo (variable global única que ignoraba el parámetro `ruta` en llamadas subsecuentes dentro del mismo proceso).
- Hardcodeos de negocio con cita exacta:
  - Línea 107: DDU 351 → `etapa_pipeline: ['OBS-N01','OBS-N02','OBS-N03','OBS-N04']`, `jerarquia: 'piso_nacional_no_derogable'`.
  - Línea 109-110: DDU 447 → mismos campos hardcodeados + nota de negocio embebida en código: `'aportes al espacio publico -- sin contenido dimensional geometrico, ver Convenciones_BIM.md seccion E'`.
  - Línea 123: `const comunaMap = { prv: 'providencia', stgo: 'santiago', nun: 'nunoa' };` — mapeo hardcodeado, cerrado a 3 comunas; agregar una comuna requiere editar este archivo.
  - Línea 77: `vigencia: 'vigente'` como default en `base`, válido documentadamente solo para OGUC/LGUC/LEY19300 (comentario líneas 61-68), sobreescrito a `'sin_verificar'` en las ramas DDU (línea 106,109,113) y PRC (líneas 135,137).
- Bug real, ya corregido, documentado en el propio código como historial (no activo hoy): línea 116-121, el clasificador asumía `fuente==='PRC'` exacto pero la fuente real en la tabla es `'PRC-PRV'`; corregido con `fuente.replace(/^PRC-?/, '')` en línea 122.
- Bug real **parcialmente mitigado, no resuelto**: líneas 125-136, un PRC con sufijo no mapeado en `comunaMap` y sin `metadata.comuna` cae en `ambito:'comunal', comuna:null` (línea 135) — el `console.warn` de línea 134 y el nuevo `clasificacion_metodo:'error_comuna_no_mapeada'` sólo añaden visibilidad; la fila sigue sin comuna asignada y sigue siendo invisible para cualquier filtro por comuna específica. Es un aviso, no una corrección de fondo.
- Inconsistencia real (no documentada en los comentarios del propio archivo): pese a declararse "fuente única" para la taxonomía, **ninguno de los scripts que realmente cargaron datos en producción** (`_idx_oguc.mjs`, `_idx_lguc.mjs`, `_idx351.mjs`, `_idx447.mjs`, `_idx_libro_seleccion.mjs`, `_idx_prc.mjs`) la invoca — todos meten metadata mínima ad-hoc (`{numero, decreto}`, `{ddu:'351', titulo_doc}`, `{tipo, comuna}`, etc.) sin taxonomía. La taxonomía real llegó después, vía `backfill_metadata.mjs`, sobre filas ya cargadas con metadata mínima. Carga y clasificación están desacopladas en la práctica.

## 3. `normativa/backfill_metadata.mjs` (91 líneas, leído completo)

**Qué hace:** descarga todas las filas de `normativa_chunks` (paginado de a 1000), recalcula taxonomía con `clasificar()` y hace `PATCH` individual por `codigo` (metadata únicamente, sin tocar texto/embedding). Corrida real documentada: 1608/1608 filas, 0 errores.

- Línea 21: `const SUPA_URL = process.env.SUPABASE_URL || 'https://xkpvnlvzhdgdisedlelz.supabase.co';` — **URL de producción hardcodeada como fallback**. Si `SUPABASE_URL` no está seteada, el script apunta igual a esa base real sin ningún opt-in explícito, en vez de fallar. Contrasta con línea 22-23, donde `SUPABASE_SECRET` si falta sí aborta (`process.exit(1)`) — asimetría entre las dos variables de entorno.
- Línea 63: `const CONCURRENCIA = 15;` — constante hardcodeada, no parametrizable por env var.
- Línea 28: `const PAGE = 1000;` — tamaño de página hardcodeado.
- Bug ya corregido, documentado como historial en el propio comentario (líneas 68-74): antes `clasificar()` se llamaba fuera del `try`, y si lanzaba (fuente/codigo con forma inesperada), rechazaba toda la promesa del `Promise.all` del lote, abortando corridas completas sin identificar qué fila falló. Confirmado que hoy el `try` (línea 75) sí envuelve tanto `clasificar()` como `actualizarFila()`.
- Sin reintentos: `actualizarFila()` (líneas 42-52) no reintenta ante error transitorio HTTP (429, timeout); un fallo puntual de red cuenta como error final sin retry.
- `actualizarFila()` hace un `PATCH` por fila individual (no hay batch update) — con 1608 filas son 1608 requests HTTP (mitigado por concurrencia 15, pero no es una operación batch real).

## 4. `normativa/extraer_ddu.mjs` (260 líneas, leído completo)

**Qué hace:** extrae texto de los 3 PDFs DDU (351, 447, Libro Completo) con `pdfjs-dist`; para 351/447 usa Claude (modo `'claude'`) para estructurar en secciones; para el Libro Completo usa chunking automático por página/circular (modo `'chunks'`, función `dividirEnChunks()`). Salida: `nacional/ddu_351.json`, `ddu_447.json`, `ddu_libro.json`.

- Línea 19: `const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-REEMPLAZAR';` — placeholder hardcodeado como fallback en vez de fallar rápido. Mitigado parcialmente por el chequeo de línea 220 (`if (!ANTHROPIC_API_KEY.startsWith('sk-ant-api'))`), que detecta el placeholder por prefijo específico — patrón frágil pero funcional hoy.
- Línea 105: `textoCompleto.substring(0, 60000)` — el texto completo del PDF se **trunca a 60.000 caracteres** antes de enviarlo a Claude para estructurar, **sin ningún log si el documento excede ese límite**. Si el texto extraído de DDU 351 o 447 superara 60k caracteres, el resto del documento nunca se estructura ni se indexa, sin rastro de la pérdida.
- Línea 115: `model: 'claude-haiku-4-5-20251001'` y línea 116: `max_tokens: 4096` hardcodeados.
- Línea 155: regex `patronCircular` y línea 158: `if (matches.length > 3)` — umbral hardcodeado ("más de 3 matches") sin justificación en comentarios, decide si el documento tiene estructura de circulares identificable.
- Línea 181: `const PAGINAS_POR_CHUNK = 3;` hardcodeado para el fallback sin estructura.
- **Bug real de manejo de errores con impacto en calidad de datos**: líneas 229-233, si `estructurarConClaude()` falla (rate limit, timeout, JSON inválido), el `catch` hace fallback silencioso a `dividirEnChunks()` (chunking crudo por página). El JSON de salida (líneas 240-247) **no registra qué modo se usó realmente** — un consumidor posterior (`_idx351.mjs`/`_idx447.mjs`/`indexar_normativa.mjs`) no puede distinguir si `secciones` viene de estructuración semántica por Claude o de chunking crudo por páginas sin inspeccionar manualmente el contenido.
- Línea 130: `rawText.match(/\[[\s\S]*\]/)` — regex greedy para extraer el array JSON de la respuesta de Claude; sin reintentos ante fallo de parseo.

## 5. `normativa/comunas.json` (30 líneas, leído completo)

Array de 3 comunas: `nunoa`, `santiago`, `providencia`, todas `activa: true`, todas `region: "Metropolitana"`.

- Es consumido directamente por `src/components/SelectorComuna.jsx:2` (`import comunasStatic from "../../normativa/comunas.json"`) y filtrado por `c.activa` en líneas 69/71/76 de ese componente — las 3 comunas aparecen en el selector de UI.
- Coincide 1:1 con `comunaMap` de `clasificar_normativa.mjs:123` (`prv/stgo/nun`).
- **Inconsistencia de datos real entre archivos "hermanos"**: `normativa/santiago/metadata.json` (el metadata individual de esa comuna, no `comunas.json`) **no tiene el campo `activa` en absoluto**, a diferencia de `nunoa/metadata.json` y `providencia/metadata.json`, que sí lo tienen (`"activa": true`, con `"fecha_carga":"2025-04-12"` para Ñuñoa). No rompe el selector (que lee de `comunas.json`, no de `santiago/metadata.json`), pero `src/App.jsx:13` sí importa `santiago_meta` directamente desde ese archivo — si algo llegara a leer `santiago_meta.activa`, obtendría `undefined` (falsy) en silencio.
- Ninguna de las 3 comunas reales (ni `comunas.json` ni los `metadata.json` individuales) tiene el campo `referencias_legales` que sí aparece en la plantilla `_template/metadata.json:10` (`"referencias_legales": []`) — campo de la plantilla que nunca se completó en ninguna comuna real.
- Cobertura real vs. declarada: de las 3 comunas marcadas `activa:true`, **solo Providencia tiene datos indexados en Supabase** (fuente `PRC-PRV` vía `_idx_prc.mjs`, confirmado por grep global de `fuente=eq.` / `fuente:` en todos los `_idx*.mjs` — ningún script indexa `PRC-STGO` ni `PRC-NUN`). Santiago y Ñuñoa solo existen como JSON estático de consumo directo en frontend (ver inventario de carpetas abajo).

## 6. Clasificación de los ~26 scripts con prefijo `_`

### (a) Extracción/indexación de una fuente específica ya cargada — probablemente ya cumplió su función
| Script | Genera / hace |
|---|---|
| `_extraer_oguc.mjs` | PDF OGUC → `nacional/oguc_pdf.json` (regex, sin Claude) — fuente real consumida por `_idx_oguc.mjs` |
| `_extraer_lguc.mjs` | PDF LGUC → `nacional/lguc_pdf.json` (regex) — fuente real consumida por `_idx_lguc.mjs` |
| `_extraer_ddu351.mjs` | PDF DDU 351 → `nacional/ddu_351.json` (Claude, bloques de 7 páginas) |
| `_extraer_ddu447.mjs` | PDF DDU 447 → `nacional/ddu_447.json` (Claude, bloques de 7 páginas) |
| `_extraer_libro_seleccion.mjs` | `ddu_libro.json` → `ddu_libro_seleccion.json`, lista hardcodeada de 8 circulares objetivo (líneas 20-29: 172,176,186,200,201,157,1022,912) |
| `_extraer_prc_ordenanza.mjs` | PDF `providencia/ordenanza_refundida.pdf` → `ordenanza_refundida.json` (regex) — fuente real consumida por `_idx_prc.mjs` |

### (c) Scripts que siguen siendo relevantes/re-ejecutables — más relevantes que `indexar_normativa.mjs` mismo, porque reflejan el estado real de producción
| Script | Hace (confirmado, leídos completos) |
|---|---|
| `_idx_oguc.mjs` | Borra `fuente=eq.OGUC`, re-indexa desde `oguc_pdf.json` (770 secciones), metadata mínima `{numero, decreto:'DTO-47'}`, **sin `clasificar()`** |
| `_idx_lguc.mjs` | Análogo para LGUC desde `lguc_pdf.json` (245 secciones), metadata `{numero, decreto:'DTO-458'}`, sin `clasificar()` |
| `_idx351.mjs` | Indexa `ddu_351.json` completo, sin borrado previo. **Hallazgo real**: línea 28-29, `const embJson = await emb.json(); const filas = lote.map((c,j)=>({...c, embedding: embJson.data[j].embedding}));` — no chequea `emb.ok` ni `embJson.error` antes de usar `embJson.data[j]`. Ante error de OpenAI (rate limit, key inválida), lanzaría `TypeError` no controlado (no hay `try/catch` ni `main().catch()` en el script) matando el proceso a mitad de camino. **Inconsistencia real** vs. sus hermanos `_idx_oguc.mjs`/`_idx_lguc.mjs`/`_idx447.mjs`/`_idx_libro_seleccion.mjs`, que sí validan `if (embJson.error) {...; process.exit(1);}` antes de continuar |
| `_idx447.mjs` | Borra `codigo=like.DDU-447-*&fuente=eq.DDU`, re-indexa desde `ddu_447.json`; sí valida `embJson` implícitamente en el flujo (no hay chequeo explícito de `.error` tampoco, línea 55-56, mismo patrón de riesgo que `_idx351.mjs` pero menos crítico porque sí hace `console.error` en el upsert) |
| `_idx_libro_seleccion.mjs` | Borra chunks de página (`codigo=like.DDU-%25-p%25`), re-indexa las 113 secciones curadas de `ddu_libro_seleccion.json` |
| `_idx_prc.mjs` | Borra `fuente=eq.PRC-PRV`, reconstruye chunks desde 4 fuentes de Providencia (ordenanza + normas_edificacion con texto en lenguaje natural generado línea 48-69 + usos_suelo + patrimonio agrupado por ZEP); único script que indexa PRC en producción hoy |
| `_limpiar_ddu.mjs` | Documenta y aplica el estado deseado de producción: mantiene solo 10 prefijos DDU (línea 9-10), borra el resto |
| `_fix_dup.mjs` | Borra chunks con `codigo like DDU-%-dup%` — limpieza puntual de duplicados generados por el mecanismo `-dupN` de `deduplicar()` |

### (b) Diagnóstico/debug puntual
| Script | Propósito |
|---|---|
| `_calibrar_threshold.mjs` | Prueba 8 queries reales hardcodeadas (línea 13-22) con resultados "esperados" por código, mide distribución de similitud — calibración de umbral de retrieval |
| `_check_db.mjs` | Cuenta filas totales/con embedding, muestra fila de ejemplo, cuenta por fuente (primeros 5000) |
| `_debug_prc.mjs` | Similitud coseno manual entre query y chunks PRC-PRV-ZONA, para distinguir problema de índice vs. problema de calidad de embedding |
| `_diag2.mjs` | Cuenta embeddings null/not-null, prueba `match_normativa` con embedding dummy (vector de 0.001×1536) |
| `_diag3.mjs` | Similar a `_diag2.mjs`, agrupa resultados del embedding dummy por fuente, prueba parámetro `fuentes: null` explícito |
| `_revisar_gaps.mjs` | Verifica presencia de `LGUC-116` y `OGUC-4.5.7` puntuales, detecta códigos DDU "inesperados" (fuera de la lista de 10 circulares) |
| `_test_ddu351.mjs` | Extrae y muestra texto de las primeras 5 páginas del PDF DDU 351 (prueba de extracción cruda) |
| `_test_detalle.mjs` | Test manual contra el worker de producción (`laude.nestragues.workers.dev`) con una query PRC específica |
| `_test_respuesta_completa.mjs` | Test manual contra el worker con query de aportes al espacio público en Santiago |
| `_fix_ivfflat_probes.mjs` | **Hallazgo real**: intenta actualizar `match_normativa` (SET `ivfflat.probes=10`) probando 3 endpoints HTTP distintos contra Supabase (`/rest/v1/rpc/`, `/rest/v1/`, `/pg/sql` — líneas 31, 42, 48), ninguno de los cuales es un endpoint válido de Supabase para ejecutar SQL arbitrario vía REST estándar. El propio comentario del código (línea 41) admite "Supabase no expone SQL directo vía REST" y aun así prueba `/pg/sql`, que tampoco existe en la API pública de Supabase. Todo indica que este script **nunca logró su objetivo por HTTP** y el cambio de `ivfflat.probes` se aplicó manualmente por otra vía (coherente con el mensaje final de `indexar_normativa.mjs:319-322`, que instruye crear el índice IVFFlat manualmente en el SQL Editor de Supabase) |

### (c)/(b) híbridos — reutilizables como test suite/diagnóstico más formal
| Script | Nota |
|---|---|
| `_test_produccion.mjs` | Se autodescribe (líneas 1-5) como "Tests de integración — ArchiCheck Worker producción... checks robustos (no-deterministas)" — más formal que los `_test_detalle`/`_test_respuesta_completa` puntuales |
| `_test_worker.mjs` | Array `TESTS` estructurado con `esperaCitar`/`noEsperaCitar` por caso — test suite reutilizable, no un one-off |
| `_test_rag_queries.mjs` | 3 queries reales fijas contra `match_normativa`, reutilizable para verificar retrieval tras cambios |

### `_template/` (carpeta, 4 archivos, todos leídos completos — plantillas puras, no código)
`metadata.json` (293B), `normas_edificacion.json` (408B, 1 zona con todos los campos `null`), `estacionamientos.json` (596B, plantilla de fórmulas), `schema.sql` (1.15KB, `INSERT`s comentados con instrucción de copiar a `normativa/{slug_comuna}/schema.sql`). Confirma que agregar una comuna nueva es un proceso **100% manual** — no existe ningún script `.mjs` que automatice creación/carga de una comuna nueva.

## 7. Inventario de carpetas de datos

### `normativa/nacional/` (10 archivos + subcarpeta `Fuentes/`)
- `Fuentes/` (16.4MB): 5 PDFs originales (OGUC 4.56MB, LGUC 437KB, DDU351 3.72MB, DDU447 1.26MB, DDU_LIBRO 4.97MB) + 3 JSON esquema `articulos` que **ya no reflejan producción**: `oguc.json` (1.32MB, 644 arts.), `lguc.json` (387KB, 234 arts.), `ley19300.json` (155KB, 126 arts.)
- `oguc_pdf.json` (1.16MB, **770 secciones — la fuente real de producción**), `lguc_pdf.json` (354KB, **245 secciones — fuente real**), ambos esquema `secciones`, generados por `_extraer_oguc.mjs`/`_extraer_lguc.mjs`
- `oguc_articulos.json` (89.9KB) y `lguc_articulos.json` (66.8KB): terceros archivos con esquema `articulos` pero **distintos de `Fuentes/oguc.json`/`Fuentes/lguc.json`** (mismo nombre de clave `articulos` pero archivo separado) — no referenciados por ningún `.mjs` leído; posible tercer esquema huérfano, no confirmado su origen
- `ley19300_articulos.json` (11.7KB)
- `ddu_351.json` (53.6KB), `ddu_447.json` (64.2KB) — usados por `_idx351.mjs`/`_idx447.mjs`
- `ddu_libro.json` (1.39MB, **1144 secciones crudas sin curar**, con duplicados confirmados)
- `ddu_libro_seleccion.json` (139KB, **113 secciones curadas de 8 circulares** — la que realmente se indexó vía `_idx_libro_seleccion.mjs`)
- `metadata.json` (996B) — **hallazgo real: archivo huérfano y desactualizado**. Grep global confirma que ningún `.mjs` ni archivo en `src/` lo importa. Declara `total_articulos:644` (OGUC) / `234` (LGUC) — coincide con el esquema viejo `Fuentes/*.json`, no con los 770/245 reales — y `articulos_indexados: 35/14/10`, cifras que no corresponden a ninguna carga documentada (las cargas reales fueron de cientos de artículos vía `_idx_oguc.mjs`/`_idx_lguc.mjs`). Aparenta ser un remanente de una prueba piloto muy temprana, nunca actualizado
- `reglas_verificacion.json` (10.8KB) y `schema.sql` (10KB) — **nombre idéntico mas ruta distinta** de `normativa/supabase_schema.sql`; referenciados en comentarios de `clasificar_normativa.mjs:8-9` como el par con "las mismas 12 reglas desincronizadas" — inconsistencia ya conocida y documentada en el propio código, no releídos en esta pasada (fuera de alcance de la lista asignada al agente)

### `normativa/ddu/` (3 archivos, 20.4KB total)
`circ279_accesibilidad.json` (8.2KB), `circ320_adosamiento.json` (4.2KB), `circ390_expedientes.json` (8.1KB). **Huérfanos confirmados**: grep global (`*.mjs`, `*.js`, `*.jsx`) por `normativa/ddu/` o los nombres de circulares (279/320/390) no arroja ningún resultado. No están en la lista `KEEP` de `_limpiar_ddu.mjs` (172,176,186,200,201,157,912,1022,351,447) — son JSON estático que no corresponde a ninguna circular indexada en Supabase hoy, ni consumido por el frontend.

### `normativa/nunoa/` (8 archivos, ~83KB) — comuna más completa
`estacionamientos.json` (9.7KB), `metadata.json` (717B, con `activa:true` y `fecha_carga`), `normas_edificacion.json` (12.3KB), `patrimonio.json` (5.4KB), `restricciones.json` (2.1KB), `restricciones_condicionales.json` (1.46KB, el más reciente, 26-ago), `schema.sql` (10.4KB), `usos_suelo.json` (5KB). Consumida por `src/normativa/verificador.js` (normas, patrimonio, restricciones_condicionales) y `src/normativa/estacionamientos.js` — única comuna, junto con Providencia, con lógica de verificación determinística real en el frontend. **No indexada en Supabase** (sin `_idx_nunoa.mjs`, sin fuente `PRC-NUN` en ningún script).

### `normativa/santiago/` (3 archivos, ~21.3KB) — comuna menos desarrollada
Solo `metadata.json` (846B, **sin campo `activa`**), `normas_edificacion.json` (14.7KB), `usos_suelo.json` (5.8KB). Le faltan `estacionamientos.json`, `patrimonio.json`, `restricciones*.json`, `schema.sql` respecto a Ñuñoa/Providencia. **Confirmado que `src/normativa/verificador.js` no la importa en absoluto** (solo importa Ñuñoa y Providencia) — Santiago solo se usa en `src/App.jsx` (metadata/normas, probablemente solo despliegue de info) y **no tiene ninguna indexación en Supabase** (sin `_idx_santiago.mjs`, sin fuente `PRC-STGO`). Pese a esto, `comunas.json` la marca `activa:true` y aparece seleccionable en `SelectorComuna.jsx` sin verificación real de fondo.

### `normativa/providencia/` (9 archivos, ~118MB total — la carpeta más pesada por lejos)
`metadata.json` (1.79KB), `normas_edificacion.json` (14.97KB), `patrimonio.json` (13.8KB), `usos_suelo.json` (12.9KB), `ordenanza_refundida.json` (339KB, 242 artículos, fuente real usada por `_idx_prc.mjs`), `ordenanza_refundida.pdf` (2.8MB). Además, **4 PDFs fuente muy pesados** versionados en git: `prcp_2007_l1...pdf` (8.7MB), `l2...pdf` (44MB), `l3...pdf` (36MB), `l4...pdf` (26MB) — total ~118MB solo de PDFs en esta carpeta. Es la comuna con el pipeline de indexación más desarrollado (única con fuente `PRC-PRV` real en Supabase, 4 sub-fuentes vía `_idx_prc.mjs`). El peso de los 4 PDFs de "trabajo" es un hallazgo de higiene de repositorio, no un bug de código.

### `normativa/_template/` (4 archivos, ~2.4KB)
Plantillas puras (no ejecutables). Confirma proceso manual para dar de alta una comuna nueva.

## Resumen de riesgo si se re-ejecuta `indexar_normativa.mjs` sin corregir
1. OGUC/LGUC: sobrescribe filas existentes con versión vieja de menor cobertura (644 vs 770; 234 vs 245 arts.), sin borrar las filas huérfanas resultantes.
2. PRC: bloque completo no ejecuta (ruta `normativa/comunas/` inexistente), sin ningún log — comportamiento silencioso, inconsistente con el resto del script.
3. DDU Libro Completo: reinserta ~1144 secciones crudas sin curar, regresionando el trabajo de `_limpiar_ddu.mjs` que mantiene la tabla acotada a 10 circulares verificadas — este es el riesgo de mayor volumen de los tres.
