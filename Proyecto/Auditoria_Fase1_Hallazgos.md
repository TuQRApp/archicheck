# Auditoría Integral ArchiCheck — Fase 1: Inventario Técnico y Hallazgos

**Fecha de ejecución**: 2026-09-21 (sesión iniciada 2026-09-20).
**Alcance de esta corrida**: completo, primera ejecución de la auditoría acordada en [Auditoria_Integral_ArchiCheck_Consolidado.md](Auditoria_Integral_ArchiCheck_Consolidado.md) (§4 confirma que esta auditoría reemplaza a "Revisión Ing SW").
**Método**: lectura directa completa (no muestreo) de los archivos listados abajo, por mí y por 3 agentes Explore dedicados corriendo en paralelo, cada uno con instrucción explícita de leer archivo completo + grep de confirmación antes de afirmar cualquier hallazgo, y de marcar SIN VERIFICAR todo lo que no pudiera confirmarse por lectura directa.

> Esta es la Fase 1 (Inventario técnico exhaustivo) de la auditoría de punta a cabo. Cubre 4 de las áreas identificadas como puntos ciegos: `src/App.jsx` (parcial), motor CAD (`Herramientas_CubiCasa5k/`), pipeline BIM (4 scripts sin leer), y scripts de indexación/clasificación de `normativa/`. El Worker (`worker.js`, `reglas_aprendidas.js`) ya se había leído completo en una pasada anterior de esta misma sesión (ver [Prompt_Auditoria_Completa_ArchiCheck.md](Prompt_Auditoria_Completa_ArchiCheck.md), Anexo A) y no se re-verificó en esta pasada — su hallazgo P0 se referencia aquí para que la priorización quede completa.
>
> Detalle exhaustivo (línea por línea, con cita de código) en los 3 anexos:
> - [Auditoria_Fase1_Detalle_Normativa.md](Auditoria_Fase1_Detalle_Normativa.md) — `normativa/*.mjs`, ~26 scripts `_*.mjs`, inventario de datos por comuna
> - [Auditoria_Fase1_Detalle_MotorCAD.md](Auditoria_Fase1_Detalle_MotorCAD.md) — `Herramientas_CubiCasa5k/` (motor `cuerpo_cerrado.py`, `_celda4_actual.py`, tests, 169 archivos)
> - [Auditoria_Fase1_Detalle_BIM.md](Auditoria_Fase1_Detalle_BIM.md) — `analizar_todos.py`, `generar_plano_pdf.py`, `piloto_ids_oguc.py`, `generar_json_colab.py`

---

## Resumen ejecutivo

**19 hallazgos** con evidencia directa (archivo:línea), más ~15 de higiene/menores documentados en los anexos. Ningún hallazgo de esta pasada se basó en inferencia sin lectura del código real.

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

| ID | Resumen | Archivo:línea |
|---|---|---|
| ACH-BIM-001 | Ancho de puerta comparado en `generar_json_colab.py` es el de una ventana residual, no el de la puerta evaluada (bug de scope de variable) | `Fase 2/BIM/generar_json_colab.py:551-568` |
| ACH-FRONT-001 | Contradicción interna en el prompt de producción sobre citar artículos de DS 50/2015 — con síntoma ya confirmado en producción (`sanitizeDS50`) | `src/App.jsx:1014` vs. `:1054`; síntoma en `:443-455` |
| ACH-CAD-002 | Dos líneas paralelas de "Celda 4" (motor de fusión vs. reglas sincronizadas) no unificadas; no se puede confirmar cuál corre hoy en Colab | `_celda4_actual.py` vs. `Fase 2/Desarrollos/Test/Celda 4 - copiar en Colab.py` |
| ACH-DATA-001 | Re-ejecutar `indexar_normativa.mjs` regresiona OGUC/LGUC a versiones de menor cobertura y reinserta 1144 secciones DDU sin curar, sin ningún guard | `normativa/indexar_normativa.mjs:253-301` |
| ACH-WORKER-001 *(referenciado, no re-verificado esta pasada)* | CORS `Access-Control-Allow-Origin: "*"` + sin autenticación + sin rate limit + sin validación de payload en el Worker | `archicheck-worker/worker.js` (leído completo en pasada anterior de esta sesión) |

### P1 — impacto real, acotado o parcialmente mitigado

