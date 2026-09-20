# Backlog de temas macro

Lista de temas grandes que el usuario quiere ejecutar con calma, anotados el 2026-09-20 para no perderlos. No son tareas en curso — cada uno se activa cuando el usuario decida partir con él.

---

## 1. Revisión Ing SW al proyecto completo

**Estado**: ya hay un brief completo listo para consultar IAs externas → [Brief_Robustecer_Revision_Ing_SW.md](Brief_Robustecer_Revision_Ing_SW.md) (2026-09-20). Documenta las 4 capas actuales (hardcodeo, regresión rápida, golden-file, LLM Paso 3), los incidentes reales que las motivaron, y 7 preguntas concretas para robustecerlas (falsos positivos/negativos, extender golden-file a BIM, ampliar el checklist de 10 puntos, CI real, calibración N=1, property-based testing más allá de geometría).

**Siguiente paso**: pasar ese brief a las IAs externas (ChatGPT, Gemini, Copilot, Perplexity) y consolidar las respuestas.

## 2. Revisar pendientes acumulados en todo el proyecto

Barrido general de lo que ha ido quedando abierto en distintos documentos, para decidir qué corresponde retomar ahora dado el nivel de avance actual. Puntos ya conocidos que este barrido debería considerar (no exhaustivo — hay que recorrer el repo completo):

- [Plan_Pendiente_Linea_Rectangulo.md](Plan_Pendiente_Linea_Rectangulo.md)
- Gaps explícitos del §6 de [Brief_Robustecer_Revision_Ing_SW.md](Brief_Robustecer_Revision_Ing_SW.md) (sin métricas de falsos +/-, golden-file solo cubre CAD, sin CI real, heurísticas calibradas con N=1, etc.)
- Auditoría de integridad normativa (memoria `project_archicheck_normativa_auditoria_integridad`): 3 JSON de DDU fabricados/sin fuente (279, 320, 390), Providencia 86% sin procesar, Ñuñoa/Santiago sin PDF fuente
- Cobertura BIM vs CAD (memoria `project_archicheck_bim_pdf_paralelo_y_cobertura_oguc`): puntos 3-4 de la tabla de divergencia (§3 del brief) — confirmar qué quedó cerrado tras el commit de rampas/salidas de emergencia y qué sigue abierto
- Pendientes sueltos dentro de [Roadmap_Revision_Dossier_ArchiCheck.md](Roadmap_Revision_Dossier_ArchiCheck.md) y [Diseno_Funcional_ArchiCheck.md](Diseno_Funcional_ArchiCheck.md)

## 3. Entornos dev/test/producción + trabajo con branches

Hoy no hay separación formal de entornos: Vercel hace auto-deploy de `main` a producción (`archicheck-xi.vercel.app`), y no hay CI en GitHub Actions (confirmado en el gap #5 del brief de Ing SW). Definir: estrategia de branches (feature branches, `develop` vs `main`, o trunk-based con feature flags), cómo se prueba antes de que algo llegue a producción, y si el Worker (`archicheck-worker`, repo privado) necesita su propio esquema de entornos (staging de Supabase, keys separadas).

## 4. Completar normativa: LGUC, OGUC, DDU, PRC

Estado actual (RAG en Supabase, tabla `normativa_chunks`): OGUC 770 chunks, LGUC 244, Ley 19.300 128, DDU ~185, PRC solo Providencia (281, con 86% del documento sin procesar según la auditoría de integridad). Ñuñoa y Santiago tienen JSON estático embebido pero sin PDF fuente verificado. Objetivo: completar cobertura real (no fabricada) de las 4 fuentes normativas, cerrando los gaps que la auditoría de integridad ya dejó documentados.

## 5. Validar bugs históricos que hayan quedado corregidos

Revisión de que las correcciones ya aplicadas siguen siendo correctas y tienen cobertura de regresión real, no solo el fix puntual. Casos conocidos a revisar primero:
- Bug AREAUNIT ≠ LENGTHUNIT (ancho de puerta) — memoria `feedback_archicheck_bim_unidades_area_vs_longitud`: ¿tiene test de regresión específico? (el brief de Ing SW, tabla §5, marca que no)
- Inferencia de puertas sin dato por footprint — memoria `project_archicheck_bim_puertas_sin_dato_geometria`: calibrada con N=1, pendiente de revalidar por archivo
- Heurística `bisagra_por_geometria` (`UMBRAL_ASIMETRIA_BISAGRA_M = 0.02 m`) — también N=1, mencionada como pregunta abierta en el brief de Ing SW (§7.5)

## 6. Revisión profunda de marco normativo con cofounders

Sesión de revisión del marco normativo (OGUC/LGUC/DDU/PRC y cómo se traduce a reglas del producto) junto con los cofounders — no un ejercicio solo técnico/de auditoría de datos como el punto 4, sino una revisión conjunta de criterio normativo. Relacionar con item 4 (completar normativa) y con la auditoría de integridad ya hecha (memoria `project_archicheck_normativa_auditoria_integridad`) como insumo de partida para esa sesión.

## 7. Interfaz de carga BIM — contexto de edificación, mapeo de niveles, cuadro de superficies

Cuando se sube un PDF/JSON/PNG generado desde el canal BIM, hoy entra directo al análisis sin ningún contexto declarado por el usuario. Agregar un paso de preguntas:

**a) Tipo de construcción (obligatorio)** — determina qué normativa aplica: casa/vivienda unifamiliar, edificio habitacional (vivienda colectiva), colegio/establecimiento educacional, oficinas, comercio, industria, salud, otro. Conecta directo con OGUC Art. 4.5.1 (establecimientos) y con los destinos que ya aparecen en los dos demos (educativo en el demo 1, comercio+oficinas en Beauchef).

