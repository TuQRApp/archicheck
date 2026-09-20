# Biblioteca de Convenciones BIM — ArchiCheck

Registro vivo de cómo se representa cada elemento/espacio (y cada dato que NO es geometría real) en los archivos IFC que hemos analizado. Se actualiza cada vez que el usuario define o corrige una convención — no se adivina ni se generaliza sin que el usuario lo confirme primero.

**Por qué existe este archivo separado de `Convenciones_CAD.md`**: los mecanismos de extracción son distintos — CAD/PDF trabaja con geometría vectorial "muda" (líneas, capas OCG, texto) que hay que interpretar; BIM/IFC trae objetos ya tipados (`IfcWall`, `IfcDoor`) con metadatos y parámetros propios, pero con sus propios problemas de variabilidad por exportador (nombres de Pset, mecanismos de contención, dimensiones ausentes). **Sigue exactamente la misma lógica y estructura que `Convenciones_CAD.md`** (mismas secciones A/B/C/D, mismo principio permanente de la sección 0, misma exigencia de fuente/fecha por entrada) — es un documento hermano, no un documento distinto en su forma de pensar. La sección E, sin precedente en el lado CAD, existe porque en BIM hay una pregunta adicional que no existe en PDF: cuando un umbral normativo (ancho de puerta, resistencia al fuego, ventilación) ya está definido para el pipeline PDF, el pipeline BIM **debe usar exactamente la misma definición**, no inventar una paralela — la sección E audita eso explícitamente, entrada por entrada.

**Regla de fondo**: cada convención puede variar entre software de origen (Revit, ArchiCAD, Tekla, Vectorworks) y entre oficinas — nada de esta lista es universal por decreto. Cada entrada indica en qué archivo(s) de ejemplo se confirmó. Si aparece un IFC nuevo con una variante distinta, se agrega como variante nueva (no se asume que "está mal" el archivo, ni se sobreescribe la convención anterior).

**Regla de fondo #2 — el principio central de todo este documento**: toda afirmación sobre un elemento debe trazarse a uno de tres canales reales del archivo — **metadato** (Property Set), **parámetro** (atributo nativo del objeto IFC), o **gráfica explícita** (la geometría 3D real, triangulada). Nunca se inventa ni se adivina un valor que ninguno de los tres canales declara — cuando ninguno da señal, se marca la ausencia (nunca se oculta en silencio), y cuando se usa un canal más débil como último recurso (ver `geometría` en la sección D.7), el resultado se marca **siempre** distinto de un dato declarado, nunca como si fuera cierto.

---

## 0. Principio permanente — este documento nunca deja de crecer

Mismo principio que `Convenciones_CAD.md` sección 0, aplicado a BIM sin ninguna variación de fondo:

1. **Persistencia de resultados confirmados.** Ningún cambio de lógica puede alterar en silencio el resultado de un elemento o archivo ya confirmado. Toda corrección debe validarse contra TODO lo confirmado hasta ese momento (ver la tabla cruzada de 8 archivos en `Proyecto/bim_exploracion_mercado_y_viabilidad.md` sección 18) — si algo que antes daba bien ahora da distinto, es una regresión real a investigar.
2. **Tipologías nombradas y persistentes**, para todo elemento y todo mecanismo IFC que exista o se agregue — muro, puerta (con sus subtipos de apertura), ventana, escalera, rampa, recinto, y cualquier categoría de "no es geometría real" (vano de obra sin terminar, hardware no transitable, elemento huérfano). Cada rasgo distintivo descubierto se registra aquí como tipología explícita con su criterio.
3. **Conflictos entre tipologías se levantan a propósito** — nunca se resuelven por accidente del orden de ejecución del código. Ejemplo ya vivido: dos clases IFC distintas (`IfcWall`/`IfcWallStandardCase`) pueden convivir en el mismo archivo representando la misma categoría — se decidió explícitamente tratarlas como la misma tipología, consultando ambas siempre, y esa decisión queda persistida acá (ver D.1).
4. **🆕 Jerarquía de fuente de dato, específica de BIM (sin equivalente exacto en CAD)**: cuando existe un parámetro/metadato declarado, ese manda — la geometría nunca se usa en paralelo ni lo contradice. La geometría solo se consulta como último recurso cuando el parámetro está ausente o no es utilizable, y ese resultado queda marcado como inferencia, nunca como dato cierto. Ver D.8 para el detalle completo — es el equivalente BIM de la regla D.8 de `Convenciones_CAD.md` ("la capa OCG manda, la heurística geométrica es *fallback*").

---

## A. Elementos/espacios reales (SÍ son geometría del edificio)

### Muros (`IfcWall` / `IfcWallStandardCase`)

- **Convención general**: ambas clases deben consultarse siempre — son la MISMA tipología a efectos de este proyecto, nunca una sola. `IfcWallStandardCase` es el subtipo más común (muro con capas estándar); `IfcWall` genérico aparece como única clase en archivos donde el exportador no distingue (HouseZ, 140/140 muros) o mezclado con `IfcWallStandardCase` en el mismo archivo (Schependomlaan: 652+282; Administrativo ES). `el.is_a()` devuelve la clase exacta de cada instancia, así que ambas conviven sin doble conteo al consultar `modelo.by_type("IfcWall")` (incluye el subtipo).
- **Regla dura de origen (bug real corregido 2026-09-18)**: el cálculo del punto de origen común para el dibujo asumía `IfcWallStandardCase`; con HouseZ (0 instancias de esa clase exacta) la variable quedaba `None` y el script se caía. Fix: usar `IfcWall` (incluye subtipo) con *fallback* a `(0, 0)` si el archivo no tiene ningún muro.
- **`Pset_WallCommon.FireRating`: ausente en el 100% de los muros probados, en 8 archivos con al menos 6 exportadores/proyectos de origen distintos** (Administrativo ES 143/143, BasicHouse 13/13, FZK-Haus 13/13, HouseZ 140/140, DuplexHouse, LTU K-modell 413/413, LTU redesign 2623/2623, Schependomlaan 934/934). Ya no es sospecha de un archivo raro — es prácticamente universal en la práctica de modelado BIM real, sin importar software ni país. **Se reporta siempre como dato ausente, nunca como "no cumple"** — el propio `Pset_WallCommon` puede existir con otros campos poblados (`IsExternal`, `LoadBearing`) sin `FireRating`.
- **Cantidades (área/volumen/longitud): el nombre del Pset/Qto que las trae varía por exportador, nunca asumir uno solo.** Administrativo (ES, Revit): viven en un grupo nativo "Cotas" de Revit, NO en `Qto_WallBaseQuantities` (el quantity set estándar que `ifcopenshell` busca por defecto). BasicHouse (Revit, otro proyecto): sí trae `BaseQuantities` reales y completas (Height/Length/Width/GrossFootprintArea/NetVolume/NetSideArea). **Conclusión: ambos caminos son reales, ninguno universal — el extractor necesita fallback, nunca asumir que ninguno o que ambos existen.** `ifcopenshell.util.element.get_psets(el, qtos_only=True)` abstrae esta variación de NOMBRE de Pset de forma automática para cantidades — no hace falta saber si el set se llama `Qto_WallBaseQuantities` o `BaseQuantities`.
- **🆕 Fragmentación de un muro físico en 2+ objetos `IfcWall` (Schependomlaan, exportador tipo ArchiCAD, 2026-09-19)**: un muro de cavidad (aislación entre 2 hojas) se modela como objetos separados — hoja exterior (`buitenblad`), hoja interior (`binnenblad`), y a veces el marco de vano (`kozijn`) como tercer objeto — cada uno con su propio `Pset_WallCommon` real (`LoadBearing`/`IsExternal` propios, verificado). **Son objetos legítimos, no un bug ni duplicados accidentales** — pero un piso con 327 muros de este tipo no corresponde 1:1 a lo que un arquitecto contaría mirando el plano (~100-150). **Conflicto conocido, sin resolver todavía**: `analizar_todos.py` evalúa `FireRating` por objeto crudo, sin consolidar por muro físico — el conteo de incumplimientos `muro_fire_rating_no_declarado` queda inflado 2-3x en archivos con este patrón de modelado. No se debe confiar en "cuántos muros incumplen" como cifra literal hasta que exista una lógica de consolidación (agrupar por continuidad física/capas), que hoy no existe.
- **Fuente**: Administrativo ES, BasicHouse, FZK-Haus, HouseZ, DuplexHouse, LTU K-modell/redesign, Schependomlaan (2026-09-18/19).

