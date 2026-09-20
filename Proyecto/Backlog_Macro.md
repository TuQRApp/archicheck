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

## 8. Indexación de artículos normativos para mejorar la búsqueda

Hoy `normativa_chunks` (Supabase pgvector, ver [supabase_schema.sql](../normativa/supabase_schema.sql)) solo filtra por `fuente` (OGUC/LGUC/LEY19300/DDU) antes de la búsqueda semántica — `match_normativa()` no acepta ningún otro filtro, y la columna `metadata jsonb` existe pero no se usa para filtrar. Objetivo: indexar cada chunk por múltiples dimensiones para que el RAG recupere el artículo correcto sin depender solo de similaridad semántica. Dimensiones propuestas (a validar, agregar las que falten):

- **Tipo de edificación/destino** (escolar, residencial, salud, comercio, oficinas, industrial, deportivo, etc.) — la más pedida explícitamente. Se conecta directo con la pregunta de "tipo de construcción" que se agregará en la interfaz de carga BIM (item 7) y con OGUC Art. 4.5.1 (reglas específicas por tipo de establecimiento).
- **Tipo de norma/materia** (ventilación, iluminación, accesibilidad, evacuación/circulación, estructural, superficies mínimas, urbanística — constructibilidad/COS/altura/rasante —, estacionamientos, resistencia al fuego).
- **Fuente normativa** (ya existe como columna `fuente`).
- **Ámbito territorial**: nacional vs. comunal/PRC, más comuna específica y zona dentro del PRC (ej. ZC3, ZE) para los chunks de PRC.
- **Etapa del pipeline / tipo de observación**: mapear cada chunk a las categorías que el producto ya usa (OBS-G/E/V/M de Capa 1, OBS-N/INC de Capa 2) — permitiría recuperar exactamente el artículo relevante para cada chequeo que el motor ya corre, en vez de depender solo de similaridad semántica del texto de la observación.
- **Vigencia**: vigente/derogada/modificada + fecha — crítico porque las circulares DDU se actualizan y hoy no hay forma de filtrar por vigencia (riesgo real de citar norma derogada).
- **Canal aplicable**: CAD, BIM o ambos — porque algunas reglas se verifican de forma distinta según el canal de extracción (ver tabla de divergencia del brief de Ing SW, §3).
- **Jerarquía normativa**: para resolver conflictos cuando un PRC es más restrictivo o más permisivo que la OGUC en el mismo punto.

Implementación probable: usar la columna `metadata jsonb` ya existente para estos campos (en vez de agregar columnas nuevas por cada dimensión) y extender `match_normativa()` para aceptar filtros adicionales sobre `metadata`, no solo sobre `fuente`. Relacionado con item 4 (completar cobertura normativa) — conviene definir la taxonomía de indexación antes o junto con cargar lo que falta, para no tener que re-indexar todo dos veces.

---

**Nota de proceso**: según las instrucciones del proyecto, esta documentación vive en el repo local (`Proyecto/`), no en el Proyecto de Claude en la nube.
