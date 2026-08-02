# Puerta/Ventana/Muro como línea, Escalera/Rampa como rectángulo — no más puntos sueltos

## Context

Hoy, en la interfaz de revisión gráfica del arquitecto (`archicheck/src/App.jsx`), los elementos puntuales (puerta/ventana/escalera/rampa) se dibujan siempre como un punto (círculo + una letra) — tanto los que detecta el JSON de Colab como los que el arquitecto agrega/mueve a mano. Solo **Muro** (agregado en la sesión anterior) se dibuja como una línea real (polilínea). El usuario pidió explícitamente que la marca sobre el plano sea fiel a la figura real: puerta/ventana/muro como **línea**, y —aclarado en la ronda de preguntas de hoy— escalera/rampa como **rectángulo**, en ambos casos tanto para lo detectado automáticamente como para lo que el arquitecto marca/edita.

**Decisiones ya confirmadas por el usuario (no volver a preguntar):**
1. Para que la línea de puerta/ventana tenga la orientación real (no una aproximación), se debe **extender el notebook de Colab** (Python, Celda 4, fuera de este repo) para que Claude Vision entregue 2 puntos reales por elemento, no solo un centroide.
2. Escalera y Rampa se dibujan como **rectángulo**, tanto lo detectado por el sistema como lo que edita el arquitecto.
3. Los prefijos de id actuales se mantienen (`P`, `V`, `ES`, `R`, `MU`) — no cambiar a 2 letras. La etiqueta corta sobre el plano para muro sigue siendo `"M"` (no `"MU"`).

**Hallazgo del código, verificado antes de planear (no asumir)**: `calcularElementoDesdeLinea` (App.jsx ~línea 534) ya calcula `p1`/`p2` reales desde los 2 clics del arquitecto, pero **los descarta** — solo persiste `ancho_estimado_m` + centroide. Esto significa que hasta hoy, ni siquiera lo que el arquitecto marca a mano queda como línea real; solo Muro (que sí persiste `puntos`) lo hace. El JSON de Colab (`puertas_detalle`/`ventanas_detalle`/`escaleras_detalle`/`rampas_detalle`, Parte A ya construida) tampoco trae más que un centroide — confirmado leyendo el prompt real de Celda 4 en `Fase 2/Desarrollos/Test/ArchiCheck_Base 01ago_1808.ipynb`.

## Diseño de datos: mismo par de puntos (`p1_relativo`/`p2_relativo`), interpretado distinto según categoría

En vez de un esquema separado para "línea" y otro para "rectángulo", **puerta/ventana/escalera/rampa comparten el mismo shape de datos**: dos puntos en fracción 0–1 del ancho/alto de la imagen, igual convención que ya usa `cx_relativo`/`cy_relativo`.
- Puerta/Ventana: `p1_relativo`→`p2_relativo` es el segmento real de la puerta/ventana (el vano/hoja).
- Escalera/Rampa: `p1_relativo`→`p2_relativo` son 2 esquinas opuestas del rectángulo que delimita el elemento.
- Muro: sin cambios — sigue usando `puntos` (array de píxeles, polilínea de N segmentos), es la única categoría con forma propia distinta.

Se agrega un campo `forma` a `CATEGORIAS_ELEMENTO` (App.jsx ~línea 424) para que el resto del código (dibujo, hit-test, preview) despache por forma en vez de hardcodear `categoria === "muro"`:
```js
const CATEGORIAS_ELEMENTO = [
  { id: "puerta",   campo: "puertas_detalle",   label: "Puerta",   prefijo: "P",  forma: "linea" },
  { id: "ventana",  campo: "ventanas_detalle",  label: "Ventana",  prefijo: "V",  forma: "linea" },
  { id: "escalera", campo: "escaleras_detalle", label: "Escalera", prefijo: "ES", forma: "rectangulo" },
  { id: "rampa",    campo: "rampas_detalle",    label: "Rampa",    prefijo: "R",  forma: "rectangulo" },
  { id: "muro",     campo: "muros_detalle",     label: "Muro",     prefijo: "MU", forma: "polilinea" },
];
```

