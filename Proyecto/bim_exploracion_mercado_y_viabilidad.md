# BIM en Archicheck — exploración técnica, de mercado y de viabilidad (2026-09-17)

Documento aparte del roadmap general (`Roadmap_Revision_Dossier_ArchiCheck.md`). Recoge la conversación exploratoria sobre si/cómo Archicheck podría trabajar con BIM (y CAD/DWG), qué valor real tendría, y qué tan viable es hoy en el contexto chileno. Es insumo para decidir, no una decisión tomada.

---

## 1. Adaptación técnica: de PDF vectorial a BIM-origen

El pipeline actual (etapas 1-8 de `Criterios_graficos_muros.txt` + el complemento) resuelve un problema específico: inferir semántica (qué es un muro, una puerta, un pilar) a partir de geometría vectorial "muda" extraída de un PDF. Un archivo BIM-origen (IFC, `.rvt`, etc.) no tiene ese problema en el mismo grado, porque el objeto ya viene tipado (`IfcWall`, `IfcColumn`, `IfcOpeningElement`).

**Qué queda obsoleto o se simplifica fuerte:** extracción de segmentos/curvas (etapa 1), filtro de color (etapa 2), filtro de ángulo (etapa 3), filtro por capa OCG (etapa 4) — todo esto se reemplaza por consultar directamente el tipo de entidad IFC. El clasificador muro/puerta/ventana pasa de heurística geométrica a lectura directa de `IfcRelVoidsElement`/`IfcRelFillsElement`. Pilares dejan de necesitar la heurística de proporción ancho/largo y se identifican por tipo `IfcColumn`.

**Qué se mantiene:** la etapa 7 (cuerpo cerrado / flood-fill / dos bordes paralelos) sigue siendo valiosa, pero cambia de rol — de mecanismo de detección primario a control de calidad sobre geometría ya tipada, porque un modelo BIM mal construido puede tener objetos correctamente tipados pero geometría inválida (muros no unidos, huecos no declarados). La verificación humana (etapa 8) se mantiene o se vuelve más necesaria, no menos.

**Pros:** precisión geométrica exacta (no inferida por tolerancia de píxeles), eliminación de heurísticas enteras (color, ángulo, capa, clasificador de vano, proporción de pilar), curvas resueltas nativamente (extrusión sobre directriz curva, no reconstrucción desde Bézier), información adicional "gratis" (material, tipo de muro, cantidades).

**Contras / riesgos:**
- No es una adaptación, es un stack técnico nuevo (parser IFC vía `ifcopenshell`/`web-ifc`, o API de Revit/Forge-APS para `.rvt` nativo) — prácticamente un pipeline paralelo.
- "BIM-origen" no garantiza modelo limpio: muros exportados como proxy genérico, aberturas mal vinculadas, geometría no unida — la validación geométrica (etapa 7) sigue siendo necesaria, no opcional.
- Geometría variable en IFC: `SweptSolid` (fácil) vs. malla teselada (`Tessellation`, común en curvas/exportaciones complejas) — este último caso es geometría 3D computacional más difícil que el problema 2D actual, no más fácil.
- El plano ya no viene "curado": un modelo BIM es el edificio 3D completo, no la lámina que el arquitecto decidió mostrar — se necesita lógica nueva de selección de nivel/plano de corte y mapeo storey→lámina esperada.
- Variabilidad de esquema (IFC2x3/IFC4/IFC4.3) y de exportador (Revit, ArchiCAD, Tekla, Vectorworks), cada uno con bugs conocidos de exportación.
- Costo/infraestructura: archivos IFC/RVT de 100MB-1GB+ vs. un PDF liviano.
- Realidad de flujo de trabajo: lo que se entrega y tiene valor legal en permisos es el plano PDF/DWG timbrado, no el modelo BIM nativo — muchas oficinas no comparten el `.rvt`/`.ifc` directamente.

**Precisión:** mejora de forma clara solo cuando el modelo está bien disciplinado — deja de depender de tolerancias de píxeles. Pero la precisión efectiva depende de la disciplina de modelado del origen, que Archicheck no controla; a diferencia del ruido sistemático y ya caracterizado del PDF (color, capas, ángulo de PdV), el ruido de un BIM mal construido es heterogéneo y por proyecto. En geometría teselada la precisión puede incluso empeorar respecto al PDF vectorial.

**Recomendación de esa sesión:** no encuadrar esto como "adaptar el modelo actual" sino como pipeline nuevo y paralelo. Mantener PDF como vía principal si sigue siendo la entrega real de la mayoría de los clientes; construir ingesta BIM como vía adicional de mayor precisión para quienes sí entregan modelo nativo; conservar la lógica de cuerpo cerrado como control de calidad. Piloto sugerido: tomar un IFC real de un proyecto ya evaluado con PDF y medir con `ifcopenshell` cuánto de las etapas 1-6 se puede eliminar y cuánto de la etapa 7 sigue siendo necesaria, antes de comprometer alcance grande.

---

## 2. El journey normativo completo con BIM (no solo la plataforma)

**Dos tipos de norma:** geométrica verificable por cálculo (anchos de evacuación, superficies mínimas, pendientes, resistencia al fuego, iluminación/ventilación) — acá BIM rinde más, incluso habilita cruces hoy inviables (ej. "todos los muros que colindan con la escalera de evacuación del piso 3 deben tener F-120"). Y norma no geométrica/interpretativa (integración urbana, criterio de autoridad) — esta **no** mejora con BIM, sigue necesitando revisor humano. Importante no sobrevender esto ante un cliente.

**El cambio real no es el checker, es cuándo se puede correr.** Con PDF, Archicheck solo actúa al final (el plano ya está "cerrado"). Con BIM, el modelo existe desde el primer boceto y se actualiza continuamente — la revisión puede dejar de ser un evento único al final y volverse control continuo durante el modelado (idealmente como plug-in dentro de la herramienta de diseño, no como paso externo).

**Journey completo con los gates donde insertar el chequeo:**
1. Diseño esquemático — chequeos gruesos (rasantes, distanciamientos).
2. Desarrollo del modelo BIM — mayor valor de inserción, en paralelo al modelado.
3. Coordinación con especialidades — repetir el chequeo después, porque estructura puede cambiar espesores/posiciones.
4. QA/QC interno de la oficina — insumo objetivo para ese gate, ya existente en oficinas grandes.
5. Corrección — **punto crítico**: debe hacerse en el modelo, no en el plano derivado. Si se corrige solo el PDF exportado, el modelo queda desincronizado y el error reaparece en la próxima regeneración de documentación. Es un problema real y frecuente en oficinas de arquitectura.
6. Generación de documentación desde el modelo — el plano PDF final debería ser subproducto automático, no documento con vida propia. Segunda pasada de chequeo acá, sobre el PDF derivado, como control de que la exportación no introdujo inconsistencias.
7. Revisión pre-envío interna.
8. Envío a la Dirección de Obras Municipales — **cuello de botella no resuelto por adopción BIM interna**: la autoridad sigue revisando PDF/papel, no el modelo (ver sección 3).
9. Observaciones → corrección → reenvío → permiso — si el paso 5 se hizo bien, este ciclo debería acortarse mucho.

**Valor real para una empresa grande:** no es "automatizar una revisión que antes hacía una persona", es económico y de gobernanza. Costo de corregir un error sube exponencialmente cuanto más tarde se detecta (lógica de la curva de MacLeamy) — un error detectado en modelado cuesta mover muros; el mismo error detectado por el DOM meses después cuesta semanas de atraso en un proyecto inmobiliario. Segundo: estandarización de criterio entre oficinas/equipos — el conocimiento normativo hoy vive en la cabeza de arquitectos senior; un chequeo automático lo estandariza y lo hace auditable (argumento de gobernanza corporativa, no solo técnico). Tercero: trazabilidad defendible ante control de calidad interno o auditoría.

**¿Ayuda a que el arquitecto mejore el BIM?** Sí, pero solo si la corrección se hace en el modelo y no en el plano derivado — si la cultura de la oficina es "corrijo el dibujo final a mano", tener BIM no cambia nada. El cambio de comportamiento real ocurre cuando el chequeo es tan temprano e integrado que corregir el modelo es más rápido que corregir el plano a mano (rol de "linter", no de "calificador final"). Esto es tanto tema de producto (¿corre dentro de Revit/ArchiCAD en tiempo real?) como de cambio organizacional del cliente (¿tiene disciplina de "el modelo es la fuente única de verdad"?).

**Techo que ninguna tecnología resuelve sola:** el organismo regulador sigue exigiendo PDF/papel (ver sección 3), y el set de normas no geométricas/interpretativas sigue necesitando revisor humano sin importar el formato de origen.

---

## 3. Mercado en Chile

### Adopción BIM
Fuente: Encuesta Nacional BIM, U. de Chile (oficializada como metodología de evaluación nacional, la usa incluso la CChC).
- Uso regular: 23% (2013) → 34% (2019) → 41% (2022) → **46% (2025)**. Meta de la Hoja de Ruta BIM: 70% para 2028.
- Por profesión (2022): arquitectos 46% usuarios regulares, ingenieros 41%, **constructoras 26%** (el eslabón más atrasado).
- Por tamaño de empresa: grandes ~40%, PyME 28%, microempresas 20%.
- Uso concentrado en diseño; cae fuerte en etapas de obra.
- Mandato público: solo 6,6% de licitaciones públicas analizadas exigía BIM, aunque representaban 69,9% de la inversión pública estudiada.

