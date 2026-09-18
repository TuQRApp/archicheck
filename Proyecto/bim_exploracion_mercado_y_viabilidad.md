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

*Este documento consolida investigación con fuentes web (búsquedas y fetches de septiembre 2026). Migrado desde el Proyecto "Archicheck" de Claude en la nube al repo local el 2026-09-18, por decisión de dejar de usar ese proyecto en la nube para esta documentación. Secciones 7 y 8 agregadas el 2026-09-18 en sesión de Claude Code, tras un piloto real sobre un IFC español (no se encontró IFC chileno público) usando el visor Altiro.*