### Puertas (`IfcDoor`)

- **Filtro de vanos "no reales" (`filtrar_vanos_reales()`, hallazgo grave 2026-09-19)**: algunos exportadores traen como `IfcDoor` elementos que NO son aberturas transitables — contramarcos de obra en hormigón sin terminar (Schependomlaan: `"stelkozijn"`, 65/205 = ~32%) y hardware de mecanismo de ascensor (`"liftdeur"`, geometría de 0.039 m² rotada). **Señal usada, deliberadamente NO basada en nombre/idioma** (corregida por el usuario tras un primer intento por nombre en holandés, que no habría servido para un IFC chileno en español): si ALGUNOS elementos de la categoría (puerta o ventana) en el archivo declaran `OverallWidth`/`OverallHeight` y otros no, los que no declaran ninguna de las dos se excluyen. **Si NINGÚN elemento de la categoría en todo el archivo declara dimensión, se mantienen todos** — esa ausencia total no es señal de nada, es cómo exporta ese archivo particular (caso real: HouseZ, 15/15 puertas reales sin ninguna dimensión declarada — un filtro incondicional las habría eliminado todas, bug peor que el que se corrige). Verificado sin regresión contra 4 archivos antes de aplicarse a Schependomlaan.
- **`OverallWidth` como parámetro de ancho: NO siempre mide lo mismo — verificar, no asumir.** Tres comportamientos distintos confirmados en archivos distintos:
  - **Mide el vano/marco completo, no el "ancho libre" que exige literalmente OGUC Art. 4.1.7 N°6** (Administrativo ES: 0.845/0.945/2.09 m, muy distinto del "72.5 cm" del nombre comercial de la puerta). Riesgo abierto, sin resolver — no confiar en este chequeo en producción sin que el arquitecto confirme la convención de su oficina/software.
  - **Coincide con el ancho de hoja real, dato confiable** (BasicHouse: 910/1010 mm = nombres reales suecos "D9"/"D10"; DuplexHouse: 0.762 m = 30", tamaño estándar de puerta de clóset EE.UU. — primer archivo con incumplimientos reales de ancho: 4/14 puertas bajo 0.80 m).
  - **Ausente del 100% de las puertas del archivo** (HouseZ, 15/15) — un tercer caso, ni "vano" ni "hoja", directamente sin dato. Se reporta `cumple=None` ("sin dato"), nunca `cumple=False` ("no cumple") — bug real corregido esta sesión, el mismo tipo de confusión que motiva todo este documento, encontrado en código propio.
- **`IfcDoorStyle.OperationType` (vía `IfcRelDefinesByType`) como parámetro primario del sentido de apertura.** `NOTDEFINED`/`USERDEFINED` son valores reales que informan "se revisó y no traía dato útil" — distinto de una puerta sin ninguna relación a `IfcDoorStyle` (simplemente no aparece en el mapa). En Schependomlaan: 22/104 puertas reales del edificio traen `OperationType` declarado y usable (`SINGLE_SWING_LEFT/RIGHT`, `DOUBLE_DOOR_SINGLE_SWING`); las 82 restantes son 100% `NOTDEFINED`(74)/`USERDEFINED`(8) — dato genuinamente ausente, no ambigüedad del código.
- **Convención de bisagra/barrido — verificada empíricamente, no solo leída del estándar.** Se transformaron los vértices reales de una puerta con arco de giro modelado a mano ("D1R", GlobalId `3BDarYIf1EXRuu7o6glIV$`, Schependomlaan) a su sistema de coordenadas LOCAL: la bisagra queda en X local = 0 para `SINGLE_SWING_LEFT` ("izquierda" según `IfcDoorStyleOperationEnum`), y el barrido siempre va hacia +Y local ("hacia afuera") — consistente con la definición oficial en standards.buildingsmart.org.
- **`DOUBLE_DOOR_SINGLE_SWING` (2026-09-19)**: 2 hojas, cada una la mitad del ancho total, bisagras en los 2 extremos opuestos del vano, ambas abriendo hacia +Y local. 9 puertas reales de Schependomlaan declaran este tipo — antes cayían a "sin dato" solo por no estar implementado, pese a tener dato real.
- **Algunas puertas ya traen el arco de giro modelado como parte de su propia geometría 3D** (familia "D1R"/"D2R" de Schependomlaan, ~40% del archivo) — `footprint_2d()` (convex hull) lo capta y dibuja correctamente sin ningún código adicional; no hace falta sintetizar nada quando esto ocurre.
- **🆕 Inferencia por geometría (`bisagra_por_geometria()`) — ÚLTIMO recurso, solo cuando no hay `OperationType` útil (2026-09-19).** Señal: se separa el footprint de la puerta (convex hull, coordenadas locales) en mitad izquierda/derecha del ancho; la mitad de MENOR rango de Y es la bisagra, la de mayor rango es donde la hoja barre al abrir. **Calibrado contra un único caso de verdad conocida** ("D1R") — no hay en Schependomlaan otra puerta con `OperationType` declarado y esta misma geometría "rica" para validar de forma independiente (N=1). Resultado: de 82 puertas antes sin dato, 74 ahora muestran arco inferido, solo 8 sin ninguna señal (footprint simétrico). **Regla dura, pedida explícitamente por el usuario: se trata como último recurso, detrás de la opción de preguntarle al arquitecto, y el resultado se marca SIEMPRE distinto de un dato declarado** (línea punteada ámbar vs. sólida azul, campo `arco_apertura_fuente` en el JSON del portal) — nunca se presenta como dato cierto. Antes de generalizar a otro IFC, recalibrar contra un caso de verdad conocida de ESE archivo — no asumir que el mismo umbral generaliza.
- **Regla del proyecto: el sentido de apertura debe quedar SIEMPRE señalado, nunca ausente en silencio** — cuando ni el dato declarado ni la geometría dan señal, se marca "?" con entrada en la leyenda (mismo principio de "incertidumbre transparente" que rige el resto del proyecto, incluido CAD).
- **🗑️ Heurístico descartado (2026-09-19, no reintentar sin evidencia nueva)**: contar vértices del footprint o medir el lado corto del rectángulo mínimo, para decidir si una puerta "ya trae su propio arco" y así no dibujar el símbolo sintetizado encima. Probado y descartado — el lado corto de "D1R" (0.1725 m, arco real confirmado) cae en el mismo rango (0.11-0.20 m) que puertas sin ningún indicio real. No confundir con la inferencia de bisagra de arriba, que es una señal geométrica DISTINTA (asimetría izquierda/derecha, no conteo de vértices).
- **OGUC Art. 4.1.7 letra b) (aclarado 2026-09-19, verificado contra texto oficial BCN/LeyChile, no asumido)**: "el baño accesible no puede abrir hacia adentro" **NO es una prohibición absoluta** — es "preferentemente hacia el exterior", con una condición geométrica si abre hacia adentro (el barrido no puede interferir con el círculo de giro de 1,50 m de la letra a) del mismo artículo), y aplica específicamente al servicio higiénico de uso preferencial para personas con discapacidad, no a "los baños" en general. Chequeo geométrico futuro posible (ya se tiene el arco real + bisagra; falta cruzar contra el círculo de giro cuando el recinto sea el baño accesible) — no implementado todavía.
- **Fuente**: Administrativo ES, BasicHouse, DuplexHouse, HouseZ, Schependomlaan (2026-09-18/19).

### Ventanas (`IfcWindow`)