Otras preguntas propuestas para el mismo paso (a validar con el usuario):
- Comuna/ubicación → determina qué PRC aplica (hoy solo Ñuñoa/Santiago/Providencia tienen algo cargado — ver auditoría de integridad normativa)
- Obra nueva vs. ampliación/regularización de obra existente → LGCU Art. 116 vs. 116 bis tienen requisitos distintos
- Uso mixto: si el edificio tiene más de un destino (como Beauchef: comercio + oficinas), declarar qué niveles/recintos corresponden a cada uso
- N° de subterráneos / evacuación diferenciada por subterráneo (afecta OGUC 4.2.4/4.2.5)

**b) Mapeo de niveles (reemplaza la pregunta de escala del canal CAD)**: en BIM no corresponde preguntar escala — el modelo trae geometría real, no una imagen rasterizada a una escala declarada. En su lugar, mostrar un desplegable por cada `IfcBuildingStorey` detectado para que el usuario declare a qué corresponde cada nivel (ej. "Subterráneo 1", "Planta baja", "Piso 2", "Cubierta"). Los nombres de nivel en el IFC son arbitrarios (N000/N100 en un proyecto, S1/P1-P5 en otro) y el sistema no puede asumir la convención.

**c) Cuadro de superficies — opinión (respondiendo lo que se preguntó)**: no pedirlo como input manual nuevo. El gap real (tabla de divergencia BIM vs. CAD del brief de Ing SW, §3) es que el canal BIM hoy NO cruza contra un cuadro de superficies declarado (❌), mientras que el canal CAD sí lo hace — y ese cruce ya encontró un incumplimiento real (OBS-E01 del demo Beauchef: "Local Tipo C" en planta vs. "Bodega Comercial" en cuadro). Para BIM la fuente correcta no es pedirle al usuario que tipee un cuadro aparte, sino **extraer las áreas directamente de las Quantities del IFC** (`Qto_SpaceBaseQuantities`/Pset de área por `IfcSpace`) — el mismo dato estructurado donde ya se corrigió el bug AREAUNIT≠LENGTHUNIT. Eso cumple la función del "cuadro de superficies" sin agregar un paso manual, y es justamente la ventaja de tener BIM en vez de un PDF. Sí valdría la pena ofrecer, **opcional**, subir un cuadro de superficies oficial (PDF/Excel) del proyecto para cruzarlo contra lo que dice el IFC — mismo patrón que OBS-E01 pero en dirección IFC↔documento oficial en vez de planta↔cuadro. Eso sería trabajo nuevo real (parser de un documento externo), a diferencia de leer Quantities que ya están en el archivo.

Relacionado con: item 4 (normativa por tipo de destino), tabla de divergencia BIM/CAD del brief de Ing SW (§3, fila "Cruce con cuadro de superficies declarado").