### ¿Las DOM revisan con BIM?
No. DOM en Línea (plataforma nacional MINVU) es digitalización de trámite (formularios, pagos, seguimiento), no de revisión técnica — no usa ni exige BIM en ningún punto. Además estuvo prácticamente detenido (mesa público-privada sin reunirse desde 2019, relanzada en abril 2025 con licitación de 29.000 UF, "el proyecto tecnológico más caro de la cartera del MINVU"). El proyecto de ley que agiliza permisos de edificación (en trámite en el Congreso) es puramente procedimental — plazos, silencio administrativo — sin mención a BIM o digitalización de la revisión técnica. La revisión sigue siendo, en la práctica, sobre planos en papel o PDF.

### Competidores
**Revi (CChC + CENIA + Google Cloud + Stanford + U. de Chile)** — el más relevante con diferencia. Lanzado oct. 2025 en Maipú/Providencia; a agosto 2026 opera en 12 municipios (10 más implementando), meta **75 municipios para 2027 (80% de la población)**. Dos asistentes: Clara (ayuda al solicitante) y Norman (ayuda al revisor), entrenados sobre LGUC/OGUC/PRC/circulares DDU. Resultados reportados: -25% a -30% en tiempos de tramitación en municipios piloto. **Punto crítico:** hoy solo procesa documentos de texto, no planos ni BIM — pero el alcalde de Providencia declaró explícitamente que "el próximo paso es la digitalización completa y estandarización de planos para análisis mediante IA" (oct. 2025). Esta intención no aparece confirmada como hito de producto en fuentes más recientes (acuerdo Google-CChC de junio 2026 no la menciona). Es una señal de timing, no una amenaza inminente confirmada, pero el actor con más respaldo institucional del país ya declaró intención de entrar al terreno de Archicheck.

**DOMus AI** (Universidad de los Andes) — "biblioteca normativa" conversacional para el revisor municipal (LGUC/OGUC desde 1976, circulares DDU, dictámenes de Contraloría). No hace verificación geométrica de planos — compite en "consulta normativa", no en "revisión de cumplimiento".

**BuildBIM / Bimworks Chile** — consultoras BIM locales que ofrecen "validación normativa" como servicio de coordinación digital, apoyadas en herramientas como Solibri de forma manual/consultiva, no como producto de software escalable.

### Soluciones world-class de referencia
**Singapur — CORENET X**: el caso más maduro. Liderado por BCA + URA junto a otras 7 agencias, lanzado dic. 2023 (desarrollo desde 2018). Incluye un Automated Model Checker que valida requisitos geométricos/espaciales directo sobre el modelo BIM, permitiendo autoverificación antes de enviar. Solibri se asoció con la consultora AcePLP para construir un "Compliance Checker for Accessibility" conectado al Código de Práctica de CORENET X.

**Dubái**: en agosto 2026 lanzaron un sistema de IA que emite permisos en minutos, revisando diseño arquitectónico contra el Dubai Building Code, MEP, estabilidad estructural y coherencia entre documentos. No queda claro si trabaja sobre BIM nativo o sobre "planos y documentos" genéricos — no confirmado.

**Solibri**: estándar de facto mundial en model-checking BIM, presente en 99 países, reglas para accesibilidad/incendio/evacuación/sismo. Es control de calidad interno de oficina, no pensado para integrarse al trámite regulatorio salvo casos puntuales como Singapur.

**UpCodes** (EE.UU.): el más comparable a Archicheck. Tiene un plug-in dentro de Revit que analiza el modelo BIM en tiempo real mientras se modela (detectaba ~27 violaciones promedio por proyecto en pruebas privadas) y más recientemente "AI-Native Plan Review" para planos. Se evaluó su "PDK API" — no se confirmó que sea una API de extracción de datos geométricos; por contexto parece orientada a datos de productos/especificaciones de construcción, no a compliance checking programático.

---

## 4. CAD/DWG como insumo alternativo

DWG/DXF es un punto intermedio real entre PDF y BIM completo, no "más de lo mismo que el PDF": geometría vectorial nativa sin aplanado de impresión, capas reales y consultables (no aproximación vía OCG), bloques reutilizados para puertas/ventanas (señal estructural extra, aunque depende de convención de cada oficina, sin estándar como IFC). Lo que **no** cambia: sigue siendo geometría "muda" en la mayoría de los casos (sin objeto "muro" real, salvo AutoCAD Architecture/Civil3D, poco común en arquitectura pura en Chile) — la etapa 7 (cuerpo cerrado) sigue siendo el mecanismo principal de detección, no una validación secundaria como en BIM.

Nota técnica: DWG es propietario (requiere SDK de Open Design Alliance, pago, o Forge/APS). Camino más accesible: pedir o convertir a **DXF**, abierto, con librería madura y gratuita (`ezdxf` en Python).

**Uso en Chile:** no existe una encuesta formal equivalente a la de BIM. Por evidencia indirecta, AutoCAD/DWG es el estándar de facto casi universal, incluso en oficinas que ya usan BIM (Revit/ArchiCAD interoperan en DWG como formato común de intercambio con estructura, consultores, municipios). Alternativas más económicas compatibles con DWG con distribución local confirmada: **BricsCAD** (Geocom) y **ZWCAD** (RestChile, entre otros). Vectorworks tiene presencia menor en el mercado chileno de arquitectura. Recomendación: verificar directamente con clientes actuales de Archicheck en qué formato llegan hoy los proyectos (PDF puro vs. acceso a DWG/DXF de origen) antes de invertir en desarrollo — dato más confiable que cualquier encuesta genérica.

---

## 5. Herramientas para el flujo "sube el archivo → informe → corrige en su software → resube"

Confirmado con el usuario: el modelo de producto NO es integrarse al software del arquitecto (no plug-in en vivo dentro de Revit/ArchiCAD). Es un flujo desacoplado por subida de archivo, igual al que ya opera con PDF, cambiando el formato de entrada.

**Formato de entrada recomendado: IFC.** Es el formato de intercambio abierto y neutral, exportable desde cualquier software de autoría (Revit, ArchiCAD, Vectorworks, Tekla, Allplan) sin integrarse a ninguno — el arquitecto sigue trabajando en lo que ya usa, solo cambia el botón de exportación (IFC en vez de plot a PDF).

**Motor de extracción principal: `ifcopenshell`.** Librería Python open-source y gratuita, self-hosted, sin dependencia de terceros ni costo recurrente — extrae `IfcWall`/`IfcOpeningElement`/`IfcColumn` con su geometría y propiedades, permitiendo construir el mismo tipo de JSON que hoy alimenta las reglas normativas desde PDF. Reemplaza la etapa 1 sin depender de un vendor externo.

**Respaldo, no principal: Autodesk Platform Services (Model Derivative API).** Útil solo si algunos arquitectos no logran exportar IFC limpio y prefieren subir `.rvt` nativo — traduce en la nube sin necesitar Revit instalado, con endpoints de "Extract Metadata"/"Extract Geometry" en JSON. De pago por traducción, dependiente de Autodesk.

**Descartado para este caso: Speckle.** Su fortaleza (sincronización continua entre actores conectados a un modelo vivo, vía "Speckle Automate") es lo opuesto a lo que se necesita — requeriría que el arquitecto instale un conector y esté "conectado" a una capa compartida, justo el tipo de integración que se quiere evitar.

**Descartado: UpCodes.** No es herramienta de extracción de datos; es un producto cerrado de checking (Revit plugin + plan review web), sin API pública confirmada para esto.

**Arquitectura resultante:** IFC como entrada + `ifcopenshell` como extractor propio, con APS como respaldo puntual para `.rvt` mal exportado. Es el camino que menos cambia la arquitectura actual: se reemplaza la etapa 1 (extracción desde PDF) por extracción desde IFC, y todo lo posterior (reglas normativas, informe, etapa 7 como control de calidad) se mantiene con ajustes, no con reescritura completa.

---

## 6. Disponibilidad pública de proyectos aprobados en DOM (para eventual sourcing de datos de prueba)

**Datos administrativos del permiso:** públicos por ley (Ley 20.285, transparencia activa — actos con efecto sobre terceros), pero de forma dispareja. Confirmado con un PDF real de la Municipalidad de Las Condes: la resolución publicada trae dirección, propietario, arquitecto, superficie, tipo de obra — **pero no incluye planos adjuntos**, solo texto administrativo. El CPLT fiscalizó 160 municipios (2019-ago. 2023) y encontró incumplimientos en el 36% incluso en la publicación de estos datos básicos.

**Los planos en sí no se publican proactivamente en ningún caso encontrado.** Precedente relevante: una solicitud de transparencia pasiva pidiendo explícitamente "planos del anteproyecto/proyecto" a una SEREMI fue **denegada no por confidencialidad, sino por la causal de "solicitud genérica"** (art. 21 N°1 letra c, Ley 20.285) — eran 1.772 casos / 10.632 documentos sin sistematizar. Lectura: los planos sí se consideran "antecedentes" solicitables en principio, pero una solicitud masiva para armar un dataset probablemente sea rechazada por desproporcionada; una solicitud puntual y acotada tiene más chance.