- **No siempre existe como clase propia — un edificio puede ser 100% muro cortina.** Administrativo ES: 0 `IfcWindow` en todo el modelo, fachada completa vía `IfcCurtainWall`+`IfcPlate`. Si el chequeo de iluminación/ventilación (OGUC Art. 4.5.7) espera solo `IfcWindow`, este tipo de edificio lo rompe en silencio — hay que resolver también contra sistemas de muro cortina, no solo vanos puntuales (pendiente, no implementado).
- **Mismo filtro `filtrar_vanos_reales()` que puertas, mismo hallazgo grave** — en Schependomlaan, 70% de las "ventanas" (182/259) eran el mismo tipo de vano de obra sin terminar (`"stelkozijn"`), detectadas y excluidas por la misma señal de dimensión adaptativa (ver Puertas arriba).
- **Vínculo ventana↔recinto vía `IfcRelSpaceBoundary`: NO es un mecanismo garantizado, verificar en cada archivo.** El `RelatedBuildingElement` de un boundary "nivel 1" (el más común en la práctica) suele apuntar al MURO que delimita el recinto, no a la ventana — la ventana solo aparece si el exportador genera boundaries de "nivel 2". Confirmado que SÍ funciona en FZK-Haus (ArchiCAD) y DuplexHouse; no se debe asumir que generaliza a otro exportador sin volver a comprobarlo.
- **Fuente**: Administrativo ES, BasicHouse, FZK-Haus, HouseZ, DuplexHouse, Schependomlaan (2026-09-18/19).

### Recintos (`IfcSpace`)

- **Dos mecanismos de contención distintos, ambos reales — un extractor que solo mira uno pierde recintos en silencio.** La mayoría de los elementos (muros, puertas, columnas) cuelgan de `IfcRelContainedInSpatialStructure`. Pero en Administrativo ES, los `IfcSpace` específicamente cuelgan del nivel vía `IfcRelAggregates` (decomposición) — un extractor que solo consulte "contained in" encontró 0 recintos pese a que existían 540 en el archivo, sin ningún error. Fix: consultar siempre `ifcopenshell.util.element.get_decomposition()` además de la relación de contención.
- **El nombre del Pset/campo de área varía por exportador — lista abierta, no una sola clave.** `NetFloorArea` (Qto estándar, FZK-Haus), `GSA BIM Area` (Pset propio "GSA Space Areas", convención estadounidense GSA — General Services Administration, encontrada en DuplexHouse, ninguna clave anterior la cubría). `CLAVES_AREA_RECINTO` es una lista extensible (`["NetFloorArea", "GrossFloorArea", "Area", "Fläche", "Flache", "NetArea", "GSA BIM Area"]`), no una constante fija — **regla dura de orden de búsqueda**: se busca por CLAVE primero (recorriendo todos los Psets del recinto por cada clave, en el orden de prioridad de la lista), no por Pset primero — bug real corregido: iterar Psets en el orden que devuelve `ifcopenshell` (no garantizado) podía devolver `GrossFloorArea` antes que `NetFloorArea` cuando ambos existían, y el umbral de ventilación exige superficie ÚTIL con prioridad real, no accidental.
- **Nombre del recinto**: `LongName` o `Name`, en el idioma real del archivo de origen (holandés, alemán, sueco, español, inglés según el proyecto) — nunca se traduce ni se asume un idioma.
- **Fuente**: Administrativo ES, FZK-Haus, DuplexHouse, HouseZ, Schependomlaan (2026-09-18/19).

### Escaleras (`IfcStairFlight` / `IfcStair`)

- **`IfcStair` (contenedor) puede no tener ningún `IfcStairFlight` hijo, y aun así tener geometría 3D propia usable.** Schependomlaan: 3 de 6 escaleras sin decomposición a tramos hijos, pero el propio `IfcStair` sí triangula correctamente (`footprint_2d` funciona directo sobre él, 2.2-3.9 m²) — antes esa geometría nunca se dibujaba porque `"IfcStair"` no estaba en el catálogo de estilos, aunque SÍ se contaba (mismo estilo visual que `IfcStairFlight`, es la misma escalera, solo que el exportador no modeló el tramo como objeto separado). **Regla dura para no duplicar**: el propio `IfcStair` se excluye de la lista de elementos crudos SOLO cuando sí tiene tramos hijos reales (para no dibujarlo dos veces); si no tiene ninguno, se mantiene como elemento dibujable por sí mismo.
- **`Qto_StairFlightBaseQuantities.Width` NO existe en el estándar IFC en absoluto** (verificado contra `standards.buildingsmart.org`, no asumido de un fallo de exportación) — el quantity set estándar solo define `Length`/`GrossVolume`/`NetVolume`. Pedir este campo no es "el archivo no lo trae", es una pregunta que no tiene respuesta posible en ningún IFC — el ancho de tramo de escalera siempre requiere cálculo desde geometría cruda, en cualquier archivo, no solo en los incompletos.
- **`NumberOfRiser`/`NumberOfTreads` sí son atributos nativos cuando el exportador los declara** (visto en Administrativo ES).
- **Requisito de campo específico del portal, no del IFC**: el registro de escalera necesita `cx_relativo`/`cy_relativo` poblados aunque el dibujo en canvas solo use `p1_relativo`/`p2_relativo` — el contador de "marcadas"/gate de dudas del portal filtra específicamente por `cx_relativo` numérico. Mismo patrón de "el dato está pero no en el campo que se necesita" visto varias veces esta sesión.
- **Fuente**: Administrativo ES, Schependomlaan (2026-09-18/19).

### Rampas (`IfcRamp` / `IfcRampFlight`)

- **Sin ningún ejemplo real encontrado todavía en ningún IFC de prueba** — a diferencia de CAD (que ya tiene un ejemplo gráfico documentado), BIM no ha topado con ninguna `IfcRamp` real en los 8 archivos analizados.
- **🆕 Implementado 2026-09-20 (a pedido explícito del usuario, tras la auditoría de cobertura de la sección 30 del diario BIM) el mecanismo de dibujo/conteo/registro** — mismo patrón ya probado y verificado para `IfcStair`/`IfcStairFlight`: decomposición a tramo hijo cuando existe, contenedor `IfcRamp` como *fallback* cuando no. Agregado a `ESTILOS`/`ORDEN_DIBUJO` (`generar_plano_pdf.py`), a `CATEGORIA_POR_CLASE`/`rampas_detalle` (`generar_json_colab.py`, confirmado contra el propio código del portal — `App.jsx` ya esperaba `id: "rampa"`, `campo: "rampas_detalle"`, `prefijo: "R"` desde antes, sin usarlo nunca porque el backend nunca lo producía) y a `analizar_todos.py`. `resumen_global.rampas_detectadas` pasó de estar hardcodeado en `0` a un conteo real.
- **⚠️ Límite honesto, explícito a propósito**: el mecanismo se implementó por CONSISTENCIA con el patrón ya probado de escalera, no porque se haya podido calibrar contra un caso real — sigue sin haber ninguna `IfcRamp` en los 8 archivos de esta sesión para confirmarlo empíricamente. **No se implementó ningún chequeo de pendiente/ancho contra OGUC Art. 4.1.7** (fórmula real `i% = 12.8 - 0.5333*L`, ver `App.jsx` línea ~1051) — eso sí requeriría calibrar contra geometría real, y el proyecto no inventa un umbral sin evidencia (principio 0.4). Revalidar el mecanismo de dibujo/conteo en cuanto aparezca un IFC real con rampas, antes de confiar en él sin reservas.
- **Fuente**: implementación 2026-09-20, sin archivo de calibración todavía.

### Salidas de emergencia

- **🆕 Hallazgo real 2026-09-20 (auditoría de cobertura, sección 30 del diario BIM): la afirmación anterior de este documento ("no existe ningún mecanismo IFC que las etiquete directamente") era PARCIALMENTE incorrecta — no se había verificado a fondo antes de escribirla.** `Pset_DoorCommon.FireExit` es un campo estándar real de IFC (buildingSMART) — declarado en 1 de las 8 IFC de ejemplo (FZK-Haus, 1 de 5 puertas, valor `False`, verificado con el atributo crudo, no solo con el nombre del campo).
- **🆕 Hallazgo de calidad de dato real, encontrado al verificar (no solo al leer el nombre del campo)**: `DuplexHouse.ifc` trae `PSet_Revit_Type_Other.IsFireExit` en las 14 puertas del archivo, pero el VALOR declarado es el string `"IsFireExit"` (el nombre del propio campo), no un booleano — inspeccionado el atributo IFC crudo: `IfcPropertySingleValue('IsFireExit', $, IfcLabel('IsFireExit'), $)`. Es un export de Revit roto/mal armado en el archivo de origen, no un bug del extractor. `mapa_salida_emergencia()` (`generar_plano_pdf.py`) filtra explícitamente por `isinstance(valor, bool)` para no tratar ese string como una señal real — mismo principio ya aplicado al ancho de puerta (Sección C): "el dato existe con un nombre parecido" no es lo mismo que "el dato mide/dice lo que dice medir/decir".
- **✅ Implementado 2026-09-20**: `generar_json_colab.py`/`analizar_todos.py` reemplazan el hardcode `"salidas_emergencia": 0` por un conteo real de puertas con `FireExit`/`IsFireExit` booleano `True`, más un campo separado que cuenta cuántas puertas del edificio declaran el campo EN ABSOLUTO (`salidas_emergencia_puertas_con_dato`) — para no confundir "0 encontradas" con "nunca se evaluó", mismo principio de "ausente vs. no cumple" que rige el resto del proyecto.
- **⚠️ Límite que sigue vigente, sin cambiar**: esto NO es una evaluación completa de salidas de emergencia — eso requiere cálculo de carga de ocupación + trazado de rutas de evacuación (OGUC Art. 4.2.x), que sigue sin implementar, 0% construido. Lo implementado hoy es solo el dato de ETIQUETADO puntual por puerta que sí existe como campo IFC real, cuando el exportador lo declara (raro: 1/8 archivos, 1/5 puertas de ese archivo).
- **Fuente**: FZK-Haus (dato real usable), DuplexHouse (dato presente pero corrupto/inutilizable) — 2026-09-20.

