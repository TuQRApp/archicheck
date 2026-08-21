# Instrucción para la ventana paralela: crear el documento de diseño funcional

Pegá este archivo completo como primer mensaje en la ventana nueva (o decile "ejecuta lo que dice este archivo": `archicheck/Proyecto/INSTRUCCION_documento_diseno_funcional.md`).

---

## Tarea

Crear `archicheck/Proyecto/Diseno_Funcional_ArchiCheck.md` — un documento de **estado actual y arquitectura**, no una bitácora de proceso. A diferencia del roadmap (`archicheck/Proyecto/Roadmap_Revision_Dossier_ArchiCheck.md`, que documenta cada iteración/bug/hallazgo cronológicamente y ya tiene miles de líneas), este documento debe explicar **cómo está construido el sistema HOY y por qué**, sin el historial de cómo se llegó ahí. Alguien que lo lea debe poder entender la arquitectura vigente sin tener que leer el roadmap completo.

**No ejecutes ningún otro cambio** (no toques el notebook, no corras Colab, no edites el roadmap ni la memoria de Claude) — el usuario está trabajando eso en paralelo en otra ventana sobre los mismos archivos, y editarlos desde acá generaría conflictos. Tu único entregable es el archivo nuevo `Diseno_Funcional_ArchiCheck.md`.

## Fuentes que tenés que leer antes de escribir

1. `C:\Users\nicolas.estragues\Documents\Claude\CLAUDE.md` — contexto general del proyecto.
2. `archicheck/Proyecto/Roadmap_Revision_Dossier_ArchiCheck.md` — el roadmap completo. Es largo (>1500 líneas); leelo entero si podés, o al menos desde donde empieza la sección de Fase 2 (extracción geométrica) en adelante, prestando especial atención a las secciones fechadas 2026-08-18 a 2026-08-21 (son las más recientes y las que más cambiaron el diseño).
3. `archicheck/Fase 2/Roadmap_ArchiCheck.html` — versión HTML del mismo roadmap, por si el .md es difícil de navegar.
4. El notebook vigente en `archicheck/Fase 2/Desarrollos/Test/` — buscá el archivo `ArchiCheck_Base *.ipynb` con el timestamp más reciente en el nombre (NO uses `NotebookEdit` para leerlo, es demasiado grande — parseá el JSON con Node si necesitás ver el código real de una celda específica, extrayendo `cells[4].source` a un `.py` aparte).
5. Los archivos en `archicheck/Fase 2/Desarrollos/Test/pdv/` con nombre `test_linea_sola_v2_n1.png`, `marcas_feedback_global_cap*.png`, `ejemplo_cuerpo_cerrado_*.png` — son evidencia visual de la sesión de hoy (2026-08-21), útiles para entender los ejemplos concretos citados abajo.

## REGLA CRÍTICA — qué cuenta y qué no

Durante el desarrollo de ArchiCheck hubo **múltiples iteraciones donde un enfoque reemplazó a otro**. El roadmap documenta TODO el proceso, incluyendo enfoques que se probaron y se descartaron. **El documento de diseño funcional debe reflejar SOLO el estado vigente — el último enfoque que reemplazó a los anteriores —, nunca los intentos superseded.** Ejemplos concretos de esto que tenés que tener en cuenta (hay más, hay que rastrearlos leyendo el roadmap con cuidado):

- La fusión de muros por proximidad evaluando la **entrada completa** (`tiene_algun_paralelo` a nivel de todo el `muros_geo[i]`) quedó **superada** el 2026-08-21 por una evaluación **por segmento individual** dentro de la misma entrada — porque una sola entrada puede mezclar muro real + ventana fusionados. Y esa versión por segmento, a su vez, **también quedó incompleta** el mismo día (rompe segmentos "tapa"/esquina perpendicular que sí son parte real de un cuerpo cerrado) — el diseño vigente al cierre de la sesión es el de **cuerpo cerrado completo** (ver más abajo), todavía sin implementar en el notebook.
- El achurado (`_es_amarillo`, filtro hardcodeado rojo=mantener/amarillo=excluir, específico de PdV) queda **superado** por la instrucción del 2026-08-21: el achurado (relleno diagonal) siempre se ignora como geometría, solo la silueta del elemento cuenta como candidato a muro, y el color se usa ÚNICAMENTE para etiquetar `agregado`/`eliminado` buscando la leyenda SIMBOLOGIA real del PDF (nunca hardcodeado). Esto todavía no está implementado.
- Todas las tolerancias del pipeline (fusión, clustering, achurado, cotas, ejes) están **en metros reales**, convertidas a píxeles vía `mpx`/`mpp` por página — no en píxeles fijos. Esto se corrigió el 2026-08-20/21 (antes varias estaban hardcodeadas en px). Si ves código con constantes tipo `TOL_X_PX = 35` sin una `TOL_X_M` correspondiente, es código viejo/incorrecto.
- El `ACHURADO_DESPROTEGER_ACTIVO` está en `False` desde el 2026-07-27 (causó una regresión grave) — el achurado NO excluye geometría activamente hoy, solo cuenta en un diagnóstico. No documentes el mecanismo de "desproteger por achurado" como si estuviera activo.

Si en algún punto no estás seguro de si algo es el enfoque vigente o uno superado, **decilo explícitamente en el documento como pendiente de confirmar**, no asumas.

## Contenido mínimo que debe cubrir el documento