**Canal aparte y angosto:** ChileAtiende/Dirección de Arquitectura del MOP para planos de **edificios públicos/fiscales únicamente** (no privados), máximo 5 planos por solicitud vía correo — no sirve para el universo de clientes privados de Archicheck.

**Implicancia práctica:** no apostar a la Ley de Transparencia como vía de sourcing de datos a escala — el precedente sugiere que solicitudes masivas se topan con la misma causal de rechazo. El camino más viable sigue siendo proyectos que llegan directamente de clientes propios, o un convenio puntual con uno o dos municipios para un lote acotado.

---

## 7. Piloto técnico — hallazgos sobre un archivo IFC real (2026-09-18)

No se encontró ningún IFC de origen chileno público y descargable (mismo patrón que la sección 6: los modelos de proyecto son de clientes privados, no hay repositorio abierto). Como las preguntas técnicas pendientes son de esquema IFC y de cómo exporta Revit/ArchiCAD — no de normativa chilena — se corrió el piloto sobre un archivo real español encontrado por el usuario: `04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc` (edificio administrativo, IFC2x3, exportado de **Revit 2021**, el mismo software que usan las oficinas grandes en Chile). Archivo guardado en `Fase 2/BIM/Archivos ejemplo/`. Inspeccionado con **Altiro** (`ifc.cl`), visor de IFC chileno gratuito basado en navegador (ver más abajo sección 8 sobre la herramienta misma).

**Clasificación — mejor que el peor caso, pero con matices.** 454 elementos en 4 niveles (cotas de nivel reales tipo -72.800 m, aparentemente datum de sitio, no altura relativa). Por clase: `Space` 540, `Plate` 363, `Column` 169, `WallStandardCase` 143, `OpeningElement` 84, `Door` 64, `CurtainWall` 50, `Slab` 26, `Roof` 2, `StairFlight` 2, `Railing` 2, `Stair` 1.
- Muros, puertas, pilares, losas y escaleras vienen **correctamente tipados** (no como proxy genérico) — confirma el escenario optimista de la sección 1.
- **No hay ninguna clase `Window` en todo el modelo.** La fachada es 100% `CurtainWall`+`Plate` (muro cortina de vidrio), típico de un administrativo moderno. Si Archicheck espera `IfcWindow` para verificar iluminación/ventilación (Art. 4.5.7 OGUC), este edificio lo rompe — hay que resolver también contra sistemas de muro cortina, no solo ventanas puntuales individuales. Hallazgo nuevo, no anticipado en la sección 1.

**Cantidades — hay datos geométricos reales, pero no en el lugar "estándar".** Un muro cualquiera (`Muro básico:MUR_BH_(BH20)`) trae ÁREA 43.62 m², LONGITUD 10.80 m, VOLUMEN 8.72 m³ ya calculados. Pero viven agrupados como "Cotas" (grupo de parámetros nativo de Revit), **no como `Qto_WallBaseQuantities`** (el quantity set estándar de IFC que `ifcopenshell` busca por defecto vía `ifcopenshell.util.element`). Implicación para el extractor propio: no basta con pedir el Qto_ estándar — hay que tener fallback a los Pset "traducidos" desde los parámetros nativos del software de origen, porque el exportador de este proyecto no generó cantidades IFC canónicas.

**Normativa — el dato clave casi nunca está, aunque el Pset exista.** El mismo muro tiene `Pset_WallCommon` poblado, pero solo con `IsExternal=true`, `ExtendToStructure=false`, `LoadBearing=false`. **`FireRating` no está informado.** Confirma con evidencia real el matiz ya anotado en la sección 2: que un elemento traiga BIM tipado no garantiza que traiga el dato normativo específico que se necesita — depende de la disciplina de modelado de la oficina de origen. El chequeo "todos los muros de la escalera de evacuación deben ser F-120" solo funciona si esa práctica existe aguas arriba.

**Puertas:** dimensión codificada tanto en el nombre del tipo (`72.5 x 203 cm`) como en propiedades de tipo — fácil de extraer para ancho de vano en evacuación/accesibilidad.

**Conclusión del piloto:** no cambia la recomendación de la sección 1, la confirma con datos reales. `ifcopenshell` sí puede reemplazar gran parte de las etapas 1-6, pero el extractor no puede asumir que los datos vienen en `Qto_*`/Pset estándar — necesita fallback a los grupos de parámetros nativos del exportador, y la ausencia de campos normativos específicos (FireRating y similares) sigue exigiendo tratar esos casos como "dato faltante", igual que hoy con el PDF.

---

## 8. Altiro (`ifc.cl`) — herramienta chilena de inspección IFC, evaluada como insumo de research

Visor de IFC 100% en navegador (WASM + WebGPU), gratuito, de la empresa chilena **APIBIM**, sin subir archivos a servidor. Trae funciones de nivel profesional (Solibri/Navisworks): árbol espacial, propiedades y Psets/Qtos completos, filtros, mediciones, clash detection con export a BCF/CSV, conectividad MEP, validación IDS (buildingSMART), comparación de revisiones, tablas dinámicas con export a Excel/CSV, y un asistente de IA con **conector MCP** para manejar la pestaña desde un agente externo.

**Para qué sirve en este proyecto:** herramienta de prototipado/validación manual, no pieza de producto. Permite inspeccionar un IFC real en minutos sin instalar `ifcopenshell` ni escribir código — así se hizo el piloto de la sección 7. El conector MCP es el hallazgo más interesante: en teoría permite consultar un modelo (árbol, propiedades, cantidades) de forma conversacional desde una sesión de Claude Code, aunque el piloto real de esta sesión se hizo por automatización de navegador (drag-and-drop manual + lectura de la interfaz), no por el conector MCP directamente — no se probó ese camino todavía.

**Qué NO resuelve:** no tiene API server-side ni modo batch — todo corre en la pestaña del navegador del usuario. Para producto real (procesar automáticamente los IFC de todos los clientes) sigue en pie la conclusión de la sección 5: hace falta `ifcopenshell` como motor de extracción propio. Altiro no compite con eso, es una herramienta de inspección ad-hoc.

---

## 9. Piloto `IfcTester`/IDS — motor declarativo para el subconjunto numérico de `OGUC_REGLAS` (2026-09-18)

Siguiendo la recomendación de la sección 8 (`ifcopenshell` trae empaquetado `ifctester`, su propio validador contra especificaciones IDS de buildingSMART), se instaló localmente (`pip install ifcopenshell` + `pip install ifctester`, ambos 0.8.5) y se corrieron **3 reglas OGUC reales contra el mismo IFC español del piloto** — los umbrales se tomaron tal cual del diccionario `OGUC_REGLAS` ya verificado en `Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py`, no se inventaron para esta prueba. Script: `Fase 2/BIM/piloto_ids_oguc.py`.

| Regla (umbral ya verificado en `OGUC_REGLAS`) | Aplicable | Cumple | Falla |
|---|---|---|---|
| Puertas — `OverallWidth` ≥ 0.80 m (Art. 4.1.7 N°6) | 64 | **64** | 0 |
| Muros — `Pset_WallCommon.FireRating` declarado (Art. 4.3.3) | 143 | 0 | **143** |
| Escaleras — `Qto_StairFlightBaseQuantities.Width` ≥ 1.10 m (Art. 4.2.10) | 2 | 0 | **2** |

**Funciona como motor declarativo**: sin escribir ningún parser a mano, `IfcTester` leyó el atributo nativo `OverallWidth` de las 64 puertas y evaluó el umbral correctamente.

**Pero el resultado "perfecto" de puertas escondía un riesgo, no una victoria limpia.** Verificación manual de los valores crudos: `OverallWidth` real es 0.845 m / 0.945 m / 2.09 m — muy distinto de los "72.5 cm" que aparecían en el nombre del tipo de puerta en el piloto de la sección 7 (`PUE_INT_1H_Abatible_Madera:72.5 x 203 cm`). Conclusión: `OverallWidth` mide el **vano/marco completo**, no el ancho de hoja ni necesariamente el "ancho libre" que exige literalmente el Art. 4.1.7 N°6 (el paso útil real, descontando marco y hoja abierta). El PASS 64/64 es correcto contra el atributo que se le pidió a IDS, pero **puede no ser el atributo normativamente correcto** — mismo riesgo ya anotado en la sección 2 y en el piloto de la sección 7: que el dato exista con un nombre parecido no significa que mida lo que la norma pide. No se debe confiar en este chequeo específico en producción sin que un arquitecto confirme qué atributo/Pset corresponde a "ancho libre" en cada convención de exportación.

Las otras dos reglas confirman **a escala completa** (143 muros, no solo el 1 inspeccionado a mano en la sección 7) lo que el piloto manual ya sugería: cero muros declaran `FireRating`.