### Pilares (`IfcColumn`) / Barandas (`IfcRailing`) / Mobiliario (`IfcFurnishingElement`) / Muro cortina (`IfcCurtainWall`+`IfcPlate`)

- **Tipados de forma nativa, sin heurística de clasificación necesaria** (a diferencia de CAD, donde un pilar se infiere por proporción ancho/largo) — se leen directo por clase IFC.
- **Mobiliario confirmado real solo en un archivo** (BasicHouse: 71 instancias — escritorios, sillas, sofás, gabinetes de cocina) — responde parcialmente la pregunta de descubrimiento "¿los clientes reales de ArchiCheck modelan mobiliario en BIM?", sigue sin verificarse con un cliente real (ver sección C).
- **Muro cortina como sistema de fachada alternativo a `IfcWindow`**: `IfcCurtainWall` (marco/sistema) + `IfcPlate` (paño de vidrio) — visto en Administrativo ES como el 100% de la fachada de un edificio moderno. Tratado hoy solo como geometría dibujable, no vinculado todavía al chequeo de iluminación/ventilación (ver Ventanas arriba).
- **Fuente**: BasicHouse (mobiliario), Administrativo ES (muro cortina) — 2026-09-18.

### 🆕 Pisos y cubiertas (`IfcCovering` / `IfcSlab` / `IfcBeam` / `IfcMember`) — implementado SOLO para el nivel de cubierta (2026-09-19)

- **Hallazgo, a pedido explícito del usuario tras comparar el nivel "04 dak" (cubierta) de Schependomlaan contra Altiro**: nuestro PDF/PNG dibuja solo 22 elementos en ese nivel (un marco rectangular simple); Altiro muestra ~300, incluida la superficie completa de terraza/cubierta. Investigado a fondo, no es un límite de triangulación — es que 3 clases IFC completas nunca estuvieron en `ESTILOS`/`ORDEN_DIBUJO` (`generar_plano_pdf.py`): `IfcCovering`, `IfcSlab`, `IfcBeam`. Verificado que SÍ triangulan bien con `footprint_2d()` (148/158, 9/9, 11/11 respectivamente en el nivel "04 dak") — no es el mismo caso que los parapetos `dakopstand` (esos sí son Curve2D-only, ver sección B).
- **Composición real del nivel "04 dak" (205 elementos, por nombre)**: `IfcCovering` (158) — `"betontegels"` (123, adoquines/baldosas de hormigón de la terraza de cubierta — la superficie principal que se ve en Altiro), `"dakopstand"` (20, parapeto — ya cubierto vía `IfcWall`), `"zinkwerk"` (12, chapa de zinc/canaleta), `"isolatie"`/`"dakisolatie"` (3, aislación). `IfcSlab` (11) — `"dakvloer"` (9, losa de cubierta), `"lifttop"` (1), `"dakisolatie"` (1). `IfcBeam` (9) — perfiles de acero reales `HEB220`/`HEA220` (vigas estructurales). `IfcMember` (9, en todo el edificio, no solo cubierta) — `"geveldrager"` (soporte de fachada) + más perfiles `HEA180`/`HEB220`. **`IfcRoof` no existe en este archivo** (0 instancias) — el exportador modela la cubierta enteramente con `IfcSlab`+`IfcCovering`+`IfcWall` (parapeto), no con la clase dedicada.
- **`IfcCovering`/`IfcSlab`/`IfcBeam` existen en cantidades MUCHO mayores en TODOS los demás niveles del edificio** (ej. "00 begane grond": 252 `IfcCovering` + 80 `IfcSlab` + 24 `IfcBeam`) — **decisión explícita del usuario (2026-09-19): agregarlas SOLO al nivel de cubierta, dejar los demás niveles exactamente como estaban** (solo muros/puertas/ventanas/escaleras/pilares/barandas/mobiliario/muro cortina).
- **✅ Implementado**: `ESTILOS` (`generar_plano_pdf.py`) suma las 3 clases con estilo propio (`IfcSlab` gris, `IfcCovering` gris claro/tostado, `IfcBeam` ámbar oscuro). Se agregó `ORDEN_DIBUJO_CUBIERTA` (lista aparte, no se tocó `ORDEN_DIBUJO`) y una función `es_nivel_cubierta(nivel, niveles)` que decide cuál nivel usa la lista extendida — **criterio geométrico, no por nombre**: el nivel de MAYOR `Elevation` del edificio (mismo principio ya establecido en el proyecto de no depender de idioma/nombre). Propagado a `generar_json_colab.py` (parámetro `es_cubierta` en `render_nivel_png()`).
- **⚠️ Límite honesto de `es_nivel_cubierta()`, documentado a propósito**: no es infalible — un ático o terraza intermedia bajo una cubierta real quedaría mal clasificado como "cubierta" si fuera el nivel de mayor cota por error de modelado, y un edificio real con una cubierta que NO es el punto más alto (raro, pero posible) no se detectaría. Es la mejor señal disponible sin inventar una heurística de nombre — no se intentó nada más sofisticado.
- **Bug real encontrado y corregido en el camino**: el print de diagnóstico de `generar_plano_pdf.py` (`"Nivel X: N elementos dibujados"`) sumaba TODOS los valores de `por_tipo` (que ahora incluye `IfcSlab`/`IfcCovering`/`IfcBeam` en CUALQUIER nivel, porque `por_tipo` se arma filtrando solo por pertenencia a `ESTILOS`, sin saber de `orden_nivel`) — el conteo impreso para niveles normales se infló 2-3x aunque el DIBUJO seguía correcto (esos tipos nunca entraban al loop de dibujo real, que sí usa `orden_nivel`). Corregido para sumar solo lo que `orden_nivel` efectivamente recorre. Verificado sin regresión: los 5 niveles sin cubierta volvieron a reportar exactamente 50/394/365/237/159 elementos (idéntico a antes del cambio), y "04 dak" pasó de 22 a 200.
- **Fuente**: Schependomlaan — 2026-09-19.

---

## B. Datos/elementos que NUNCA se tratan como abertura o geometría real del edificio

### Vanos de obra sin terminar y hardware no transitable
- **Convención**: `IfcDoor`/`IfcWindow` que en realidad son huecos estructurales de obra (contramarco de hormigón, sin terminaciones) o mecanismo/hardware no transitable (panel de ascensor). Señal: ver `filtrar_vanos_reales()` en la sección A (Puertas) — geométrica/adaptativa por archivo, nunca por nombre ni idioma.
- **Regla dura**: se excluyen de TODO conteo/cálculo que trate al elemento como abertura real (ancho de evacuación, superficie de ventilación) — no son ruido a nivel de dibujo, son ruido a nivel de clasificación semántica.
- Confirmado en: Schependomlaan (2026-09-19).

