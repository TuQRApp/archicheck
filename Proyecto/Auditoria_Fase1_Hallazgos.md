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
| ACH-BIM-001 | Ancho de puerta comparado en `generar_json_colab.py` es el de una ventana residual, no el de la puerta evaluada (bug de scope de variable) | `Fase 2/BIM/generar_json_colab.py:551-568` | Sin remediar |
| ACH-FRONT-001 | Contradicción interna en el prompt de producción sobre citar artículos de DS 50/2015 — con síntoma ya confirmado en producción (`sanitizeDS50`); fechada por `git log -S`: prohibición agregada 2026-07-27, párrafo contradictorio existe desde 2026-06-30, re-editado 2026-07-30 sin detectarla, 56+ días vigente | `src/App.jsx:1014` vs. `:1054`; síntoma en `:443-455` | Sin remediar |
| ACH-DATA-001 | Re-ejecutar `indexar_normativa.mjs` regresiona OGUC/LGUC a versiones de menor cobertura y reinserta 1144 secciones DDU sin curar, sin ningún guard; sin CI que lo dispare automáticamente (riesgo 100% humano) | `normativa/indexar_normativa.mjs:253-301` | Sin remediar |
| ACH-INFRA-002 | El Worker no se redesplegaba desde 2026-07-23 (~2 meses) — un fix real de `reglas_aprendidas.js` (26-ago) no había llegado a producción | `wrangler deployments status` vs. `git log reglas_aprendidas.js` | **FIJO 2026-09-21** — redesplegado 2 veces en esta sesión (secrets + fix RPC), código actual de `worker.js`/`reglas_aprendidas.js` ahora sí está en vivo |
| ACH-WORKER-001 *(referenciado, re-confirmado esta pasada por lectura completa de `worker.js`)* | CORS `Access-Control-Allow-Origin: "*"` + sin autenticación + sin rate limit + sin validación de payload en el Worker | `archicheck-worker/worker.js` | Sin remediar — fuera del alcance de "Hazlo" 2026-09-21, que fue específicamente secrets+deploy+Celda 4 |

### P1 — impacto real, acotado o parcialmente mitigado