**Corrección posterior (2026-09-18, verificado contra la fuente oficial buildingSMART tras revisión cruzada con DeepSeek — ver sección 14):** la caracterización original de la regla de escaleras estaba mal planteada. No es que "este archivo no traiga el Qto estándar" — **`Width` nunca fue parte del estándar `Qto_StairFlightBaseQuantities`** (que solo define `Length`, `GrossVolume`, `NetVolume` en IFC4.3, confirmado en `standards.buildingsmart.org`), ni tampoco de `Pset_StairFlightCommon`. El ancho de un tramo de escalera **no tiene ningún campo nombrado en todo el schema IFC** — la regla 3 de esta sección no estaba probando "¿este archivo tiene el dato?", estaba pidiendo una propiedad que no existe en el estándar en absoluto, así que el resultado 0/2 no distingue "exportador incompleto" de "pregunta mal planteada". El ancho de escalera siempre requiere cálculo desde geometría cruda, en cualquier IFC, no solo en este.

**Conclusión del piloto**: `IfcTester`/IDS sirve para el subconjunto de `OGUC_REGLAS` que son umbrales simples sobre un atributo/propiedad existente, con la misma exigencia de siempre — verificar contra fuente que el campo mide lo que la norma pide, no asumirlo por el nombre. No resuelve las reglas relacionales/espaciales (adyacencia muro-escalera, etc.), que siguen necesitando recorrido manual de relaciones IFC (`IfcRelSpaceBoundary`, `IfcRelConnectsElements`).

---

## 10. Generador de plano en planta (PDF) directo desde geometría IFC (2026-09-18)

Para comprobar si un IFC puede producir un entregable visualmente equivalente a lo que hoy sube un arquitecto (un plano en PDF), se escribió `Fase 2/BIM/generar_plano_pdf.py`: para cada nivel del edificio, cada elemento (`IfcWallStandardCase`, `IfcColumn`, `IfcDoor`, `IfcCurtainWall`, `IfcPlate`, `IfcStairFlight`, `IfcRailing`) se triangula con `ifcopenshell.geom` (coordenadas de mundo) y cada triángulo se proyecta al plano XY con `shapely` (`unary_union`) — no es un bounding-box ni un convex hull, sigue la silueta real del elemento aunque sea curvo o no rectangular.

Resultado sobre el IFC de prueba: PDF de 4 páginas (una por nivel — PS1, P00, P01, P02), guardado junto al IFC original como `{nombre_del_ifc}_plano_{timestamp}.pdf` (convención de nombres fijada el 2026-09-18, ver más abajo) (104, 171, 143 y 10 elementos de muro/pilar/puerta/etc. por nivel respectivamente, más nombres de recinto). La planta resultante es reconocible como edificio real (dos alas rotadas según orientación del sitio, columnas, puertas marcadas, fachada con paños de vidrio angulados) — **confirmado contra la vista real del mismo modelo en Altiro**, aislando cada nivel y ocultando `Slab`/`Roof`: las 4 plantas coinciden en forma, proporciones y programa (parking en PS1, oficinas en L en P00/P01, cubierta simple en P02).

**Primera versión ilegible — corregido.** La primera pasada dibujaba muros/pilares a su espesor real (~0.15-0.30 m), que a la escala de un edificio de ~65 m completo en una página se reduce a menos de 1 mm — invisible en la práctica. Fix: `linewidth` de trazo exagerado a propósito (igual que un plano de arquitectura real exagera el poché a escalas chicas — no se infla el polígono, solo el grosor de línea), marcador de tamaño fijo en pantalla para cada pilar (independiente de su huella real), y nombres de recinto (`IfcSpace.LongName`) como texto.

**Segundo hallazgo real en el camino — `IfcSpace` no usa el mismo mecanismo que el resto.** Al intentar agregar los nombres de recinto, aparecieron 0 espacios por nivel pese a que sí existen 540 en el archivo. Causa: muros/puertas/columnas cuelgan de `IfcRelContainedInSpatialStructure`, pero en este archivo los `IfcSpace` cuelgan del nivel vía `IfcRelAggregates` (decomposición), un mecanismo IFC distinto y igualmente válido. Un extractor que solo mire "contained in" pierde el 100% de los recintos **en silencio, sin error** — mismo patrón de riesgo que el resto del piloto (Qto no estándar, `FireRating` ausente, sin `IfcWindow`): la forma de guardar el dato varía por exportador, y hay que cubrir más de un mecanismo. Fix: `ifcopenshell.util.element.get_decomposition()` además de la relación de contención. Con 176 `IfcSpace` en un solo nivel (PS1, estacionamiento), etiquetar cada uno habría sido ruido — se capó a máximo 3 etiquetas por nombre distinto repetido.

**Qué NO es**: no tiene cotas, cuadro de superficies ni escala gráfica/norte — es una verificación técnica de geometría, no un plano timbrado para la DOM. Tampoco dibuja `IfcSlab` (habría tapado el resto del dibujo).

**Por qué importa**: confirma en la práctica que se puede pasar de IFC a un plano visualmente auditable sin heurística de PDF de por medio — la etapa 8 (verificación humana) sigue siendo necesaria, pero corre sobre geometría exacta en vez de inferida. Es además la pieza que permitiría, si algún día se consigue el PDF timbrado real de este mismo proyecto, correr la Celda 4 (pipeline PDF existente) sobre él y comparar `muros_geo`/`puertas_geo` extraídos por heurística contra los extraídos directo del IFC — el experimento de comparación cabeza a cabeza que quedó pendiente desde la sección 1.

**Convención de guardado (instrucción del usuario, 2026-09-18):** cualquier PDF u otro derivado generado a partir de un IFC/BIM de ejemplo se guarda siempre en la misma carpeta que el archivo de origen, no en una carpeta de salida separada.

---

## 11. Evaluación de brecha — ¿alcanza esto para el análisis normativo completo por IFC? (2026-09-18)

**Objetivo final del usuario, para que quede registrado tal cual se planteó**: subir un IFC y revisar automáticamente *todos* los elementos — puertas, ventanas, muros, escaleras, salidas de emergencia, ventilación, mobiliario, ocupación, superficies, cortes, elevaciones. Todo.

**Respuesta corta: no, no todavía.** Lo hecho en las secciones 7-10 es evidencia real para decidir si vale la pena seguir invirtiendo en la vía BIM — no un sistema funcional. Balance por categoría:

| Elemento pedido | Estado real a esta fecha |
|---|---|
| Puertas (ancho) | ✅ Probado — `OverallWidth` se lee bien. ⚠️ Riesgo real encontrado (sección 9): puede no ser "ancho libre", el dato normativo exacto |
| Muros | ✅ Extracción funciona (tipo, área, volumen vía Pset no estándar). ⚠️ `FireRating` ausente en el 100% de los 143 muros probados — no verificable con el dato solo |
| Escaleras | ✅ Existen tipadas, con `NumberOfRiser`/`NumberOfTreads` nativos. ❌ Ancho (dato crítico Art. 4.2.10) sin quantity set estándar — requiere cálculo desde geometría cruda, no construido |
| Ventanas | ❌ Riesgo real: el edificio de prueba no tiene ninguna `IfcWindow` — 100% muro cortina (`CurtainWall`+`Plate`). La clasificación depende de la tipología del edificio, no es universal |
| Salidas de emergencia | ❌ No existe nada. IFC no etiqueta "esto es salida de emergencia" — requiere calcular carga de ocupación + trazar rutas de evacuación sobre la topología del modelo. 0% construido, en ningún lado del proyecto (ni PDF ni BIM) |
| Ventilación/iluminación natural | ❌ No probado. Requiere vincular vano (ventana o muro cortina) a su `IfcSpace` y calcular % de superficie — no construido |
| Mobiliario | ❌ No probado. No se sabe si los clientes reales de ArchiCheck modelan mobiliario en BIM — dato no verificado con ningún cliente |
| Ocupación | ❌ No existe. Requiere tablas m²/persona por uso (OGUC Art. 4.2.4) aplicadas a áreas de `IfcSpace` — 0% construido |
| Superficies por recinto | ⚠️ Parcial. Se extrajeron nombres de `IfcSpace` (sección 10) pero no se verificó si sus áreas vienen confiables — dado el patrón de esta sesión, probable que tengan el mismo problema que los muros (Pset no estándar) |
| Cortes | ❌ No construido. El generador de la sección 10 solo hace planta (proyección horizontal); un corte es una proyección vertical — mismo método (`ifcopenshell.geom` + `shapely`), cero líneas escritas |
| Elevaciones | ❌ No construido. Mismo caso que cortes — técnicamente la extensión más barata de toda esta lista, pero no existe |

**El patrón que se repitió todo el día, y que es la lección real de esta sesión**: cada vez que se probó algo nuevo (quantities de muros, `FireRating`, ancho de escalera, clase de ventana, contenedor de `IfcSpace`) apareció un caso donde **el dato existe con un nombre distinto al esperado, no existe, o vive en un mecanismo IFC diferente al asumido** (`IfcRelAggregates` en vez de `IfcRelContainedInSpatialStructure`, ver sección 10). Esto no es un problema puntual de este archivo — es la naturaleza de BIM real: cada oficina/software exporta distinto. Un sistema que cubra "todos los elementos" necesita una capa de extracción defensiva con fallback por campo, no un script de piloto que asuma un solo camino como los de hoy.

