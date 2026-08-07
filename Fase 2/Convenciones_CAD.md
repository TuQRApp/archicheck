# Biblioteca de Convenciones CAD — ArchiCheck

Registro vivo de cómo se dibuja cada elemento/espacio (y cada línea/texto que NO es un elemento) en los planos que hemos analizado. Se actualiza cada vez que el usuario define o corrige una convención — no se adivina ni se generaliza sin que el usuario lo confirme primero.

**Por qué existe este archivo separado del roadmap**: el roadmap registra decisiones e hitos del proyecto; esto es una referencia técnica de consulta rápida para el pipeline (Colab) y para mí, que crece con el tiempo y que eventualmente alimenta tanto el detector determinista de convenciones como los prompts de Claude Vision (mismo mecanismo que ya usa `reglas_aprendidas.js` para normativa, aplicado acá a símbolos gráficos).

**Regla de fondo**: cada convención puede variar entre oficinas de arquitectura / software de origen — nada de esta lista es universal por decreto. Cada entrada indica en qué proyecto(s) se confirmó. Si aparece un plano nuevo con una variante distinta, se agrega como variante nueva (no se asume que "está mal" el plano, ni se sobreescribe la convención anterior).

**Regla de fondo #2 (usuario, 2026-07-31): dentro de un mismo PDF, una convención confirmada aplica a TODAS sus páginas.** Distinto del punto anterior (que habla de variación ENTRE proyectos/oficinas): una vez que una convención se confirma en una página de un PDF puntual (ej. el significado de un achurado de color según la leyenda/simbología de ese expediente), esa misma definición se aplica automáticamente al resto de las láminas del mismo documento — no hay que re-derivarla página por página. Lo que sí varía entre PDFs distintos es el criterio de la Regla de fondo #1.

---

## A. Elementos/espacios reales (SÍ son geometría del edificio)

**Regla general (confirmada por el usuario, 2026-07-31): SOLO los elementos de esta sección A separan/limitan espacios.** Ningún elemento de la sección B (ejes, cotas, rasantes) lo hace nunca, sin excepción — ver regla dura en cada uno más abajo. Cualquier elemento nuevo que se agregue a esta sección A implica, por definición, que sí puede actuar como límite de recinto; cualquier cosa que se agregue a la sección B implica lo contrario.

