# Auditoría Integral ArchiCheck — Fase 1: Inventario Técnico y Hallazgos

**Fecha de ejecución**: 2026-09-21 (sesión iniciada 2026-09-20).
**Alcance de esta corrida**: completo, primera ejecución de la auditoría acordada en [Auditoria_Integral_ArchiCheck_Consolidado.md](Auditoria_Integral_ArchiCheck_Consolidado.md) (§4 confirma que esta auditoría reemplaza a "Revisión Ing SW").
**Método**: lectura directa completa (no muestreo) de los archivos listados abajo, por mí y por 3 agentes Explore dedicados corriendo en paralelo, cada uno con instrucción explícita de leer archivo completo + grep de confirmación antes de afirmar cualquier hallazgo, y de marcar SIN VERIFICAR todo lo que no pudiera confirmarse por lectura directa.

> Esta es la Fase 1 (Inventario técnico exhaustivo) de la auditoría de punta a cabo. Cubre 4 de las áreas identificadas como puntos ciegos: `src/App.jsx` (parcial), motor CAD (`Herramientas_CubiCasa5k/`), pipeline BIM (4 scripts sin leer), y scripts de indexación/clasificación de `normativa/`. El Worker (`worker.js`, `reglas_aprendidas.js`) ya se había leído completo en una pasada anterior de esta misma sesión (ver [Prompt_Auditoria_Completa_ArchiCheck.md](Prompt_Auditoria_Completa_ArchiCheck.md), Anexo A) y no se re-verificó en esta pasada — su hallazgo P0 se referencia aquí para que la priorización quede completa.
>
> Detalle exhaustivo (línea por línea, con cita de código) en los 4 anexos:
> - [Auditoria_Fase1_Detalle_Normativa.md](Auditoria_Fase1_Detalle_Normativa.md) — `normativa/*.mjs`, ~26 scripts `_*.mjs`, inventario de datos por comuna
> - [Auditoria_Fase1_Detalle_MotorCAD.md](Auditoria_Fase1_Detalle_MotorCAD.md) — `Herramientas_CubiCasa5k/` (motor `cuerpo_cerrado.py`, `_celda4_actual.py`, tests, 169 archivos) + resolución de cuál "Celda 4" corre en vivo
> - [Auditoria_Fase1_Detalle_BIM.md](Auditoria_Fase1_Detalle_BIM.md) — `analizar_todos.py`, `generar_plano_pdf.py`, `piloto_ids_oguc.py`, `generar_json_colab.py`
> - [Auditoria_Fase1_Detalle_Infraestructura.md](Auditoria_Fase1_Detalle_Infraestructura.md) — introspección **en vivo** de Cloudflare Worker, Supabase (RLS/grants/índices) y Vercel

---

## Resumen ejecutivo

**27 hallazgos** con evidencia directa (archivo:línea o introspección en vivo), más ~15 de higiene/menores documentados en los anexos. Ningún hallazgo de esta pasada se basó en inferencia sin lectura del código real o consulta directa al sistema desplegado.

### Los 2 hallazgos que más cambian el panorama (2026-09-21, profundización de P0) — **ambos ya remediados el mismo día**