## 8. Indexación de artículos normativos para mejorar la búsqueda — ✅ IMPLEMENTADO 2026-09-21

**Estado**: ejecutado en vivo contra la base Supabase real (a pedido explícito del usuario, "prefiero dejarlo ejecutado ya" en vez de dejarlo en el backlog). Las 7 dimensiones propuestas están implementadas sobre la columna `metadata jsonb` que ya existía (sin columnas nuevas), y las 1.608 filas ya cargadas fueron actualizadas con la taxonomía real.

**Archivos nuevos** (`normativa/`):
- `taxonomia_articulos.json` — tabla de clasificación: `articulos` (precisa, por número exacto, para los ~46 artículos OGUC ya leídos a fondo el 2026-09-21 — capítulos 4.1.x y 4.2.x completos, más 2.1.43/2.6.4/5.1.4 de patrimonio) marcada `clasificacion_metodo: "verificado"`; `capitulos_fallback` (heurística por prefijo de capítulo para el resto) marcada `"heuristica_no_verificada"` — nunca mezcladas sin distinguir.
- `clasificar_normativa.mjs` — función `clasificar()` única, importada tanto por `indexar_normativa.mjs` (cargas futuras) como por `backfill_metadata.mjs` (actualiza filas ya cargadas sin regenerar embeddings) — evita la duplicación que causó el problema real de `reglas_verificacion.json` vs. `nacional/schema.sql` encontrado en el camino (ver abajo).
- `migracion_taxonomia_metadata.sql` — índice GIN sobre `metadata`, `match_normativa()` extendida con 6 filtros nuevos opcionales (retrocompatible: la firma de 3 argumentos original sigue existiendo, el Worker actual no necesita cambios), y `articulos_por_etapa()` nueva (recupera por código OBS-N sin pasar por similaridad semántica). **Ejecutado y verificado en vivo** vía conexión directa a Postgres (Session Pooler, la conexión "Direct" falló por ser IPv6-only y este entorno no tiene ruta IPv6).
- `backfill_metadata.mjs` — corrida real: 1.608/1.608 filas actualizadas, 0 errores (2 corridas: la primera con un bug real -- la fuente de Providencia en la tabla es `PRC-PRV`, no `PRC`, corregido y verificado en la segunda).

**Las 7 dimensiones implementadas**: tipo_edificacion, tipo_norma (vocabulario controlado), ámbito+comuna+zona, etapa_pipeline (códigos OBS-N reales del producto), vigencia+fecha, canal (CAD/BIM/ambos), jerarquía (`piso_nacional_no_derogable` / `marco_nacional_ajustable_por_prc` / `exclusivo_comunal` — los 3 valores reales para resolver PRC vs. OGUC). Verificado en vivo: `articulos_por_etapa('OBS-N05')` devuelve exactamente los 3 artículos reales de ventilación (4.1.2/4.1.3/4.1.4); filtro por `tipo_norma=accesibilidad` devuelve resultados reales coherentes.