### Muros
- **Convención general**: líneas continuas, casi siempre 2 trazos paralelos, formando un contorno cerrado — la distancia entre ambos trazos indica el grosor del muro.
- **Por confirmar con datos**: el dataset MLSTRUCT-FP (Pizarro) trae muros anotados de planos chilenos reales — sirve para validar/afinar esta convención con evidencia, no solo con lo observado a ojo en 3 planos.
- Confirmado en: PDV, Beauchef, Isla de Pascua (observación general, sin verificación formal todavía).
- **🆕 Muros nuevos marcados con achurado de color (usuario, 2026-07-31, ejemplo PDV Nivel 1; re-confirmado 2026-08-02)**: un achurado de color sobre un tramo de muro (ej. rojo = "se construye"/nuevo, amarillo = "se retira"/existente a eliminar, negro = existente que se mantiene, según la simbología propia de ese expediente) SÍ es geometría real — no es ruido a excluir, es un muro nuevo o a demoler. **Regla dura de proceso, reafirmada explícitamente por el usuario el 2026-08-02: este código de color NO es un estándar universal** — es la convención de ESTE plano puntual, puede haber otras en planos futuros que se irán confirmando caso a caso. El significado de cada color NUNCA se asume — siempre se confirma contra la leyenda/simbología de ESE plano puntual con el arquitecto. Una vez confirmado para un PDF, aplica a todas sus páginas (ver Regla de fondo #2 arriba).
- **🆕 Un muro puede ser un polígono complejo, no solo una franja recta (usuario, 2026-08-02)**: puede tener quiebres/escalones y cambiar de sección a media altura (ej. un tramo conectándose con otro marcado para eliminar). Esto confirma por qué un solo centroide nunca alcanza para representar un muro — se necesita una polilínea de varios puntos (ver herramienta "Muro" del portal, ya construida con este mismo criterio).
- **🆕 Muro corto aislado (usuario, 2026-08-02)**: un tramo de muro corto que no forma parte de una corrida larga conectada es un caso real y válido, no necesariamente un artefacto/ruido — coincide con el tipo de caso ya identificado como históricamente problemático para la detección automática (muros cortos en esquinas confundidos con otros trazos cortos).
- **🆕 Muros atravesados por ejes (usuario, 2026-08-02)**: caso real confirmado donde una línea de eje (ya sabíamos que se debe ignorar, ver sección B) cruza literalmente por ENCIMA de un tramo de muro real, no solo pasa cerca — el muro debe seguir reconociéndose como muro real pese a la superposición.
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/muros/` — `Muro complejo.jpg`, `Muros existentes, nuevos en rojo y eliminados en amarillo.jpg` (2 segmentos rojos de 1.22m y 1.44m), `muro corto aislado.jpg`, `muros atravesados por ejes.jpg`.

### Puertas
- **Convención general**: el espacio (vano) entre dos tramos de muro — generalmente se grafica con una línea (la hoja) con su medida de ancho acotada. A veces incluye el arco de giro (radio de apertura), a veces no se dibuja.
- Confirmado en: PDV, Beauchef, Isla de Pascua.
- Nota de pipeline: el emparejamiento hoja↔arco (por consistencia geométrica: radio del arco ≈ largo de la hoja) todavía no está implementado — hoy son dos trazos sueltos sin relación (ver roadmap P1, "leer elementos completos").
- **🆕 IMPORTANTE (usuario, 2026-07-31, ejemplo PDV Nivel 1): el arco de giro/apertura de la puerta, y la cota de ancho asociada, NUNCA deben contaminar el cálculo de área ni actuar como límite de recinto** — aunque el arco sea parte gráfica de un elemento real (la puerta), el trazo del arco en sí se comporta como una línea de referencia para efectos de segmentación, igual que un eje o una cota. No confundir con la existencia de la puerta como vano (que sí es real) — es específicamente el TRAZO del arco el que no debe limitar/dividir un espacio.
- **🆕 Cómo distinguir la hoja de un muro cuando ambos son doble línea (usuario, 2026-08-02)**: heurística general — los muros suelen dibujarse como doble línea **gruesa y más separada** (la separación indica el espesor real del muro); las hojas de puerta como doble línea **tenue y más cercana** entre sí. Sirve para no confundir una hoja con un tramo corto de muro cuando ambos aparecen como líneas paralelas.
- **🆕 Los arcos son una EXCEPCIÓN a la regla de "línea discontinua = ignorar" (usuario, 2026-08-02)**: a diferencia de ejes/cotas (sección B, donde discontinuo siempre significa "no es geometría real"), un arco de puerta dibujado con línea discontinua sigue siendo un arco de giro válido — el estilo de línea (continuo vs. discontinuo) NO debe usarse para clasificar o descartar un arco. Confirmado con ejemplo real (`Convenciones_CAD_Ejemplos/puertas/Puerta con arco discontinuo.jpg`).
- **🆕 Dos variantes de cómo se dibuja la hoja (usuario, 2026-08-02, sin resolver todavía cuál es más común ni si hay más variantes)**:
  1. **Hoja cerrada**: línea(s) delgada(s) plana(s), dentro del plano del vano (la variante "general" de arriba).
  2. **Hoja abierta**: la hoja se dibuja como un rectángulo sólido girado, parado sobre el arco en su posición abierta (~90°), en vez de plana en el vano. Confirmado en puerta simple y en puerta doble (2 hojas abriendo hacia lados opuestos, cada una con su propio arco).
- **🆕 Puerta doble**: vano único con 2 hojas independientes, cada una con su propio arco (los 2 arcos pueden cruzarse/superponerse en el centro del vano).
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/puertas/` — `Puerta1.jpg` (vano simple con arco, sin hoja visible), `2 puertas.jpg` y `2 puertas con hoja abierta en lugar de cerrada.jpg` (puerta doble, hoja cerrada y hoja abierta respectivamente), `3 puertas.jpg` (hoja tenue + arco de trazo más claro), `puerta sin arco.jpg` (variante sin hoja, solo arco — pese al nombre del archivo, sí tiene arco), `Puerta con arco discontinuo.jpg` (arco dibujado discontinuo, sigue siendo válido), `Muro eliminado y puerta agregada.jpg` (caso combinado de remodelación: muro demolido en amarillo + puerta nueva en el vano resultante), `puerta con hoja abierta en lugar de cerrada.jpg` (hoja abierta, puerta simple).

### Ventanas
- **Convención general**: el espacio entre dos tramos de muro, generalmente dibujado como **3 líneas paralelas** (línea central del vano entre las 2 líneas del muro) con marca de ancho acotada. **Confirmado explícitamente por el usuario (2026-08-02)** contra un ejemplo real: sí son 3 líneas paralelas entre muros, no 2.
- Punto ciego conocido: el pipeline tiene 0% de detección sistemática de ventanas en varias herramientas probadas (DINO, Claude Vision, CubiCasa5K con recall parcial) — ver roadmap P1. Ventanas altas/claraboyas (Beauchef) son un punto ciego adicional, no siguen ni siquiera el patrón de 3 líneas en planta porque están sobre el nivel de corte.
- Confirmado en: PDV, Beauchef (parcial), Isla de Pascua (0 detectadas).
- **🆕 Ventanales en escuadra (usuario, 2026-08-02)**: cuando 2 tramos de ventana se encuentran en una esquina (uno en cada muro), se dibujan como 2 segmentos de líneas paralelas que se juntan en la esquina, con marcadores cuadrados en los extremos/esquina (postes o marco) — sin arcos ni símbolo de apertura visible en el ejemplo visto. Sin confirmar todavía si hay un símbolo gráfico de apertura para ventanas operables, o si eso nunca se dibuja.
- **🆕 Fila de ventanas repetidas (usuario, 2026-08-07)**: en recintos alargados (ej. camarín), pueden aparecer varias ventanas chicas (~0.5-0.6m) evenly espaciadas a lo largo de un mismo muro largo — patrón distinto a los pares/sueltas ya documentados, más parecido a una serie rítmica que a una o dos aberturas puntuales.
- **🆕 Tabique de vidrio completo, no ventana puntual (usuario, 2026-08-07)**: un tramo de muro interior completo puede estar vidriado de punta a punta (partición de oficina), con arcos de puerta en ambos extremos del tramo — visualmente son las mismas 2-3 líneas paralelas que una ventana, pero conceptualmente es un tabique/mampara distinto de un vano puntual en un muro sólido. Sin resolver todavía si el pipeline debe tratarlo como "ventana" (dato geométrico) o como una categoría propia — anotado como pendiente, no hay código que lo distinga hoy.
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/ventanas/` — `1 ventana.jpg` (una ventana entre 2 tramos de muro), `2 ventanas.jpg` (dos ventanas apiladas en un muro vertical, el acotado entre ellas es la separación, no el ancho de una ventana), `2 ventanas separadas.jpg` (dos ventanas en un mismo muro horizontal, confirma el patrón de 3 líneas), `ventanales (2 hojas de ventana que abren hacia lados opuestos).jpg` (ventanal en esquina), `fila de ventanas repetidas en camarin.jpg` (serie de 4 ventanas chicas en un muro largo), `tabique de vidrio completo con puertas en ambos extremos (oficina agente).jpg` (partición vidriada, no vano puntual), `ventanas 0.8m en cocina-bodega con formas curvas junto a acceso.jpg` (refuerza el patrón de 3 líneas con dimensión real 0.8m; las formas curvas junto al acceso de "1.5" no están identificadas todavía — podrían ser puertas curvas, sin confirmar).

### Escaleras
- **Sin convención única confirmada todavía — se han visto 3 estilos gráficos distintos en la misma sesión (2026-08-02), ninguno domina**: (1) peldaños como líneas paralelas rectas numeradas (1, 2, 3... 9, 10), (2) patrón de líneas anidadas en forma de L/rectángulos concéntricos (peldaños vistos en planta, achicándose hacia una esquina), (3) rectángulos angostos en paralelo (regla general dada por el usuario: "escaleras y escalones suelen ser rectángulos angostos en paralelo").
- **Regla dura del usuario (2026-08-02): ante la duda de si algo es una escalera, SIEMPRE preguntar, nunca asumir** — mismo principio ya establecido en la sección C de este documento, extendido explícitamente a escaleras.
- **Ejemplos de referencia guardados**: `Fase 2/Convenciones_CAD_Ejemplos/escaleras/Escalinatas de aceso.jpg` (estilo 2, líneas anidadas en L).

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

### Cotas
- **Convención**: líneas delgadas (sólidas, no discontinuas) marcadas con una figura de "testigo" en cada punto de medición — típicamente un tique/trazo diagonal corto cruzando la línea (ver captura de referencia, Screenshot_340).
- **Regla dura**: igual que los ejes, nunca son geometría real, nunca dividen ni limitan un espacio.
- Confirmado en: Isla de Pascua, PDV, Beauchef (las 4 cadenas de acotación en los bordes de cada lámina).
- **Estado del fix: pendiente.** A diferencia de los ejes, las cotas son líneas sólidas — no las detecta el mecanismo de patrón de guiones. Candidato de diseño: identificar un segmento recto colineal y pegado a una secuencia regular de `cotas_texto` (los números de la cadena de acotación, ya extraídos con precisión) como parte de una cota. No implementado, requiere su propio diagnóstico antes de codificarse.

### Rasantes
- **Convención**: texto/cotas de nivel de terreno o pendiente, en cortes o plano de emplazamiento (ej. "RASANTE +2.50", "NT +0.15").
- **Regla dura**: nunca representa un espacio habitable — no debe interpretarse como nombre de recinto.
- Confirmado en: mencionado por el usuario 2026-07-31 (sin caso puntual documentado todavía en un plano de prueba).
- **Estado del fix: ✅ implementado** (2026-07-31, notebook `31jul_0230`) — instrucción agregada al prompt semántico de Claude Vision (Celda 4) para que nunca use texto de rasante como `nombre`/`etiqueta_en_plano` de un recinto.

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

## Pendiente de definir (el usuario irá indicando caso a caso)

- Escaleras: primeros ejemplos ya recopilados (ver sección A) — 3 estilos gráficos distintos vistos, sin convención dominante identificada todavía, sigue siendo "siempre preguntar" ante la duda.
- Rampas: primer ejemplo de símbolo gráfico ya recopilado (ver sección A) — un solo caso visto, falta contrastar con más planos antes de darlo por representativo.
- Mobiliario de línea repetitiva (duchas, casilleros, estanterías) — ya confirmado como categoría "artefactos y mobiliario" (sección B) que nunca contamina superficie; sigue sin convención de DETECCIÓN definida, sin fix implementado.
- Puertas: sin resolver todavía si "hoja abierta" o "hoja cerrada" es más común, o si depende de la oficina/software de origen — solo 2 ejemplos vistos hasta ahora, ambos en el mismo plano (PDV).
- Ventanales en escuadra: sin confirmar si existe o no un símbolo gráfico de apertura para ventanas operables — un solo ejemplo visto, sin arcos visibles.

## Repositorio de imágenes de referencia

Cada convención de arriba con ejemplo visual real queda guardada en `Fase 2/Convenciones_CAD_Ejemplos/`, organizada por carpeta (`puertas/`, `ventanas/`, `escaleras/`, `rampas/`, `muros/`, `elementos_aislados/`) — nombres de archivo descriptivos, copiados tal cual los compartió el usuario. Es la primera versión del "repositorio de muestras gráficas" mencionado en el roadmap (interfaz de administración — biblioteca de convenciones CAD, todavía sin construir como interfaz, hoy son solo archivos + este documento). Se sigue ampliando cada vez que el usuario comparte ejemplos nuevos.
- Cortes / elevaciones como figuras completas dentro de una lámina — sin convención de símbolo propia, se identifican hoy por posición/rótulo, no por geometría.