**Compatibilidad con JSON viejo (sin `p1_relativo`/`p2_relativo`)**: nuevo helper puro `resolverPuntosElemento(e, imagenWPx, imagenHPx, mpp)` — si el elemento trae los puntos reales, los usa; si no (JSON pre-cambio, o elementos con solo centroide), sintetiza un segmento horizontal centrado en `cx_relativo`/`cy_relativo` usando `ancho_estimado_m` (o 0.9m por defecto), y marca `sintetico: true`. Se dibuja con línea punteada cuando es sintético (vs. sólida cuando es geometría real) — señal visual consistente con el principio ya establecido en el proyecto de "incertidumbre transparente, no confianza falsa" (ver memoria `project_archicheck_roadmap`). Usado tanto por el dibujo como por el hit-test, para no duplicar la lógica de fallback en dos lugares.

## Cambios en el portal (`archicheck/src/App.jsx`)

1. **`calcularElementoDesdeLinea`** (~línea 534): además de `ancho_estimado_m`/`cx_relativo`/`cy_relativo` (sin cambios), agrega `p1_relativo`/`p2_relativo` (fracción 0-1) a partir de los 2 clics reales — ya no se descartan. Sirve igual para las 4 categorías (línea o rectángulo, la interpretación es responsabilidad del renderer/hit-test, no de este cálculo).

2. **`dibujarOverlayEnCanvas`** (~línea 943-976): reemplazar el `if (categoria === "muro") {...} else {...punto...}` actual por un despacho de 3 ramas según `forma` (buscando en `CATEGORIAS_ELEMENTO`):
   - `"polilinea"` (muro): sin cambios, misma lógica de hoy.
   - `"linea"` (puerta/ventana): `resolverPuntosElemento` → trazo `p1→p2` (punteado si `sintetico`), etiqueta con el prefijo (`cat.prefijo`, no `categoria[0]` — corrige de paso un bug menor donde escalera mostraba "E" en vez de "ES", relevante también para el label del rectángulo).
   - `"rectangulo"` (escalera/rampa): `resolverPuntosElemento` → rectángulo con esquinas `min/max` de `p1`/`p2` (relleno translúcido + borde, mismo lenguaje visual que ya usan los recintos), punteado si `sintetico`.

3. **`hitTestElemento`** (~línea 1097): mismo despacho por `forma` — `"polilinea"` usa `distanciaMinimaAPolilinea` (sin cambios), `"linea"` usa `distanciaPuntoASegmento` sobre el segmento resuelto, `"rectangulo"` usa test punto-dentro-de-rectángulo (mismo criterio que `hitTestRecinto`). Requiere pasarle `mpp` (ya disponible como prop en `RevisionGeometricaCanvas`) para que `resolverPuntosElemento` pueda sintetizar el fallback.

4. **Preview en vivo durante el 2° clic** (`RevisionGeometricaCanvas.handleMouseMove`, ~línea 1181-1186): hoy decide `tipo: tool === "excluir_area" ? "rect" : "linea"` — extender la condición para que `tool === "escalera" || tool === "rampa"` también cuente como `"rect"` (reutiliza el dibujo de preview de rectángulo que ya existe para `excluir_area`, sin código nuevo de preview).

5. **`moverElemento`** (~línea 2244): hoy solo actualiza `cx_relativo`/`cy_relativo`. Se extiende para, si el elemento tiene `p1_relativo`/`p2_relativo`, trasladar ambos puntos por el mismo delta (nuevo centroide − centroide viejo) — mueve la línea/rectángulo completo preservando forma/tamaño/orientación, sin gesto nuevo (sigue siendo "clic para reubicar"). Muro sigue sin botón Mover (sin cambios, limitación v1 ya documentada).

6. **`agregarElementoNuevo`/`ejecutarAccionDosClicks`**: sin cambios estructurales — ya son genéricos sobre `CATEGORIAS_ELEMENTO`, la nueva forma de datos fluye automáticamente desde `calcularElementoDesdeLinea`.

7. **`PanelRetag`**: sin cambios — el campo "Ancho m" sigue siendo un número editable independiente de la geometría (mismo precedente ya establecido: editar el nombre/tipo de un recinto no redimensiona su bbox). Redimensionar/reorientar una línea o rectángulo ya marcado queda fuera de alcance v1 — el flujo es eliminar y volver a marcar, mismo criterio que ya se fijó para "cambiar de categoría".

8. **`construirColabJsonCorregido`**: sin cambios — ya hace spread de todas las propiedades del elemento (`{ categoria, ...resto }`), los campos nuevos viajan solos.

## Cambio en el notebook de Colab (Python, `Fase 2/Desarrollos/Test/ArchiCheck_Base 01ago_1808.ipynb`, Celda 4, fuera de este repo)

