# Biblioteca de Convenciones CAD — ArchiCheck

Registro vivo de cómo se dibuja cada elemento/espacio (y cada línea/texto que NO es un elemento) en los planos que hemos analizado. Se actualiza cada vez que el usuario define o corrige una convención — no se adivina ni se generaliza sin que el usuario lo confirme primero.

**Por qué existe este archivo separado del roadmap**: el roadmap registra decisiones e hitos del proyecto; esto es una referencia técnica de consulta rápida para el pipeline (Colab) y para mí, que crece con el tiempo y que eventualmente alimenta tanto el detector determinista de convenciones como los prompts de Claude Vision (mismo mecanismo que ya usa `reglas_aprendidas.js` para normativa, aplicado acá a símbolos gráficos).

**Regla de fondo**: cada convención puede variar entre oficinas de arquitectura / software de origen — nada de esta lista es universal por decreto. Cada entrada indica en qué proyecto(s) se confirmó. Si aparece un plano nuevo con una variante distinta, se agrega como variante nueva (no se asume que "está mal" el plano, ni se sobreescribe la convención anterior).

**Regla de fondo #2 (usuario, 2026-07-31): dentro de un mismo PDF, una convención confirmada aplica a TODAS sus páginas.** Distinto del punto anterior (que habla de variación ENTRE proyectos/oficinas): una vez que una convención se confirma en una página de un PDF puntual (ej. el significado de un achurado de color según la leyenda/simbología de ese expediente), esa misma definición se aplica automáticamente al resto de las láminas del mismo documento — no hay que re-derivarla página por página. Lo que sí varía entre PDFs distintos es el criterio de la Regla de fondo #1.

---

## 0. Principio permanente — este documento nunca deja de crecer (usuario, 2026-08-24)

**Definición explícita y permanente del usuario, sin fecha de término** — no limitada a la etapa actual del proyecto ni a las sesiones de desarrollo de hoy: aplica igual al trabajo futuro del usuario y a lo que vayan ejecutando los usuarios finales del sistema una vez en producción, indefinidamente. Es una definición central porque ArchiCheck está orientado a un sistema que debe seguir aprendiendo con el uso real, no a un pipeline que se calibra una vez y queda fijo:

1. **Persistencia de resultados confirmados.** Ningún cambio de lógica puede alterar en silencio el resultado de un elemento o plano ya confirmado (por el arquitecto en desarrollo, o por un usuario final en producción). Toda corrección debe validarse contra TODO lo confirmado hasta ese momento, no solo contra el caso puntual que la motivó — si algo que antes daba bien ahora da distinto, es una regresión real a investigar, no un costo aceptable de arreglar otra cosa.
2. **Tipologías nombradas y persistentes, para todo elemento y toda construcción topológica que exista o se agregue** — muro, puerta (con sus subtipos), ventana, escalera, rampa, empalme, esquina, cruce, conector de 3+ brazos, y cualquier categoría de "ruido a excluir" (ejes, cotas, rasantes, achurado). Cada rasgo distintivo que se descubra se registra aquí como tipología explícita con su criterio — nunca queda solo implícito en código.
3. **Conflictos entre tipologías se levantan a propósito**, nunca se resuelven por accidente del orden de ejecución del código — se decide explícitamente de qué lado queda cada caso límite, y esa decisión se persiste como regla de frontera (en este documento).

Este documento es, en los hechos, el catálogo vivo que implementa los puntos 2 y 3. Ver memoria `project_archicheck_objetivo_etapa_aprendizaje.md` para el razonamiento completo — debe mantenerse consistente con esta sección.

---

## A. Elementos/espacios reales (SÍ son geometría del edificio)

**Regla general (confirmada por el usuario, 2026-07-31): SOLO los elementos de esta sección A separan/limitan espacios.** Ningún elemento de la sección B (ejes, cotas, rasantes) lo hace nunca, sin excepción — ver regla dura en cada uno más abajo. Cualquier elemento nuevo que se agregue a esta sección A implica, por definición, que sí puede actuar como límite de recinto; cualquier cosa que se agregue a la sección B implica lo contrario.

**🆕 Precisión para el cálculo de superficies (usuario, 2026-08-24)**: dentro de la sección A, no todos los elementos juegan el mismo rol en el cálculo de área de un recinto:
- **Solo muros, ventanas, puertas y vanos actúan como separadores/límites** de recinto para efectos de superficie.
- **Las escaleras NO cuentan como superficie** — no aportan área de recinto.
- **Las rampas SÍ cuentan como espacio** (sí aportan área), a diferencia de las escaleras.