### Elementos huérfanos (sin ningún nivel asignado)
- **Convención**: elementos físicos que no cuelgan de ningún `IfcBuildingStorey` vía `IfcRelContainedInSpatialStructure` — contar `IfcBuildingStorey` sin cruzar contra el contenido real puede subestimar gravemente cuánto del edificio "vive" en algún nivel.
- **Regla dura**: se cuentan y reportan siempre (`validar_niveles()`), nunca se ignoran en silencio — pueden ser una fracción sustancial del edificio (LTU redesign: 3419 elementos huérfanos, >35% del total).
- Confirmado en: los 6 archivos con arquitectura real de la sección 15 del roadmap BIM (Administrativo ES 452, BasicHouse 30, FZK-Haus 20, DuplexHouse 61, LTU K-modell 644, LTU redesign 3419) — 2026-09-18.

### Representación 2D-only sin cuerpo 3D sólido
- **Convención**: algunos elementos solo tienen `IfcShapeRepresentation` tipo `Curve2D` (un eje, no un volumen) — `ifcopenshell.geom.create_shape` no puede triangularlos.
- **Regla dura**: no se dibujan, se documentan como límite conocido — bajo impacto cuando son elementos no estructurales (parapetos de techo).
- Confirmado en: Schependomlaan, 4 muros de techo (`"dakopstand"`, parapetos) — 2026-09-19.

### `IfcOpeningElement` (resta booleana desactivada)
- **Convención**: cada hueco de puerta/ventana en un muro tiene su propio `IfcOpeningElement` — la resta booleana (CSG) contra el sólido del muro existe en el estándar IFC, pero se desactivó en el generador de planos (`disable-opening-subtractions`) **por rendimiento**, no por criterio de dato: con archivos grandes (2785 vanos sobre 2623 muros) la triangulación con resta booleana colgaba el proceso.
- **Regla dura**: esta desactivación es puramente visual/de rendimiento — puertas y ventanas igual se dibujan aparte, encima del muro, así que el hueco booleano en el polígono del muro nunca se veía de todos modos. No afecta ningún cálculo normativo (que usa `OverallWidth`/geometría propia de la puerta/ventana, no el hueco del muro).
- Confirmado en: LTU redesign (2026-09-18).

### Contenido MEP puro (sin arquitectura)
- **Convención**: archivos o porciones de archivo compuestos 100% por `IfcFlowSegment`/`IfcFlowFitting`/`IfcFlowTerminal`/etc. (ductos, tuberías) — 0 muros.
- **Regla dura**: no se procesan con el modo "arquitectura" (triangulación sólida, muy lento a esta escala — hasta 60.884 elementos en un solo archivo) — modo aparte ("instalaciones"), que ubica cada elemento por su punto de inserción (`ObjectPlacement`, sin geometría) y lo dibuja como punto de color por clase.
- Confirmado en: 7 de los 9 archivos del dataset LTU (`Air`, `Cooling`, `Ducting`, `Heating`, `Plumbing`, `Sanitation`, `VOIDS`) — 2026-09-18.

---

## C. Casos que siempre requieren marcar incertidumbre (nunca asumir en silencio)

Extensión directa del mismo principio de `Convenciones_CAD.md` sección C — pipeline/yo no debemos resolver solos cuando el dato es ambiguo o inferido, sino marcarlo de forma explícita.

### Ancho de puerta: vano/marco vs. ancho libre
- **Regla**: cuando `OverallWidth` no se ha verificado contra el nombre/tipo real de la puerta de ESE archivo, no asumir que mide el "ancho libre" que exige literalmente OGUC Art. 4.1.7 N°6 — puede medir el vano completo (Administrativo ES).
- Por qué importa: un PASS 64/64 puede ser correcto contra el atributo pedido y a la vez incorrecto contra lo que la norma realmente exige — no es lo mismo "el dato existe con un nombre parecido" que "el dato mide lo que la norma pide".

### Sentido de apertura inferido por geometría
- Ya cubierto en detalle en la sección A (Puertas) y D.7 — se repite acá porque es, junto con el punto anterior, el caso más directo de "dato con incertidumbre real" que produce hoy el pipeline BIM. Se marca siempre distinto (línea punteada ámbar, campo `arco_apertura_fuente`), nunca como dato cierto.

### `FireRating` ausente
- **Regla**: la ausencia universal (8/8 archivos) no se reporta como "el muro no tiene resistencia al fuego real" — se reporta como "no está declarado en el modelo", que es lo único verificable desde el archivo. La diferencia importa para el arquitecto: puede ser que el edificio sí cumpla en la realidad constructiva y el modelo simplemente no lo capturó.

### Recintos tipo circulación sin regla diferenciada
- **Regla**: la regla genérica de ventilación (`reglas_verificacion.json`, ≥10%) no distingue recintos habitables de circulaciones — un pasillo (`Flur`, FZK-Haus) da 0% y se reporta tal cual sale de la regla, sin inventar una excepción no verificada contra el artículo real de OGUC (que probablemente exime pasillos, pero no se confirmó artículo por artículo en este ejercicio).

### Mobiliario en BIM — pregunta de descubrimiento sin responder
- **Regla**: no se sabe si los clientes reales de ArchiCheck modelan mobiliario en su BIM — un solo archivo de prueba (BasicHouse) lo trae. No se debe diseñar ninguna regla normativa que dependa de mobiliario modelado sin antes verificar con un cliente real.

---

## D. Tabla maestra de tipologías

### D.1 Muros

| Tipología/variante | Criterio distintivo | Parámetro/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| Muro estándar | `IfcWallStandardCase` | — | Coexiste con `IfcWall` genérico en el mismo archivo sin doble conteo (`is_a()` exacto) | 2026-09-18 |
| Muro genérico | `IfcWall` (sin subtipo) | — | Único caso en HouseZ (140/140) — el extractor debe consultar `IfcWall` (incluye subtipo), nunca solo `IfcWallStandardCase` | 2026-09-18 |
| `FireRating` no declarado | `Pset_WallCommon.FireRating` ausente | — | **Universal, 8/8 archivos** — se reporta como dato ausente, nunca "no cumple" | 2026-09-18/19 |
| Cantidades en Pset no estándar | Grupo nativo del software de origen (ej. "Cotas" de Revit) en vez de `Qto_WallBaseQuantities` | — | `get_psets(qtos_only=True)` abstrae el nombre — no asumir un solo camino, ninguno es universal | 2026-09-18 |
| 🆕 Fragmentación por hoja/capa (muro de cavidad) | Exportador modela hoja exterior/interior + marco como objetos `IfcWall` separados | — | Objetos legítimos (`Pset_WallCommon` propio verificado) — **infla 2-3x el conteo de incumplimientos `FireRating` por objeto crudo, sin consolidar por muro físico** — brecha conocida, sin resolver | 🆕 2026-09-19 |

### D.2 Puertas

| Tipología/variante | Criterio distintivo | Parámetro/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| Vano/hardware no real | Sin `OverallWidth` NI `OverallHeight`, cuando otros elementos de la categoría en el mismo archivo SÍ declaran alguna | `filtrar_vanos_reales()` — señal geométrica, no de nombre | Si NINGÚN elemento del archivo declara dimensión, se mantienen todos (HouseZ) | 🆕 2026-09-19 |
| `OverallWidth` = vano/marco completo | No coincide con el ancho de hoja del nombre comercial | — | Riesgo abierto — no confiar sin confirmación del arquitecto (Administrativo ES) | 2026-09-18 |
| `OverallWidth` = ancho de hoja real | Coincide con nombre/tipo de puerta | Umbral OGUC 4.1.7 N°6: **≥ 0.80 m** (ver sección E — origen del umbral, no confirmado contra `OGUC_REGLAS` compartido) | Dato confiable (BasicHouse, DuplexHouse) — DuplexHouse: primer incumplimiento real (4/14 puertas a 0.762 m) | 2026-09-18 |
| `OverallWidth` ausente del 100% del archivo | Ningún elemento declara dimensión | — | `cumple=None`, nunca `cumple=False` (HouseZ, 15/15) | 2026-09-18 |
| `SINGLE_SWING_LEFT`/`RIGHT` | `IfcDoorStyle.OperationType` declarado y usable | Bisagra: X local = 0 (izq.) o = ancho (der.); barrido siempre a +Y local | Convención verificada empíricamente contra "D1R" (arco real embebido) | 🆕 2026-09-19 |
| `DOUBLE_DOOR_SINGLE_SWING` | Ídem, 2 hojas | Cada hoja = mitad del ancho; bisagras en extremos opuestos, ambas a +Y local | 9 puertas reales en Schependomlaan — antes caían a "?" por no estar implementado | 🆕 2026-09-19 |
| Arco ya modelado en la geometría propia | Footprint rico (familia "D1R"/"D2R") | — | `footprint_2d()` lo capta solo con el convex hull, sin código adicional | 2026-09-19 |
| 🆕 Bisagra inferida por geometría | `OperationType` no útil; asimetría de footprint entre mitad izq./der. del ancho | `UMBRAL_ASIMETRIA_BISAGRA_M = 0.02 m` (parámetro configurable) — mitad de MENOR rango de Y = bisagra. 🆕 Guardia agregada (revisión cruzada DeepSeek): `UMBRAL_MARGEN_HULL_M = 0.08 m` — si el footprint se extiende más allá de `[0, ancho_m]` más ese margen (marco/jamba, o cualquier asimetría no causada por un arco real), se descarta la señal por completo en vez de arriesgar una bisagra mal inferida | **Calibrado N=1** (solo "D1R") — último recurso, marcado SIEMPRE distinto (línea punteada, campo `arco_apertura_fuente`); revalidar antes de generalizar a otro archivo. Guardia de margen verificada contra D1R sin cambiar su resultado (desviación real 0.058 m, bajo el margen de 0.08 m) | 🆕 2026-09-19, guardia agregada mismo día |
| `NOTDEFINED`/`USERDEFINED`/sin geometría útil | Ni parámetro ni geometría dan señal | — | Marca "?" siempre, nunca se omite en silencio | 2026-09-19 |
| 🗑️ Descartado: conteo de vértices / lado corto del hull | Intentaba detectar "¿ya trae arco propio?" | — | Sin separación confiable — "D1R" (real) cae en el mismo rango que puertas ambiguas | 2026-09-19 |