**Qué falta construir, de mayor a menor tamaño:**
1. **Motor de reglas normativo completo** — hoy `OGUC_REGLAS` (el que ya existe en el pipeline PDF, no es exclusivo de BIM) tiene ~6 reglas verificadas contra fuente, no las ~50-100 que exigiría cobertura real. Es trabajo de la Fase 2 (P2) del roadmap general, pendiente también para PDF — no es una brecha exclusiva de BIM.
2. **Ocupación + rutas de evacuación** — motor nuevo, no existe en ningún punto del proyecto hoy.
3. **Ventilación/iluminación por recinto** — requiere vincular vano↔`IfcSpace`, no existe.
4. **Extracción robusta con fallback** por cada categoría de elemento (lo de hoy fue "hacerlo funcionar una vez sobre un archivo", no "a prueba de la variabilidad real de exportadores").
5. **Cortes y elevaciones** — extensión directa de `generar_plano_pdf.py`, la más barata de la lista.
6. **Mobiliario** — depende de una pregunta de descubrimiento sin responder: ¿los clientes reales modelan mobiliario en BIM? No verificado.

**Recomendación registrada de esta sesión**: antes de construir lo de arriba, decidir con qué frecuencia real llegan archivos BIM de clientes actuales de ArchiCheck — si es poco frecuente, probablemente no se justifica todavía frente a terminar P2/P4 del pipeline PDF (que sigue siendo la vía principal según el roadmap general), y esta exploración queda como opción evaluada y lista para retomar cuando la demanda real lo justifique, no como carril de desarrollo activo.

---

## 12. Segundo IFC de prueba — `BasicHouse.ifc`, cross-validación de hallazgos (2026-09-18)

Se repitió el piloto sobre un segundo archivo real, `Fase 2/BIM/Archivos ejemplo/Basic House/BasicHouse.ifc` (52.7 MB) — otro archivo de muestra genérico, no un proyecto chileno (exportado de Revit 2021, familias con nombres en sueco: "Ytterlvägg" = muro exterior, "Innerdörr"/"Ytterdörr" = puerta interior/exterior, "Väggförteckning"/"Fönsterförteckning" = listas de muros/ventanas — parece plantilla de oficina sueca, no una "casa" residencial real pese al nombre del archivo). 2 niveles: "Floor 0" (todo el contenido real) y "Floor 1" (solo la cubierta, 1 elemento).

**Por qué vale la pena aunque no sea chileno**: a diferencia del edificio administrativo español de las secciones 7-11, este archivo tiene **exportador distinto y más completo** — permite cross-validar si los hallazgos de antes eran un defecto de un archivo puntual o un patrón real de BIM en general.

**Resultado — algunos hallazgos se confirman, otros NO se repiten (exportador-dependientes):**
- ✅ **`FireRating` sigue ausente — esta vez confirmado con datos de OTRO exportador.** `Pset_WallCommon` existe en los 13 muros, pero sin `FireRating` en ninguno (13/13 falla en `IfcTester`, igual patrón que los 143/143 del edificio español). Con dos exportadores distintos mostrando el mismo vacío, deja de ser sospecha de un archivo raro y pasa a ser **evidencia de un patrón real**: los arquitectos casi nunca declaran resistencia al fuego en el modelo BIM, sin importar el software.
- ❌ **El problema de "Qto no estándar" NO se repite aquí — este exportador SÍ trae `BaseQuantities` reales** (Height/Length/Width/GrossFootprintArea/NetVolume/NetSideArea en muros; Height/Width/Area en ventanas). Conclusión revisada: la sección 7 tenía razón en la alerta ("no asumir Qto estándar"), pero se sobre-generalizó — depende de la disciplina de exportación de cada oficina, no es universal. Un extractor robusto necesita *ambos* caminos con fallback, no asumir que ninguno existe.
- ✅ **Puertas con dato confiable esta vez.** A diferencia del caso de la sección 9 (donde `OverallWidth` resultó ser el vano/marco, no el ancho de hoja real), acá `OverallWidth` = 910 mm / 1010 mm coincide con los nombres reales de las puertas ("Innerdörr - standard:D9" / "Ytterdörr - standard:D10") — valores de puerta interior/exterior estándar suecos, plausibles como ancho de hoja real. Pasa el chequeo IDS de 0.80 m con datos que esta vez sí inspiran confianza.
- 🆕 **Primera vez con `IfcWindow` real** (19 instancias, no muro cortina) y **primera vez con mobiliario** (`IfcFurnishingElement`, 71 instancias: escritorios, sillas, sofás, mesas, gabinetes de cocina) — ninguno de los dos existía en el edificio español. Responde parcialmente la pregunta abierta de la sección 11 ("¿los clientes modelan mobiliario en BIM?"): al menos es *posible* que un archivo lo traiga, sigue sin verificarse con un cliente real de ArchiCheck.

**Extensión de `generar_plano_pdf.py`**: se agregaron estilos para `IfcWindow` y `IfcFurnishingElement`, y el script se generalizó (`main(ifc_path)` + lista `ARCHIVOS`) para correr sobre varios archivos de ejemplo sin duplicar código. Resultado guardado junto al IFC como `BasicHouse_plano_{timestamp}.pdf`: planta de un solo nivel, mobiliario completo y legible (mesa de comedor con 8 sillas, sala de estar, cocina en L, escritorios), ventanas marcadas en los muros exteriores.

**Convención de nombres fijada (instrucción del usuario, 2026-09-18):** todo archivo generado a partir de un IFC/BIM de ejemplo se nombra `{nombre_del_archivo_de_origen}_{descripción}_{timestamp}.{ext}` — nunca un nombre fijo/genérico que una corrida posterior pueda pisar en silencio. Implementado en `generar_plano_pdf.py` vía `ruta_salida()`.

**Matiz sobre IDS descubierto en el camino, no mencionado en la sección 9**: el chequeo de `FireRating` en IDS necesita saber el nombre exacto del property set (`Pset_WallCommon`) de antemano — es una limitación del formato IDS en sí, no del extractor. Un extractor propio en Python usando `ifcopenshell.util.element.get_psets(el, qtos_only=True)` es más robusto para el caso de cantidades (no le importa si el set se llama `Qto_WallBaseQuantities` o simplemente `BaseQuantities`, los reconoce igual), pero ese mismo tipo de abstracción no está disponible para propiedades normativas específicas como `FireRating` — ahí sí hay que seguir sabiendo el nombre exacto del campo en cada convención de exportación.

---

## 13. Primer ejercicio real de "análisis normativo desde IFC" — 4 archivos distintos (2026-09-18)

Se armó `Fase 2/BIM/analizar_todos.py`: el primer script que produce el JSON canónico (mismo espíritu que `archicheck_geometrico_*.json` del pipeline PDF — `muros_geo`/`puertas_geo`/`ventanas_geo`/`recintos_geo`/`incumplimientos_geo`) y corre 3 reglas OGUC ya verificadas en el propio código (`OGUC_REGLAS`) contra 4 IFC de ejemplo distintos. Se descartó `DuplexHouse.ifc` del análisis: es **MD5 idéntico a `BasicHouse.ifc`**, el mismo archivo duplicado con otro nombre.

Se sumó un quinto archivo encontrado en el camino: `AC20-FZK-Haus.ifc` — el "FZK Haus" del KIT (Karlsruhe Institute of Technology), una referencia académica muy citada en investigación BIM, exportado de ArchiCAD (alemán). Y `ISSUE_034_HouseZ.ifc`, que trajo su propia variante: usa `IfcWall` genérico en vez de `IfcWallStandardCase` en las 140 instancias de muro — ningún otro archivo de la sesión lo hacía así.

| Archivo | Muros | Con `FireRating` | Puertas | ≥0.80m | Ventanas | Recintos | Ventilación calculable |
|---|---|---|---|---|---|---|---|
| Administrativo (ES) | 143 | **0** | 64 | 64 | 0 | 540 | 0 (sin `IfcWindow` en el edificio) |
| BasicHouse | 13 | **0** | 8 | 8 | 19 | 0 | 0 (sin `IfcSpace` en el archivo) |
| FZK-Haus | 13 | **0** | 5 | 5 | 11 | 7 | **7** |
| HouseZ | 140 | **0** | 15 | 0 (sin dato) | 22 | 5 | 0 (`BoundedBy` vacío, ver más abajo) |

**`FireRating` da 0 en los 4 archivos, con 4 exportadores distintos** (Revit español, Revit inglés, ArchiCAD alemán, y el exportador de HouseZ) — deja de ser sospecha de un archivo raro, es un patrón universal de la práctica real de modelado BIM.

**HouseZ trajo un tercer tipo de vacío**: ninguna de sus 15 puertas declara `OverallWidth`. El primer intento del script lo reportó mal (`cumple=False`, "no cumple", en vez de `cumple=None`, "sin dato") — el mismo tipo de confusión que motiva este documento, encontrada en el propio código de esta sesión, no solo en los IFC de terceros. Corregido antes de reportar (ver sección 14, donde la revisión cruzada encontró más casos del mismo patrón).

**El ejercicio completo, de punta a punta, con `FZK-Haus`:** este archivo tiene recintos con nombres reales (alemán), `NetFloorArea` estándar, y las ventanas vinculadas a cada recinto vía `IfcRelSpaceBoundary` — la primera vez que las tres piezas necesarias para la regla de ventilación natural (superficie del recinto + área de ventanas + vínculo entre ambas) coinciden en un mismo archivo.