### Muros
- **Convención general**: líneas continuas, casi siempre 2 trazos paralelos, formando un contorno cerrado — la distancia entre ambos trazos indica el grosor del muro.
- **Por confirmar con datos**: el dataset MLSTRUCT-FP (Pizarro) trae muros anotados de planos chilenos reales — sirve para validar/afinar esta convención con evidencia, no solo con lo observado a ojo en 3 planos.
- Confirmado en: PDV, Beauchef, Isla de Pascua (observación general, sin verificación formal todavía).
- **🆕 Muros nuevos marcados con achurado de color (usuario, 2026-07-31, ejemplo PDV Nivel 1; re-confirmado 2026-08-02)**: un achurado de color sobre un tramo de muro (ej. rojo = "se construye"/nuevo, amarillo = "se retira"/existente a eliminar, negro = existente que se mantiene, según la simbología propia de ese expediente) SÍ es geometría real — no es ruido a excluir, es un muro nuevo o a demoler. **Regla dura de proceso, reafirmada explícitamente por el usuario el 2026-08-02: este código de color NO es un estándar universal** — es la convención de ESTE plano puntual, puede haber otras en planos futuros que se irán confirmando caso a caso. El significado de cada color NUNCA se asume — siempre se confirma contra la leyenda/simbología de ESE plano puntual con el arquitecto. Una vez confirmado para un PDF, aplica a todas sus páginas (ver Regla de fondo #2 arriba).
- **🗑️ Eliminada 2026-08-24: "polígono complejo" como tipología aparte** — quedó redundante con la definición amplia de muro (más abajo): un muro que cambia de dirección o de sección es simplemente el caso general de "red de brazos con distintos ángulos", no una categoría separada.
- **🆕 Muro corto aislado (usuario, 2026-08-02)**: un tramo de muro corto que no forma parte de una corrida larga conectada es un caso real y válido, no necesariamente un artefacto/ruido — coincide con el tipo de caso ya identificado como históricamente problemático para la detección automática (muros cortos en esquinas confundidos con otros trazos cortos).
- **🆕 Muros atravesados por ejes (usuario, 2026-08-02)**: caso real confirmado donde una línea de eje (ya sabíamos que se debe ignorar, ver sección B) cruza literalmente por ENCIMA de un tramo de muro real, no solo pasa cerca — el muro debe seguir reconociéndose como muro real pese a la superposición.
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/muros/` — `Muro complejo.jpg`, `Muros existentes, nuevos en rojo y eliminados en amarillo.jpg` (2 segmentos rojos de 1.22m y 1.44m), `muro corto aislado.jpg`, `muros atravesados por ejes.jpg`.
- **🆕 Una línea única, sin borde paralelo consistente, SIEMPRE se ignora (usuario, 2026-08-24, corregido el mismo día)**: no aplica ninguna excepción de deslinde aquí — si la línea del deslinde tuviera un trazo paralelo, ya dejaría de ser "línea única" y pasaría a evaluarse como el caso general de muro (ver definición amplia más abajo). Esta fila es solo para el caso de una línea verdaderamente sola, sin ningún par enfrentado: nunca es muro.
- **🆕 El color de achurado aplica sobre borde Y relleno (usuario, 2026-08-24)**: no solo el borde del tramo — corrige/precisa la nota de 2026-07-31 de arriba.
- **🆕 Un muro corto aislado también debe pasar el test de cuerpo cerrado (usuario, 2026-08-24)**: no queda exento de esa validación solo por ser corto — precisa la nota de 2026-08-02 de arriba.
- **🆕 Filtro para el problema de clasificación upstream — firma de ventana excluye de candidato a muro (usuario, 2026-08-24)**: una ventana (par de bordes paralelos + línea central, ver convención en Ventanas más abajo) **nunca** debe entrar como candidato a "muro" — coincide con el hallazgo de revisión visual de N2 registrado en `project_archicheck_objetivo_etapa_aprendizaje` (memoria).
- **🆕 "CORTE A" generaliza a cualquier corte, y el patrón puede ser guion-guion (usuario, 2026-08-24)**: la regla dura de exclusión (ver sección B) no es exclusiva del símbolo puntual "CORTE A" — aplica a cualquier símbolo de corte/rasante, y el patrón de línea puede ser guion-guion, no solo guion-punto.
- **🔴→✅ Corrección sobre corrección, misma sesión (usuario, 2026-08-24)**: la nota de arriba (que decía "esquina, empalme y cruce NO son la misma tipología") queda **corregida por el propio usuario poco después** — la formulación correcta y definitiva es la contraria: **toda forma de encuentro de brazos (cruce, empalme, esquina — cualquier nombre que se le dé) es la MISMA tipología**, sin excepción. Se deja este historial visible a propósito (no se borra el error, se marca la corrección) — mismo criterio de "nunca dejar pasar errores en silencio" que rige todo el proyecto.
- **🆕 Definición amplia y definitiva de "muro" como entidad única (usuario, 2026-08-24)**: un solo muro es **cualquier red conectada de segmentos/brazos con bordes paralelos** (cada brazo con su propio ancho, no necesariamente igual al de los demás) que, en conjunto, **cumple cuerpo cerrado** — sin importar cuántos brazos lo componen, si se encuentran de a 2 o de a 3+, en qué ángulo (no necesariamente recto), ni si los brazos que confluyen tienen anchos distintos entre sí. "Muro simple" (2 trazos paralelos sin ningún encuentro) es solo el caso más chico de esta definición general, no una categoría aparte. **La lógica de cierre debe soportar, siempre, brazos de distintos anchos y distintos ángulos de encuentro** — no es un caso especial a tratar por separado, es la regla general.

### Puertas
- **Convención general**: el espacio (vano) entre dos tramos de muro — generalmente se grafica con una línea (la hoja) con su medida de ancho acotada. A veces incluye el arco de giro (radio de apertura), a veces no se dibuja.
- Confirmado en: PDV, Beauchef, Isla de Pascua.
- **🆕 El vano no siempre está entre 2 tramos de muro (usuario, 2026-08-24)**: a cada lado puede haber un muro corto, un muro largo, **o un pilar** — no asumir que siempre es "muro corto" a ambos lados.
- **🆕 Vano sin hoja, solo arco: el gozne se ubica opuesto al arco (usuario, 2026-08-24)**.
- **🆕 Regla definitiva del gozne — simplificada (usuario, 2026-08-24, corrige la formulación de la sesión del 2026-08-19 más abajo)**: el gozne va **opuesto al arco** — geométricamente, el centro del círculo cuyo segmento dibuja el arco (mismo criterio que el ajuste de círculo por mínimos cuadrados ya usado). El hallazgo empírico del 2026-08-19 ("segundo par de líneas más angosto dentro del espesor del muro") sigue siendo válido como **pista visual** para encontrar ese centro en un plano con ese estilo de dibujo puntual — no como definición que reemplace este principio geométrico general.
- **🆕 Puerta sin gozne NI arco — cuando ninguno de los dos existe (usuario, 2026-08-24, precisado para cuadrar con la fila anterior)**: no se descarta el elemento — se marca simplemente como puerta, sin campo de gozne ni de arco (no se fabrica ninguno de los dos). Distinto del caso de hoja obstruida (más abajo), donde SÍ hay arco pero la hoja no se ve.
- **🆕 Puerta doble — corrección (usuario, 2026-08-24)**: el gozne al centro del vano **solo es válido si los arcos están efectivamente marcados/dibujados** — nunca se asume la configuración "al centro" sin esa evidencia visual. Sin arcos marcados, cada hoja mantiene su gozne en su propio extremo exterior.
- **🆕 Tolerancia radio de arco ↔ ancho de vano (usuario, 2026-08-24, valor definido — 10%, como parámetro configurable)**: el radio del arco de la puerta debe ser **prácticamente igual al ancho del vano** (la abertura entre los 2 tramos de muro/pilar), **con una tolerancia máxima del 10%** — no una coincidencia aproximada aceptada sin más. Si el radio medido se aleja del ancho del vano más allá de ese 10%, es señal de que el emparejamiento arco↔vano está mal (arco mal detectado, o vano mal medido).
- **🆕 Tolerancia de constancia del radio a lo largo del arco (usuario, 2026-08-24, valor definido — 10%, como parámetro configurable)**: debe validarse por separado que **el radio no cambie en toda la extensión del arco** — es decir, que el trazo sea efectivamente circular (ajuste de círculo por mínimos cuadrados con residuo bajo). **Tolerancia máxima: 10%** de variación del radio a lo largo del arco. Si la variación supera ese margen, el arco no debe aceptarse como puerta válida sin revisión.
- **🆕 Arco discontinuo — reconstrucción (usuario, 2026-08-24)**: se debe pintar de un extremo a otro considerando todos los segmentos — no debe tener cambio de radio al recorrer el ángulo completo del vano.
- **🆕 Verificación obligatoria contra el arco de referencia (usuario, 2026-08-19/2026-08-24)**: todo arco debe calzar visualmente exacto contra el arco ya impreso en el plano — un ajuste de círculo con residuo bajo no basta por sí solo. Esto implica que el gozne se dibuja siempre en el centro del segmento de círculo que corresponde al arco.
- **🆕 Gozne con hoja no dibujada (obstruida por mobiliario u otro elemento) — distinto de "sin arco" (usuario, 2026-08-19, simplificado 2026-08-24)**: el gozne va en el centro del segmento de círculo al que corresponde el arco (misma regla general de arriba) — si en cambio no hay arco en absoluto, aplica la regla de arriba (se marca sin gozne).
- Nota de pipeline: el emparejamiento hoja↔arco ya usa el criterio de radio↔vano de arriba (antes solo largo de hoja) — ver roadmap P1, "leer elementos completos".
- **🆕 IMPORTANTE (usuario, 2026-07-31, ejemplo PDV Nivel 1): el arco de giro/apertura de la puerta, y la cota de ancho asociada, NUNCA deben contaminar el cálculo de área ni actuar como límite de recinto** — aunque el arco sea parte gráfica de un elemento real (la puerta), el trazo del arco en sí se comporta como una línea de referencia para efectos de segmentación, igual que un eje o una cota. No confundir con la existencia de la puerta como vano (que sí es real) — es específicamente el TRAZO del arco el que no debe limitar/dividir un espacio.
- **🆕 Cómo distinguir la hoja de un muro cuando ambos son doble línea (usuario, 2026-08-02)**: heurística general — los muros suelen dibujarse como doble línea **gruesa y más separada** (la separación indica el espesor real del muro); las hojas de puerta como doble línea **tenue y más cercana** entre sí. Sirve para no confundir una hoja con un tramo corto de muro cuando ambos aparecen como líneas paralelas.
- **🆕 Los arcos son una EXCEPCIÓN a la regla de "línea discontinua = ignorar" (usuario, 2026-08-02)**: a diferencia de ejes/cotas (sección B, donde discontinuo siempre significa "no es geometría real"), un arco de puerta dibujado con línea discontinua sigue siendo un arco de giro válido — el estilo de línea (continuo vs. discontinuo) NO debe usarse para clasificar o descartar un arco. Confirmado con ejemplo real (`Convenciones_CAD_Ejemplos/puertas/Puerta con arco discontinuo.jpg`).
- **🆕 Dos variantes de cómo se dibuja la hoja (usuario, 2026-08-02)**: (1) **Hoja cerrada**: línea(s) delgada(s) plana(s), dentro del plano del vano. (2) **Hoja abierta**: rectángulo sólido girado, parado sobre el arco en posición abierta — **el ángulo de apertura no necesariamente es cercano a 90° (corrección usuario, 2026-08-24)**, lo central es que el radio calce con la hoja/vano dentro de la tolerancia de arriba. Confirmado en puerta simple y en puerta doble.
- **🆕 Puerta doble**: vano único con 2 hojas independientes, cada una con su propio arco (los 2 arcos pueden cruzarse/superponerse en el centro del vano) — ver corrección de gozne al centro más arriba.
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/puertas/` — `Puerta1.jpg` (vano simple con arco, sin hoja visible), `2 puertas.jpg` y `2 puertas con hoja abierta en lugar de cerrada.jpg` (puerta doble, hoja cerrada y hoja abierta respectivamente), `3 puertas.jpg` (hoja tenue + arco de trazo más claro), `puerta sin arco.jpg` (variante sin hoja, solo arco — pese al nombre del archivo, sí tiene arco), `Puerta con arco discontinuo.jpg` (arco dibujado discontinuo, sigue siendo válido), `Muro eliminado y puerta agregada.jpg` (caso combinado de remodelación: muro demolido en amarillo + puerta nueva en el vano resultante), `puerta con hoja abierta en lugar de cerrada.jpg` (hoja abierta, puerta simple).

### Ventanas
- **🆕 Definición vigente, siempre la misma sin importar cómo llegue el dato (usuario, 2026-08-24)**: una ventana es un **par de bordes opuestos + 1 línea central** en el lado largo (geométricamente equivalente a "muro recto con línea al medio"). Esta regla aplica igual sin importar cómo llegue el símbolo como objeto de datos — en un caso real de Colab (PdV Nivel 1, 2026-08-09) llegó como un rectángulo cerrado (`'qu'`) + 1 línea central (`'l'`), pero eso es solo un detalle de cómo lo exportó ESE PDF puntual, no una variante de la regla; otro CAD podría exportarlo como 2 líneas rectas sueltas. Implicancia de pipeline: `extraer_datos_vectoriales` hoy solo mete operaciones `'l'` a `segmentos_l`; los `'qu'`/`'re'` van a `otros_items`, un balde que nunca se evalúa — un clasificador de ventanas necesita procesar también `otros_items` (rectángulos), no solo líneas.
- Confirmado en: PDV, Beauchef (parcial), Isla de Pascua (0 detectadas). Ventanas altas/claraboyas (Beauchef) no siguen el patrón en planta porque están sobre el nivel de corte — punto ciego adicional.
- **🗑️ Eliminada 2026-08-24: "Ventanales en escuadra"** como tipología aparte, a pedido del usuario.
- **🆕 Regla definitiva de independencia entre ventanas (usuario, 2026-08-24, reemplaza "fila de ventanas repetidas" como tipología aparte)**: dos ventanas **siempre se tratan de forma independiente**, sin validar dimensión/tolerancia entre ellas — sin importar si están separadas por muro/pilar/parteluz, si están una justo al lado de la otra sin nada entre medio, en línea recta o en ángulo, o si tienen largos distintos. No es necesario que exista un elemento separador para que dos ventanas sean independientes.
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/ventanas/` — `1 ventana.jpg` (una ventana entre 2 tramos de muro), `2 ventanas.jpg` (dos ventanas apiladas en un muro vertical, el acotado entre ellas es la separación, no el ancho de una ventana), `2 ventanas separadas.jpg` (dos ventanas en un mismo muro horizontal, confirma el patrón de 3 líneas), `ventanales (2 hojas de ventana que abren hacia lados opuestos).jpg` (ventanal en esquina), `fila de ventanas repetidas en camarin.jpg` (serie de 4 ventanas chicas en un muro largo), `tabique de vidrio completo con puertas en ambos extremos (oficina agente).jpg` (partición vidriada, no vano puntual), `ventanas 0.8m en cocina-bodega con formas curvas junto a acceso.jpg` (refuerza el patrón de 3 líneas con dimensión real 0.8m; las formas curvas junto al acceso de "1.5" no están identificadas todavía — podrían ser puertas curvas, sin confirmar).

### Escaleras
- **Sin convención única confirmada todavía**: (1) **peldaños rectos paralelos** — líneas o rectángulos angostos en paralelo, a veces numerados (1, 2, 3...9, 10) — fusiona lo que antes se documentó como "Estilo 1" y "Estilo 3" por separado (misma forma geométrica, la numeración es incidental, no un estilo distinto — **a confirmar con el arquitecto si hay un caso real donde sí sean formas distintas**). (2) **🆕 Caracol (usuario, 2026-08-24)**: escalones triangulares proyectados como un círculo, con uno de los extremos de cada escalón encontrándose con los demás en un punto común. (3) **🆕 Mixta (usuario, 2026-08-24)**: peldaños paralelos rectos (como el estilo recto) que se conectan con un tramo circular tipo Caracol, pero sin formar un círculo completo.
- **🗑️ Eliminada 2026-08-24: "líneas anidadas en L"** como tipología aparte, a pedido del usuario.
- **🆕 Regla de consistencia entre plantas (usuario, 2026-08-24)**: la misma estructura de una escalera debe aparecer en las plantas sucesivas (por pares de plantas) — sirve como verificación cruzada. Una planta puede tener más de una escalera.
- **Regla dura del usuario (2026-08-02): ante la duda de si algo es una escalera, SIEMPRE preguntar, nunca asumir** — mismo principio ya establecido en la sección C de este documento, extendido explícitamente a escaleras.

### Rampas
- **Sin convención de símbolo formal todavía — un solo ejemplo visto hasta ahora (2026-08-02)**: rectángulo con líneas diagonales que convergen hacia un punto central (indicando sentido/dirección de la pendiente), acompañado de texto aparte con el % de pendiente y la fórmula de cálculo. Antes del pipeline solo se detectaba por el texto "Pendiente NN%" cercano, no por símbolo gráfico — este es el primer acercamiento a un símbolo propio.
- **🆕 "Pavimento Podotáctil" (marcas de accesibilidad cerca de la rampa) se ignora — no es parte del elemento rampa ni debe marcarse (usuario, 2026-08-02).**
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/rampas/Escalinatas de aceso + rampa.jpg`.

---

## B. Líneas/textos/símbolos que NUNCA son elementos/espacios (jamás dividen ni limitan un recinto)

### Líneas discontinuas (ejes, cortes, proyecciones de viga — no un significado único)
- **Convención**: líneas discontinuas (guion-guion o guion-punto-guion). Pueden representar cosas distintas según el plano: grilla de ejes estructurales (terminada en círculo con número 1,2,3... o letra A,B,C...), líneas de corte (A-A, B-B), o **proyección de una viga en planta** (ejemplo confirmado, PDV Nivel 1, 2026-07-31 — dos líneas discontinuas paralelas cruzando Cocina/Bodega, que en este caso son la proyección de una viga, no un eje numerado).
- **Regla dura, no depende de cuál sea el significado específico**: NINGUNA línea discontinua es geometría real del edificio. Nunca dividen ni limitan un espacio — afecta tanto el conteo de recintos como sus áreas si se tratan como muro. **No hardcodear un solo significado** (ej. "línea discontinua = eje numerado") — la regla dura aplica igual sea eje, corte, o proyección de viga; lo que importa es que es una línea de referencia, no un muro.
- **Uso positivo (no descartar el dato, cuando sea una grilla de ejes)**: sirven como referencia de ubicación de un elemento dentro de la planta (ej. "Baño Accesible Universal está entre los ejes B2 y C3", como una coordenada de grilla) — se deben extraer y conservar como dato propio, no solo borrarse.
- Confirmado en: Isla de Pascua (causa raíz de la falla catastrófica de segmentación, 2026-07-31, grilla de ejes numerados) y PDV Nivel 1 (2026-07-31, proyección de viga). Fix de detección implementado en Celda 4 ("Paso 1.5", notebook `31jul_0130`) — reusa la detección de patrón de guiones ya existente (geométrica, no depende de saber el significado semántico de la línea), corriéndola antes de la protección de muro por conectividad.
- **🆕 Incluir también líneas con puntos intermedios (usuario, 2026-08-24)**: la detección de discontinuidad debe cubrir tanto el patrón guion-guion como guion-punto-guion — no limitarse a un solo patrón de guion.

### Cotas
- **Convención**: líneas delgadas (sólidas, no discontinuas) marcadas con una figura de "testigo" en cada punto de medición — típicamente un tique/trazo diagonal corto cruzando la línea (ver captura de referencia, Screenshot_340).
- **🆕 La marca también puede ser 2 diagonales cruzadas en forma de X (usuario, 2026-08-24)**: no solo la combinación perpendicular+diagonal ya documentada (regla v2, 2026-08-09) — ampliar el criterio geométrico para cubrir ambas variantes.
- **Regla dura**: igual que los ejes, nunca son geometría real, nunca dividen ni limitan un espacio.
- Confirmado en: Isla de Pascua, PDV, Beauchef (las 4 cadenas de acotación en los bordes de cada lámina).
- **Estado del fix: pendiente.** A diferencia de los ejes, las cotas son líneas sólidas — no las detecta el mecanismo de patrón de guiones. Candidato de diseño: identificar un segmento recto colineal y pegado a una secuencia regular de `cotas_texto` (los números de la cadena de acotación, ya extraídos con precisión) como parte de una cota. No implementado, requiere su propio diagnóstico antes de codificarse.

### Rasantes
- **Convención**: texto/cotas de nivel de terreno o pendiente, en cortes o plano de emplazamiento (ej. "RASANTE +2.50", "NT +0.15").
- **🆕 Trae además una línea discontinua asociada que también debe ignorarse (usuario, 2026-08-24)**: la rasante no es solo texto — el trazo discontinuo que la acompaña se excluye con el mismo criterio que ejes/cortes, **cubriendo ambos patrones por igual: guion-guion y guion-punto-guion**.
- **Regla dura**: nunca representa un espacio habitable — no debe interpretarse como nombre de recinto.
- Confirmado en: mencionado por el usuario 2026-07-31 (sin caso puntual documentado todavía en un plano de prueba).
- **Estado del fix: ✅ implementado** (2026-07-31, notebook `31jul_0230`) — instrucción agregada al prompt semántico de Claude Vision (Celda 4) para que nunca use texto de rasante como `nombre`/`etiqueta_en_plano` de un recinto.

### "CORTE A" / líneas de corte
- **Convención**: línea discontinua, **🆕 cubriendo ambos patrones por igual: guion-guion Y guion-punto-guion (usuario, 2026-08-24)** — no uno solo, símbolo círculo+triángulo en los extremos.
- **Regla dura permanente (usuario, 2026-08-20; generalizada 2026-08-24): SIEMPRE excluir del conteo de muros, sin importar el rótulo puntual** — "CORTE A" es un ejemplo, la regla aplica a cualquier símbolo de corte/rasante.
- Confirmado en: Beauchef (Acceso, Kiosco, Camarines).

### Artefactos y mobiliario (lavaplatos, WC, muebles, etc.)
- **Convención**: íconos de artefactos sanitarios (WC, lavamanos, lavaplatos, tinas, urinarios) y mobiliario (muebles de cocina, repisas, mesones) dibujados dentro de un recinto real.
- **Regla dura (usuario, 2026-07-31, confirmado con ejemplo PDV Nivel 1 — ícono de lavaplatos en Bodega): TODOS se excluyen del cálculo de superficies.** No importa el tipo específico de artefacto o mueble — ninguno debe limitar, dividir, ni restar/sumar al área de un recinto. Generaliza (y reemplaza como regla dura, ya no como sospecha) el hallazgo de mobiliario de línea repetitiva de Beauchef (duchas, casilleros) — no es solo ese caso puntual, es la categoría completa de artefactos/mobiliario.
- Distinto de muros/puertas/ventanas (sección A): un artefacto está DENTRO de un recinto, nunca define su límite — aunque geométricamente tenga líneas rectas que OpenCV podría confundir con muro.
- Confirmado en: PDV Nivel 1 (lavaplatos en Bodega). Mismo principio ya evidenciado (sin nombrarlo como regla general hasta ahora) en Beauchef (duchas, casilleros, 2026-07-30).
- **Estado del fix: pendiente.** Sigue sin implementarse un mecanismo que excluya estos íconos del raster de detección de muros — mismo pendiente ya anotado para mobiliario de línea repetitiva, ahora con alcance confirmado más amplio (cualquier artefacto/mueble, no solo los de línea repetitiva).
- **🆕 Más ejemplos confirmados (usuario, 2026-08-02), misma regla dura de arriba, sin cambios**: equipo/maquinaria (2 símbolos cuadrados en una sala "Grupo Electrógeno"), elementos de paisajismo/decoración (símbolo de planta/flores), y baterías de artefactos sanitarios (fila de lavamanos, cubículos de WC en un baño público) — todos son "elementos aislados" que hay que reconocer como mobiliario/equipo, no confundir con puerta/ventana/muro. Ejemplos guardados en `Fase 2/Convenciones_CAD_Ejemplos/elementos_aislados/` (`Elementos aislados 1.jpg`, `2.jpg`, `3.jpg`).

### Nombres de recinto (para contraste — si NO son ninguno de los anteriores)
- Texto simple ubicado dentro o cerca del área de un recinto, que no es cota ni rasante — este SÍ se usa para el emparejamiento nombre↔forma (con los problemas de matching ya documentados en el roadmap, ver Beauchef "Taller"/"Casino" e Isla de Pascua "Recepción").
- Ya excluido correctamente del raster de detección de muros desde 2026-07-23 (`cotas_texto` pinta de blanco todo el texto, incluidos los nombres, antes de `adaptiveThreshold`) — este mecanismo sigue vigente sin cambios.

---

## C. Casos que siempre requieren preguntar al arquitecto (nunca asumir)

Extensión directa de la lección de proceso "preguntar, no asertar" — casos donde el pipeline/yo no debemos clasificar solos, sino marcar como pregunta para el arquitecto vía la interfaz de chat (ver roadmap, "Redefinición del producto").

### Pasillo sin nombre
- **Regla (usuario, 2026-07-31)**: cualquier recinto que geométricamente parezca un pasillo/circulación (forma alargada y angosta) pero que NO tenga un nombre/etiqueta en el plano — nunca asumir que es circulación. Preguntar al arquitecto qué es realmente.
- Por qué importa: un pasillo mal asumido puede ocultar un recinto real mal segmentado (mismo patrón que el caso "Escalera" de Beauchef, que en realidad era Asientos Duchas) o, al revés, un espacio que sí es circulación pero con una forma atípica podría rechazarse por error.
- Confirmado en: instrucción general del usuario, sin caso puntual de plano todavía.

### Mobiliario de línea repetitiva causando recintos fantasma
- La regla dura ya quedó confirmada en la sección B ("Artefactos y mobiliario") — nunca contaminan superficie. Lo que sigue sin resolver es la DETECCIÓN: mientras no exista el fix técnico, cualquier fragmentación sospechosa de un recinto (duchas, casilleros, estanterías u otro mobiliario de línea repetitiva) se pregunta al arquitecto en vez de intentar adivinar con un detector por tipo de mueble.

---

## D. Tabla maestra de tipologías — primera versión completa (2026-08-24, construida en retrospectiva sobre todo el roadmap, para revisión)

**Qué es esto y qué no es**: primera pasada exhaustiva releyendo todo `Roadmap_Revision_Dossier_ArchiCheck.md` para consolidar en un solo lugar, por elemento, cada tipología/variante/regla/tolerancia ya confirmada — implementa los puntos 2 y 3 de la sección 0. Es un **borrador para que el usuario lo revise**, no una relectura infalible garantizada completa al 100% — puede faltar algo o tener un matiz mal resumido; se corrige lo que el usuario señale, igual que el resto de este documento.

### D.1 Muros

| Tipología/variante | Criterio distintivo | Tolerancia/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| Muro simple | 2 trazos paralelos formando contorno cerrado; distancia entre trazos = espesor | — | Con hoja de puerta doble línea: muro = gruesa y más separada; hoja = tenue y más cercana | 2026-07-31/08-02 |
| 🆕 Línea única (sin borde paralelo consistente) | Una sola línea, sin trazo paralelo enfrentado | — | **SIEMPRE se ignora, sin excepción** — corregido 24-ago: no aplica ninguna excepción de deslinde aquí (si el deslinde tuviera par paralelo, ya no sería "línea única", pasaría al caso general de muro) | 🆕 2026-08-24 |
| Muro con achurado de color (estado de obra) | Color de achurado sobre **borde Y relleno** del tramo — significado NUNCA universal, se confirma contra la leyenda de CADA plano puntual | — | Ver D.7 (sinónimos de estado) | 2026-07-31/08-02, reafirmado 08-04 y 🆕 24-ago (aplica también al relleno, no solo el borde) |
| Muro corto aislado | Tramo corto sin conexión larga | — | Caso real válido, no descartar automáticamente como ruido — **🆕 igual debe pasar el test de cuerpo cerrado**, no queda exento por ser corto | 2026-08-02, precisado 🆕 24-ago |
| Muro atravesado por eje | Un eje (línea de referencia, se ignora aparte) pasa literalmente por encima del muro | — | Sigue siendo muro real pese a la superposición | 2026-08-02 |
| Pilar (caso degenerado de muro) | Proporción ancho ≈ largo ≈ espesor típico | — | **🆕 Filtro confirmado**: una ventana (par de bordes paralelos + línea central, ver D.3) NUNCA entra como candidato a muro — resuelve parte del problema de clasificación *upstream* ya identificado. **⚠️ Esta firma es ESPECÍFICA de ventana, no se generaliza a otros elementos no-estructurales** (corrección explícita del arquitecto en la revisión visual de N2, misma fecha): un vano/hoja de puerta, por ejemplo, no debería tener más de 2 líneas, pero puede ser válido con solo 1 — firma distinta, no la misma regla estirada. Cada tipo de elemento no-estructural necesita su propia firma geométrica nombrada | 2026-08-20, filtro + advertencia 🆕 24-ago |
| 🔴→✅ Encuentro de brazos — cruce, empalme y esquina son LA MISMA tipología (construcción topológica única) | Cualquier red conectada de brazos con bordes paralelos que, en conjunto, cierra como cuerpo sólido ("cuerpo cerrado") — sin importar cuántos brazos, en qué ángulo se encuentran (no necesariamente recto), ni si tienen anchos distintos entre sí. Una de las 2 caras puede interrumpirse internamente en el punto de conexión — es NORMAL, no evidencia de muros distintos | Fusión: `max(10% del ancho local del muro, piso ~2px)` | **Corrección de una corrección, misma sesión 24-ago**: se había concluido que "esquina ≠ empalme/cruce" (3 tipologías distintas) — el usuario aclaró que es incorrecto: **son la misma tipología**, la lógica de cierre debe soportar siempre anchos y ángulos distintos entre brazos, no como caso especial. El polígono de cierre real (de cada brazo, tomar sus 2 caras, ordenar angularmente, rellenar) es el mecanismo único que implementa esto, aplica igual a curvas (sin ingerir Bézier) | 2026-08-20/23 (implementación), unificación 🆕 24-ago tras una corrección intermedia que quedó revertida el mismo día |
| "CORTE A" / cualquier corte / rasante | Línea guión-punto **🆕 o guion-guion**, símbolo círculo+triángulo en los extremos | — | **Regla dura permanente: SIEMPRE excluir**, no solo cuando hay contaminación evidente. 🆕 Generaliza a cualquier símbolo de corte, no solo el rótulo "CORTE A" puntual | 2026-08-20, generalizado 🆕 24-ago |
| Fusión bloqueada por puerta | Punto de contacto entre 2 candidatos a muro cae cerca de una puerta | — | 🆕 **Regla simplificada 24-ago**: solo bloquea la fusión cuando se identifica una puerta **con certeza** — una detección incierta/tentativa no debe bloquear | 2026-08-20, simplificado 🆕 24-ago |
| Todas las tolerancias de muro | — | **Siempre en metros reales** (`_M`, convertidas por página vía `mpx`), nunca en píxeles fijos — no generaliza entre planos de distinta escala/resolución | 2026-08-20 (13 constantes auditadas y convertidas) |

### D.2 Puertas

| Tipología/variante | Criterio distintivo | Tolerancia/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| Vano con hoja cerrada | Línea(s) delgada(s) plana(s), dentro del plano del vano | — | 🆕 A cada lado del vano puede haber muro corto, muro largo, **o un pilar** — no asumir siempre "muro corto" | 2026-08-02, precisado 🆕 24-ago |
| Vano con hoja abierta | Rectángulo sólido girado, parado sobre el arco en posición abierta | — | 🆕 El ángulo NO tiene que ser cercano a 90° — lo central es que el radio calce con la hoja/vano dentro de tolerancia (ver fila de tolerancia radio↔vano) | 2026-08-02, corregido 🆕 24-ago |
| Vano SIN hoja dibujada, solo arco | El arco define posición y dirección — **🆕 el gozne se ubica opuesto al arco** | — | **Nunca aceptar una puerta sin gozne confirmado** sobre geometría real | 2026-08-19, precisado 🆕 24-ago |
| 🆕 Puerta sin gozne ni arco (ninguno de los dos existe) | No hay arco en absoluto (distinto de "hoja obstruida", ver más abajo) | — | Se marca igual como puerta, **sin gozne ni arco** — ninguno de los dos campos se fabrica | 🆕 2026-08-24, precisado para cuadrar con la fila anterior |
| Puerta doble | Vano único, 2 hojas independientes, cada una con su propio arco (pueden cruzarse/superponerse en el centro) | Radio de cada hoja: no necesariamente mitad exacta del vano salvo que se confirme — en el caso validado (Coc-izq/Coc-der) sí resultó ser la mitad exacta | 🔴 **Corrección 24-ago**: el gozne al CENTRO solo es válido si los arcos están efectivamente marcados/dibujados — sin esa evidencia, cada hoja va con gozne en su extremo exterior | 2026-08-02, radio confirmado 2026-08-19, corregido 🆕 24-ago |
| Arco discontinuo | Línea discontinua — **EXCEPCIÓN** a la regla general "discontinuo = ignorar" (sección D.6/B): sigue siendo arco válido, el estilo de línea no clasifica ni descarta | — | 🆕 Se pinta de un extremo a otro considerando todos los segmentos — no debe tener cambio de radio en todo el ángulo del vano | 2026-08-02, precisado 🆕 24-ago |
| **Gozne (bisagra) — regla definitiva** | 🔴 **Corregida y simplificada 24-ago**: el gozne va **opuesto al arco** — geométricamente, es el centro del círculo cuyo segmento dibuja el arco (mismo punto que da el ajuste de círculo por mínimos cuadrados) | — | El hallazgo del 19-ago ("segundo par de líneas más angosto dentro del muro") queda como **pista visual** para encontrar ese centro en un estilo de dibujo puntual — no reemplaza este principio geométrico general | 19-ago (hallazgo visual), regla general 🆕 24-ago |
| Gozne cuando la hoja NO está dibujada pero SÍ hay arco (obstruida por mobiliario u otro elemento) | 🔴 **Simplificado 24-ago**: va en el centro del segmento de círculo al que corresponde el arco (misma regla general de arriba) | — | Distinto de "sin arco" (fila de arriba) — aquí el arco sí existe | 2026-08-19, simplificado 🆕 24-ago |
| **Radio del arco ↔ ancho de vano** | Debe calzar con la cota impresa del vano | **Tolerancia máxima: 10%**, como parámetro configurable | — | 🆕 2026-08-24, valor ajustado tras revisión |
| **Constancia del radio a lo largo del arco** | El trazo debe ser efectivamente circular (ajuste de círculo con residuo bajo) | **Tolerancia máxima: 10%** de variación del radio en toda la extensión, como parámetro configurable | Si supera el margen, no aceptar como puerta válida sin revisión — señal de detección errónea | 🆕 2026-08-24, valor ajustado tras revisión |
| **Verificación obligatoria contra arco de referencia** | Todo arco debe calzar visualmente exacto contra el arco ya impreso en el plano (color varía: gris / rosa-salmón / rojo saturado — muestrear antes de asumir) | RMS < 1px sobre ≥50 puntos = confirmación fuerte; RMS alto = casi siempre contaminación | Un ajuste de círculo con residuo bajo **no es prueba suficiente por sí sola** — sigue haciendo falta el cruce visual contra el arco real. Implica que el gozne se dibuja siempre en el centro del segmento de círculo del arco | 2026-08-19 (regla permanente, tras 3 cierres prematuros el mismo día) |
| Capturas marcadas por el arquitecto | Referencia aproximada de DÓNDE mirar | — | Nunca una medida literal a calcar — el elemento se construye aplicando las reglas ya definidas | 2026-08-19 |

### D.3 Ventanas

| Tipología/variante | Criterio distintivo | Tolerancia/valor | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|---|
| Ventana simple | 🔴 **Definición corregida 24-ago, siempre la misma sin importar el objeto de origen**: par de bordes **opuestos** + 1 línea central en el lado largo — geométricamente igual a "muro recto con línea al medio". La nota de que llegó como objeto `'qu'`+`'l'` en un PDF puntual (Colab, 09-ago) es solo un detalle de extracción, no una variante de la regla | — | 🗑️ *(eliminado a pedido del usuario, 24-ago)* | Definición 🆕 24-ago |
| 🆕 Independencia entre ventanas — regla definitiva (reemplaza "fila de ventanas repetidas" y "tabique de vidrio" como tipologías aparte) | Dos ventanas cualesquiera | — | **Siempre se tratan de forma independiente, sin validar dimensión/tolerancia entre ellas** — no importa si están separadas por muro/pilar/parteluz, si están adyacentes sin nada entre medio, en línea recta o en ángulo, ni si tienen largos distintos. No requiere que exista un separador | 🆕 2026-08-24 |

### D.4 Escaleras

| Tipología/variante | Criterio distintivo | Fuente |
|---|---|---|
| Peldaños rectos paralelos | Líneas o rectángulos angostos en paralelo, a veces numerados (1,2,3...9,10) — 🆕 fusiona lo que antes eran "Estilo 1" y "Estilo 3" (misma forma, numeración incidental) | 2026-08-02, fusionado 🆕 24-ago (a confirmar si hay caso real donde sí sean distintos) |
| 🆕 Caracol | Escalones triangulares proyectados como un círculo, un extremo de cada escalón se encuentra con los demás en un punto común | 🆕 2026-08-24 |
| 🆕 Mixta | Peldaños rectos (como el estilo recto) que se conectan a un tramo circular tipo Caracol, sin formar un círculo completo | 🆕 2026-08-24 |

**🆕 Regla de consistencia entre plantas (24-ago)**: la misma estructura de una escalera debe aparecer en las plantas sucesivas (por pares) — verificación cruzada, aplica a las 3 variantes. Una planta puede tener más de una escalera.

**Sin convención dominante identificada** — regla dura: ante la duda, SIEMPRE preguntar al arquitecto, nunca asumir. Ninguno de los 3 proyectos analizados tiene capa OCG "Escalera" separada.

### D.5 Rampas

| Tipología/variante | Criterio distintivo | Fuente |
|---|---|---|
| Símbolo de pendiente (único visto hasta ahora) | Rectángulo con líneas diagonales convergiendo a un punto central (sentido de la pendiente) + texto aparte (% pendiente, fórmula) | 2026-08-02 |
| Pavimento podotáctil (marca de accesibilidad cerca de la rampa) | **Se ignora** — no es parte del elemento rampa | 2026-08-02 |

Un solo ejemplo visto — falta contrastar con más planos antes de dar el símbolo por representativo.

### D.6 Elementos que NUNCA son geometría del edificio (ruido a excluir, mismo estatus de tipología que un elemento real)

| Tipología | Criterio distintivo | Conflicto conocido ↔ resolución | Fuente |
|---|---|---|---|
| Eje / línea de referencia | Discontinua — **regla v2**: mínimo 2 huecos consistentes entre sí (3 segmentos), 🆕 incluye variante con puntos intermedios (guion-punto-guion), no solo guion-guion | v1 (sin mínimo) generaba falso positivo con muro real de esquina en L con 1 solo corte incidental | 2026-08-09 (v2), ampliado 🆕 24-ago |
| Cota | Geometría de "cruz" real: marca perpendicular + diagonal que se tocan casi en el mismo punto, **🆕 o 2 diagonales cruzadas en forma de X** | v1 (marca perpendicular y diagonal sueltas cerca) generaba falso positivo con muro real cercano a una cota vecina no relacionada | 2026-08-09 (v2), ampliado 🆕 24-ago |
| Rasante | Texto/cota de nivel de terreno o pendiente. 🆕 Trae además una línea discontinua asociada que también debe ignorarse — **cubre ambos patrones por igual, guion-guion y guion-punto-guion** | Nunca se interpreta como nombre de recinto | 2026-07-31, ampliado 🆕 24-ago |
| Corte/rasante ("CORTE A" o cualquier corte) | Línea discontinua — **🆕 cubre ambos patrones por igual: guion-guion Y guion-punto-guion**, no uno solo — + símbolo círculo+triángulo en extremos | **Regla dura permanente: siempre excluir del conteo de muros**, no solo ante contaminación evidente. 🆕 Generaliza a cualquier corte, no solo "CORTE A" | 2026-08-20, generalizado 🆕 24-ago |
| Artefactos y mobiliario | Cualquier ícono sanitario/mueble/equipo/paisajismo dentro de un recinto | **Todos excluidos de superficie sin excepción** por tipo — está DENTRO de un recinto, nunca define su límite | 2026-07-31, ampliado 2026-08-02 |
| Nombres de recinto | Texto que no es cota ni rasante | Ya excluido del raster desde 2026-07-23; se usa para emparejamiento nombre↔forma | 2026-07-23 |

### D.7 Estado de obra — sinónimos de tipología (generalización 2026-08-24)

Toda tipología de elemento puede tener, además, un **estado de obra** independiente del tipo de elemento — y ese estado puede nombrarse con distintas palabras según la oficina de origen del plano:

| Estado | Sinónimos observados/posibles | Significado |
|---|---|---|
| Nuevo / agregado | "nuevo", "se agrega", "se construye" | Elemento que NO estaba antes, aparece en la planta nueva |
| Eliminado / demolido | "se demuele", "se elimina", **"se retira"**, u otros equivalentes | Elemento que SÍ estaba antes, ya no aparece en la planta nueva |
| Existente (sin cambio) | "existente", "se mantiene" | Sin cambio entre estado anterior y nuevo |

**Regla**: reconocer estos términos como la MISMA tipología de estado aunque el texto difiera entre oficinas — no tratarlos como estados distintos solo porque la palabra cambia. Ya confirmado puntualmente para color de achurado de muros (rojo/amarillo/negro en PdV — ver D.1); esta tabla generaliza el concepto a cualquier elemento con estado de obra, no solo muros.

**🆕 Regla operacional (usuario, revisión visual N2, 2026-08-24)**: cuando la leyenda dice "Se retira" (o cualquier sinónimo de eliminado/demolido), el elemento debe **tratarse como ausente en el estado final del plano** — no basta con etiquetarlo con un campo `estado` y seguir extrayéndolo como geometría activa. Pendiente del lado técnico: la detección de leyenda (`_detectar_leyenda_simbologia`) sigue rota (exige relleno sólido, los swatches reales son contorno + achurado sin relleno) y la leyenda puede aparecer 2 veces en páginas distintas del mismo plano — hay que consolidarlas, no quedarse con la primera.

### D.8 Capas nativas OCG del PDF (`MAPEO_CAPAS`) — taxonomía completa

**Regla de fondo, la más importante de esta sección**: cuando el PDF trae capas OCG nativas, **la capa manda como señal primaria** (0% de precisión confirmado de la heurística geométrica de ejes/cotas contra la capa real de PdV); la heurística geométrica queda como *fallback* **solo cuando no hay capa mapeada para esa categoría** — nunca correr ambas en paralelo cuando existe capa. Los nombres de capa **no son estándar entre oficinas** (`Muros` en PdV vs. `MUROS` en Beauchef; `Ptas Ventanas` combinada en PdV vs. separadas en Beauchef/Campo Lindo) — el mapeo se confirma por proyecto, nunca se adivina por keyword. `dashes` nativos del PDF son una señal adicional posible pero no universal (depende del driver de exportación de CAD — confirmado 0/3021 segmentos en PdV porque el driver de AutoCAD usado "quema" el patrón al exportar).

| Categoría | Equivalente AIA CAD Layer Guidelines | Estado de uso hoy | Ejemplo de nombre real |
|---|---|---|---|
| `muro` | — | Solo diagnóstico, no restrictivo todavía | `Muros` (PdV) / `MUROS` (Beauchef) |
| `eje` | `GRID` | Aditiva (OR) — nunca quita protección a algo ya identificado como real por geometría | `Ejes` (solo PdV tiene) |
| `cota` | — | Aditiva (OR) | `Cotas` (solo PdV) |
| `mobiliario` | — | **Restrictiva** (excluye directamente) | `Muebles`, `ARTEFACTOS` |
| `ignorar` | — | **Restrictiva** (excluye) | `Muros Proy`, `Proyecciones`, `Formato`, capa por defecto `0` |
| `puerta` / `ventana` | — | Solo diagnóstico — separadas cuando el PDF lo permite | `Ptas Ventanas` (combinada, mapea a ambas en PdV) |
| `accesibilidad` | — | "Se debe considerar" (sin lógica propia todavía) | Beauchef (mezcla rampas+ascensores) |
| `ascensor` | `EVTR` | Pendiente | — |
| `rampa` | — | Pendiente (separada de `accesibilidad` si el proyecto distingue) | — |
| `escalera` | `STRS` | Pendiente — ningún proyecto tiene capa separada | — |
| `columna` | `COLS` | Pendiente (fuente de confusión típica con muro) | — |
| `achurado` | `HTCH` | Pendiente (Beauchef tiene `HATCH` real, candidato a reforzar filtro de color) | — |
| `formato` | `TTLB` | Pendiente (candidato a excluir cajetín/marco más confiable que por geometría) | — |
| `corte_elevacion` | — | Pendiente — ojo: en Beauchef es solo el símbolo/marcador, no el contenido real de la lámina | — |
| `deslinde_terreno` | — | Pendiente (candidato a reemplazar el detector geométrico de "línea de referencia periódica") | — |
| `superficies` | — | "Se debe validar contra la tabla" — no implementado | — |
| Niveles, pavimentos/suelos/techos, iluminación, cubiertas, hatch, ball, textos | — | **Sin decisión** — quedan documentadas, a la espera de que el equipo de arquitectos del usuario defina si vale la pena aislarlas | — |

### D.9 Conexión formal: duda de tipología ↔ interfaz de dudas del portal (2026-08-24)

Cuando el pipeline tiene una duda real clasificando un elemento — no logra decidir con confianza a qué tipología pertenece, o dos tipologías compiten por el mismo trazo (D.1-D.6 arriba) — esa duda **se levanta como pregunta puntual en uno de los pasos de la interfaz de dudas del portal** (`TablaDudas`/`calcularDudas`, ver `project_archicheck_webapp` en memoria), no se resuelve en silencio ni se le pregunta "en general" al arquitecto. La respuesta cierra el ciclo: duda → pregunta en el portal → respuesta del arquitecto → caso confirmado persistente (sección 0, punto 1) → si corresponde, refina o crea una fila nueva en esta tabla (sección 0, punto 2). Ver también el registro correspondiente en el roadmap.

### D.10 Cálculo de superficies — qué cuenta como separador y qué cuenta como área (2026-08-24)

| Elemento | Rol en el cálculo de superficies |
|---|---|
| Muros, ventanas, puertas, vanos | **Únicos que actúan como separadores/límites** de recinto |
| Escaleras | **NO cuentan como superficie** — no aportan área de recinto |
| Rampas | **SÍ cuentan como espacio** (aportan área), a diferencia de escaleras |

### D.11 Ensamble semántico multi-modelo (decisión de arquitectura, 2026-08-24, pendiente de implementar)

**Objetivo**: fortalecer el mecanismo de D.9 (duda → interfaz de dudas del portal) con una señal más objetiva que la confianza de un solo modelo — **el desacuerdo entre 2+ modelos independientes al clasificar el mismo elemento se trata como duda real**, se levanta en `TablaDudas` igual que cualquier otra duda, no se resuelve en silencio eligiendo un modelo sobre otro.

**Alcance — solo capa semántica, nunca la geometría determinista**: el ensamble evalúa clasificación/nombre/tipología de elementos ambiguos (misma capa que ya hace Claude Vision hoy) — **nunca** reemplaza ni compite con `muros_geo`/`puertas_geo`/cuerpo cerrado, que siguen siendo 100% deterministas. Esto es consistente con la arquitectura ya validada por la revisión de estado del arte (sección de más abajo del roadmap): los VLM generalistas rinden mal en geometría precisa, bien en semántica.

**Decisión de composición (2026-08-24)**: empezar con **Claude + GPT-4o** (2 modelos) — no más por ahora. Precedente real: Fase 1 del proyecto ya corrió Claude Sonnet 4.6 + GPT-4o en paralelo (ver `project_archicheck_webapp` en memoria) — no es territorio nuevo, es retomar y formalizar algo que ya se hizo. Con 2 modelos el mecanismo es simple: acuerdo = confirmado, desacuerdo = duda.

**Análisis de candidatos considerados** (mismo criterio que los benchmarks de extracción geométrica: registrar qué se evaluó y por qué, no solo la conclusión):

| Candidato | Veredicto | Por qué |
|---|---|---|
| **GPT-4o** | ✅ Elegido, primer par junto a Claude | Visión probada y comparable, linaje de entrenamiento distinto (discrepancia = señal real), API REST simple de sumar al Worker existente, ya usado en Fase 1 |
| **Gemini** (2.5 Pro o similar) | 🔲 Paso 2, futuro — no para el lanzamiento inicial | Visión probada (aparece en benchmark propio vía AECV-Bench), linaje distinto a Claude/GPT — aportaría diversidad real si se pasa a votación de mayoría (2 de 3), pero no es necesario para validar el mecanismo con 2 |
| **DeepSeek** | ❌ No aplica a este rol (ensamble semántico/visión) — **✅ rol activado por separado, ver abajo** | Sin evidencia (ni en literatura revisada ni en benchmark propio) de capacidad de lectura de planos/símbolos CAD — no asumido sin verificar. Su fortaleza real (razonamiento de texto, código, costo bajísimo) sí encaja como revisor de código — ver "Revisión de código con DeepSeek" más abajo |
| **Perplexity** | ❌ No aplica | Motor de búsqueda con síntesis (RAG web), no clasificador de imágenes de propósito general — ya cumplió su rol real en el proyecto (investigación de estado del arte), no encaja en clasificación de elementos de plano |
| **Copilot** | ❌ No aplica | Interfaz sobre modelos de OpenAI (GPT-4/4o) — no es un modelo entrenado de forma independiente; sumarlo junto a GPT-4o no aporta diversidad real, y no tiene API pensada para integración automatizada servidor-a-servidor como sí tienen OpenAI/Google/Anthropic |

**🔴 CORRECCIÓN 2026-08-24 (misma tarde) — todo el párrafo de "Estado" de arriba y el diseño de mecanismo que se había registrado estaban basados en memoria desactualizada, no en el código real.** Al revisar `worker.js` y `App.jsx` directamente antes de empezar a implementar, se encontró que:

- **El Worker YA soporta GPT-4o** (`body.modelo === "gpt4o"`, proxea a `api.openai.com/v1/chat/completions` con `gpt-4o`, normaliza el SSE al mismo formato que Claude). No hay que construirlo.
- **`App.jsx` YA llama a Claude + GPT-4o en paralelo para CADA análisis completo** (Fase 1 y Fase 2, no solo casos dudosos) — es exactamente lo que este documento había registrado como "evolución futura, más cara, diferida", y ya está en producción.
- **Pero no hay detección de desacuerdo.** Existe `mergeResults(r1, r2)`: por cada sección se queda con el resultado del modelo que tenga **más filas/texto más largo** (proxy de "más completo", no de "más correcto"); las observaciones se deduplican por parecido de palabras (≥3 palabras significativas en común); arrays como `alertas_especiales`/`documentos_faltantes`/`pasos_siguientes` se unen sin duplicar. `estado_global` sí toma el más severo de los 2 (criterio de seguridad razonable). **Ninguna discrepancia real se muestra al arquitecto** — se resuelve en silencio eligiendo el resultado "más grande", justo lo que el objetivo permanente de aprendizaje dice que no debe pasar.

**Implicancia real**: la justificación original ("llamar a GPT-4o solo en casos dudosos para no duplicar costo") ya no aplica — el costo de la doble llamada ya se paga hoy, en cada análisis. El trabajo de mayor valor no es agregar una llamada nueva — es **agregar detección de desacuerdo sobre datos que ya existen** (`pC1`/`pG1`/`pC2`/`pG2` ya están en memoria al momento de mergear en `App.jsx`) y conectar eso a `TablaDudas`, en vez del flujo de llamadas acotado que se había diseñado (Worker sin tocar, sin llamadas nuevas).

**✅ IMPLEMENTADO (2026-08-24, misma tarde) — sin correr en producción todavía, sin probar en navegador con datos reales**: `mergeResults()` en `src/App.jsx` ahora usa `compararTablas()` (emparejamiento por nombre normalizado con fuzzy match, ningún modelo emite ID estructurado por fila) para las 4 tablas de Capa 2 (`recintos_superficies`, `circulaciones`, `iluminacion_ventilacion`, `normativa_urbanistica`) y para `recintos_por_nivel` (Capa 1) — reemplaza el "gana el más largo" de `mergeSection`. Cada fila emparejada con veredicto (`cumple`/`estado`) distinto, y cada fila detectada por un solo modelo, se acumula en `result.discrepancias_ensamble` — nunca se descarta información de ningún lado. Nueva sección en la pantalla de resultados ("DISCREPANCIAS ENTRE MODELOS") la muestra al arquitecto. Verificado con `npx vite build` (sin errores) — **no probado en vivo** (requiere análisis real con las API keys del Worker). Gemini como desempate (paso 2, cuando `discrepancias_ensamble` no está vacío) sigue sin implementar.

### Revisión de código con DeepSeek (decisión de arquitectura, 2026-08-26)

Rol distinto y separado del ensamble semántico de arriba — **no es sobre planos ni clasificación de elementos, es revisión de calidad de código**, la fortaleza real de DeepSeek (texto/razonamiento/código, no visión).

**Mecánica acordada con el usuario**:
1. **Disparo manual** — el usuario decide cuándo, no hay cadencia automática ni `/loop`.
2. **Archivos completos cada vez**, no diffs incrementales.
3. **Se filtra antes de mostrar** — mismo criterio que la revisión de literatura: no repetir un hallazgo solo porque un modelo lo dijo, solo se presenta lo que parezca un problema real tras verificarlo contra el código.

**Alcance — qué SÍ entra** (código en producción/vigente, no historial ni diagnóstico puntual):
- Frontend: `src/App.jsx`, `src/main.jsx`, `src/components/CropModal.jsx`, `src/components/SelectorComuna.jsx`, `src/normativa/estacionamientos.js`, `verificador.js` (+ su test)
- Worker (repo separado): `archicheck-worker/worker.js`, `reglas_aprendidas.js`
- Pipeline geométrico: `Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py`, `catalogo_tipologias.py` + sus tests (`test_cuerpo_cerrado.py`, `test_threshold_bajo.py`, `celda_test_cubicasa5k.py`)
- Notebook vigente: `Fase 2/Desarrollos/Test/ArchiCheck_Base <fecha más reciente>.ipynb`
- Indexación normativa: `normativa/indexar_normativa.mjs`, `extraer_ddu.mjs` y variantes por fuente

**Qué NO entra** (confirmado por auditoría real del repo, 2026-08-26 — no es una lista supuesta): ~100 notebooks históricos en `Versiones anteriores/`, ~60 scripts `_tmp_`/`_celda4_*` de diagnóstico puntual en `Herramientas_CubiCasa5k/`, ~25 scripts `_*` de extracción/depuración ya ejecutados una vez en `normativa/`, y la carpeta `Startup Chile/` (proyecto no relacionado).

**Estado**: mecanismo definido, **sin ejecutar todavía** — falta resolver cómo se invoca DeepSeek en la práctica (API key, integración) la primera vez que el usuario lo dispare.

---

## Pendiente de definir (el usuario irá indicando caso a caso)

- Escaleras: primeros ejemplos ya recopilados (ver sección A) — 3 estilos gráficos distintos vistos, sin convención dominante identificada todavía, sigue siendo "siempre preguntar" ante la duda.
- Rampas: primer ejemplo de símbolo gráfico ya recopilado (ver sección A) — un solo caso visto, falta contrastar con más planos antes de darlo por representativo.
- Mobiliario de línea repetitiva (duchas, casilleros, estanterías) — ya confirmado como categoría "artefactos y mobiliario" (sección B) que nunca contamina superficie; sigue sin convención de DETECCIÓN definida, sin fix implementado.
- Puertas: sin resolver todavía si "hoja abierta" o "hoja cerrada" es más común, o si depende de la oficina/software de origen — solo 2 ejemplos vistos hasta ahora, ambos en el mismo plano (PDV).
- Ventanales en escuadra: sin confirmar si existe o no un símbolo gráfico de apertura para ventanas operables — un solo ejemplo visto, sin arcos visibles.

## Repositorio de imágenes de referencia

Cada convención de arriba con ejemplo visual real queda guardada en `Fase 2/Convenciones_CAD_Ejemplos/`, organizada por carpeta (`puertas/`, `ventanas/`, `escaleras/`, `rampas/`, `muros/`, `elementos_aislados/`) — nombres de archivo descriptivos, copiados tal cual los compartió el usuario. Es la primera versión del "repositorio de muestras gráficas" mencionado en el roadmap (interfaz de administración — biblioteca de convenciones CAD, todavía sin construir como interfaz, hoy son solo archivos + este documento). Se sigue ampliando cada vez que el usuario comparte ejemplos nuevos.
- Cortes / elevaciones como figuras completas dentro de una lámina — sin convención de símbolo propia, se identifican hoy por posición/rótulo, no por geometría.