### D.3 Ventanas

| Tipología/variante | Criterio distintivo | Parámetro/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| `IfcWindow` real | Declara dimensión, o el archivo no declara ninguna dimensión en la categoría | Mismo `filtrar_vanos_reales()` que puertas | 70% de las "ventanas" de Schependomlaan eran vano de obra sin terminar | 🆕 2026-09-19 |
| Muro cortina como fachada (sin `IfcWindow`) | `IfcCurtainWall` + `IfcPlate`, 0 instancias de `IfcWindow` en el edificio | — | Rompe cualquier chequeo que asuma solo `IfcWindow` — pendiente de resolver, no implementado | 2026-09-18 |
| Vínculo a recinto vía `IfcRelSpaceBoundary` | Boundary "nivel 2" (no todos los exportadores lo generan) | — | Boundary "nivel 1" apunta al muro, no a la ventana — confirmado funcional solo en FZK-Haus/DuplexHouse | 2026-09-18 |

### D.4 Escaleras

| Tipología/variante | Criterio distintivo | Parámetro/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| `IfcStairFlight` hijo real | Decomposición normal desde `IfcStair` | `NumberOfRiser`/`NumberOfTreads` cuando el exportador los declara | — | 2026-09-18 |
| `IfcStair` sin `IfcStairFlight` (fallback) | Decomposición vacía, geometría 3D propia usable | — | Se excluye el contenedor de la lista cruda SOLO si SÍ tiene tramos hijos, para no duplicar | 🆕 2026-09-19 |
| Ancho de tramo | Sin campo nombrado en el estándar IFC (`Qto_StairFlightBaseQuantities.Width` no existe) | Umbral OGUC 4.2.10: **≥ 1.10 m** (piso, hasta 50 personas — mismo valor que `OGUC_REGLAS['escalera']` del pipeline PDF, ver sección E) | Requiere SIEMPRE cálculo desde geometría cruda, en cualquier IFC | 2026-09-18, corregido tras verificación contra buildingSMART |

### D.5 Recintos

| Tipología/variante | Criterio distintivo | Parámetro/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| Contención estándar | `IfcRelContainedInSpatialStructure` | — | Mecanismo más común | 2026-09-18 |
| Contención por decomposición | `IfcRelAggregates` (Administrativo ES, solo para `IfcSpace`) | — | Un extractor que solo mire "contained in" pierde el 100% de los recintos, sin error | 2026-09-18 |
| Área — clave de Pset variable | `NetFloorArea` / `GrossFloorArea` / `Area` / `Fläche` / `GSA BIM Area` (lista abierta, `CLAVES_AREA_RECINTO`) | Prioridad: NetFloorArea > GrossFloorArea > ... (buscar por clave primero, no por Pset primero) | `GSA BIM Area` (convención EE.UU.) agregada tras encontrarla en DuplexHouse | 2026-09-18 |
| 🆕 Recinto sin `IfcRelSpaceBoundary` propio (`tiene_boundary=False`) | `sp.BoundedBy` vacío para ESE recinto puntual, aunque el edificio en general tenga el mecanismo de vínculo funcionando en otros recintos | — | Antes recibía `pct_ventilacion=0.0`/`cumple=False` (incumplimiento espurio) igual que un recinto con boundaries pero sin ventana — ahora se marca `sin dato` (`None`), distinto de "boundaries existen pero ninguno es ventana" (señal más fuerte de que genuinamente no tiene ventanas) | 🆕 2026-09-19, revisión cruzada DeepSeek |

### D.6 Datos que NUNCA son abertura/geometría real (ruido BIM)

| Tipología | Criterio distintivo | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|
| Vano de obra sin terminar / hardware no transitable | Sin dimensión declarada cuando otros del archivo sí la declaran | Ver `filtrar_vanos_reales()`, D.2/D.3 | 2026-09-19 |
| Elemento huérfano (sin nivel asignado) | Fuera de `IfcRelContainedInSpatialStructure` | Puede ser >35% del edificio (LTU redesign) — se cuenta siempre, nunca se ignora | 2026-09-18 |
| Representación 2D-only (`Curve2D`) | Sin cuerpo 3D triangulable | No se dibuja, límite documentado (bajo impacto: parapetos no estructurales) | 2026-09-19 |
| `IfcOpeningElement` (resta booleana) | Desactivada por rendimiento, no por criterio de dato | Sin impacto visual ni normativo — puertas/ventanas se dibujan aparte | 2026-09-18 |
| Contenido MEP puro | 0 muros, solo `IfcFlowSegment`/etc. | Modo "instalaciones" aparte (puntos de inserción), no triangulación sólida | 2026-09-18 |

### D.7 Estado de la fuente de dato — equivalente BIM de "estado de obra" (D.7 de `Convenciones_CAD.md`)

A diferencia de CAD (donde el "estado" es del elemento — nuevo/eliminado/existente), en BIM el estado relevante es de **la fuente del dato en sí**:

| Estado | Significado | Cómo se marca |
|---|---|---|
| `declarado` | Metadato/parámetro real del IFC (`Pset`, `OverallWidth`, `OperationType`) | Estilo normal (línea sólida, color base del elemento) |
| `geometría` | Inferido de la gráfica explícita como ÚLTIMO recurso, sin parámetro útil | Estilo SIEMPRE distinto (línea punteada, color de alerta — `#D97706` ámbar en el caso de puertas) + campo propio en el JSON del portal (`arco_apertura_fuente`) |
| `sin dato` | Ni parámetro ni geometría dan señal | Marca "?" explícita, nunca se omite en silencio |

**Regla dura, la más importante de esta sección**: cuando existe `declarado`, manda — nunca se corre `geometría` en paralelo ni se usa para contradecirlo. `geometría` solo se intenta cuando `declarado` está ausente o no es usable. Equivalente exacto de la regla D.8 de `Convenciones_CAD.md` ("la capa OCG manda, la heurística geométrica es *fallback*, nunca corren ambas en paralelo cuando existe capa").

### D.8 Reglas duras de extracción, aplicables a CUALQUIER elemento (lecciones repetidas ≥2 veces esta sesión)