| ID | Resumen | Archivo:línea |
|---|---|---|
| ACH-FRONT-002 | Cita OGUC Art. 4.2.5 para ancho de pasillo/salidas de emergencia en el prompt de producción, no actualizada al Art. 4.2.18 ya corregido en `reglas_normativas.py` | `src/App.jsx:1034, 1036` |
| ACH-FRONT-003 | `mergeSection(..., tableKey=null)` para la sección "modelo" (accesos/evacuación) siempre favorece la respuesta de Claude; el aporte de GPT-4o a `organizacion_funcional`/`accesos_evacuacion` se descarta en silencio — el cruce entre 2 modelos no ocurre ahí | `src/App.jsx:381-388` (función), `:420` (call site) |
| ACH-XCUT-001 | Fórmula de pendiente de rampa con constante truncada no propagada — ver [hallazgo transversal](#hallazgo-transversal-fórmula-de-pendiente-de-rampa-no-propagada-3-ubicaciones) | 3 ubicaciones, ver tabla arriba |
| ACH-CAD-003 | `_celda4_actual.py` mantiene `puerta_ancho_libre` en 0.80m/N°6 (valor viejo); `reglas_normativas.py` ya lo corrigió a 0.90m/N°4 el 21-sep | `_celda4_actual.py:138` vs. `reglas_normativas.py:191` |
| ACH-CAD-004 | `aplicar_fix_celda4.mjs` usa por defecto `_celda4_nueva.py` (snapshot de 23-jul, reglas OGUC ya identificadas como incorrectas) para pegar sobre el notebook vivo de Colab si se corre sin argumento explícito | `aplicar_fix_celda4.mjs:26` |
| ACH-BIM-002 | `generar_json_colab.py` no evalúa tipo/área/ancho de recinto, círculo de giro, rampa ni escalera — el campo `cumple_oguc` que llega al portal solo refleja ventilación, sin documentarlo | `Fase 2/BIM/generar_json_colab.py:523-547` |
| ACH-DATA-006 | 3 comunas marcadas `activa:true` en `comunas.json` y seleccionables en la UI, pero solo Providencia está indexada en Supabase; `santiago/metadata.json` ni siquiera tiene el campo `activa` | `normativa/comunas.json`, `normativa/santiago/metadata.json` |

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

### P3 — higiene / menor (detalle completo en los anexos, no repetido aquí)

Imports sin usar (`datetime` en `_celda4_actual.py`), funciones nunca invocadas (`resumen_estado()` en `catalogo_tipologias.py`), docstrings desactualizados (conteo de casos de test), archivos JSON huérfanos (`normativa/ddu/circ*.json`, `normativa/nacional/metadata.json` con cifras de una prueba piloto temprana), ~118MB de PDFs de trabajo versionados en git bajo `normativa/providencia/`, citas de artículo hardcodeadas como texto plano en paralelo a la versión importada correctamente (`analizar_todos.py:674,884`, `piloto_ids_oguc.py:65,142-143`).

---

## Cobertura de esta pasada — qué quedó cubierto al 100% y qué no

| Área | Cobertura | Estado |
|---|---|---|
| `normativa/*.mjs` (scripts de indexación/clasificación, ~26 scripts `_*`) | Completa — 4 archivos principales leídos línea por línea + los 26 secundarios por encabezado/propósito + inventario de las 5 carpetas de datos | Cerrado para esta pasada |
| `Fase 2/Herramientas_CubiCasa5k/` (motor CAD) | Completa para los archivos núcleo (`cuerpo_cerrado.py`, `catalogo_tipologias.py`, `_celda4_actual.py`, 4 archivos de test, 6 `.py` adicionales) + categorización de los 169 archivos totales | Cerrado para esta pasada; **pendiente** leer `Fase 2/Desarrollos/Test/Celda 4 - copiar en Colab.py` y variantes (fuera de alcance asignado, necesario para resolver ACH-CAD-002) |
| `Fase 2/BIM/` (pipeline BIM) | Completa — los 4 scripts que faltaban (`analizar_todos.py`, `generar_plano_pdf.py`, `piloto_ids_oguc.py`, `generar_json_colab.py`) leídos línea por línea | Cerrado para esta pasada |
| `src/App.jsx` (4.636 líneas) | **Parcial** — leídas en profundidad: líneas 1-460 (helpers de merge, `sanitizeDS50`, `buildColabTexto`), 896-1130 (`buildPromptCapa1`/`buildPromptCapa2` completos), más greps dirigidos (`catch`, citas `Art\.`, `TODO/FIXME`) sobre el archivo completo que no arrojaron hallazgos adicionales fuera de lo ya reportado | **PENDIENTE** — quedan sin revisión línea-por-línea profunda las líneas ~1130-4636 (renderizado de UI, exportación, resto de handlers) — los greps dirigidos cubrieron patrones de riesgo conocidos (errores tragados, citas normativas, TODOs) en el archivo completo, pero no reemplazan una lectura estructural completa |
| Worker (`worker.js`, `reglas_aprendidas.js`) | Completa, pero de una **pasada anterior** de esta misma sesión (no re-verificada hoy) | Ya cerrado antes de esta Fase 1; hallazgo referenciado como ACH-WORKER-001 |
| Supabase (esquema, RLS, grants, funciones RPC más allá de lo que tocan los scripts) | No cubierto en esta pasada | **PENDIENTE** — Fase 2/3 |
| Vercel / Cloudflare (configuración real de deploy, no solo código) | No cubierto en esta pasada | **PENDIENTE** — Fase 0/2 (requiere acceso a dashboards) |
| GitHub (branch protection, CI, colaboradores) | Ya verificado en pasada anterior vía `gh api` (ver memoria de proyecto) | Ya cerrado antes de esta Fase 1 |
| Colab (notebook vivo) | No accesible desde filesystem local — confirmado que `Docs archicheck/Doc prueba/` no tiene ningún `.ipynb` actualmente | **PENDIENTE**, bloqueado sin acceso directo a Colab |

---

## Qué sigue

Esta consolidación es el entregable de Fase 1. Antes de avanzar a Fase 2 (auditoría de código transversal: hardcodeos fuera de las áreas ya cubiertas, cruce CAD-vs-BIM, correr la suite de tests existente) conviene que el usuario revise esta lista y decida:
1. Si los 5 P0 se abordan ahora (aunque sea investigación adicional, no remediación) antes de seguir inventariando, dado que 3 de ellos son de "no sabemos qué corre en producción" más que "sabemos que está mal".
2. Si completar la lectura de `src/App.jsx` (líneas 1130-4636) es parte de esta Fase 1 o se difiere a Fase 2.
3. Si Supabase (RLS/grants) y Vercel/Cloudflare (config real) se investigan ahora con las credenciales ya guardadas ([reference_archicheck_supabase_credenciales]) o quedan para una Fase 0 formal de accesos.