| ID | Resumen | Archivo:línea |
|---|---|---|
| ACH-FRONT-002 | Cita OGUC Art. 4.2.5 para ancho de pasillo/salidas de emergencia en el prompt de producción, no actualizada al Art. 4.2.18 ya corregido en `reglas_normativas.py` | `src/App.jsx:1034, 1036` |
| ACH-FRONT-003 | `mergeSection(..., tableKey=null)` para la sección "modelo" (accesos/evacuación) siempre favorece la respuesta de Claude; el aporte de GPT-4o a `organizacion_funcional`/`accesos_evacuacion` se descarta en silencio — el cruce entre 2 modelos no ocurre ahí | `src/App.jsx:381-388` (función), `:420` (call site) |
| ACH-FRONT-005 | Cuando solo Claude o solo GPT-4o responde completo en una fase, el análisis sigue en modo degradado sin ningún indicador visible — la sección "Discrepancias entre modelos" queda vacía igual que cuando ambos modelos coincidieron, indistinguible para el usuario | `src/App.jsx:3324-3357` (`analizar()`, `isComplete`) |
| ACH-FRONT-006 | "Normativa OGUC verificada" / "Normativa LGUC verificada" se muestran con `ok:true` hardcodeado — no derivado de ningún resultado real — duplicado en la pestaña en pantalla y en el PDF exportado | `src/App.jsx:2684-2685` (PrintReport), `:4583-4584` (vista en pantalla) |
| ACH-XCUT-001 | Fórmula de pendiente de rampa con constante truncada no propagada — ver [hallazgo transversal](#hallazgo-transversal-fórmula-de-pendiente-de-rampa-no-propagada-3-ubicaciones) | 3 ubicaciones, ver tabla arriba |
| ACH-CAD-003 | `_celda4_actual.py` mantiene `puerta_ancho_libre` en 0.80m/N°6 (valor viejo); `reglas_normativas.py` ya lo corrigió a 0.90m/N°4 el 21-sep | `_celda4_actual.py:138` vs. `reglas_normativas.py:191` |
| ACH-CAD-004 | `aplicar_fix_celda4.mjs` usa por defecto `_celda4_nueva.py` (snapshot de 23-jul, reglas OGUC ya identificadas como incorrectas) para pegar sobre el notebook vivo de Colab si se corre sin argumento explícito | `aplicar_fix_celda4.mjs:26` |
| ACH-BIM-002 | `generar_json_colab.py` no evalúa tipo/área/ancho de recinto, círculo de giro, rampa ni escalera — el campo `cumple_oguc` que llega al portal solo refleja ventilación, sin documentarlo | `Fase 2/BIM/generar_json_colab.py:523-547` |
| ACH-DATA-006 | 3 comunas marcadas `activa:true` en `comunas.json` y seleccionables en la UI, pero solo Providencia está indexada en Supabase; `santiago/metadata.json` ni siquiera tiene el campo `activa` | `normativa/comunas.json`, `normativa/santiago/metadata.json` |
| ACH-INFRA-003 | `anon`/`authenticated` tienen grant `TRUNCATE` (y también DELETE/INSERT/UPDATE, mitigados por RLS en la práctica pero no `TRUNCATE`, que Postgres no cubre con RLS) sobre `normativa_chunks` — no explotable hoy porque el frontend nunca usa una key de Supabase directamente, pero mal higienizado | Introspección Postgres en vivo (`pg_policies`, `information_schema.role_table_grants`) |

### P2 — deuda técnica real, sin síntoma confirmado hoy

| ID | Resumen | Archivo:línea |
|---|---|---|
| ACH-CAD-001 | Tolerancia ventana/muro hardcodeada en píxeles fijos (no metros), contradice el principio de "un solo lugar rastreable" que el propio módulo enuncia; no escala con DPI/escala del plano | `cuerpo_cerrado.py:205, 236` |
| ACH-CAD-005 | Excepciones silenciosas (`except: pass` / `except Exception: pass`) en parseo de SSE de Claude Vision | `_celda4_actual.py:853-854, 683-684` |
| ACH-BIM-003 | `piloto_ids_oguc.py` no aplica escala de unidades a `OverallWidth` — misma familia del bug histórico de unidades ya conocido en el proyecto, no confirmado disparado en su único IFC de prueba | `Fase 2/BIM/piloto_ids_oguc.py` (sin coincidencias de escala) |
| ACH-BIM-004 | Deduplicación escalera/rampa triplicada (3 implementaciones independientes), listas `ARCHIVOS` desincronizadas entre scripts, manejo de errores de batch inconsistente (continue-on-error / solo PermissionError / sin try-except) | `analizar_todos.py`, `generar_plano_pdf.py`, `generar_json_colab.py` |
| ACH-DATA-002 | Bloque PRC de `indexar_normativa.mjs` nunca ejecuta (ruta `normativa/comunas/` no existe) sin ningún `console.warn`, a diferencia de los otros 5 bloques que sí avisan | `normativa/indexar_normativa.mjs:304-316` |
| ACH-DATA-003 | `clasificar_normativa.mjs` se declara "fuente única" de taxonomía pero ningún script de carga real (`_idx_*.mjs`) la invoca; la taxonomía se aplicó después, vía `backfill_metadata.mjs` | `normativa/clasificar_normativa.mjs:4-9` |
| ACH-DATA-004 | URL de Supabase de producción hardcodeada como fallback si falta `SUPABASE_URL` — asimétrico con `SUPABASE_SECRET`, que sí aborta si falta | `normativa/backfill_metadata.mjs:21-23` |
| ACH-DATA-005 | `extraer_ddu.mjs` trunca texto a 60.000 caracteres antes de enviarlo a Claude sin loguearlo; placeholder de API key hardcodeado como fallback; el JSON de salida no registra si una sección vino de estructuración por Claude o de chunking crudo de fallback | `normativa/extraer_ddu.mjs:19, 105, 229-233` |
| ACH-INFRA-004 | Sin índice vectorial (ivfflat/hnsw) sobre `normativa_chunks.embedding` — contradice la documentación/scripts existentes que asumen que existe; hoy hace escaneo secuencial completo (correcto, no escalable) | Introspección Postgres en vivo (`pg_indexes`) |
| ACH-INFRA-005 | `wrangler deploy` del Worker fallaba por falta de la carpeta `public/` (referenciada en `wrangler.toml`, no versionable vacía en git) | `archicheck-worker/wrangler.toml` | **FIJO 2026-09-21** — carpeta recreada localmente antes de desplegar; sigue **PENDIENTE** un fix permanente para que un checkout limpio futuro no vuelva a tropezar con esto (ej. un `.gitkeep` filtrado del asset upload, o un paso de setup documentado) |

### P3 — higiene / menor (detalle completo en los anexos, no repetido aquí)

Imports sin usar (`datetime` en `_celda4_actual.py`), funciones nunca invocadas (`resumen_estado()` en `catalogo_tipologias.py`), docstrings desactualizados (conteo de casos de test), archivos JSON huérfanos (`normativa/ddu/circ*.json`, `normativa/nacional/metadata.json` con cifras de una prueba piloto temprana), ~118MB de PDFs de trabajo versionados en git bajo `normativa/providencia/`, citas de artículo hardcodeadas como texto plano en paralelo a la versión importada correctamente (`analizar_todos.py:674,884`, `piloto_ids_oguc.py:65,142-143`).

---

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

Antes de avanzar a Fase 2 (auditoría de código transversal: hardcodeos fuera de las áreas ya cubiertas, cruce CAD-vs-BIM, correr la suite de tests existente) o saltar directo a remediación de los P0 más urgentes, quedan 3 decisiones reales del usuario:
1. **¿Remediar primero, o seguir inventariando?** Dos de los P0 (RAG inerte, Worker sin desplegar) tienen fixes de bajo esfuerzo relativo (agregar 2 secrets + 1 deploy; investigar y desplegar la Celda 4 real) pero alto impacto — podría valer la pena resolverlos antes de seguir con Fase 2, en vez de acumular más hallazgos sobre un sistema que ya se sabe que no está corriendo como se pensaba.
2. **Celda 4**: ¿se corrige agregando las 4 reglas faltantes directo en el notebook de Colab (rápido, pero vuelve a quedar como copia manual sin mecanismo de sync), o se aprovecha para finalmente resolver el problema estructural (una sola fuente real que el notebook importe, no copie)?
3. Si se quiere cerrar el resto de Vercel (dominios, protección de deployment) y las routes del Worker — bajo impacto, puede quedar para cuando se llegue naturalmente a la Fase de infraestructura/operación.