1. **Stack y arquitectura general**: React 19 + Vite (frontend, Vercel), Cloudflare Worker "laude" (proxy Claude API), Supabase (RAG normativo — OGUC/LGUC/Ley 19.300/DDU/PRC), notebook de Colab (extracción geométrica desde PDF vectorial con PyMuPDF). Ver `project_archicheck_webapp`/`project_archicheck_urls`/`project_archicheck_pipeline` en la memoria de Claude si tenés acceso, o derivalo del roadmap/CLAUDE.md.

2. **Pipeline geométrico (Colab), estado vigente**:
   - Extracción vectorial (`get_drawings()` de PyMuPDF) — capas OCG nativas (`MAPEO_CAPAS`, mapeo manual por proyecto, sin estándar entre arquitectos).
   - Filtrado de candidatos a muro: por capa (`ignorar`/`mobiliario` excluyen; `eje`/`cota` son señal aditiva sobre la heurística geométrica, y esa heurística geométrica SOLO corre si NO hay capa mapeada para esa categoría — si hay capa, la capa manda sola).
   - Clustering de topología (`_dividir_en_muros_por_union`) — corta en cruces reales (3+), no en esquinas de paso (grado 2).
   - Fusión de muros por proximidad (`_fusionar_muros_por_proximidad`) — regla del arquitecto: L/T/I/O sin separación explícita = un solo muro; puerta interrumpe (`_punto_cerca_de_puerta`, funciona con puertas de 1 o 2 `puntos_union`).
   - **Pendiente de implementar**: el test de "cuerpo cerrado" que reemplaza la evaluación por segmento aislado — documentalo como diseño acordado, no como código existente. Descripción del diseño (tal como se definió el 2026-08-21): rasterizar el contexto local completo cerca de un punto de contacto (no solo el par candidato), cerrar micro-gaps con tolerancia = `max(10% del ancho local, piso ~2px)`, verificar componente conectado + espesor real vía `distanceTransform` (para distinguir masa sólida real de 2 líneas tocándose sin nada detrás). Corre en línea, por par, antes de cada fusión — no como filtro posterior sobre grupos ya armados. Aplica igual a curvas (2 bordes enfrentados a separación consistente, sin necesidad de ingerir Bézier).
   - Clasificador **línea central = ventana** (regla permanente, confirmada 2026-08-21): un segmento largo sin otro segmento paralelo cercano (0.08-0.9m) en cualquier otra entrada — o dentro de la misma entrada fusionada — es una línea central de ventana, no muro. Validado en Node (0 falsos rechazos en muros reales de PdV N1/N2) pero **todavía no portado al notebook/Python**.
   - Definición de **pilar/parteluz** (permanente, dada por el arquitecto): todo cuerpo cerrado que sea un cuadrilátero que no sea hoja de puerta ni ventana.
   - Gap de extracción sin resolver: muros reales en zonas con achurado denso (ej. "Baño Universal" en PdV) nunca llegan a ser candidatos en absoluto — causa real todavía no identificada, hay un diagnóstico de 6 zonas agregado al notebook (`ZONAS_DIAGNOSTICO_MURO_PERDIDO`) pendiente de correr en Colab.
   - Puertas: detección geométrica de arcos (líneas + curvas Bézier reales), gozne = centro de la hoja (par de líneas más angosto dentro del espesor del muro, nunca la cara ni la línea central del muro), verificación pixel a pixel contra el arco real impreso siempre obligatoria.

3. **Convenciones y reglas permanentes ya confirmadas** (listalas todas, son la parte más valiosa del documento):
   - Escala del plano siempre manual, nunca inferida por Claude Vision.
   - Nunca dejar pasar errores en silencio — avisar explícito ante cualquier condición no esperada.
   - Al corregir un patrón de error en un elemento, revisar TODOS los elementos ya construidos con el mismo patrón (no solo puertas — aplica a cualquier categoría).
   - Verificar con overlay/crop contra el plano real antes de dar cualquier geometría por buena.
   - Excluir siempre líneas de corte y rasante del conteo de muros (guión-punto, símbolo círculo+triángulo).
   - Geometría de cuerpo cerrado manda por sobre heurísticas posicionales (ej. "está cerca del deslinde" no es motivo de exclusión si tiene estructura real de muro).
   - Notebook: versionado con timestamp fresco en cada edición + `Versiones anteriores/`, nunca `NotebookEdit` directo (el archivo es muy grande), edición vía parseo de JSON con Node.

4. **Lo que NO está implementado todavía** (lista explícita, con fecha del hallazgo si aplica): test de cuerpo cerrado, clasificador línea-sola portado a Python, manejo de achurado por leyenda real (no hardcodeado), causa raíz del gap de extracción, ventanas con clasificador geométrico propio (hoy dependen de estimación de Claude Vision).

5. **Cómo levantar el entorno / correr el pipeline** — podés derivarlo de `project_archicheck_pipeline` (memoria) o del roadmap si encontrás la sección relevante; si no la encontrás, dejalo como pendiente de completar en vez de inventarlo.

## Formato

Markdown, dentro de `archicheck/Proyecto/`. Sin bitácora de fechas/iteraciones — solo el estado actual, con notas breves de "por qué así" cuando el motivo no sea obvio. Cuando termines, no hace falta que hagas commit — el usuario decide cuándo comitear, junto con el resto de los cambios de la sesión paralela.