| Recinto | Área (m²) | Ventanas vinculadas | % ventilación | ¿Cumple ≥10%? |
|---|---|---|---|---|
| Schlafzimmer | 21.41 | 2 (4.8 m²) | 22.4% | ✅ |
| Bad | 12.13 | 1 (2.4 m²) | 19.8% | ✅ |
| Büro | 12.60 | 2 (4.8 m²) | 38.1% | ✅ |
| Wohnen | 25.21 | 2 (4.8 m²) | 19.0% | ✅ |
| Küche | 16.31 | 2 (4.8 m²) | 29.4% | ✅ |
| Flur | 11.19 | 0 | 0.0% | ❌ |
| **Galerie** | 74.51 | 2 (2.0 m²) | **2.7%** | **❌** |

`Galerie` (sala de doble altura) y `Flur` (pasillo) quedan bajo el 10% de ventilación natural — calculado desde geometría IFC real, sin heurística de PDF de por medio. `Flur` es un caso a tratar con cautela: la regla genérica de `reglas_verificacion.json` no distingue recintos habitables de circulaciones, y la mayoría de los códigos de construcción reales (probablemente OGUC también, sin verificar artículo por artículo en este ejercicio) eximen a pasillos de ventilación natural — se reporta tal cual sale de la regla tal como está documentada hoy en el proyecto, sin inventar una excepción no verificada.

Los 4 JSON quedan junto a cada IFC (`{origen}_analisis_{timestamp}.json`). Ver sección 14 para las correcciones que se le hicieron a este script tras revisión cruzada con Codex y DeepSeek — los números de esta tabla ya reflejan las versiones corregidas, no la primera corrida.

---

## 14. Revisión cruzada del código de hoy con Codex y DeepSeek (2026-09-18)

Siguiendo el mecanismo ya establecido en el proyecto (`Fase 2/Herramientas_CubiCasa5k/revisar_con_codex.mjs` / `revisar_con_deepseek.mjs`, documentado en `Convenciones_CAD.md` D.11), se crearon las versiones equivalentes para el piloto BIM de hoy — `Fase 2/BIM/revisar_con_codex.mjs` y `revisar_con_deepseek.mjs` — apuntando a los 3 scripts nuevos (`piloto_ids_oguc.py`, `generar_plano_pdf.py`, `analizar_todos.py`) en vez de a los archivos del pipeline PDF. Mismo patrón: disparo manual, archivos completos, respuesta cruda guardada en `_codex_reviews/`/`_deepseek_reviews/` para que Claude la filtre.

**Ambos revisores, de forma independiente, encontraron el mismo bug crítico**, ya corregido:

- **`analizar_todos.py` confundía "0.0 real" con "sin dato"** en el cálculo de ventilación (`if (area and area_ventanas)` — Python trata `0` como falso). Esto significaba que un recinto con **cero ventanas reales vinculadas** (el caso exacto que la regla debe detectar) se reportaba como "no evaluable" en vez de "incumple". Corregido comparando contra `None` explícitamente en todo el bloque.
- Codex encontró además: la misma confusión en `area_m2` de ventanas (`if (ancho and alto)`) y en el contador `recintos_con_area` — corregidos igual.
- Codex encontró una inconsistencia real entre archivos: `piloto_ids_oguc.py` seguía usando `IFCWALLSTANDARDCASE` hardcodeado para la regla de muros, mientras que `analizar_todos.py` ya se había corregido a `IfcWall` genérico (por HouseZ) — el piloto IDS queda con esa limitación documentada, no se volvió a correr.
- **Al corregir el bug, apareció un problema más grande, no cosmético**: el edificio administrativo español (0 `IfcWindow` reales, sección 7) pasó a reportar **540 "incumplimientos de ventilación"** — un falso positivo masivo, no un hallazgo real, porque ese edificio no tiene ninguna apertura clasificada como `IfcWindow` (es 100% muro cortina). Se agregó un resguardo: el chequeo de ventilación se desactiva a nivel de edificio completo cuando hay 0 `IfcWindow` en todo el modelo, en vez de reportar el 100% de los recintos como incumplimiento por definición.
- **Segundo resguardo del mismo tipo, encontrado al aplicar el primero**: HouseZ tiene 22 `IfcWindow` reales, pero como ya se sabía que su `IfcSpace.BoundedBy` viene vacío, sin este resguardo habría reportado sus 5 recintos al 0% de ventilación — otro falso positivo, esta vez por falta de vínculo espacial, no por falta de ventanas. Se agregó una segunda condición: el chequeo de ventilación solo se activa si **al menos un recinto del edificio** logró vincular una ventana real.

**DeepSeek encontró, además, dos cosas que Codex no vio:**

1. **La vinculación ventana↔recinto vía `IfcRelSpaceBoundary` no es un mecanismo garantizado.** El `RelatedBuildingElement` de un boundary "nivel 1" (el más común en la práctica) suele apuntar al **muro**, no a la ventana — la ventana solo aparece si el exportador genera boundaries de "nivel 2" (ArchiCAD, como `FZK-Haus`, sí lo hace; no hay garantía de que otro exportador lo haga igual). El resultado de la sección 13 para `FZK-Haus` sigue siendo válido porque se verificó con datos reales, pero no se debe asumir que este método generaliza a cualquier IFC sin volver a comprobarlo.
2. **`Qto_StairFlightBaseQuantities.Width` no existe en el estándar IFC** (ver corrección en la sección 9 más arriba) — hallazgo verificado después contra `standards.buildingsmart.org` directamente, no solo aceptado de la revisión.
3. El mismo bug `None≠False` de `analizar_todos.py` estaba también reintroducido en `piloto_ids_oguc.py`: `cardinality="required"` sobre un `ids.Attribute` con `value=...` hace que IDS trate un atributo `None` como **falla**, no como "sin dato" — el 64/64 PASS de puertas reportado en la sección 9 no distingue "todas las puertas cumplen" de "ninguna tiene el atributo nulo" (en ese caso particular sí eran datos reales, verificado a mano, pero el piloto no lo habría detectado si no hubiera sido así).

**Bug real adicional, corregido, encontrado por Codex y DeepSeek en `generar_plano_pdf.py`:** el cálculo del origen común (`ox, oy`) usaba `modelo.by_type("IfcWallStandardCase")` — si el archivo no tiene ningún muro de esa clase exacta (HouseZ, que usa `IfcWall` genérico), la variable quedaba en `None` y el script se caía con `TypeError` al primer `translate()`. Nunca se había corrido el generador de planos contra HouseZ hasta este punto de la sesión — el bug estaba latente, sin manifestarse. Corregido: usa `IfcWall` (incluye el subtipo) con fallback a `(0, 0)`, y se agregó `IfcWall` al diccionario de estilos de dibujo (el mismo problema existía ahí también: los 140 muros de HouseZ no se habrían dibujado). Verificado corriendo el generador sobre HouseZ por primera vez — genera el plano correctamente.

**Por qué importa esta sección más que las anteriores**: no es una lista de bugs de programación cualquiera — cada uno es una instancia concreta del riesgo central de todo este documento (confundir "dato ausente" con "no cumple la norma", y asumir que una clase/mecanismo IFC es universal cuando no lo es), encontrado esta vez en el propio código de ArchiCheck, no solo en los archivos IFC de terceros. La revisión cruzada con Codex/DeepSeek —ya una práctica establecida en el proyecto— demostró ser igual de útil para el código nuevo de BIM que para el pipeline PDF original.

---

## 15. Dataset LTU, validación de niveles, y un cuello de botella real de rendimiento (2026-09-18)

**Regla nueva del usuario, aplicada desde esta sección en adelante:** cada vez que se revisa un IFC, se genera siempre el plano PDF de cada nivel Y se valida que la cantidad de niveles sea la correcta (no solo lo que declara `IfcBuildingStorey`). Implementado como `validar_niveles()` en `generar_plano_pdf.py`: cruza cada nivel contra elementos "sustantivos" (muros/losas/columnas/vigas/cubierta/escalera), detecta cotas duplicadas, y cuenta elementos físicos sin ningún nivel asignado (huérfanos, fuera de `IfcRelContainedInSpatialStructure`).

**Resultado al aplicarlo a todo lo ya procesado — hallazgo real, no cosmético:** todos los archivos con arquitectura real tienen elementos huérfanos, en proporciones que van de moderadas a alarmantes:

| Archivo | Huérfanos | Del total del archivo |
|---|---|---|
| Administrativo (ES) | 452 | — |
| BasicHouse | 30 | — |
| FZK-Haus | 20 | — |
| DuplexHouse | 61 | — |
| LTU K-modell | 644 | — |
| **LTU redesign** | **3419** | **>35% del edificio** |

Esto confirma con datos reales, a escala, la razón de ser de la regla que pidió el usuario: contar `IfcBuildingStorey` sin cruzar contra el contenido real puede subestimar gravemente cuánto del edificio efectivamente "vive" en algún nivel.

**Segundo IFC de referencia académica encontrado: `AC20-FZK-Haus.ifc`** (KIT, Alemania) — ver sección 12 y 13 para sus resultados (recintos con nombre real, ventilación calculable de punta a punta).