**Hallazgos reales encontrados en el camino** (no buscados, aparecieron haciendo el trabajo):
1. `normativa/nacional/schema.sql` tenía una copia duplicada y desactualizada de las 12 reglas de `reglas_verificacion.json` (con las citas viejas ya corregidas hoy mismo en la auditoría de integridad) — corregida en el archivo. Verificado que esa tabla (`reglas_verificacion_nacional`) **nunca se creó en la base real** — el archivo nunca se había ejecutado, cero drift en producción, solo el archivo local estaba obsoleto.
2. **CORREGIDO 2026-09-21 (este punto estaba mal, verificado directo contra la base real)**: se creía que la base viva estaba indexada desde `Fuentes/oguc.json` (644)/`lguc.json` (234) en vez de `oguc_pdf.json` (770)/`lguc_pdf.json` (245). Verificado con `select fuente, count(*) from normativa_chunks group by fuente` + comparación de `codigo` exactos: **la base real tiene 770 filas OGUC y 244 LGUC** — ya está indexada desde las fuentes completas (confirmado por los `codigo` con sufijo de letra, ej. `OGUC-1.1.2-b`, que solo existen en `oguc_pdf.json`). Item 4 en este aspecto **ya está resuelto**, no pendiente. El riesgo real es al revés: `normativa/indexar_normativa.mjs` (el script) sigue apuntando a `Fuentes/oguc.json`/`lguc.json` (644/234, esquema distinto) — si alguien lo vuelve a correr sin corregir esa ruta primero, **regresionaría** la base viva de 770/244 a 644/234. Pendiente real: corregir las rutas/esquema de `indexar_normativa.mjs` antes de la próxima vez que alguien lo use para recargar OGUC/LGUC.
3. **CORREGIDO 2026-09-21**: curando manualmente el capítulo 4.2 (vías de evacuación) se encontró que el **ancho mínimo real de pasillo es 1,10 m** (Art. 4.2.18, piso de tabla por carga de ocupación, mismo patrón que escaleras) — distinto del 1,20 m que vivía marcado `SIN VERIFICAR` en `OGUC_REGLAS['pasillo']`. Corregido con el mismo rigor que `puerta_ancho_libre` (verbatim de Art. 4.2.18 verificado antes de aplicar), en `Fase 2/reglas_normativas.py` **y** en su espejo manual `Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py` (que tenía su propio desync adicional: su comentario ya había descartado la cita vieja, pero el valor no se había actualizado). El 1,20 m anterior era más estricto que el mínimo real — el fix reduce falsos positivos, no introduce falsos negativos.

**Cobertura OGUC en curso** (regla de 100% de `Diseno_Funcional_ArchiCheck.md` §3.17): ver `Fase 2/cobertura_oguc.csv` — capítulos 4.1 (17 artículos) y 4.2 (29 artículos) completos hoy, con varios candidatos nuevos identificados sin conectar todavía (ascensor cabina 4.1.11, ducto ventilación 4.1.3, puerta de escape 0,85m fija de 4.2.24, distanciamiento entre fachadas 4.1.13-15). Quedan ~724 artículos OGUC + 245 LGUC + resto de DDU/PRC por revisar.

**Revisión Ing SW Paso 2 corrida sobre todo esto (2026-09-21, DeepSeek+Codex, 9 hallazgos reales, todos verificados contra el código antes de aceptar)**:
- **Crítico (Codex)**: `Fase 2/BIM/generar_json_colab.py` seguía con la puerta hardcodeada en 0.80m/N°6 — el fix a 0.90m/N°4 de esa misma sesión nunca se había propagado a este 3er consumidor. Corregido.
- `reglas_verificacion.json`/`schema.sql`: "pasillos mínimos 1.5m" sin base real — corregido.
- **`vigencia` hardcodeada a `'vigente'` para las 1.608 filas, sin ninguna rama que la sobreescribiera** — `p_solo_vigentes` no filtraba nada real. Corregido en el archivo (`clasificar_normativa.mjs` → `'sin_verificar'` en DDU/PRC; DDL sin `coalesce`) y **re-ejecutado en vivo el mismo día** (DDL + backfill, 1608/1608 filas, 0 errores) — verificado con query real: 185 DDU + 281 PRC-PRV en `sin_verificar`, resto en `vigente`; `articulos_por_etapa(..., true)` ya filtra de verdad. Credenciales guardadas en `.env.supabase.local` (gitignored, mismo patrón que las de OpenAI/DeepSeek).
- `backfill_metadata.mjs`: `clasificar()` fuera del `try/catch` (hallazgo coincidente de DeepSeek y Codex) — corregido.
- PRC con comuna no mapeada caía en silencio — corregido con warning + `clasificacion_metodo` explícito. Cache de taxonomía ignoraba `ruta` — corregido. Comentario de `schema.sql` describía un mecanismo inexistente — corregido. Docstring de `verificar_hardcodeo_normativo.py` sobre-prometía su alcance — corregido.
- Sin forzar fix (documentado como riesgo, no bug hoy): escalado de `match_normativa()` a mayor escala; posible divergencia silenciosa `etapa_pipeline` vs. motor BIM real.

Detalle completo en memoria (`project_archicheck_taxonomia_normativa_supabase`) y `Proyecto/Roadmap_Revision_Dossier_ArchiCheck.md`.

---

**Nota de proceso**: según las instrucciones del proyecto, esta documentación vive en el repo local (`Proyecto/`), no en el Proyecto de Claude en la nube.