| Regla | Por qué existe | Ejemplos donde se violó y se corrigió |
|---|---|---|
| Nunca confundir "0.0 real" con "sin dato" | Python trata `0`/`None` distinto, pero `if valor:` los confunde | Ventilación (`area and area_ventanas`), área de ventana (`ancho and alto`), cardinalidad IDS `required` sobre atributo `None` |
| Nunca asumir una sola clase/mecanismo IFC como universal | Cada exportador puede usar un camino distinto para el mismo concepto | `IfcWall` vs `IfcWallStandardCase`; `IfcRelContainedInSpatialStructure` vs `IfcRelAggregates` para `IfcSpace`; `Qto_*` estándar vs Pset nativo del software |
| Campos normativos específicos (`FireRating` y similares) SIEMPRE requieren saber el nombre exacto — a diferencia de cantidades, no hay abstracción genérica posible | `get_psets(qtos_only=True)` resuelve el nombre variable de un Qto automáticamente, pero NO existe el equivalente para un Pset/campo normativo puntual | `Pset_WallCommon.FireRating` — hay que saberlo de antemano, en IDS y en extractor propio por igual |
| Todo umbral/tolerancia se define en metros reales, convertido por la escala del archivo (`ifcopenshell.util.unit.calculate_unit_scale`) — nunca en unidades crudas asumidas | El valor crudo de `OverallWidth`/`ObjectPlacement` está en la unidad que declara CADA archivo (a veces mm, a veces m) | `escala_m` se aplica siempre antes de comparar contra un umbral en metros — **🔴 esta misma regla se violó en `analizar_todos.py` y `generar_json_colab.py` hasta el 2026-09-19**: el chequeo de ancho de puerta comparaba `OverallWidth` CRUDO contra 0.80, nunca podía fallar en archivos con `LENGTHUNIT` en milímetros (3 de 6 archivos). Corregido — ver fila de abajo sobre `escala_area()` para la distinción con superficies |
| 🆕 El AREA (`Qto` de recinto) NO se escala igual que un largo — `AREAUNIT` puede declararse INDEPENDIENTE de `LENGTHUNIT` | Verificado con evidencia real, no asumido: BasicHouse y Schependomlaan declaran `LENGTHUNIT=milímetro` pero `AREAUNIT=metro_cuadrado` explícito (patrón real de exportadores Revit: longitud en mm por precisión, área en m² por legibilidad) — aplicarles `escala_m**2` habría corrompido un área ya correcta | `g.escala_area(modelo)` (en `generar_plano_pdf.py`) usa el `AREAUNIT` propio si el proyecto lo declara, y solo deriva `escala_m**2` cuando NO hay `AREAUNIT` explícito (HouseZ, sin caso de ventilación calculable todavía) — 🆕 2026-09-19 |
| 🆕 La geometría triangulada (`ifcopenshell.geom.create_shape` con `use-world-coords=True`) YA viene en metros, sin importar la unidad del archivo — pero `get_local_placement()` NO, devuelve la matriz en la unidad CRUDA del archivo | Mezclar ambas sin aplicar `escala_m` solo a la segunda produce un desfase de 3 órdenes de magnitud (confirmado numéricamente: origen esperado ~5.4 m, sin escalar daba ~0.005) | Verificado 2026-09-19 al depurar `bisagra_por_geometria()` — documentado acá para no repetir el error |
| Verificar contra la fuente oficial (buildingSMART / texto real de la norma) antes de aceptar una afirmación — propia o de un revisor de IA | Codex y DeepSeek dieron 2 falsos positivos independientes esta sesión sobre el mismo código, con razonamientos distintos, ambos descartados con evidencia directa | `Qto_StairFlightBaseQuantities.Width` no existe en el estándar (verificado contra buildingsmart.org); OGUC 4.1.7 b) no es prohibición absoluta (verificado contra BCN/LeyChile) |
| 🆕 Un revisor de IA puede encontrar un bug real incluso citando el código incorrectamente — verificar el HALLAZGO contra datos reales, no solo la explicación | DeepSeek atribuyó el bug de unidades a una causa parcialmente distinta de la real, pero el hallazgo en sí (comparación sin escalar) era correcto y verificable de forma independiente | Verificado con datos duros antes de corregir: Schependomlaan tenía 12 puertas reales bajo 0.80 m (0.63–0.68 m) con CERO incumplimientos reportados — 🆕 2026-09-19 |
| Nombrar cada tipología/regla por Fuente (archivo + fecha) | Sin esto, no se puede saber si una convención generaliza o es de un solo archivo | Todo este documento |

### D.9 Conexión formal: inferencia por geometría / dato ausente ↔ interfaz de dudas del portal

Mismo principio que D.9 de `Convenciones_CAD.md`: cuando el pipeline BIM usa un dato con incertidumbre real (arco de puerta inferido por geometría, o directamente "sin dato"), eso **no se resuelve en silencio** — se propaga como campo explícito en el JSON del portal (`arco_apertura_fuente`) para que la interfaz de revisión gráfica del arquitecto (misma pantalla que ya usa el pipeline PDF) pueda, en una futura iteración, mostrarlo como pregunta puntual en vez de una línea más del plano. **Estado actual: el campo ya se propaga al JSON, pero el frontend (`App.jsx`) todavía no tiene una pantalla específica que lo use para levantar la pregunta** — mismo patrón que D.9 de CAD (duda → interfaz → respuesta → caso confirmado persistente), pendiente de conectar del lado de UI.

---

## E. Definiciones normativas compartidas con el pipeline PDF — auditoría, no solo intención

Regla de fondo (confirmada explícitamente por el usuario, 2026-09-19): **cuando un umbral normativo ya existe para PDF, BIM debe usar exactamente la misma definición — nunca una versión paralela reinventada.** Esta sección audita, uno por uno, cada umbral que usa el piloto BIM hoy contra la fuente real del lado PDF (`OGUC_REGLAS` en `Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py`, y `normativa/nacional/reglas_verificacion.json`) — no se asume que coinciden solo porque un comentario de código lo dice.

| Umbral usado por BIM | Dónde se usa | ¿Existe en el lado PDF? | Estado |
|---|---|---|---|
| Ventilación natural ≥ 10% de superficie del recinto | `analizar_todos.py`, `generar_json_colab.py` | ✅ `reglas_verificacion.json`, regla `ventilacion_iluminacion` — mismo id, mismo umbral | **Compartido de verdad** |
| Ancho mínimo de escalera ≥ 1.10 m (OGUC 4.2.10, piso de la tabla por carga de ocupación) | `piloto_ids_oguc.py` | ✅ `OGUC_REGLAS['escalera'] = (None, 1.10, ...)` en `_celda4_actual.py` — mismo valor exacto | **Compartido de verdad** |
| Ancho de puerta ≥ 0.80 m ("ancho libre", OGUC 4.1.7 N°6) | `piloto_ids_oguc.py`, `analizar_todos.py` | ✅ **Consolidado 2026-09-19**: `OGUC_REGLAS['puerta_ancho_libre'] = (None, 0.80, ...)` en `_celda4_actual.py` | **Compartido, con advertencia**: el valor 0.80 m se había verificado de forma independiente (texto OGUC vía BCN, sección 19 del roadmap BIM) sin agregarse de vuelta al diccionario — ya corregido. Sigue existiendo una COPIA manual en los 2 scripts de `Fase 2/BIM/` (no hay import directo posible, `_celda4_actual.py` no es un módulo limpio) — si el valor cambia, corregir en los 3 lugares |
| `Pset_WallCommon.FireRating` declarado (OGUC 4.3.3) | `piloto_ids_oguc.py`, `analizar_todos.py` | ✅ **Consolidado 2026-09-19**: `OGUC_REGLAS['muro_fire_rating']` en `_celda4_actual.py` (dict con `campo_requerido`/`ref`, no el mismo tuple de 3 que las reglas de recinto — es un chequeo de presencia, no de umbral numérico) | **Compartido, con la misma advertencia de copia manual que la fila anterior** |

**Nota sobre el mecanismo de consolidación**: `OGUC_REGLAS['puerta_ancho_libre']`/`['muro_fire_rating']` ahora existen en el diccionario compartido, pero el loop que lo consume en `_celda4_actual.py` (línea ~1011) solo busca por `tipo` de RECINTO — una puerta o un muro nunca son un "tipo de recinto", así que estas 2 entradas no se consumen automáticamente por ese loop; existen para ser la fuente única del VALOR + la REFERENCIA normativa, no para enchufarse solas a un chequeo existente. Tampoco hay import de Python real entre `_celda4_actual.py` (espejo local de una celda de Colab, con código de nivel superior que no es seguro ejecutar como módulo) y los scripts de `Fase 2/BIM/` — la consolidación es de la FUENTE canónica del dato, no de un mecanismo de import automático; la sincronización entre los 3 lugares sigue siendo manual y debe revisarse si el valor cambia, mismo patrón que ya existe entre el notebook de Colab y su espejo local.