**Dataset LTU (Lulea University of Technology, Suecia) — 9 archivos multi-disciplina** extraídos de `LTU_A-House_2014-09-25_ifc.zip`: `K-modell` (estructura: 413 muros, 95 puertas, 204 ventanas) y `redesign` (arquitectura completa: 2623 muros, 606 puertas, 976 ventanas, 5 niveles) tienen contenido arquitectónico real; los otros 7 (`Air`, `Cooling`, `Ducting`, `Heating`, `Plumbing`, `Sanitation`, `VOIDS`) son instalaciones puras (MEP) — miles de `IfcFlowSegment`/`IfcFlowFitting`/`IfcFlowTerminal`, sin un solo muro. Se agregó un **modo "instalaciones"** a `generar_plano_pdf.py` (`generar_mep()`): en vez de triangular geometría sólida, ubica cada elemento por su punto de inserción real (`ObjectPlacement` resuelto, sin geometría) y lo dibuja como punto de color por clase — mucho más rápido a la escala de estos archivos (hasta 60.884 elementos en `Plumbing.ifc`) y sigue siendo una verificación visual real de dónde está el trazado.

**Corrección importante: `DuplexHouse.ifc` dejó de ser el duplicado de `BasicHouse.ifc`.** La sección 13 documentó (correctamente, en su momento) que ambos archivos eran MD5-idénticos. Al reprocesarlo hoy para esta sección, **el archivo en disco había cambiado** (52.7 MB → 2.4 MB, MD5 distinto) sin que nadie lo señalara explícitamente — es ahora un archivo real y distinto (la "Duplex House" pública de Autodesk: 4 niveles T/FDN·Level 1·Level 2·Roof, 21 recintos con nombre real, superficie vía Pset `GSA Space Areas`/`GSA BIM Area` — una convención estadounidense (GSA) que ninguna clave anterior cubría, agregada a `CLAVES_AREA_RECINTO`). Reverificado con `hashlib.md5` antes de asumir que seguía siendo el duplicado — la lección de esta sesión ("verificar, no asumir") aplicada a un hallazgo propio de hace unas horas, no solo a datos de terceros.

