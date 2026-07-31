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
- **🆕 Muros nuevos marcados con achurado de color (usuario, 2026-07-31, ejemplo PDV Nivel 1)**: un achurado de color sobre un tramo de muro (ej. rojo = "se construye", amarillo = "se retira", según la simbología propia de ese expediente) SÍ es geometría real — no es ruido a excluir, es un muro nuevo o a demoler. **Regla dura de proceso**: el significado de cada color NUNCA se asume — siempre se confirma contra la leyenda/simbología de ESE plano puntual con el arquitecto (puede no coincidir con otro expediente). Una vez confirmado para un PDF, aplica a todas sus páginas (ver Regla de fondo #2 arriba) — en este caso, la convención roja/amarilla ya confirmada para Nivel 2 de PDV aplica igual en Nivel 1 del mismo expediente, sin volver a preguntar por cada lámina.

### Puertas
- **Convención general**: el espacio (vano) entre dos tramos de muro — generalmente se grafica con una línea (la hoja) con su medida de ancho acotada. A veces incluye el arco de giro (radio de apertura), a veces no se dibuja.
- Confirmado en: PDV, Beauchef, Isla de Pascua.
- Nota de pipeline: el emparejamiento hoja↔arco (por consistencia geométrica: radio del arco ≈ largo de la hoja) todavía no está implementado — hoy son dos trazos sueltos sin relación (ver roadmap P1, "leer elementos completos").
- **🆕 IMPORTANTE (usuario, 2026-07-31, ejemplo PDV Nivel 1): el arco de giro/apertura de la puerta, y la cota de ancho asociada, NUNCA deben contaminar el cálculo de área ni actuar como límite de recinto** — aunque el arco sea parte gráfica de un elemento real (la puerta), el trazo del arco en sí se comporta como una línea de referencia para efectos de segmentación, igual que un eje o una cota. No confundir con la existencia de la puerta como vano (que sí es real) — es específicamente el TRAZO del arco el que no debe limitar/dividir un espacio.

### Ventanas
- **Convención general**: el espacio entre dos tramos de muro, generalmente dibujado como **3 líneas paralelas** (línea central del vano entre las 2 líneas del muro) con marca de ancho acotada.
- Punto ciego conocido: el pipeline tiene 0% de detección sistemática de ventanas en varias herramientas probadas (DINO, Claude Vision, CubiCasa5K con recall parcial) — ver roadmap P1. Ventanas altas/claraboyas (Beauchef) son un punto ciego adicional, no siguen ni siquiera el patrón de 3 líneas en planta porque están sobre el nivel de corte.
- Confirmado en: PDV, Beauchef (parcial), Isla de Pascua (0 detectadas).

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

- Escaleras: patrón de peldaños + dirección de subida — sin definir todavía como convención formal (hoy solo se mide como un recinto con área, ver roadmap "leer elementos completos").
- Rampas: sin convención de símbolo documentada todavía (hoy se detecta por texto "Pendiente NN%" cercano, no por símbolo gráfico).
- Mobiliario de línea repetitiva (duchas, casilleros, estanterías) — ya confirmado como categoría "artefactos y mobiliario" (sección B) que nunca contamina superficie; sigue sin convención de DETECCIÓN definida, sin fix implementado.
- Cortes / elevaciones como figuras completas dentro de una lámina — sin convención de símbolo propia, se identifican hoy por posición/rótulo, no por geometría.