Sigue el mismo proceso ya validado en la sesión anterior (ver memoria `feedback_archicheck_workflow` — parsear como JSON vía Node, nunca Read/NotebookEdit directo por tamaño; backup a `Versiones anteriores/`; escribir archivo nuevo con timestamp fresco, borrar el viejo).

1. **Prompt (schema JSON)**: agregar `p1_relativo`/`p2_relativo` a cada item de `puertas_detalle`/`ventanas_detalle`/`escaleras_detalle`/`rampas_detalle`, ej.:
   ```
   'puertas_detalle':[{"id":"P01","ubicacion_o_recinto":"...","ancho_estimado_m":null,
     "sentido_apertura":"interior|exterior|no_determinado","cx_relativo":0.5,"cy_relativo":0.5,
     "p1_relativo":{"x":0.5,"y":0.5},"p2_relativo":{"x":0.5,"y":0.5}}],
   ```
   (mismo patrón para las otras 3 listas).
2. **Instrucciones nuevas en el prompt**, distintas para línea vs. rectángulo:
   - Puertas/ventanas: "`p1_relativo`/`p2_relativo` es el segmento real que traza la puerta/ventana en el plano (el ancho del vano/hoja), no solo su centro."
   - Escaleras/rampas: "`p1_relativo`/`p2_relativo` son dos esquinas opuestas del rectángulo que delimita la escalera/rampa en el plano."
3. **Dict de fallback** (`analisis = {...}`): sin cambios — las 4 listas siguen partiendo vacías, los campos nuevos son propiedades dentro de cada item, no listas nuevas.
4. **Expectativa honesta a comunicar, no a prometer**: mismo tipo de limitación ya documentada para el cambio de posición original — el recall de Claude Vision en puertas/escaleras es razonable (~75-80%) pero en ventanas es históricamente bajo (~0% en corridas previas); pedir además la orientación exacta es un pedido más difícil que pedir solo posición, así que es esperable que la línea/rectángulo salga sintética (fallback) para buena parte de los elementos hasta que el arquitecto los remarque a mano — el fallback sintético del portal (punto anterior) es lo que hace que la interfaz siga siendo útil mientras tanto, no un parche temporal a remover.
5. **No se puede probar localmente** (no hay Python/OpenCV fuera de Colab) — pendiente que el usuario lo corra en Colab y confirme visualmente (mismo patrón ya usado: `visualizar_recintos_bbox.mjs` o recorte-zoom) antes de darlo por bueno.

## Verificación

**Notebook**: no ejecutable localmente — pendiente que el usuario lo corra en Colab contra un plano conocido y confirme que `p1_relativo`/`p2_relativo` aparecen poblados (aunque sea parcialmente) en `puertas_detalle`/`ventanas_detalle`/`escaleras_detalle`/`rampas_detalle`.

**Portal** (`npm run dev`, probar en vivo en el navegador como en la sesión anterior, con el JSON+PNGs de PDV ya existentes — ese JSON no tendrá `p1_relativo`/`p2_relativo` todavía, así que sirve para probar el camino sintético/fallback; el camino con geometría real solo se podrá probar después de que el usuario corra el notebook nuevo):
1. Confirmar que los elementos puntuales ya existentes en el JSON (sin `p1_relativo`/`p2_relativo`) ahora se dibujan como línea punteada (puerta/ventana) o rectángulo punteado (escalera/rampa) en vez de un punto — visualmente distinto de antes.
2. Agregar una puerta/ventana nueva a mano (2 clics) → debe dibujarse como línea **sólida** (no punteada, tiene geometría real) con la orientación exacta de los 2 clics.
3. Agregar una escalera/rampa nueva a mano (2 clics) → debe dibujarse como rectángulo sólido con las esquinas exactas de los 2 clics (mismo preview visual que ya usa "Excluir área").
4. Seleccionar cada tipo (línea y rectángulo) haciendo clic cerca del trazo/dentro del rectángulo — confirmar que el panel abre correctamente y no gana el recinto de fondo (mismo fix de prioridad de hit-test ya aplicado la sesión anterior, ahora extendido a las formas nuevas).
5. Probar "Mover" sobre una puerta/línea y una escalera/rectángulo — confirmar que se traslada completa (forma/tamaño/orientación intactos), no que colapsa a un punto.
6. Eliminar y editar (Ubicación/descripción + Ancho m) siguen funcionando igual que antes para todas las categorías.
7. Confirmar visualmente que Muro sigue sin cambios (polilínea, etiqueta "M", sin botón Mover).