**`DuplexHouse` resultó ser el mejor caso de prueba de toda la sesión:**
- Primer archivo con **incumplimientos reales de ancho de puerta**: 4 de 14 puertas miden 0.762 m (30", tamaño estándar de puerta de clóset en EE.UU.) — bajo el mínimo de 0.80 m. Dato confiable: `OverallWidth` coincide exactamente con el nombre del tipo de puerta (`M_Single-Flush:0762 x 2032mm`), a diferencia del caso ambiguo de la sección 9.
- Segundo archivo (después de FZK-Haus) con **ventilación natural calculable de punta a punta**, y con un patrón que valida la calidad del vínculo: dormitorios/living/cocina pasan holgado (19-54%), baños/pasillo/utility/escalera/cubierta dan 0% — exactamente lo esperable en un diseño real (esos recintos no tienen ventana), no un artefacto de vínculo roto como en el edificio español o HouseZ.

**Cuello de botella de rendimiento real, encontrado y corregido en el camino:** al intentar generar el plano de `redesign.ifc` (2623 muros, 976 ventanas, 5 niveles), el proceso quedó **"Not Responding" en Windows con 7+ minutos de CPU y 2 GB de RAM** — confirmado con `tasklist`, terminado a mano. Dos fixes aplicados, en orden:
1. **`footprint_2d()` reemplazado**: de "un `Polygon` por triángulo + `buffer(0)` + `unary_union`" (el patrón que la revisión cruzada de la sección 14 ya había marcado como riesgo de escala) a **un solo `convex hull` sobre todos los vértices del elemento** — una operación en vez de cientos, inmune al bug de winding-order que señaló DeepSeek. Verificado que el resultado es visualmente idéntico en un caso ya conocido (DuplexHouse) y ~40× más rápido (0.7 s vs. varios segundos por nivel).
2. Con ese fix, `redesign.ifc` **seguía** colgado — el cuello de botella real no estaba en el post-procesado de Python sino en la triangulación de `ifcopenshell.geom` en sí, específicamente la resta booleana (CSG) de cada vano en cada muro (2785 `IfcOpeningElement` sobre 2623 muros). Se desactivó con `settings.set("disable-opening-subtractions", True)` — sin impacto visual en este script porque puertas/ventanas ya se dibujan aparte, encima del muro. Con ambos fixes, `redesign.ifc` terminó en **299 segundos** (2 niveles con >2000 elementos sustantivos cada uno).

---

## 16. Intento de flujo completo en el portal — hasta dónde se llegó (2026-09-18)

Se probó si un IFC podía llegar hasta el informe final real de ArchiCheck (Claude + GPT-4o en el portal), no solo hasta el JSON/reglas propias de las secciones 9-15.

**El portal no abría — causa real, no ambigua:** la sesión se había movido de carpeta de trabajo a mitad de conversación (al `cd` a `archicheck`), y la herramienta de preview seguía buscando `.claude/launch.json` en el workspace original (vacío). Solucionado creando el `launch.json` correcto ahí, apuntando a `npm run dev` en la ruta real del proyecto vía `cmd /c cd /d ...`.

**Corrección importante sobre el flujo, verificada leyendo `src/App.jsx` en vivo, no asumida:** el botón "Analizar expediente" exige, en este orden, **dos requisitos obligatorios**, no uno:
1. JSON + al menos un PNG de "Resultados Colab" (`handleColabPngs` bloquea con error explícito si falta).
2. Una **revisión gráfica interactiva** (`revisionConfirmada`, marcada igual "requerido para analizar") donde el arquitecto confirma/corrige cada muro/puerta/ventana detectado sobre cada PNG — es la etapa 8 (verificación humana) del pipeline, por diseño, no un trámite salteable.

La validación del JSON en sí es floja (`handleColabJson` solo exige una clave `paginas` o `tabla_cruzada` en la raíz) — no valida el esquema interno completo al subir.

**Se construyó `Fase 2/BIM/generar_json_colab.py`**: adapta los datos reales de `DuplexHouse.ifc` (mismo método que `analizar_todos.py`, desglosado por nivel) al esquema exacto que `buildColabTexto()` consume — `paginas[]` con `analisis_semantico.recintos` (nombre, área real, `cumple_oguc`, observación de ventilación), `mediciones_geometricas`, `incumplimientos_geo` (los 2 anchos de puerta reales bajo 0.80m) — más un PNG por nivel (4 páginas, generado con el mismo `footprint_2d`, sin ejes ni ticks para parecerse más a un plano subido real).

**Límites honestos de este adaptador, declarados en el propio script:**
- `muros_geo`/`puertas_geo` quedan vacíos a propósito: ese campo espera segmentos en coordenadas de píxel sobre el PNG (formato de detección OpenCV), no geometría 3D real — la revisión gráfica del portal no tendrá nada que revisar ahí.
- `FireRating` de muros no tiene ningún campo natural en este esquema (pensado para hallazgos de recinto/puerta, no de muro individual) — se omite, no se fuerza.
- Ventilación (%) no se mete en `incumplimientos_geo` (esa lista asume metros/m², un porcentaje ahí sería engañoso) — va como `cumple_oguc` + `observacion` por recinto, el campo que el prompt real ya lee para ese propósito.

**Dónde quedó, por decisión explícita del usuario:** en vez de automatizar la inyección de archivos y el click-through de la revisión gráfica (compleja e incierta vía navegador, sin selector de archivos nativo disponible), se optó por dejar el JSON + los 4 PNG + el PDF ya generados y que el usuario complete la subida y la revisión gráfica a mano en el portal — el mismo patrón que con Altiro (sección 7): cuando la automatización del navegador choca con un límite real (sin `<input type=file>` accesible, o un paso que exige juicio humano por diseño), se entrega el trabajo preparado en vez de forzarla.

---

## 17. Cierre del ciclo completo: informe final real, IFC → Claude+GPT-4o (2026-09-18)

El usuario completó a mano la subida (PDF + JSON + 4 PNG de la sección 16), la asignación de páginas y la revisión gráfica en el portal local, y corrió "Analizar expediente". Resultado: `ArchiCheck — obra-nueva — 2026-09-18 1536.pdf`, un informe real de 8 páginas generado por Claude+GPT-4o sobre datos extraídos de un IFC — la primera vez en toda esta exploración que se llega de punta a punta, desde el archivo BIM hasta el informe final del producto real, no un JSON o PDF propio.

**Veredicto: OBSERVADO — 3 incumplimientos ALTA, 16 observaciones MEDIA/BAJA.**

**Lo que el informe usó correctamente de los datos reales que le dimos (verificado contra lo que ya sabíamos, no solo leído):**
- Las 4 puertas a 0.762 m aparecen exactas, con criticidad **OBSERVADO** (no "INCUMPLE" directo) porque no hay cota en el plano que lo confirme — decisión correcta y disciplinada, coherente con la propia filosofía anti-fabricación del prompt de ArchiCheck.
- Los recintos con 0% de ventilación (`Room`, `Foyer` norte/sur, los 4 baños) aparecen todos, citando el porcentaje real calculado desde IFC — confirma que `cumple_oguc`/`observacion` por recinto (el campo que preparamos a propósito en la sección 16) sí llega al prompt y el modelo lo usa bien.
- Cita OGUC Art. 4.2.10 (escalera/circulación) y Art. 4.1.7 N°6 (puerta accesibilidad) — los mismos artículos que `OGUC_REGLAS` ya tiene verificados en el código del proyecto, no inventados.

**Hallazgo genuinamente nuevo, que ninguno de nuestros scripts propios generó:** el informe marca como **incumplimiento crítico (I1)** que la escalera interior no está graficada con huellas/alzadas/cotas — un hallazgo real y correcto (nuestro adaptador dejó `muros_geo`/geometría de escalera vacía a propósito, ver sección 16), y que además el expediente completo carece de cortes y elevaciones (**I2**) — igual de correcto, nunca subimos esos documentos. El modelo razonó bien sobre la AUSENCIA de datos, no solo sobre los datos presentes.

**Imprecisión real encontrada en nuestro propio adaptador, no en el informe:** `generar_json_colab.py` fija `elementos_detectados.escaleras = 0` en todas las páginas — nunca contó las `IfcStairFlight`/`IfcStair` reales (`DuplexHouse.ifc` tiene 2 de cada una). No invalida el incumplimiento I1 (la geometría de la escalera de todos modos nunca se cargó), pero es una cuenta incorrecta que debería corregirse antes de reusar este adaptador.

**Matiz sobre atribución a "OpenCV":** el informe atribuye varias veces los datos a "OpenCV" (ej. "el conteo de 18 ventanas puede incluir sobredetección por OpenCV") — nuestros datos vienen de geometría IFC real, no de detección por imagen. Causa: el campo `generado_desde` que sí incluimos en el JSON (aclarando el origen IFC) vive a nivel raíz del archivo, pero `buildColabTexto()` en `src/App.jsx` solo lee dentro de `paginas[]` — ese campo nunca llega al prompt. El modelo asume razonablemente el contexto que sí conoce (Colab/OpenCV es el flujo normal del portal). Ajuste pendiente si se vuelve a usar este adaptador: repetir una nota de origen dentro de cada página, no solo a nivel raíz.

**Conclusión de todo el arco de hoy**: sí es viable llegar de un IFC de ejemplo a un informe normativo real generado por el producto — con un adaptador relativamente chico (`generar_json_colab.py`, ~150 líneas) y sin tocar el prompt ni el motor del portal. El informe resultante es de calidad razonable: no fabricó números, citó artículos reales, y encontró un incumplimiento genuino (escalera) a partir de la ausencia de datos, no de datos inventados. Sigue siendo un adaptador de un solo caso (DuplexHouse), con las limitaciones ya conocidas (sin `muros_geo`/`puertas_geo` con coordenadas de píxel, conteo de escaleras a corregir) — no un pipeline IFC→informe listo para otros archivos sin ajuste.

---

## 18. Verificación cruzada manual en Altiro (Level 1 y 2 de DuplexHouse) + `Schependomlaan`, tercer resguardo de ventilación (2026-09-19)

**Verificación visual manual, no solo automática:** el usuario cargó `DuplexHouse.ifc` en Altiro (drag-and-drop manual — sigue sin haber forma de inyectar el archivo por navegador sin exponer un servidor, ver sección 7) y comparó, nivel por nivel, la vista real de Altiro (aislando el nivel, proyección ortográfica, vista superior) contra el PNG que genera `generar_plano_pdf.py` para el mismo nivel. **Level 1 y Level 2 coinciden**: misma huella exterior, mismo muro espina central, mismo núcleo de baño/escalera en la misma posición relativa, mismas protuberancias de porche norte/sur. Es la primera verificación cruzada húmero-por-humano de la geometría generada contra el render nativo de un visor independiente — hasta ahora solo se había verificado contra los propios datos numéricos (áreas, conteos), no contra un dibujo hecho por otro software.

**Nuevo IFC de referencia académica: `Schependomlaan.ifc`** (residencial holandés, Nijmegen — dataset muy citado en investigación BIM, 49 MB, IFC2x3). El más rico de toda la sesión: 6 niveles reales (`fundering`/subsuelo, `begane grond`/planta baja, 3 pisos superiores, `dak`/cubierta), 100 `IfcSpace` reales, 205 puertas, 259 ventanas, y — igual que HouseZ — mezcla `IfcWall` (652) e `IfcWallStandardCase` (282) **en el mismo archivo**, confirmando otra vez que no basta con elegir una sola clase. Plano generado en 20.5 s (gracias a los fixes de rendimiento de la sección 15) — el resultado es el plano más detallado y reconocible de toda la exploración (miradores octogonales, planta irregular real).

**Tercer hallazgo real del mismo patrón "el vínculo existe pero no sirve", más sutil que los dos anteriores.** Al correr `analizar_todos.py`, el primer resultado dio **100 de 100 recintos con 0% de ventilación** — incluidos dormitorios (`slaapkamer`) y living (`woonkamer`) en una casa con 259 ventanas reales. El resguardo de la sección 13 (¿algún recinto logró vincular una ventana?) no lo frenó porque **sí** había vínculo: 2 de 100 recintos (`woonkamer`) tenían `IfcRelSpaceBoundary` apuntando a ventanas reales. El problema era un nivel más profundo — esas ventanas vinculadas no tenían `OverallWidth`/`OverallHeight` declarado, así que su área siempre calculaba 0.0 aunque el vínculo espacial funcionara. **El resguardo revisaba "¿hay vínculo?" cuando la pregunta correcta era "¿el vínculo trae un dato usable?"** — corregido: ahora exige que al menos un recinto tenga `ventanas_con_area_valida > 0`, no solo `num_ventanas_vinculadas > 0`. Verificado que el fix no regresiona los dos casos que sí funcionan (FZK-Haus 7/7, DuplexHouse 21/21 siguen intactos) antes de darlo por bueno.

**Tabla cruzada final, 8 archivos con arquitectura real** (más 7 puros de instalaciones del dataset LTU en modo rápido):

| Archivo | Muros | `FireRating` | Puertas | ≥0.80m | Ventanas | Recintos | Ventilación posible |
|---|---|---|---|---|---|---|---|
| Administrativo (ES) | 143 | 0 | 64 | 64 | 0 | 540 | 0 |
| BasicHouse | 13 | 0 | 8 | 8 | 19 | 0 | 0 |
| FZK-Haus | 13 | 0 | 5 | 5 | 11 | 7 | **7** |
| HouseZ | 140 | 0 | 15 | 0 (sin dato) | 22 | 5 | 0 |
| DuplexHouse | 57 | 0 | 14 | 10 | 24 | 21 | **21** |
| LTU K-modell | 413 | 0 | 95 | 95 | 204 | 0 | 0 |
| LTU redesign | 2623 | 0 | 606 | 606 | 976 | 0 | 0 |
| **Schependomlaan** | 934 | **0** | 205 | 104 | 259 | 100 | 0 (vínculo sin área) |

**`FireRating` da 0 en los 8 archivos, con al menos 6 exportadores/proyectos de origen distintos.** Ya no es un patrón sospechoso — es prácticamente universal en la práctica real de modelado BIM, sin importar software ni país de origen.

---

*Este documento consolida investigación con fuentes web (búsquedas y fetches de septiembre 2026). Migrado desde el Proyecto "Archicheck" de Claude en la nube al repo local el 2026-09-18, por decisión de dejar de usar ese proyecto en la nube para esta documentación. Secciones 7 y 8 agregadas el 2026-09-18 en sesión de Claude Code, tras un piloto real sobre un IFC español (no se encontró IFC chileno público) usando el visor Altiro. Secciones 9 y 10 agregadas el mismo día: piloto real de `IfcTester`/IDS con reglas OGUC ya verificadas, y generador de plano PDF directo desde geometría IFC. Sección 11 agregada el mismo día: evaluación de brecha entre lo probado y el objetivo final de análisis normativo completo por IFC. Sección 12 agregada el mismo día: segundo IFC de prueba (`BasicHouse.ifc`) para cross-validar hallazgos contra un exportador distinto — confirma el vacío de `FireRating` como patrón real, matiza el problema de Qto no estándar como exportador-dependiente, y suma el primer caso con ventanas reales y mobiliario. Secciones 13 y 14 agregadas el mismo día: primer ejercicio real de análisis normativo (JSON + reglas) sobre 4 IFC distintos, y revisión cruzada de ese código con Codex/DeepSeek — 2 bugs reales de "dato ausente vs. no cumple" corregidos, y 2 falsos positivos masivos evitados con resguardos de aplicabilidad. Secciones 15 y 16 agregadas el mismo día: dataset LTU completo + validación de niveles + fix de rendimiento real (convex hull + resta de vanos desactivada), y el intento de flujo completo hasta el portal — corrección de que `DuplexHouse.ifc` ya no es duplicado de `BasicHouse.ifc`, y JSON+PNG reales dejados listos para que el usuario complete la revisión gráfica manual. Sección 17 agregada el mismo día: el usuario completó la subida y revisión gráfica manual, cerrando el ciclo completo IFC → informe final real de Claude+GPT-4o — informe de calidad razonable, con un incumplimiento genuino nuevo (escalera sin representar) y una imprecisión menor detectada en nuestro propio adaptador (conteo de escaleras). Sección 18 agregada el 2026-09-19: verificación visual manual en Altiro (Level 1/2 de DuplexHouse) confirma la geometría generada, nuevo IFC `Schependomlaan` (6 niveles, 100 recintos reales) trae un tercer hallazgo del patrón "vínculo sin dato usable" en ventilación — corregido y verificado sin regresionar los casos que ya funcionaban.*