---

## F. Repositorio de referencia — GlobalIds de calibración (equivalente BIM del repositorio de imágenes de CAD)

A diferencia de CAD (donde la referencia es una imagen recortada de un plano), en BIM la referencia es un GlobalId puntual dentro de un IFC de ejemplo, con lo que aportó como caso de calibración:

| Archivo | GlobalId de referencia | Para qué sirve |
|---|---|---|
| `Schependomlaan.ifc` | `3BDarYIf1EXRuu7o6glIV$` (puerta "D1R") | Único caso de verdad conocida para el sentido de apertura de puertas — arco de giro real modelado a mano, usado para calibrar tanto la convención de bisagra/barrido (`OperationType`) como la inferencia por geometría (`bisagra_por_geometria()`) |
| `HouseZ/ISSUE_034_HouseZ.ifc` | (las 15 `IfcDoor` del archivo, sin GlobalId puntual) | Único caso confirmado donde TODAS las puertas reales carecen de dimensión — evita que `filtrar_vanos_reales()` las elimine por error |
| `Duplex house/DuplexHouse.ifc` | (las 14 `IfcDoor`, 4 bajo 0.80 m) | Primer y único caso con incumplimientos reales de ancho de puerta verificados con dato confiable |
| `FZK/AC20-FZK-Haus.ifc` | (7 `IfcSpace` con boundary nivel 2) | Único caso de ventilación natural calculable de punta a punta sin resguardos activados — referencia de "cómo se ve cuando el vínculo SÍ funciona" |
| `04N02-36_..._Administrativo.ifc` | (edificio completo, 0 `IfcWindow`) | Referencia de fachada 100% muro cortina — caso que rompe cualquier chequeo que asuma `IfcWindow` |

Cada IFC de ejemplo queda guardado en `Fase 2/BIM/Archivos ejemplo/`, junto a sus derivados (`{origen}_{descripción}_{timestamp}.{ext}`) — mismo criterio de guardado ya fijado como convención de nombres del proyecto.

**Convención de nombres para capturas de comparación en Altiro (fijada 2026-09-20)**: para todo ejemplo BIM nuevo donde se genere un PNG propio (pipeline `generar_json_colab.py`) Y se capture el mismo nivel en Altiro para comparación visual cruzada, la captura de Altiro se guarda en la MISMA carpeta que el PNG de origen, con el MISMO nombre, agregando el sufijo `_Altiro` antes de la extensión (ej. `Schependomlaan_pagina2_00_begane_grond_20260919_211035.png` → `Schependomlaan_pagina2_00_begane_grond_20260919_211035_Altiro.png`). Ver sección 29 de `Proyecto/bim_exploracion_mercado_y_viabilidad.md` para el detalle de cómo se obtienen estas capturas (Claude en Chrome real, no el panel sandboxed — ese está bloqueado para descargas/clipboard/fetch local).

---

## Pendiente de definir (el usuario irá indicando caso a caso)

- Rampas: ✅ mecanismo de dibujo/conteo/registro implementado 2026-09-20 (ver sección A) — sin ningún ejemplo real en BIM todavía para calibrar, y sin chequeo de pendiente/ancho contra OGUC 4.1.7 (eso sí requiere evidencia real antes de implementarse).
- Salidas de emergencia / ocupación: ✅ **parcialmente** resuelto 2026-09-20 (ver sección A) — el dato de etiquetado puntual (`Pset_DoorCommon.FireExit`) SÍ se lee cuando existe (raro: 1/8 archivos). Sigue pendiente, 0% construido, lo que de verdad define una salida de emergencia: cálculo de carga de ocupación + trazado de rutas (OGUC Art. 4.2.x).
- Cortes y elevaciones: el generador de planos solo hace proyección horizontal (planta) — mismo método aplicaría a un corte (proyección vertical), sin implementar.
- Muro cortina ↔ chequeo de iluminación/ventilación: sin resolver, ver D.3.
- Mobiliario: solo 1 de 8 archivos lo trae — sigue sin verificarse con un cliente real si esto es representativo.
- Consolidación de muros fragmentados (hoja exterior/interior) para no inflar conteos de incumplimiento — ver D.1, brecha conocida.
- Sección E: consolidación resuelta 2026-09-19 (puerta/FireRating ahora viven en `OGUC_REGLAS`). Queda pendiente de más largo plazo: un mecanismo real de sincronización (hoy es copia manual entre `_celda4_actual.py` y los 2 scripts de `Fase 2/BIM/`) si esto sigue creciendo.
- Pisos y cubiertas (`IfcCovering`/`IfcSlab`/`IfcBeam`): ✅ resuelto 2026-09-19, implementado solo para el nivel de cubierta (ver sección A). Queda abierto el límite conocido de `es_nivel_cubierta()` (heurística de mayor cota, no infalible con áticos/terrazas intermedias).
- 🆕 **`IfcRoof` — clase completa sin ningún manejo, ni siquiera en el nivel de cubierta (hallazgo 2026-09-20, auditoría de cobertura de clases).** No está en `ESTILOS` ni en `ORDEN_DIBUJO_CUBIERTA` — nunca se dibuja, nunca se cuenta, nunca se chequea, en NINGÚN nivel, aunque exista. Verificado con evidencia real barriendo los 8 archivos de arquitectura: presente en 6 de 8 (BasicHouse 1, Administrativo ES 2, HouseZ 4, DuplexHouse 1, LTU K-modell 12, LTU redesign 14) — solo Schependomlaan (0, modela la cubierta con `IfcSlab`+`IfcCovering`+`IfcWall`) y FZK-Haus (0) no lo usan. Es exactamente la clase "cubierta" cuyo nombre coincide con el trabajo de la sección de arriba, pero el trabajo de esa sección solo cubrió `IfcSlab`/`IfcCovering`/`IfcBeam` (las 3 clases que SÍ tenía Schependomlaan) — `IfcRoof` quedó fuera sin que nadie lo pidiera ni lo descartara a propósito. Pendiente: decidir si se agrega al catálogo del nivel de cubierta.
- 🆕 **`IfcBuildingElementProxy` (clase "genérica" de exportadores que no supieron clasificar un elemento) — completamente invisible para el análisis normativo (hallazgo 2026-09-20).** Solo se usa como categoría de dibujo en el modo "instalaciones" (`CLASES_MEP`); en modo "arquitectura" (el que genera el PDF/JSON/PNG reales) no se dibuja, no se cuenta, no se inspecciona su contenido real. Presente en 4 de 8 archivos, en cantidades que van de bajas a **muy altas**: BasicHouse 4, LTU redesign 1, Schependomlaan 27, **LTU K-modell 1302** — un proxy puede representar literalmente cualquier cosa (un muro, una puerta, mobiliario) que el exportador no pudo mapear a una clase IFC estándar; hoy no hay ninguna forma de saber, desde este pipeline, si algún incumplimiento normativo real se esconde ahí. Sin investigar todavía qué contienen esos 1302 casos de LTU K-modell.
- Ancho de tramo de escalera (OGUC Art. 4.2.10, ≥ 1.10 m): el UMBRAL está documentado y compartido (ver sección E), pero **el chequeo real contra ese umbral no existe en el pipeline que genera el informe** (`analizar_todos.py`/`generar_json_colab.py`) — escaleras se dibujan y se cuentan, nunca se mide su ancho. El único lugar del proyecto que lo intenta es `piloto_ids_oguc.py`, y ese chequeo pide `Qto_StairFlightBaseQuantities.Width`, un campo que **no existe en el estándar IFC** (ver D.4) — ese chequeo puntual no puede dar otro resultado que "campo ausente" en ningún IFC, nunca un ancho real. Calcular el ancho real requeriría geometría cruda (mismo método que `footprint_2d`), no implementado.
- Ancho de pasillo/circulación (distancia libre entre muros enfrentados): ningún script del pipeline BIM lo calcula — 0% construido, mismo estado que "salidas de emergencia" arriba.
- Barandas (`IfcRailing`): se dibujan (catálogo `ESTILOS`) pero no se cuentan en `elementos_detectados` del JSON del portal ni se chequean contra ningún umbral normativo (ej. altura mínima) — sin implementar.
