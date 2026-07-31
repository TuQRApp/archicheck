# Biblioteca de Convenciones CAD — ArchiCheck

Registro vivo de cómo se dibuja cada elemento/espacio (y cada línea/texto que NO es un elemento) en los planos que hemos analizado. Se actualiza cada vez que el usuario define o corrige una convención — no se adivina ni se generaliza sin que el usuario lo confirme primero.

**Por qué existe este archivo separado del roadmap**: el roadmap registra decisiones e hitos del proyecto; esto es una referencia técnica de consulta rápida para el pipeline (Colab) y para mí, que crece con el tiempo y que eventualmente alimenta tanto el detector determinista de convenciones como los prompts de Claude Vision (mismo mecanismo que ya usa `reglas_aprendidas.js` para normativa, aplicado acá a símbolos gráficos).

**Regla de fondo**: cada convención puede variar entre oficinas de arquitectura / software de origen — nada de esta lista es universal por decreto. Cada entrada indica en qué proyecto(s) se confirmó. Si aparece un plano nuevo con una variante distinta, se agrega como variante nueva (no se asume que "está mal" el plano, ni se sobreescribe la convención anterior).

---

## A. Elementos/espacios reales (SÍ son geometría del edificio)

**Regla general (confirmada por el usuario, 2026-07-31): SOLO los elementos de esta sección A separan/limitan espacios.** Ningún elemento de la sección B (ejes, cotas, rasantes) lo hace nunca, sin excepción — ver regla dura en cada uno más abajo. Cualquier elemento nuevo que se agregue a esta sección A implica, por definición, que sí puede actuar como límite de recinto; cualquier cosa que se agregue a la sección B implica lo contrario.

### Muros
- **Convención general**: líneas continuas, casi siempre 2 trazos paralelos, formando un contorno cerrado — la distancia entre ambos trazos indica el grosor del muro.
- **Por confirmar con datos**: el dataset MLSTRUCT-FP (Pizarro) trae muros anotados de planos chilenos reales — sirve para validar/afinar esta convención con evidencia, no solo con lo observado a ojo en 3 planos.
- Confirmado en: PDV, Beauchef, Isla de Pascua (observación general, sin verificación formal todavía).

### Puertas
- **Convención general**: el espacio (vano) entre dos tramos de muro — generalmente se grafica con una línea (la hoja) con su medida de ancho acotada. A veces incluye el arco de giro (radio de apertura), a veces no se dibuja.
- Confirmado en: PDV, Beauchef, Isla de Pascua.
- Nota de pipeline: el emparejamiento hoja↔arco (por consistencia geométrica: radio del arco ≈ largo de la hoja) todavía no está implementado — hoy son dos trazos sueltos sin relación (ver roadmap P1, "leer elementos completos").

### Ventanas
- **Convención general**: el espacio entre dos tramos de muro, generalmente dibujado como **3 líneas paralelas** (línea central del vano entre las 2 líneas del muro) con marca de ancho acotada.
- Punto ciego conocido: el pipeline tiene 0% de detección sistemática de ventanas en varias herramientas probadas (DINO, Claude Vision, CubiCasa5K con recall parcial) — ver roadmap P1. Ventanas altas/claraboyas (Beauchef) son un punto ciego adicional, no siguen ni siquiera el patrón de 3 líneas en planta porque están sobre el nivel de corte.
- Confirmado en: PDV, Beauchef (parcial), Isla de Pascua (0 detectadas).

---

## B. Líneas/textos que NUNCA son elementos/espacios (jamás dividen ni limitan un recinto)

### Ejes
- **Convención**: líneas discontinuas (guion-guion o guion-punto-guion), terminadas en un círculo con número (1, 2, 3...) o letra (A, B, C...) — grilla de referencia estructural.
- **Regla dura**: nunca son geometría real del edificio. Nunca dividen ni limitan un espacio — afecta tanto el conteo de recintos como sus áreas si se tratan como muro.
- **Uso positivo (no descartar el dato)**: sirven como referencia de ubicación de un elemento dentro de la planta (ej. "Baño Accesible Universal está entre los ejes B2 y C3", como una coordenada de grilla) — se deben extraer y conservar como dato propio, no solo borrarse.
- Confirmado en: Isla de Pascua (causa raíz de la falla catastrófica de segmentación, 2026-07-31). Fix de detección implementado en Celda 4 ("Paso 1.5", notebook `31jul_0130`) — reusa la detección de patrón de guiones ya existente, corriéndola antes de la protección de muro por conectividad.

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
- Ver sección "Pendiente de definir" más abajo (duchas, casilleros, estanterías) — mismo principio: no construir un detector geométrico por cada tipo de mueble, preguntar al arquitecto cuando la segmentación se vea sospechosa.

---

## Pendiente de definir (el usuario irá indicando caso a caso)

- Escaleras: patrón de peldaños + dirección de subida — sin definir todavía como convención formal (hoy solo se mide como un recinto con área, ver roadmap "leer elementos completos").
- Rampas: sin convención de símbolo documentada todavía (hoy se detecta por texto "Pendiente NN%" cercano, no por símbolo gráfico).
- Mobiliario de línea repetitiva (duchas, casilleros, estanterías) — causa confirmada de recintos fantasma (Beauchef, 2026-07-30), sin convención de detección definida, sin fix implementado.
- Cortes / elevaciones como figuras completas dentro de una lámina — sin convención de símbolo propia, se identifican hoy por posición/rótulo, no por geometría.