1. **El RAG normativo de Supabase estaba completamente inerte en producción.** El Worker desplegado (`wrangler secret list`, verificado en vivo) solo tenía configurados `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` — faltaban `SUPABASE_URL` y `SUPABASE_KEY`, las 2 variables que `worker.js:49` exige para siquiera intentar la consulta RAG. **RESUELTO**: se agregaron ambos secrets y se redesplegó. Al probar en vivo apareció un SEGUNDO bug independiente que también bloqueaba el RAG (ambigüedad `PGRST203` entre las 2 sobrecargas de `match_normativa()` en Supabase) — corregido en `worker.js` agregando `p_solo_vigentes:false` explícito a ambas llamadas RPC, con cuidado de no introducir un filtro nuevo por vigencia que hubiera excluido en silencio todo el corpus DDU/PRC. Verificado end-to-end con una llamada real al RPC (200, chunks reales devueltos). Ver [ACH-INFRA-001](#ach-infra-001-p0).
2. **Se identificó, con confianza alta, cuál "Celda 4" corre realmente en el Colab del usuario — y estaba más desincronizada de lo que parecía.** Es la línea que usa `cuerpo_cerrado.py` (no `_celda4_actual.py`). Comparada contra `reglas_normativas.py`, le faltaban 4 reglas completas agregadas entre el 19 y el 21 de septiembre, tenía la cita de pasillo vieja (1,20 m / Art. 4.2.5), y el mismo bug de constante truncada en la pendiente de rampa. **RESUELTO en el notebook local** (`Fase 2/Desarrollos/Test/ArchiCheck_Base 05sep_2151.ipynb`, celda `cell-4`) y en su espejo `Celda 4 - copiar en Colab.py` — pasillo corregido a 1,10 m/Art. 4.2.18, constante de pendiente a la fracción exacta, guard de dato ausente corregido (ya no asume 8% en silencio), y las 4 reglas faltantes agregadas (confirmado que son inertes/aditivas, sin consumidor hoy). **Advertencia real sin resolver**: no hay forma de confirmar desde este entorno si el archivo local editado está efectivamente sincronizado con el notebook abierto en el navegador de Google Colab del usuario — el usuario debe verificar su sesión de Colab directamente y, si no está sincronizado, pegar el contenido corregido a mano. Ver [ACH-CAD-002](#ach-cad-002-p0).

Ambos comparten la misma causa raíz que el resto de esta auditoría ya venía señalando: el proyecto tiene el concepto correcto de "una sola fuente de verdad", pero no existía ningún mecanismo que garantizara que esa fuente realmente llegara a cada consumidor — incluido, se descubrió, el consumidor más importante de todos (lo que el usuario corre en vivo).

### Otros hallazgos relevantes de esta profundización
- Se fechó con precisión la contradicción DS50 vía `git log -S` sobre `src/App.jsx`: el párrafo "4b. circulaciones..." con la cita prohibida ("Art. 22 o Art. 23") existe desde el commit `8eaf00e2` (2026-06-30); la prohibición explícita se agregó 27 días después en el commit `1f8ac8c9` (2026-07-27); el mismo párrafo se volvió a editar 3 días más tarde (`44e21eb`, 2026-07-30, por un fix no relacionado) sin detectar la contradicción. Lleva 56+ días vigente.
- El Worker no se redespliega desde el 2026-07-23 (~2 meses) — un fix real de `reglas_aprendidas.js` del 26-ago nunca llegó a producción.
- `anon`/`authenticated` tienen el privilegio `TRUNCATE` sobre `normativa_chunks` en Supabase — la única operación de escritura que RLS *no* puede bloquear (Postgres no aplica RLS a TRUNCATE), aunque no hay hoy un camino confirmado para explotarlo (el frontend nunca usa una key de Supabase directamente).
- No existe ningún índice vectorial (ivfflat/hnsw) sobre `normativa_chunks.embedding` — confirma que `_fix_ivfflat_probes.mjs` nunca logró su objetivo; las consultas hacen escaneo secuencial completo (correcto, solo no escalable).
- Se confirmó que no existe `.github/workflows` (cero CI) — el riesgo de ACH-DATA-001 es 100% de disparo humano.
- El JSON del pipeline BIM comparte esquema con el que consume `handleColabTexto` en `App.jsx` — el bug de ancho de puerta (ACH-BIM-001) no está aislado, entra directo al prompt de producción en cuanto alguien suba ese JSON.
- Se resolvió el SIN VERIFICAR sobre `ventanas_simples_por_linea_central`: **no es un bug**, `App.jsx:653-662` lo consume como array de `segmentos` genérico, igual que produce el BIM.
- 2 hallazgos nuevos de la lectura completa de `App.jsx` (ACH-FRONT-005, ACH-FRONT-006).

**Lo más importante — 3 hallazgos que cambian cómo se debe leer el resto de la lista:**

1. **El bug de puerta 0.80→0.90 "corregido" el 21-sep en realidad quedó peor en el canal BIM del portal**: el umbral sí se actualizó, pero `generar_json_colab.py` compara ese umbral contra el ancho de una *ventana* residual, no el de la puerta — un bug de variable mal alcanzada (scope), no de dato. Ver [ACH-BIM-001](#ach-bim-001-p0).
2. **Hay una fórmula (pendiente de rampa, constante `0.5333` vs. fracción exacta `4.0/7.5`) que se corrigió en UN solo lugar (`reglas_normativas.py`) y no se propagó a ninguno de sus 3 consumidores reales** — incluido el prompt de producción que usa el modelo hoy mismo en cada análisis. Ver [hallazgo transversal](#hallazgo-transversal-fórmula-de-pendiente-de-rampa-no-propagada-3-ubicaciones).
3. **El pipeline CAD vive hoy en dos líneas paralelas no unificadas** ("Celda 4" con motor de fusión geométrica pero reglas OGUC propias sin sincronizar, vs. "Celda 4 actual" con reglas casi sincronizadas pero sin motor de fusión) y no hay forma de confirmar, sin acceso al notebook vivo de Colab, cuál corre hoy en producción. Ver [ACH-CAD-002](#ach-cad-002-p0).

Estos 3 comparten un patrón: no son bugs aislados, son síntomas de que **el mecanismo de "una sola fuente de verdad" que el proyecto ya se propuso (y documentó) no se aplica consistentemente a sus propios consumidores**. Eso es más importante que cualquier valor puntual mal citado — es lo que hay que resolver estructuralmente en Fase 2/remediación, no parchear caso por caso.

---

## Hallazgo transversal: fórmula de pendiente de rampa no propagada (3 ubicaciones)

`reglas_normativas.py:382` corrige la pendiente máxima de rampa de `i% = 12.8 - 0.5333*L` (constante truncada) a `i% = 12.8 - (4.0/7.5)*L` (fracción exacta), tras un hallazgo de DeepSeek documentado ahí mismo: en el rango L=1.5-9.0m hay 133 puntos donde el redondeo a 2 decimales difiere entre ambas versiones — suficiente para cambiar un cumple/no-cumple en un caso límite. Ese fix vive en un solo archivo. Verificado que **no llegó a ninguno de estos 3 consumidores**:

| Ubicación | Qué pasa | Severidad |
|---|---|---|
| `src/App.jsx:1051` (prompt de producción, `buildPromptCapa2`) | Instruye textualmente al modelo: *"Usa la fórmula real: i% = 12.8 - 0.5333*L"* — es el cálculo que Claude/GPT-4o ejecutan en cada análisis real hoy | **Alta** — afecta el resultado que ve el usuario final en el canal PDF/CAD, no solo un texto de referencia |
| `Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py:1168` | `max_pendiente = round(12.8 - 0.5333 * desarrollo, 2)` — cálculo real ejecutado, no solo texto | **Alta** — mismo efecto en el pipeline generador/Colab |
| `Fase 2/BIM/analizar_todos.py:67-68` (`_REF_RAMPA_PENDIENTE`) | Solo el *texto* de referencia mostrado en el hallazgo; el cálculo real (línea 719) sí usa la función correcta de `reglas_normativas.py` | Baja — inconsistencia de documentación expuesta al usuario, no de cálculo |

**Acción propuesta**: mover la fórmula a una única función exportada desde `reglas_normativas.py` (ya existe: `pendiente_maxima_rampa_pct()`) y hacer que `App.jsx` reciba el valor calculado (o al menos el string de fórmula) desde un lugar compartido en vez de tenerlo hardcodeado en el prompt. El canal BIM (`analizar_todos.py`) ya lo hace bien para el cálculo — el patrón a imitar existe en el propio repo.

---

## Tabla de hallazgos por prioridad

Estado de todos: **SIN VERIFICAR si no se indica lo contrario** en cuanto a si ya fue remediado — esta pasada es de detección, no de corrección. Prioridad P0-P3 según convención ya usada en el proyecto (ACH-`<ÁREA>`-`<NNN>`).

### P0 — bloqueante / impacto directo confirmado

| ID | Resumen | Archivo:línea | Estado |
|---|---|---|---|
| ACH-INFRA-001 | El Worker en producción no tenía `SUPABASE_URL`/`SUPABASE_KEY` configuradas — el RAG normativo completo (1.608 chunks, taxonomía) nunca se ejecutaba, sin log ni señal visible. Al corregir apareció un 2° bug independiente (`PGRST203`, ambigüedad de sobrecarga de `match_normativa`) | `archicheck-worker/worker.js:49, 236-263` + `wrangler secret list` | **FIJO 2026-09-21** — secrets agregados, `p_solo_vigentes:false` agregado a ambas llamadas RPC, redesplegado, verificado end-to-end con llamada real al RPC (200, chunks devueltos) |
| ACH-CAD-002 | La línea de "Celda 4" que corre en vivo en Colab es la que usa `cuerpo_cerrado.py` (identificada con confianza alta) — le faltaban 4 reglas completas, la cita vieja de pasillo (Art. 4.2.5/1.20m) y el bug de constante de rampa | `Fase 2/Desarrollos/Test/Celda 4 - copiar en Colab.py` vs. `Fase 2/reglas_normativas.py`; notebook real: `Fase 2/Desarrollos/Test/ArchiCheck_Base 05sep_2151.ipynb` | **FIJO en el archivo local 2026-09-21** (notebook + espejo, verificado con `py_compile` y diff línea por línea) — **SIN VERIFICAR si el archivo local está sincronizado con la sesión de Colab del navegador del usuario** |
| ACH-BIM-001 | Ancho de puerta comparado en `generar_json_colab.py` es el de una ventana residual, no el de la puerta evaluada (bug de scope de variable) | `Fase 2/BIM/generar_json_colab.py:551-568` | **FIJO 2026-09-21** — `ancho` ahora se calcula desde `d.OverallWidth` con escala de unidades. Verificado con datos reales (Schependomlaan): el residual era exactamente 0,90 m = el umbral, por lo que **las 12 puertas realmente no conformes (0,63-0,68 m) se reportaban como que cumplían**; con el fix se detectan las 12 |
| ACH-FRONT-001 | Contradicción interna en el prompt de producción sobre citar artículos de DS 50/2015 — con síntoma ya confirmado en producción (`sanitizeDS50`); fechada por `git log -S`: prohibición agregada 2026-07-27, párrafo contradictorio existe desde 2026-06-30, re-editado 2026-07-30 sin detectarla, 56+ días vigente | `src/App.jsx:1014` vs. `:1054`; síntoma en `:443-455` | **FIJO 2026-09-21** — la instrucción 4b ahora expresa la misma regla de fondo (1,50 m en ruta accesible) citando OGUC Art. 4.1.7 y reforzando la prohibición. Verificado por grep que ninguna mención restante a DS 50 lleva número de artículo; `npm run build` limpio |
| ACH-DATA-001 | Re-ejecutar `indexar_normativa.mjs` regresiona OGUC/LGUC a versiones de menor cobertura y reinserta 1144 secciones DDU sin curar, sin ningún guard; sin CI que lo dispare automáticamente (riesgo 100% humano) | `normativa/indexar_normativa.mjs:253-301` | **FIJO 2026-09-21** — guard que aborta salvo `--confirmo-reindexado-completo`, con el detalle de los 3 riesgos y puntero a los `_idx_*.mjs` que son la vía real. Probado en ambos caminos. **Queda como decisión de producto**: si el script se arregla de verdad (adaptar al esquema `secciones`) o se deprecia formalmente |
| ACH-INFRA-002 | El Worker no se redesplegaba desde 2026-07-23 (~2 meses) — un fix real de `reglas_aprendidas.js` (26-ago) no había llegado a producción | `wrangler deployments status` vs. `git log reglas_aprendidas.js` | **FIJO 2026-09-21** — redesplegado 2 veces en esta sesión (secrets + fix RPC), código actual de `worker.js`/`reglas_aprendidas.js` ahora sí está en vivo |
| ACH-WORKER-001 | CORS `Access-Control-Allow-Origin: "*"` + sin autenticación + sin rate limit + sin validación de payload en el Worker | `archicheck-worker/worker.js` | **FIJO 2026-09-21** — rate limit por IP (100/min, binding nativo), allowlist de Origin (5 alias reales + localhost), token opcional fail-open, y validación de payload (allowlist de modelo, forma de `messages`, tope de `ragQuery`). Verificado en vivo cada control, incluidos los 2 consumidores reales (frontend y Colab) sin romperse. **Caveat honesto**: el rate limit cuenta por colo y es best-effort (techo global real > 100/min), y el token no es auth real (viaja en el bundle de una SPA pública) |

### P1 — impacto real, acotado o parcialmente mitigado

| ID | Resumen | Archivo:línea |
|---|---|---|
| ACH-FRONT-002 | Cita OGUC Art. 4.2.5 para ancho de pasillo en el prompt de producción, no actualizada al Art. 4.2.18 ya corregido en `reglas_normativas.py` | `src/App.jsx:1034` — **FIJO 2026-09-21**. Verificado contra `oguc_pdf.json` antes de cambiar: 4.2.18 es el que fija pasillos (0,5 cm/persona, piso 1,10 m) y 4.2.5 el método general de vías de evacuación al que 4.2.18 remite; ahora se citan ambos en su rol. La cita de 4.2.5 en la línea de salidas de emergencia (`:1036`) se revisó y **es correcta**, no se tocó |
| ACH-FRONT-003 | `mergeSection(..., tableKey=null)` para la sección "modelo" (accesos/evacuación) siempre favorece la respuesta de Claude; el aporte de GPT-4o a `organizacion_funcional`/`accesos_evacuacion` se descarta en silencio — el cruce entre 2 modelos no ocurre ahí | `src/App.jsx:381-388` (función), `:420` (call site) |
| ACH-FRONT-005 | Cuando solo Claude o solo GPT-4o responde completo en una fase, el análisis sigue en modo degradado sin ningún indicador visible — la sección "Discrepancias entre modelos" queda vacía igual que cuando ambos modelos coincidieron, indistinguible para el usuario | `src/App.jsx:3324-3357` (`analizar()`, `isComplete`) |
| ACH-FRONT-006 | "Normativa OGUC verificada" / "Normativa LGUC verificada" se muestran con `ok:true` hardcodeado — no derivado de ningún resultado real — duplicado en la pestaña en pantalla y en el PDF exportado | `src/App.jsx:2684-2685` (PrintReport), `:4583-4584` (vista en pantalla) |
| ACH-XCUT-001 | Fórmula de pendiente de rampa con constante truncada no propagada — ver [hallazgo transversal](#hallazgo-transversal-fórmula-de-pendiente-de-rampa-no-propagada-3-ubicaciones) | 3 ubicaciones — **FIJO 2026-09-21 en las 3**: `_celda4_actual.py` y la Celda 4 real (commit `87994f7`), y `src/App.jsx:1051` (commit `997d8a1`, que además explica en el prompt por qué la fracción exacta difiere del texto publicado, para que el modelo no "corrija" de vuelta desde su entrenamiento). Los 3 consumidores ya calculan igual |
| ACH-CAD-003 | `_celda4_actual.py` mantiene `puerta_ancho_libre` en 0.80m/N°6 (valor viejo); `reglas_normativas.py` ya lo corrigió a 0.90m/N°4 el 21-sep | `_celda4_actual.py:138` vs. `reglas_normativas.py:191` |
| ACH-CAD-004 | `aplicar_fix_celda4.mjs` usa por defecto `_celda4_nueva.py` (snapshot de 23-jul, reglas OGUC ya identificadas como incorrectas) para pegar sobre el notebook vivo de Colab si se corre sin argumento explícito | `aplicar_fix_celda4.mjs:26` |
| ACH-BIM-002 | `generar_json_colab.py` no evalúa tipo/área/ancho de recinto, círculo de giro, rampa ni escalera — el campo `cumple_oguc` que llega al portal solo refleja ventilación, sin documentarlo | `Fase 2/BIM/generar_json_colab.py:523-547` |
| ACH-DATA-006 | 3 comunas marcadas `activa:true` en `comunas.json` y seleccionables en la UI, pero solo Providencia está indexada en Supabase; `santiago/metadata.json` ni siquiera tiene el campo `activa` | `normativa/comunas.json`, `normativa/santiago/metadata.json` |
| ACH-INFRA-003 | `anon`/`authenticated` tenían grant `TRUNCATE` (y también DELETE/INSERT/UPDATE, mitigados por RLS en la práctica pero no `TRUNCATE`, que Postgres no cubre con RLS) sobre `normativa_chunks` | Introspección Postgres en vivo — **FIJO 2026-09-21**: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ... FROM anon, authenticated`. Ambos roles quedaron **solo con SELECT** (que es lo único que la policy y el uso real necesitan); `service_role` intacto (es el que usan el Worker y los `_idx_*.mjs`). Verificado antes/después con snapshot de grants, 1.608 filas intactas, `match_normativa()` respondiendo, y llamada real al Worker en producción con `ragQuery` → 200 |

### P2 — deuda técnica real, sin síntoma confirmado hoy

| ID | Resumen | Archivo:línea |
|---|---|---|
| ACH-CAD-001 | Tolerancia ventana/muro hardcodeada en píxeles fijos (no metros), contradice el principio de "un solo lugar rastreable" que el propio módulo enuncia; no escala con DPI/escala del plano | `cuerpo_cerrado.py:205, 236` |
| ACH-CAD-005 | Excepciones silenciosas (`except: pass` / `except Exception: pass`) en parseo de SSE de Claude Vision | `_celda4_actual.py:853-854, 683-684` |
| ACH-BIM-003 | `piloto_ids_oguc.py` no aplica escala de unidades a `OverallWidth` — misma familia del bug histórico de unidades ya conocido en el proyecto, no confirmado disparado en su único IFC de prueba | `Fase 2/BIM/piloto_ids_oguc.py` (sin coincidencias de escala) |
| ACH-BIM-004 | Deduplicación escalera/rampa triplicada (3 implementaciones independientes), listas `ARCHIVOS` desincronizadas entre scripts, manejo de errores de batch inconsistente (continue-on-error / solo PermissionError / sin try-except) | `analizar_todos.py`, `generar_plano_pdf.py`, `generar_json_colab.py` |
| ACH-DATA-002 | Bloque PRC de `indexar_normativa.mjs` nunca ejecuta (ruta `normativa/comunas/` no existe) sin ningún `console.warn`, a diferencia de los otros 5 bloques que sí avisan | `normativa/indexar_normativa.mjs:304-316` — **FIJO 2026-09-21**, `else` con aviso agregado junto al guard de ACH-DATA-001 |
| ACH-DATA-003 | `clasificar_normativa.mjs` se declara "fuente única" de taxonomía pero ningún script de carga real (`_idx_*.mjs`) la invoca; la taxonomía se aplicó después, vía `backfill_metadata.mjs` | `normativa/clasificar_normativa.mjs:4-9` |
| ACH-DATA-004 | URL de Supabase de producción hardcodeada como fallback si falta `SUPABASE_URL` — asimétrico con `SUPABASE_SECRET`, que sí aborta si falta | `normativa/backfill_metadata.mjs:21-23` |
| ACH-DATA-005 | `extraer_ddu.mjs` trunca texto a 60.000 caracteres antes de enviarlo a Claude sin loguearlo; placeholder de API key hardcodeado como fallback; el JSON de salida no registra si una sección vino de estructuración por Claude o de chunking crudo de fallback | `normativa/extraer_ddu.mjs:19, 105, 229-233` |
| ACH-INFRA-004 | Sin índice vectorial (ivfflat/hnsw) sobre `normativa_chunks.embedding` — contradice la documentación/scripts existentes que asumen que existe; hoy hace escaneo secuencial completo (correcto, no escalable) | Introspección Postgres en vivo (`pg_indexes`) |
| ACH-INFRA-005 | `wrangler deploy` del Worker fallaba por falta de la carpeta `public/` (referenciada en `wrangler.toml`, no versionable vacía en git) | `archicheck-worker/wrangler.toml` | **FIJO 2026-09-21** — carpeta recreada localmente antes de desplegar; sigue **PENDIENTE** un fix permanente para que un checkout limpio futuro no vuelva a tropezar con esto (ej. un `.gitkeep` filtrado del asset upload, o un paso de setup documentado) |

### P3 — higiene / menor (detalle completo en los anexos, no repetido aquí)

Imports sin usar (`datetime` en `_celda4_actual.py`), funciones nunca invocadas (`resumen_estado()` en `catalogo_tipologias.py`), docstrings desactualizados (conteo de casos de test), archivos JSON huérfanos (`normativa/ddu/circ*.json`, `normativa/nacional/metadata.json` con cifras de una prueba piloto temprana), ~118MB de PDFs de trabajo versionados en git bajo `normativa/providencia/`, citas de artículo hardcodeadas como texto plano en paralelo a la versión importada correctamente (`analizar_todos.py:674,884`, `piloto_ids_oguc.py:65,142-143`).

---

## Repasada crítica de la Fase 1 (2026-09-21, con Opus)

Revisión independiente de la propia auditoría: verificar los hallazgos contra el código real, buscar falsos positivos, poner a prueba las afirmaciones de cobertura y **auditar las remediaciones aplicadas**. Resultado: la Fase 1 se sostiene, pero **dejó pasar un hallazgo importante** y hubo que corregir una afirmación.

### Lo que se confirmó
- **La identificación de la "Celda 4" viva era correcta**, y ahora está confirmada por un método independiente: las 6 corridas reales más recientes (19-sep) contienen todas `ventanas_reconstruidas_por_jamba`, campo que **solo** produce la línea con `cuerpo_cerrado.py`. La conclusión ya no depende de razonar sobre el código: la respaldan los datos de salida de producción.
- **Las remediaciones no introdujeron regresiones.** Se auditó específicamente el riesgo de haber agregado 4 entradas de formas heterogéneas (un dict, una tupla de 2) a `OGUC_REGLAS`, cuyo consumidor desempaqueta 3 valores: ambos archivos modificados tienen un único consumidor (`.get(tipo, ...)`) y ninguna derivación desde las claves. Inerte, como se había afirmado.
- **ACH-DATA-006 sin falso positivo**: 3 comunas `activa:true`, solo `PRC-PRV` indexado por algún `_idx_*.mjs`, y `santiago/metadata.json` efectivamente sin campo `activa`.
- **La afirmación de cobertura de `App.jsx` se sostiene**: en los ~1.900 líneas no leídas línea por línea hay **cero** umbrales normativos; las 48 menciones a normativa son todas de presentación (encabezados, colores, lectura de `r.cumple`).

### ACH-FRONT-007 (NUEVO, P1) — el canal PDF/CAD afirma una cita OGUC que no existe
El prompt de producción y **el informe que ve el arquitecto** dicen que la verificación de iluminación/ventilación es "según OGUC **Art. 4.5.7**", con un "ratio **1/6**" atribuido a "Art. 4.1.2, 4.5.7". Verificado contra `oguc_pdf.json`:
- **Art. 4.5.7 no trata de ventanas**: regula **patios de locales escolares** (esparcimiento, educación física, ancho mínimo 5,50 m). Es una cita de materia equivocada.
- **Art. 4.1.2** es real y sí trata de ventilación de locales habitables, pero es **cualitativo**: exige "al menos una ventana" y 1,5 m libres en dormitorios. **No contiene ningún ratio.**
- El ratio **1/6 no existe en los 770 artículos** para ventanas: las dos únicas apariciones son Art. 2.6.12 (distanciamiento a predios, 1/6 de la altura) y Art. 5.6.6 (sección de albañilería).

La cita `4.5.7` aparece **5 veces** en `src/App.jsx`, incluidos el subtítulo de la etapa y el PDF exportable. Es la misma clase de defecto que ACH-FRONT-001/002 —afirmar ante el arquitecto una cita que la fuente no respalda— pero más grave: artículo de materia ajena **y** un valor inexistente en la norma. `reglas_normativas.py` ya había documentado esto para el canal BIM ("el 10% NO es una cita OGUC real"); el canal PDF/CAD nunca se cruzó contra esa conclusión.

**RESUELTO 2026-09-21** (commit `897ee39`), y la pregunta "¿1/6 o 10%?" resultó ser la pregunta equivocada. Al preguntar el usuario *para qué tipo de proyecto* aplicaba el umbral, la respuesta reencuadró todo: **para vivienda, oficina o comercio la OGUC no fija ningún porcentaje**. El único porcentaje real del cuerpo normativo es el Art. 4.5.5, y su propio texto acota el alcance a "recintos docentes... salas de actividades, de clases, talleres y laboratorios... y los dormitorios en hogares estudiantiles". Los proyectos de prueba del sistema (restaurante, comercio+oficinas) no caen ahí. El chequeo estaba generando falsos positivos contra una exigencia inexistente para esos destinos.

**Además se recuperó la tabla del Art. 4.5.5**, que el proyecto daba por perdida ("no se extrajo limpia del PDF"). La causa real era otra: **el PDF oficial de Ley Chile no tiene la tabla en su capa de texto** —donde van los valores dice literalmente dos puntos— porque está embebida como **imagen** en la página 255. Se recuperó renderizando esa página y leyéndola. Revela dos cosas que el sistema no contemplaba:

| Regiones | Ilum. docentes | Ilum. hogar est. | Vent. docentes | Vent. hogar est. |
|---|---|---|---|---|
| Arica y Parinacota → Coquimbo | 14% | 6% | 8% | 6% |
| Valparaíso, **Metropolitana**, O'Higgins, Maule | 17% | 7% | 8% | 6% |
| Ñuble → Magallanes | 20% | 8% | 8% | 6% |

1. La exigencia es **regional** (sube de norte a sur).
2. **Iluminación y ventilación son porcentajes distintos** — el sistema los trata como un único chequeo combinado (`ventilacion_iluminacion_pct`).

Quedó implementado en `reglas_normativas.py` (`ART_455_DOCENTE` + `vanos_minimos_art_455()`, que devuelve `None` si no reconoce la región en vez de asumir un default; verificado contra las 16 regiones y sus variantes de escritura reales). En `App.jsx` se eliminaron las 5 afirmaciones de "Art. 4.5.7" (la única mención que queda es la que **prohíbe** citarlo) y el default `"1/6"` de la columna "Ratio req." pasó a `—`.

**Pendiente, bloqueado por el roadmap**: aplicar la regla educacional de verdad requiere conocer el **destino del edificio**, input que hoy no existe (el desplegable de "tipo de proyecto" es otro eje: obra nueva/ampliación/…). El usuario confirmó que la captura del destino ya está en el roadmap y será un input garantizado; cuando llegue, `vanos_minimos_art_455()` ya está listo para conectarse.

### ACH-XCUT-002 (NUEVO, P1) — el mismo requisito, dos umbrales según el canal
- **PDF/CAD**: ratio 1/6 = **16,67%**
- **BIM**: **10%** (`reglas_normativas.py` → `analizar_todos.py`)

Un recinto con 12% de ventana **cumple en BIM y no cumple en CAD**. Mismo edificio, misma regla, veredicto distinto según por dónde entró el proyecto. Es el mismo patrón raíz que el hallazgo transversal de la rampa, en un requisito que Fase 1 tocó por un lado (BIM) sin cruzarlo con el otro. **Elegir el umbral es una decisión de producto**, no técnica: queda abierta.

### ACH-TEST-001 (NUEVO, P2 — YA CORREGIDO)
`test_cuerpo_cerrado.py` (24 aserciones sobre 9 bugs históricos) **no definía ninguna función `def test_*`**, así que `pytest` no recolectaba nada de ahí, en silencio. Corriendo `pytest` se veía "5 passed" y cualquiera concluía que la regresión había corrido. El docstring del archivo hermano incluso afirmaba que "corre junto al resto" — era falso. Los 24 casos pasan (verificado a mano), así que no había regresión escondida: era un problema de cobertura del runner. **Corregido** con un envoltorio; pytest pasó de 5 a 6 tests y la afirmación del docstring ahora es verdadera.

### ACH-DATA-007 (NUEVO, **el hallazgo raíz** — RESUELTO 2026-09-21, commit `2460ed5`)

Buscando por qué la cita falsa seguía viva en producción, apareció el origen de toda la cadena de citas erróneas que el proyecto venía corrigiendo río abajo desde hacía meses.

`src/App.jsx` inyecta en **cada análisis** un bloque titulado *"NORMATIVA NACIONAL VIGENTE — OGUC/LGUC"* con 53 artículos, que salían de 2 JSON **mantenidos a mano**. Cruzados uno por uno contra el PDF oficial: **solo 23 tenían el texto real.** Los otros 30:

- **Texto fabricado** atribuido a artículos reales. Verificado a mano: el JSON decía que el **Art. 4.2.2** trata de anchos de escalera (el real trata de *cambio de destino*) y que el **Art. 4.5.7** exige *"1/6 de la superficie de piso"* de ventana (el real regula *patios de locales escolares*, y ese 1/6 **no existe en ninguno de los 770 artículos**).
- **Placeholders**: 5 artículos de LGUC (57, 58, 60, 119, 120) cuyo texto era literalmente `"[Artículo N - consultar texto completo en BCN]"` — mientras el checklist del prompt le pedía al modelo verificarlos.

**Ese 1/6 inventado es el origen de ACH-FRONT-007**, y muy probablemente de las demás citas equivocadas (4.2.2 para escaleras, 4.2.5/4.2.6 para ventilación) que se venían parcheando una por una en `reglas_normativas.py`, en la Celda 4 y en las instrucciones del prompt, sin dar con la fuente. Se corregían síntomas mientras el corpus que el prompt inyecta arriba de todo estaba inventado.

**Dos defectos más que se potenciaban entre sí:**
1. La extracción del PDF trae la marginalia del decreto **intercalada dentro de las oraciones** (*"Los pasillos tendrán un ancho **Decreto 75, VIVIENDA** libre mínimo de medio centímetro por persona…"*), en **565 de 770** secciones.
2. El prompt **truncaba cada artículo a 220 caracteres**. En el Art. 4.2.18 el requisito (`1,10 m`) cae en el carácter **222**: el ruido empujaba el número justo fuera del corte y **el modelo nunca lo veía**.

**Resuelto así**: el texto ya no se escribe a mano, se **deriva** del PDF oficial (`generar_articulos_prompt.mjs`) y se limpia (`limpiar_texto_normativo.mjs`, 565 → 0 secciones con ruido). Se eliminó el truncado —sobre texto legal un corte ciego cae donde cae, no existe un límite seguro— y la etiqueta de tema, que también estaba equivocada. Un test (`test_articulos_prompt.mjs`, 51/51) falla si el texto no coincide con el oficial, si reaparece un placeholder o si queda marginalia, y corre en el hook y en CI. El bloque pasa de ~3k a ~20k tokens: ese es el costo de que el modelo lea el texto real.

**Queda abierto**: las etiquetas de tema y, sobre todo, **la selección de qué artículos incluir** se hicieron sobre premisas equivocadas (el 4.5.7 entró creyendo que trataba de ventilación). Merece una curación normativa.

### ACH-DATA-008 (NUEVO, P2 — RESUELTO 2026-09-21 en el repo; **re-indexado de Supabase PENDIENTE**) — 45 artículos "bis" faltaban en la extracción

Ninguna de las 2 regex de extracción contemplaba los artículos *bis*/*ter*/*quáter*. Se recuperaron **45 artículos** (13 en OGUC, 32 en LGUC), entre ellos el **LGUC Art. 116 bis** (revisor independiente), que el propio checklist del prompt manda verificar.

*Corrección a la Fase 1*: el hallazgo original decía "49 (22 LGUC + 27 OGUC)". Ese conteo salía de un grep sobre el PDF que **también contaba las referencias cruzadas** escritas en minúscula (*"lo dispuesto en el artículo 116 bis"*). El número verificado, contando encabezados reales, es 45.

**Los 2 corpus fallaban de forma distinta, y la de LGUC era peor**:

- **OGUC** (`Artículo 2.1.3. bis.`): la regex capturaba solo `\d+\.\d+\.\d+`, así que el bis se guardaba con el número del artículo **base**; el dedup de más abajo conserva la primera ocurrencia y **lo descartaba entero, en silencio**. Pérdida limpia: el texto del artículo base quedaba correcto.
- **LGUC** (`Artículo 116 bis.-`): la regex exigía `.` o `-` **pegado al número**, así que el encabezado **no matcheaba en absoluto**. Como cada artículo se corta desde su match hasta el siguiente, no crear el límite no borraba el bis: **le pegaba su texto al artículo anterior**. Verificado: el Art. 2 contenía adentro todo el Art. 2 bis, y el Art. 116 se comía el 116 bis más la serie completa **116 bis A–I** (9 artículos sobre torres de antenas). Esto es peor que perder el texto — el corpus entregaba el contenido del bis **atribuido al número del artículo base**, que es precisamente el patrón de ACH-DATA-007.

**Verificación aplicada a ambos** (no una lectura a ojo): se comparó la extracción nueva contra la anterior artículo por artículo, confirmando que **0 caracteres se perdieron** y que las diferencias son solo re-corte en chunks. En OGUC un primer intento de regex con el punto opcional rompió la extracción —pasó a matchear referencias cruzadas escritas con mayúscula y generó cortes espurios que se comieron un fragmento real del Art. 2.1.4—; **lo detectó ese control de integridad, no una revisión manual**. En LGUC el delta de 581 caracteres se explicó y cuadró: son los 32 encabezados que ahora son límites en vez de texto. Resultado: OGUC 770 → 791 secciones, LGUC 245 → 267.

**Efecto colateral arreglado**: el strip del encabezado quitaba un solo carácter de `.-`, así que **los 17 artículos LGUC del prompt empezaban con `- `**. Preexistente y cosmético, pero iba en el prompt de producción.

El test del corpus pasa de 59/59 a **60/60**: `LGUC 116 bis` figuraba en `articulos_prompt.json` y hasta ahora se reportaba como "NO hallado en el PDF".

**PENDIENTE — decisión del usuario**: el **RAG de Supabase** (1.608 chunks) sale de esta misma extracción y **sigue con los datos viejos**. Re-indexar toca datos de producción, así que no se hizo sin visto bueno explícito. Hasta que se haga, el prompt y el RAG están **desincronizados**: el prompt ya tiene los bis, el RAG no.

### ACH-DATA-009 (NUEVO, P3, ABIERTO) — los 10 artículos transitorios de la LGUC se descartan en silencio

Hallado al verificar ACH-DATA-008, **preexistente y sin relación con ese arreglo**. La LGUC numera sus artículos transitorios desde 1 otra vez (`Artículo 1°.-` en el carácter 349.668, justo después de la marca *"ARTICULOS TRANSITORIOS"*). Como el extractor deduplica por número conservando la primera ocurrencia, **los 10 transitorios se descartan** y se quedan los del cuerpo principal. No afecta a ningún artículo hoy seleccionado para el prompt. El arreglo es acotado —prefijar el número cuando la posición supera la marca de transitorios—, pero cambia el corpus, así que se registra en vez de aplicarse junto con otra cosa. OGUC no tiene el problema: 791 secciones, 0 números duplicados.

### ACH-DATA-010 (NUEVO, **P1**, ABIERTO) — 4 artículos llegan al prompt con la prosa y **sin la tabla**, que es donde está la norma

Hallado al cerrar ACH-DATA-008, barriendo los 60 artículos del prompt en busca de menciones a una tabla o cuadro. En el PDF de leychile.cl **las tablas son imágenes**: la extracción verbatim captura el texto que las rodea y **descarta los números**. En estos 4 artículos los números *son* la norma, así que lo que llega al modelo es un artículo que anuncia una tabla que nunca recibe:

| Art. | Tema | Qué falta | Por qué importa |
|---|---|---|---|
| **4.2.4** | Carga de ocupación | La tabla completa de ocupación por destino. Sobreviven 2 cifras incidentales (`60 m2`, `140 m2`) | Es el **insumo** del ancho de vías de evacuación (4.2.5) y de escaleras (4.2.10). Se le pide calcular carga de ocupación sin la tabla |
| **4.3.3** | Resistencia al fuego | La matriz completa. **Cero cifras con unidad en todo el artículo** | El 4.3.14 (muros cortafuego) remite explícitamente a *"la tabla del artículo 4.3.3"*, que tampoco está |
| **2.6.3** | Distanciamientos | La tabla de distanciamientos a deslindes. Sobrevive solo un `100 m` | Es un chequeo urbanístico directo |
| **4.5.5** | Vanos de recintos docentes | La tabla de % por región. El texto dice literalmente *"el porcentaje … que se indica en la siguiente tabla: **% SUPERFICIE DEL RECINTO..**"* y ahí se corta | **Es el caso más grave**: se entrega un artículo que promete un porcentaje y no lo da. Ese es exactamente el modo de falla que produjo el "1/6" inventado (ACH-DATA-007) |

**Es un riesgo distinto al de ACH-DATA-007, y en un sentido peor**: allá el texto era falso y se detectaba comparándolo con el oficial. Acá el texto **es oficial y está incompleto**, así que el test `test_articulos_prompt.mjs` lo da por bueno —con razón, según su criterio— mientras el modelo queda invitado a rellenar el número que falta.

**La tabla del 4.5.5 ya está recuperada y verificada** (`ART_455_DOCENTE` en `Fase 2/reglas_normativas.py`, valores por grupo de regiones norte/centro/sur), obtenida renderizando la página del PDF con PyMuPDF. O sea: el motor CAD conoce el número y **el prompt no**. Las otras 3 tablas habría que recuperarlas igual.

**Por qué no se arregló en el acto**: inyectar la tabla rompe el contrato que estableció el arreglo de ACH-DATA-007 —*"el texto se deriva verbatim del PDF"*— y haría fallar al test. Necesita un mecanismo explícito: un anexo marcado como tal, con su fuente (página del PDF) y reconocido por el test. Es una decisión de diseño, no un parche.

### ACH-DATA-011 (NUEVO, P3, ABIERTO) — el prompt cita el Art. 4.2.18 y no se lo entrega

Mismo patrón que tenía el 4.2.10 antes de la curación: `src/App.jsx:1054` instruye citar **OGUC Art. 4.2.18** (ancho de pasillos) y el artículo **no está** entre los 43 que se inyectan. Verificado con un cruce de todos los artículos citados en `App.jsx` contra la lista entregada: es el **único** que falta (LGUC: 0 faltantes). El impacto es menor que en el caso del 4.2.10 porque la propia instrucción deletrea el requisito (*medio centímetro por persona, mínimo 1,10 m*), así que el umbral no se pierde. Igual corresponde entregarlo: el texto oficial está extraído y disponible.

### ACH-OPS-001 (NUEVO, P2 — RESUELTO 2026-09-21, commits `0a55a24` y `2460ed5`)
Existe un `pre-commit` real y bueno (chequeo de hardcodeo + los 24 casos de regresión + los golden tests contra 3 proyectos reales), activado vía `core.hooksPath = .githooks`. Pero **`.githooks/` no estaba versionado**: no sobrevivía a un clone limpio ni existía para ningún colaborador. Sumado a que no hay CI (`.github/workflows` no existe), toda la verificación automática del motor CAD dependía de un archivo sin trackear en un equipo. *Corrección a la Fase 1*: el anexo de motor CAD decía que los golden tests están "excluidos por defecto de cualquier corrida normal" — cierto para `pytest`, pero incompleto: el hook sí los corre.

**RESUELTO**, y versionarlo destapó 3 problemas que lo habrían hecho inútil para un colaborador:
1. **Ruta absoluta a una máquina** (`/c/Users/dell/...`) — además de inservible para otro, filtraba usuario y estructura de directorios a un repo **público**.
2. **El fallback de esa ruta estaba roto en la propia máquina donde se escribió**: probaba `command -v python3` primero y, en Windows, eso resuelve al **stub de Microsoft Store** — existe como ejecutable pero no es Python. Nunca se notó porque la ruta hardcodeada siempre ganaba. Ahora los candidatos se prueban **ejecutándolos**, no con `command -v`, y se puede fijar uno con `ARCHICHECK_PYTHON`.
3. **Modo ejecutable + finales de línea**: se marcó `100755` y se agregó `.gitattributes` con `eol=lf` para `.githooks/**`. Un script de shell que llega con CRLF falla en Linux/macOS con *"bad interpreter"* — no correría justo donde más importa.

`CLAUDE.md` documenta ahora el paso de instalación (`git config core.hooksPath .githooks`), porque **`core.hooksPath` es config local de git y no viaja con el clon**: versionar el archivo no lo activa. Verificado que las 3 etapas del gate siguen pasando con el intérprete que ahora elige la detección.

**El CI ya existe** (`.github/workflows/ci.yml`, commit `2460ed5`): en cada push a `main` y en cada PR corre el build del portal, el chequeo del corpus normativo, la sincronía con su generador, la regresión del motor CAD (24 casos + propiedades) y el chequeo de hardcodeo. Los 3 pasos se probaron localmente antes de subirlos. Los golden tests quedan fuera a propósito (lentos, dependen de PDFs pesados) y los sigue corriendo el hook local.

## Cobertura de esta pasada — qué quedó cubierto al 100% y qué no

| Área | Cobertura | Estado |
|---|---|---|
| `normativa/*.mjs` (scripts de indexación/clasificación, ~26 scripts `_*`) | Completa — 4 archivos principales leídos línea por línea + los 26 secundarios por encabezado/propósito + inventario de las 5 carpetas de datos | Cerrado para esta pasada |
| `Fase 2/Herramientas_CubiCasa5k/` (motor CAD) | Completa para los archivos núcleo (`cuerpo_cerrado.py`, `catalogo_tipologias.py`, `_celda4_actual.py`, 4 archivos de test, 6 `.py` adicionales) + categorización de los 169 archivos totales | Cerrado para esta pasada; **pendiente** leer `Fase 2/Desarrollos/Test/Celda 4 - copiar en Colab.py` y variantes (fuera de alcance asignado, necesario para resolver ACH-CAD-002) |
| `Fase 2/BIM/` (pipeline BIM) | Completa — los 4 scripts que faltaban (`analizar_todos.py`, `generar_plano_pdf.py`, `piloto_ids_oguc.py`, `generar_json_colab.py`) leídos línea por línea | Cerrado para esta pasada |
| `src/App.jsx` (4.636 líneas) | **Cerrada para funciones con impacto normativo/de datos** — leídas en profundidad: 1-828 (helpers de merge, `sanitizeDS50`, `buildColabTexto`, cálculo de mediciones/elementos corregidos por el arquitecto), 896-1150 (`buildPromptCapa1`/`buildPromptCapa2` completos), 2262-2706 (`PrintReport` completo), 2758-2822 y 3186-3472 (`resetApp`, `exportPDF`, `exportDatasetMuros`, handlers de confirmación de revisión, `analizar()` completo) — más greps dirigidos (`catch`, citas `Art\.`, `TODO/FIXME`, `ok:true`) sobre el archivo completo | **PENDIENTE, con criterio explícito**: sin leer línea-por-línea 1150-2262 (canvas de dibujo/hit-test, componentes de UI de revisión gráfica) y 3477-4636 (JSX de maquetado/estilos del componente principal) — ambos cubiertos por grep dirigido a los mismos patrones de riesgo sin hallazgos adicionales, pero es UI/interacción, no lógica normativa; se difiere una lectura secuencial completa de esas ~1900 líneas a Fase 2 si se prioriza |
| Worker (`worker.js`, `reglas_aprendidas.js`) | Completa — leído íntegro en pasada anterior y re-confirmado hoy junto con introspección en vivo (secrets, deployments) | Cerrado — ver ACH-WORKER-001, ACH-INFRA-001, ACH-INFRA-002, ACH-INFRA-005 |
| Supabase (esquema, RLS, grants, funciones RPC, índices) | Completa vía conexión Postgres directa (Session Pooler) — única tabla (`normativa_chunks`), todas las policies, grants por rol, funciones y su security type, extensiones, índices | Cerrado — ver ACH-INFRA-003, ACH-INFRA-004. No verificado: `rolbypassrls` de `service_role` explícitamente (asumido por convención Supabase, no confirmado con query directa) |
| Vercel | Completa para lo esencial — proyecto, framework, Node version, variables de entorno (ninguna configurada, confirmado coherente con la arquitectura) | Cerrado. No verificado: dominios custom, protección de deployment, configuración de build avanzada — bajo impacto, PENDIENTE si se quiere exhaustividad |
| Cloudflare (routes/dominios custom del Worker más allá de `*.workers.dev`) | No verificado con detalle esta pasada | **PENDIENTE**, menor — no bloquea ninguna conclusión de esta Fase 1 |
| GitHub (branch protection, CI, colaboradores) | Ya verificado en pasada anterior vía `gh api` (ver memoria de proyecto) | Ya cerrado antes de esta Fase 1 |
| Colab (notebook vivo) | **Resuelto indirectamente**: no hay acceso directo al navegador de Colab, pero se identificó con confianza alta cuál línea de código corre ahí (ver ACH-CAD-002) vía el único `.ipynb` no archivado del filesystem local + trazabilidad de commits | Sustancialmente cerrado; matiz honesto: no se puede descartar que se hayan pegado cambios directo en el navegador de Colab después del 13/14-sep sin dejar rastro local |

---

## Qué sigue

Las 3 preguntas abiertas del primer checkpoint de Fase 1 ya se resolvieron en esta misma sesión (profundización 2026-09-21): los 5 P0 originales se investigaron a fondo (2 de ellos — Celda 4 y RAG de Supabase — cambiaron de "incertidumbre" a "confirmado y peor de lo esperado"), `App.jsx` quedó cubierto para toda función con impacto normativo/de datos, y Supabase/Vercel/Cloudflare se auditaron en vivo con las credenciales ya guardadas. Fase 1 está ahora sustancialmente completa (7 hallazgos P0, incluidos 2 recién confirmados de infraestructura).

### Estado de remediación al cierre de la Fase 1 (2026-09-21)

**Los 7 P0 están remediados y verificados**, más los 2 P1 del prompt de producción (ACH-FRONT-002, ACH-XCUT-001) y ACH-DATA-002/ACH-INFRA-005. Ninguno se dio por cerrado sin verificación real: llamadas en vivo al Worker y a Supabase, datos reales de IFC, texto oficial de OGUC antes de tocar una cita, `npm run build`, `py_compile`, y cada control del Worker probado individualmente contra el endpoint desplegado.

Dos cosas que la verificación cambió respecto del hallazgo original, y que valen más que el fix en sí:
- **ACH-BIM-001 era peor de lo documentado**: el valor residual que el bug comparaba era el ancho de la última ventana, que en el archivo de prueba medía **exactamente 0,90 m — idéntico al umbral**. O sea `ancho < 0.90` era `False` siempre, y las 12 puertas realmente no conformes (0,63-0,68 m) se reportaban como que cumplían. No era ruido aleatorio: era un falso negativo sistemático.
- **La allowlist de Origin tenía un bug propio** que se detectó antes de desplegar, probándola contra la salida real de `vercel alias ls`: un alias de producción vivo (`archicheck-tuqrapps-projects.vercel.app`) quedaba bloqueado.

**Caveats honestos sobre ACH-WORKER-001** (el endurecimiento no es hermético, y conviene no creer que sí):
- El rate limit de Cloudflare cuenta **por colo y es best-effort**: verificado que 115 requests en paralelo no dispararon un límite de 100. El techo global real es más alto que el número configurado. Para un tope duro haría falta Durable Objects.
- El token **no es autenticación real**: el frontend es una SPA pública, así que viaja en el bundle. Es fricción contra abuso oportunista, nada más. Además está fail-open hasta que se configure el secret.
- La allowlist de Origin **no detiene `curl`**, que simplemente no manda `Origin`. No se puede exigir, porque Colab llama sin él.

**Pasos que quedan en manos del usuario (no los puedo hacer yo):**
1. **Activar el token**, si se quiere: setear `VITE_WORKER_TOKEN` en Vercel → redesplegar el frontend → recién ahí `wrangler secret put WORKER_TOKEN`. En ese orden, si no se rompe producción.
2. **Push + deploy del frontend**: todos los fixes de `App.jsx` (DS50, pasillo, rampa, header del token) están commiteados **solo en local**. El sitio en Vercel sigue sirviendo el código viejo hasta que se pushee.

**Decisiones abiertas:**
1. **Celda 4 — problema estructural**: el fix corrigió los valores, pero la línea viva sigue siendo una copia manual sin mecanismo de sincronización con `reglas_normativas.py`. Mientras siga así, el mismo desync va a volver a pasar.
2. **`indexar_normativa.mjs`**: ¿se arregla de verdad (adaptarlo al esquema `secciones`) o se deprecia formalmente dejando a los `_idx_*.mjs` como vía única?
3. Cerrar el resto de Vercel (dominios, protección de deployment) y las routes del Worker — bajo impacto.
