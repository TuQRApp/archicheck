# ArchiCheck — Diseño Funcional y Arquitectura Vigente

**Qué es este documento.** Describe cómo está construido ArchiCheck **hoy** y por qué. No es una bitácora: no cuenta cómo se llegó acá, ni documenta los enfoques que se probaron y quedaron superados. Para el historial completo de iteraciones, hallazgos, bugs y decisiones fecha por fecha está el roadmap (`archicheck/Proyecto/Roadmap_Revision_Dossier_ArchiCheck.md`, y su versión navegable `archicheck/Fase 2/Roadmap_ArchiCheck.html`).

**Cómo leerlo.** Cuando algo está acordado pero todavía no escrito en código, se dice explícitamente ("diseño acordado, no implementado"). Cuando no fue posible determinar con certeza si algo es el enfoque vigente o uno superado, se marca **⚠️ Pendiente de confirmar** en el lugar y se repite en el anexo final. Nada de lo que aparece acá sin esa marca debería tomarse como suposición.

**Qué es el producto.** Herramienta de pre-validación normativa de planos de arquitectura para el mercado chileno: un arquitecto sube su proyecto y recibe, antes de presentarlo a la DOM, un levantamiento geométrico verificable y una evaluación contra normativa chilena (OGUC / LGUC / Ley 19.300 / DDU / PRC). Base metodológica: pipeline de 4 etapas de Pablo Pizarro (2024), documentado en `IA_Analisis_Planos_Arquitectonicos.txt`.

---

## 1. Stack y arquitectura general

El sistema son **tres piezas que no comparten runtime**, unidas por un archivo JSON:

```
   PDF vectorial del proyecto
            │
            ▼
   ┌──────────────────────┐
   │  Notebook de Colab   │   extracción geométrica determinística
   │  (PyMuPDF + OpenCV)  │   + Claude Vision para la capa semántica
   └──────────┬───────────┘
              │  archicheck_geometrico_{proyecto}_{timestamp}.json
              │  + un PNG por página analizada
              ▼
   ┌──────────────────────┐         ┌──────────────────────┐
   │  Portal React (SPA)  │────────▶│ Cloudflare Worker    │
   │  Vercel              │  SSE    │ (proxy a Claude/GPT) │
   │  gate de revisión    │◀────────│ + RAG normativo      │
   │  gráfica del         │         └──────────┬───────────┘
   │  arquitecto          │                    │
   └──────────────────────┘                    ▼
                                     ┌──────────────────────┐
                                     │ Supabase (pgvector)  │
                                     │ normativa_chunks     │
                                     └──────────────────────┘
```

### 1.1 Frontend — portal React

- **React 19 + Vite 8**, SPA de un solo archivo grande: `archicheck/src/App.jsx` (~279 KB; la cifra de "~1.540 líneas" que aparece en documentación vieja ya no aplica).
- **Deploy**: Vercel, auto-deploy desde la rama `main` de GitHub → https://archicheck-xi.vercel.app/
- **Dev local**: `npm run dev` en `archicheck/` → http://localhost:5174/
- Dependencias relevantes: `pdfjs-dist` (PDF → imágenes por página, máx. 15), `html2pdf.js` y `docx` (exportación del informe).
- **Sin backend propio y sin base de datos de proyectos.** Todo el estado de una sesión vive en el navegador. Esto es deliberado: evita costo de infraestructura mientras el producto está en validación.

### 1.2 Cloudflare Worker

- Código en `archicheck-worker/worker.js` (+ `reglas_aprendidas.js`). Repo git propio y **privado**: https://github.com/TuQRApp/archicheck-worker (el repo `archicheck` del frontend es público).
- Es un **proxy SSE**: oculta las API keys (`wrangler secret put`), reenvía a la API de Anthropic y a OpenAI (el portal corre Claude y GPT-4o en paralelo sobre el mismo insumo), y resuelve el RAG normativo contra Supabase antes de armar el prompt.
- `reglas_aprendidas.js` inyecta siempre las reglas derivadas de ground truth validado por arquitectos, independientemente de si hay consulta RAG — vive server-side a propósito (es la razón por la que el repo del worker es privado).
- **Worker vigente: `archicheck-worker`, no `laude`.** URL que usan hoy tanto el portal como el notebook: `https://archicheck-worker.nestragues.workers.dev` (`VITE_WORKER_URL` en `archicheck/.env`; `WORKER_URL` hardcodeado en la Celda 4 del notebook). Confirmado con archivos reales: el único `wrangler.toml` activo es `archicheck-worker/wrangler.toml`; en la raíz `Documents/Claude/` no hay `wrangler.jsonc` activo, solo `wrangler.jsonc.disabled_2026-07-23_apuntaba-a-laude` — `laude` fue desactivado ese día y el frontend nunca volvió a apuntarle. Para deployar: `npx wrangler deploy` **desde `archicheck-worker/`**, no desde la raíz.

### 1.3 Normativa — dos mecanismos coexistiendo

| Mecanismo | Dónde vive | Para qué |
|---|---|---|
| **JSON estático embebido** | `archicheck/normativa/nacional/` (`oguc_articulos.json`, `lguc_articulos.json`, `ley19300_articulos.json`, `reglas_verificacion.json`) + `normativa/nunoa/`, `normativa/santiago/` | Contexto normativo que viaja dentro del prompt del portal |
| **RAG en Supabase (pgvector)** | Proyecto "Archicheck", tabla `normativa_chunks` — 1.928 chunks (OGUC 770, LGUC 244, Ley 19.300 128, DDU ~185, PRC Providencia 281) | Recuperación semántica desde el Worker: threshold 0.45, `match_count` 25, fallback separado para PRC, citas DDU con formato `[DDU nnn]` |

Fuentes primarias: OGUC re-extraído con regex del PDF de leychile.cl (`OGUC_DTO-47_05-JUN-1992.pdf`), LGUC de `LGUC_DTO-458_13-ABR-1976.pdf`, PRC Providencia de ordenanza refundida + normas de edificación + usos de suelo + patrimonio, DDU como 8 circulares estructuradas.

PRC disponibles en el selector del portal: Ñuñoa, Santiago. Providencia está indexado en el RAG. Si la comuna no tiene PRC, se omite del contexto del prompt en vez de inventarlo.

### 1.4 Notebook de Colab

`archicheck/Fase 2/Desarrollos/Test/ArchiCheck_Base {DD}{mes}_{HHMM}.ipynb` — el nombre cambia en **cada** edición (ver §3.7). Es una plantilla de 7 celdas donde el usuario **solo edita la Celda 3**. Ya no requiere GPU: el runtime CPU alcanza (las celdas de Grounding DINO + SAM 2 se eliminaron por recall ~0% en planos CAD — DINO fue entrenado en fotografías, no en símbolos de línea).

### 1.5 Interfaz de revisión gráfica — el gate obligatorio

Entre la salida de Colab y el análisis normativo hay un paso **no saltable**: el arquitecto valida y corrige la geometría detectada sobre un canvas, en un modal a pantalla completa, una página a la vez.

No es UX: es la pieza que evita el peor escenario del producto. Si un elemento no se detecta, su verificación normativa nunca corre — una puerta angosta que el sistema no vio es una infracción que ArchiCheck jamás marcaría, en silencio, y que la DOM sí encontraría. El gate convierte "elemento invisible para el modelo" en "elemento igual verificado".

Piezas técnicas relevantes:
- La clave de indexación real es **`entry_idx`, nunca `pagina`**: una misma lámina física puede traer varios recortes (`pag3-1`, `pag3-2`, …). `colabPngs[i].entryIdx` referencia `colabJson.paginas[x].entry_idx`.
- El canvas usa la imagen **cruda sin comprimir** (`objectUrl` vía `URL.createObjectURL`) para calzar 1:1 en píxeles con los bbox que mide Colab. `compressImage()` sigue existiendo, pero solo para la copia que viaja a la API (límite de 5 MB de Anthropic).
- Categorías de elemento puntual: puerta, ventana, escalera, rampa, muro.
- El despacho de dibujo/hit-test es **por forma de dato, no por categoría**: cualquier elemento con `.segmentos` hereda la rama polilínea. Así, `muros_geo` y `puertas_geo` (geometría determinística de Colab) se dibujan y seleccionan con el mismo código, mientras ventana/escalera/rampa siguen viniendo de `analisis_semantico` (estimación de Claude Vision).
- Elementos **detectados** por Colab se dibujan como punto simple; solo los **marcados a mano** por el arquitecto (`_nuevo`) se dibujan con su línea/rectángulo real. Motivo: la geometría línea/rectángulo que estimaba Claude Vision resultó poco confiable, así que se ignora para render/selección aunque siga presente en el JSON.
- Herramientas de recinto **Cortar / Fusionar / Excluir área: activas**, las tres probadas en vivo con datos reales. (Estuvieron deshabilitadas un tiempo; esa situación ya no aplica.)
  - Cortar: 2 clics parten el recinto en `{id}-A`/`{id}-B`, hereda `tipo` a propósito.
  - Fusionar: toggle de 2+ recintos + "Confirmar fusión"; `nombre` y `tipo` quedan vacíos a propósito (dos recintos distintos pueden ser de tipos distintos).
  - Excluir área: resta sin reemplazar el recinto; la selección **no** se limpia, para marcar varias zonas seguidas.
  - El campo del recinto para su tipo de espacio es **`tipo`**, no `uso`.
- `TablaDudas` muestra solo lo que el sistema no sabe (`sin_nombre_confirmar`, `cumple_geo:false`, elementos sin ubicar) — no el inventario completo.
- El análisis normativo recibe el **PNG anotado** con las marcas de la revisión (`pngsRevisadosPorPagina`), no el PNG limpio, y el prompt le pide explícitamente a Claude usar los ids anotados para asociar cada elemento a su recinto. Si no puede sustentarlo visualmente, debe escribir "VERIFICAR", no inventar.
- Limitación conocida y vigente: **ningún recinto se resalta visualmente al seleccionarlo**. El feedback de selección es solo texto ("Cortando: E5", "Marcado E01…").
- El coloreado de fondo de los recintos **no lo genera el portal** — viene baked-in en el PNG que exporta Colab.

---

## 2. Pipeline geométrico (Colab) — estado vigente

### 2.1 Principio de fondo

El pipeline es **determinístico primero, LLM después**. La geometría se extrae del PDF vectorial con PyMuPDF y OpenCV; Claude Vision aporta la capa semántica (qué es cada recinto, para qué se usa) pero **no** define la geometría de muros ni de puertas. Cualquier modelo externo de extracción (MitUNet, Raster2Seq, Floor Plan API, etc.) entraría como **fuente en paralelo** cuyo resultado se cruza contra el propio y cuyas discrepancias se muestran como conflicto al arquitecto — nunca como reemplazo del pipeline ni como resultado aceptado automáticamente. Hoy no hay ninguno integrado.

**Solo se acepta PDF vectorizado.** La Celda 2 lo valida y rechaza escaneados. Es una decisión de producto: el target chileno presenta PDF vectorial a la DOM, y la información de capas OCG nativas que ese formato trae no la puede recuperar ningún modelo entrenado sobre raster.

### 2.2 Configuración manual (Celda 3)

Única celda que se edita por proyecto:

| Variable | Qué es |
|---|---|
| `NOMBRE_PROYECTO` | Slug del proyecto; alimenta `BASENAME = archicheck_geometrico_{slug}_{DDmes_HHMM}` |
| `PAGINAS_Y_ESCALAS` | Lista de `(página, 'escala')` o `(página, 'escala', (x1,y1,x2,y2))`. El recorte es en fracciones 0.0–1.0 y sirve para aislar la planta cuando una lámina trae planta + elevación, o varias plantas en una hoja |
| `PAGINA_CUADRO_SUPERFICIES` | Página del cuadro de superficies impreso, o `None` |
| `MAPEO_CAPAS` | Mapeo manual de capas OCG del PDF a categorías (§2.4) |

**La escala es siempre manual, nunca inferida.** De ahí sale la conversión maestra:

```
mpx = 0.0254 * ratio_escala / DPI       # metros por píxel, por página
```

La celda imprime la lista real de capas OCG del PDF y previsualiza cada página con el recorte marcado en rojo antes de correr nada.

### 2.3 Extracción vectorial

`extraer_datos_vectoriales()` sobre `get_drawings()` de PyMuPDF. Obtiene:
- **Texto con posición exacta**: cotas (`cotas_texto`) y nombres de recinto. Sirve para dos cosas: borrarlo del raster antes de segmentar (el texto no debe limitar el área de un recinto), y como fuente futura de validación de medidas.
- **Segmentos rectos** (`'l'`), **rectángulos/quads** (`'re'`/`'qu'`) y **curvas Bézier cúbicas** (`'c'`), con su color, fill, ancho de línea y **capa OCG**.

### 2.4 Filtrado de candidatos a muro

El orden importa. Cada paso se documenta en consola: nada se descarta en silencio.

**a) Por capa (`MAPEO_CAPAS`).** Los nombres de capa **no son estándar entre arquitectos** — se confirmó con datos reales de tres proyectos que cada oficina usa su propia convención. Por eso el mapeo se completa a mano por proyecto, igual que la escala, y nunca se adivina por palabras clave.

Categorías **con lógica real** hoy:
- `ignorar` y `mobiliario` → **excluyen** el segmento de poder protegerse como muro. `ignorar` cubre capas que no son mobiliario pero tampoco muro: geometría de *otro* piso (`Muros Proy`, `Proyecciones`), cajetín/marco de lámina (`Formato`), y la capa por defecto `0`.
- `eje` y `cota` → **señal aditiva** sobre la heurística geométrica.

Cualquier otra clave (`muro`, `puerta`, `ventana`, `accesibilidad`, `escalera`, `columna`, `achurado`, `corte_elevacion`, `deslinde_terreno`, …) es **solo diagnóstico**: se cuenta e imprime, no cambia ningún resultado. Categorías vacías no rompen nada.

Puertas y ventanas se procesan **siempre por separado** cuando el PDF lo permite; van juntas solo si el PDF las trae en una sola capa.

**🎯 Decisión de fondo, 2026-08-21 — la capa deja de ser autoridad y pasa a ser señal/prior; principio permanente, todavía no portado al código.** Corrida real de `21aug_1516.ipynb` sobre PdV mostró el mismo defecto en las dos direcciones a la vez: confiar en la capa para **excluir** (`Proyecciones`→`ignorar`) excluyó muros reales que el arquitecto dibujó reusando esa capa para obra nueva (ver §2.11, causa raíz ya identificada); confiar en que la capa **no excluye** (`puerta`/`ventana` solo diagnóstico) dejó pasar centros de ventana como muro real, fusionados con muros reales (ver §2.9, bug `MU18` reproducido de nuevo). Los nombres de capa no son estándar entre oficinas (ya documentado arriba) — cualquier regla que confíe en el nombre de capa como árbitro final hereda esa inconsistencia por proyecto, en cualquiera de las dos direcciones. **Principio nuevo, confirmado por el arquitecto**: la capa **nunca decide sola**, ni para excluir ni para incluir — el veredicto final de si un segmento es muro siempre es geométrico (cuerpo cerrado, §2.8) + semántico (color de leyenda real, §2.12); la capa solo sube o baja la confianza previa. Esto no cambia el comportamiento vigente de `eje`/`cota` (b, abajo), que ya era "señal aditiva", ni el diseño de cuerpo cerrado (ya decía "la semántica manda sobre la geometría" para puertas) — formaliza la misma lógica para `ignorar`/`mobiliario`/`puerta`/`ventana`, que hoy siguen siendo autoridad dura o no-op puro. **No implementado todavía** — el test de cuerpo cerrado (§2.8) se reordenó como prioridad #1 sobre este fix, con la hipótesis de que lo resuelve de una vez para ambas direcciones del bug.

**b) Heurística geométrica de eje/cota — fallback, no complemento.** La regla vigente es: **si hay capa mapeada, la capa manda sola**; la heurística geométrica corre **solo** cuando `MAPEO_CAPAS['eje']`/`['cota']` está vacío para ese proyecto. No se corren las dos en paralelo. El motivo es empírico: contra una capa `Ejes` real la heurística relajada dio **0 % de precisión**. Cuando hay capa mapeada, el pipeline imprime un aviso explicando que omite la heurística, en vez de omitirla en silencio.

La heurística en sí detecta ejes por patrón de discontinuidad (guión, o guión-punto con punto en el hueco) y cotas por la cruz real entre marca perpendicular y diagonal.

**c) Protección por conectividad (Paso 2).** Un segmento se protege como muro si pertenece a una cadena conectada (Union-Find, extremos a ≤ `TOL_MURO_M` = 0.21 m) cuyo *span* total supere `UMBRAL_MURO_M` = 1.5 m. Así un tramo corto de esquina se protege por estar encadenado al muro largo, en vez de descartarse por su propio tamaño. La tolerancia es deliberadamente generosa porque **el riesgo es asimétrico**: proteger de más cuesta poco (un símbolo real no se borra del raster), proteger de menos reproduce la regresión de fusionar exterior + interior en un recinto falso.

Sobre esa protección se aplican las exclusiones: eje, cota, `mobiliario` por capa, `ignorar` por capa — cada una con su contador y, para `ignorar`, con desglose por capa real y muestra de coordenadas, para poder verificarla visualmente antes de confiar en ella.

**d) Filtro angular al exportar.** De los ya protegidos, hoy solo se exportan a `muros_geo` los alineados a eje (0°/90° ± 8°). El criterio acordado es que **el ángulo es una prioridad, no un filtro excluyente** — un muro real puede tener tramos curvos o no ortogonales y no debería descartarse por eso. La secuencia acordada es relajar este filtro *después* de que exista el test de cuerpo cerrado (§2.8), no antes, para no reabrir el falso positivo de "esquina real confundida con eje".

### 2.5 Clustering de topología

`_dividir_en_muros_por_union()` separa la red de muros en entradas distintas. **Corta en cruces reales (3 o más segmentos concurrentes) y en puntas sueltas; sigue de largo en las esquinas de paso (grado 2).** El clustering de nodos tiene tope de diámetro `TOL_DIAMETRO_CLUSTER_M` = 0.35 m: sin ese tope, el agrupamiento transitivo produce clusters patológicos de varios metros.

Antes de la fusión corre `_detectar_lineas_referencia_periodicas()`, que aparta a `muros_excluidos_por_referencia` las líneas de deslinde / rasante / línea oficial (span largo, largo de tramo pequeño y densidad regular) — para no intentar después fusionar un muro real con un fragmento de deslinde.

### 2.6 Fusión de muros por proximidad

Regla del arquitecto, textual:

> *"Un muro es toda estructura que considera segmentos de líneas paralelas, no separados entre ellos. Puede tener una L, seguida de una T, después una I, una O. En la medida que no haya separación explícita, se considera un solo muro."*

`_fusionar_muros_por_proximidad()` la implementa como Union-Find **sobre las entradas de `muros_geo`** (no sobre segmentos sueltos): dos entradas se fusionan si algún punto de una está a ≤ `TOL_FUSION_MUROS_M` = 0.06 m de algún **segmento** de la otra (distancia punto-a-segmento vía `_distancia_punto_segmento`, no punto-a-punto, para capturar cruces en T). El ángulo del cruce no importa: L, T, I y O son todas un solo muro.

**Una puerta es separación explícita y corta la fusión.** El chequeo es `_punto_cerca_de_puerta(p, puertas_geo, tol_union_px)`: mira si el **punto de contacto específico** entre los dos candidatos cae cerca de *cualquier* `puntos_union` de *cualquier* puerta. Funciona con puertas que tengan 1 o 2 `puntos_union` registrados — el diseño anterior, que exigía que la puerta tuviera sus dos lados apoyados uno en cada muro candidato, nunca podía bloquear a las puertas con un solo punto.

Trazabilidad: cada entrada resultante guarda `muros_originales_ids`, y el `muro_asociado_id` de cada puerta se remapea al id fusionado. Nunca se fusiona en silencio.

### 2.7 Puertas — `puertas_geo`

Clasificador geométrico de arcos, **sin Claude Vision**. Reconoce dos formas de dibujo:
- Arco compuesto por **segmentos rectos** cortos (el caso mayoritario).
- **Curva Bézier cúbica real** (4 puntos de control), muestreada explícitamente. El criterio es de **forma** (arco de ~90°), no de tamaño, más un piso mínimo de radio (`UMBRAL_RADIO_BEZIER_MIN_M` = 0.5 m) para no sobre-detectar.

Sobre los puntos crudos se ajusta un círculo por **mínimos cuadrados** (método Kasa): el centro es el gozne, el radio es el ancho real de hoja. Esto reemplaza por completo a `ancho_estimado_m` (estimación de Claude Vision) como fuente de geometría.

Reglas de gozne y radio, todas confirmadas por el arquitecto y todas permanentes:

1. **El gozne va en el centro de la HOJA**, no en la cara del muro ni en su línea central. Operacionalmente: dentro del espesor del muro (que tiene sus 2 caras paralelas reales, del orden de 0.3 m) hay un **segundo par de líneas mucho más angosto** (~5 cm, el grosor real de la hoja) — su punto medio es el gozne. Ante cualquier duda de posición: buscar primero ese par de líneas más angosto dentro del espesor del muro.
2. **El gozne siempre está en el límite de la hoja con el muro o con un pilar**, y eso se valida siempre — nunca se acepta el centro de un ajuste de curva que no caiga sobre geometría real. Un ajuste con residuo bajo que cae fuera de todo muro es la señal más fuerte de que se ajustó a la curva equivocada (un artefacto sanitario, un elemento decorativo).
3. Cuando el elemento es un **pilar**, el gozne va al **centro de su cara**, no al vértice donde termina el poste. Un vértice real no es lo mismo que el punto de contacto real hoja↔elemento.
4. Cuando **la hoja no está dibujada** (obstruida por mobiliario u otro elemento), el gozne igual se ancla sobre la línea real del muro, proyectada si hace falta ("volando").
5. **El arco de referencia impreso en el plano manda sobre cualquier suposición**, tanto para posición como para dirección de apertura. Construir desde vano + cota da un buen candidato de gozne pero nunca sustituye el cruce contra el arco real. Ese cruce es obligatorio antes de dar cualquier puerta por confirmada.
6. El **radio no se deriva aritméticamente** de la cota del vano sin verificar, ni se acepta de un ajuste de círculo solo porque el residuo sea bajo: un ajuste con rms < 0.5 px puede haber enganchado una curva distinta a la real. Se verifica contra el arco de referencia con el gozne ya confirmado. (En la práctica, a veces el valor "ingenuo" — mitad exacta de la cota — resulta ser el correcto; no descartar la hipótesis simple por parecer poco sofisticada.)
7. Detalle de render reusable: **nunca** dibujar el arco con el comando SVG de "2 puntos + radio" — resuelve a cualquiera de los dos centros posibles. Muestrear explícitamente N puntos sobre el círculo con el centro ya fijado y unirlos con `L`.

**Caso conocido sin resolver**: hay planos que dibujan la puerta como un **pequeño rectángulo embebido en el espesor del muro, sin arco de giro**. Ahí el clasificador da 0 candidatos por diseño. La instrucción del arquitecto para ese caso es reconstruir con un arco de *ejemplo* (no hay arco real que matchear), con el gozne en cualquiera de los dos lados del rectángulo — pendiente de ubicar esos rectángulos de forma confiable.

### 2.8 Test de cuerpo cerrado — diseño acordado, **no implementado**

Es la validación que hoy falta. La fusión por proximidad de §2.6 usa un umbral de distancia ciego, y un umbral ciego no distingue "es el mismo cuerpo" de "solo está cerca": sobre-fusiona cuando algo cae dentro del radio sin ser el mismo muro, y sub-fusiona cuando el gap real es mayor a la tolerancia (achurado o texto cortando el trazo). Son las dos caras del mismo defecto.

**Definición del arquitecto:**

> *"Que sea un cuerpo sólido cerrado significa que su perímetro parte en un punto y termina en el mismo punto. El muro puede estar compuesto de muchos segmentos rectos, en L, en T, en O, etc., pero siempre comunicados."*

Y el test operacional: si se trata el interior del muro como un recipiente y se vierte agua dentro, el agua debe llegar a cualquier punto del cuerpo sin escaparse. Si el flood-fill se escapa, hay discontinuidad real y esa fusión no es válida.

Aclaración clave (ejemplo de la "E": un tramo vertical + tres horizontales): en cualquier unión real (T, L, cruce) **una de las dos caras del muro se interrumpe internamente** en cada punto de conexión. Eso es normal, no es evidencia de muros distintos. El test correcto **no** es "¿esta línea individual sigue derecha?" sino **"¿el contorno exterior del grupo completo cierra como cuerpo sólido?"**.

Diseño acordado para la implementación:
- **Rasterizar el contexto local completo** cerca del punto de contacto — todas las entradas `muros_geo` cercanas, **no solo el par A/B candidato**: hace falta el contexto para que el relleno muestre espesor real.
- **Cerrar micro-gaps** con tolerancia `max(10 % del ancho local del muro, piso mínimo ~2 px)`, no un valor fijo — un valor fijo deja a un muro delgado (0.12–0.14 m, ya confirmados reales) con tolerancia sub-píxel.
- **Verificar componente conectado + espesor real vía `distanceTransform`**, para distinguir masa sólida real de dos líneas que se tocan sin nada detrás.
- Corre **en línea, por par, antes de cada `union(i,j)`** — nunca como filtro posterior sobre grupos ya armados: deshacer una fusión transitiva ya hecha es mucho más difícil que prevenirla.
- Ventana local de análisis en **metros reales**, convertida por página vía `mpx`.
- **Aplica igual a curvas**: lo relevante es que existan 2 bordes enfrentados a separación consistente, sea el recorrido recto o curvo. **No hace falta ingerir Bézier como borde de muro** — se resuelve con pares de líneas rectas cortas que se mantienen enfrentadas a lo largo de un recorrido que puede curvar. (Esto no toca la detección de arcos de puerta, que sí usa Bézier y sigue igual.)
- No se fija un rango numérico de espesor: el espesor puede variar por tramo. Lo relevante es paralelismo continuo dentro de cada tramo + contorno que cierra.
- **La semántica manda sobre la geometría**: un hueco que coincide con una puerta conocida se rechaza siempre por esa razón, no por resultado del test de forma.

Por qué esto y no otra cosa: el mecanismo que sí funcionó a mano fue **proponer candidatos de forma generosa (paso barato, puede fallar) + verificar cada uno antes de aceptarlo (paso confiable)**. El pipeline automático tiene hoy solo el paso 1. El cuerpo cerrado es el intento de automatizar el paso 2.

### 2.9 Clasificador geométrico de ventana (firma D1-D3) — implementado, pero sin conectar al export (**GAP-GEO-VENT-001**)

**Sección reescrita 2026-08-31 — estaba congelada desde 21-ago y ya no reflejaba el código real** (seguía describiendo el prototipo Node "no portado a Python"; el port ocurrió 22-ago).

**Convención permanente confirmada por el arquitecto: par de bordes paralelos + 1 línea central simétrica entre ambos, en rango de espesor de muro plausible (0.08–0.9 m), es una ventana.** (Firma D1-D3 de `Convenciones_CAD.md`; complementaria a la de puerta — "2 líneas sin línea central" — confirmada 30-ago en Beauchef.)

**Estado real del código**: portado e implementado en `cuerpo_cerrado.py:identificar_lineas_centrales` (catalogado como `D1-D3-ventana-lineas-centrales` en `catalogo_tipologias.py`), corre dentro de `clasificar_no_muro()`. Confirmado correcto contra 2 proyectos reales distintos (PdV, Beauchef) — no es una hipótesis sin probar.

**El gap real, sin resolver desde que se detectó por primera vez**: el resultado de esta clasificación solo se usa en 2 canales laterales — (a) como gate dentro de `cuerpo_cerrado_fusiona` para bloquear que las 2 caras de una ventana se fusionen entre sí como si fueran un muro continuo, y (b) para colorear el PNG de diagnóstico (`diag_completo_*`). **Ninguno de los dos escribe de vuelta al export real.** No existe un campo `ventanas_geo` en el schema de salida (ver §2.16) — el diseño original (línea 79 de este documento) asumía que las ventanas siempre vendrían de `analisis_semantico` (Claude Vision), nunca de geometría determinista, y ese supuesto nunca se revisó cuando el clasificador geométrico se construyó después (22–24 ago).

**Consecuencia real, observada 2 veces en 2 proyectos, mismo mecanismo**: la línea central de una ventana, bloqueada de fusionarse con el muro real, queda como su propio grupo de conectividad chico — pasa igual el filtro de span/ángulo de `muros_geo.append()` (Celda 4, ~línea 1700) y se exporta como su propio `MU##`, visualmente correcto en el diagnóstico pero mal etiquetado como muro real en la salida. Primera vez: bug `MU18` (PdV, 21-ago). Segunda vez: `MU18-21` (Beauchef Camarín, 30-ago).

**Segunda opinión pedida (DeepSeek + Codex, 30/31-ago — ver `Herramientas_CubiCasa5k/_consultas/`)**: ambos confirmaron el diagnóstico de causa raíz (gap de arquitectura/wiring, no bug de clasificación) y advirtieron, con razón, que construir un `ventanas_geo` genérico e inmediato arriesga (a) doble fuente de verdad contra `analisis_semantico` sin regla de precedencia, y (b) falsos positivos si la firma se generalizara mal a otros elementos. **Verificado contra el código que ese riesgo no aplica al fix puntual**: la firma D1-D3 es específica (no un filtro genérico) y ya está validada en 2 proyectos — el fix acotado real es excluir del export los segmentos ya confirmados en `_ventana_ids` (no los `_hoja_dudosa_ids`, que siguen siendo duda real), no construir el inventario completo de ventanas.

**Pendiente, sin implementar**: (1) fix acotado — excluir de `muros_geo` los segmentos de línea central ya confirmados como ventana, sin tocar `analisis_semantico` ni la lógica de fusión — secuenciado después de cerrar la revisión de Beauchef Camarín/Baño en curso (MU14-17/MU03-13); (2) diseñar `ventanas_geo` como campo de export propio (origen/confianza/cobertura, regla de precedencia contra Vision) queda fuera de este gap puntual — decisión de arquitectura más grande, sin decidir todavía.

El render de diagnóstico sigue distinguiendo corredores cortos sin veredicto (segmento ≤ 0.45 m no evaluado) como gap aparte, sin cambios en esta pasada.

### 2.10 Pilar / parteluz — definición permanente

**Todo cuerpo cerrado que sea un cuadrilátero que no sea hoja de puerta ni ventana es un pilar (o parteluz).**

Confirmado contra datos reales: 4 segmentos formando un rectángulo cerrado **sin** línea central. Complemento del arquitecto: un pilar es el caso degenerado del mismo cuerpo cerrado, con dos pares de líneas paralelas donde los cuatro lados miden lo mismo — ancho ≈ largo ≈ espesor típico de muro. Se marca como *candidato* a pilar con el mismo detector de cuerpo cerrado, sin lógica geométrica aparte, y sigue pasando por confirmación humana (un pilar y un tramo de muro muy corto se ven geométricamente igual).

### 2.11 Gap de extracción — causa raíz identificada (2026-08-21), fix diseñado, no implementado

Hay **muros reales que nunca llegan a ser candidatos**. Caso testigo: el recinto "Baño Universal" de PdV — ninguna entrada de `muros_geo` traza su contorno.

**Causa raíz real, encontrada auditando el PDF directamente con `pdfjs-dist`** (sin Python local disponible, ver Anexo técnico): el contorno rojo "Se construye" existe en el PDF como líneas `'l'` reales — el achurado diagonal interior SÍ se descarta correctamente por el filtro de ángulo (§2.4d), eso no es el bug. El bug es que el **contorno ortogonal** de esa pared está dibujado en la capa **`'Proyecciones'`**, no en `'Muros'` — confirmado cruzando coordenadas exactas contra el log de Colab. `MAPEO_CAPAS['Proyecciones'] = 'ignorar'` es correcto para el resto del plano (esa capa se usa ahí como eco de otro piso), pero el arquitecto reusó la misma capa para dibujar los muros nuevos del remodelado — y hoy la capa excluye sin que la geometría la contraste (ver principio nuevo en §2.4a). **Verificado que no es un caso aislado**: el mapa visual completo de muros de N1 y N2 (`mapeo_muros_n1/n2_21ago1921.png`) muestra el mismo patrón en varios tramos rojo-achurados de ambos niveles, no solo Baño Universal — probablemente todos los muros nuevos del proyecto están en esta capa.

**Fix diseñado, no implementado, deprioritizado detrás de cuerpo cerrado (§2.8)**: si el color de un segmento coincide con un color ya clasificado por la leyenda SIMBOLOGÍA real (§2.12), el segmento no se excluye aunque su capa esté mapeada a `'ignorar'` — la señal de leyenda prima sobre la exclusión por capa. Depende de que la leyenda se detecte correctamente primero (ver §2.12, bug de detección también encontrado el mismo día).

**Confirmado que el gap NO afecta el área de recintos, al menos en este caso.** "Baño Universal" aparece correctamente en `mediciones_geometricas` con área 29.72 m², pese a que sus muros no aparecen en `muros_geo` — el cálculo de área de recintos usa una señal distinta e independiente del pipeline de muros. **No es garantía general** — confirmado para este caso puntual.

Diagnóstico `ZONAS_DIAGNOSTICO_MURO_PERDIDO` (6 zonas de PdV Nivel 1) ya corrió en Colab el 2026-08-21 y fue la fuente de datos que permitió encontrar la causa raíz de arriba — dump completo revisado.

Evidencia del feedback del arquitecto en `Fase 2/Desarrollos/Test/pdv/marcas_feedback_global_cap1-6.png`: **5 marcas amarillas `EX`** ("debiste excluir") y **14 lilas `IN`** ("debiste incluir"), con numeración **global a través de las 6 capturas**, detectadas y numeradas por script (no a ojo).

**🔴 Segundo gap encontrado el mismo día, mayor alcance — bug `MU18` (ventana+pilar+ventana) reproducido en la corrida cruda**: al generar por primera vez esta sesión un mapa visual 100% crudo de `muros_geo` (sin corrección manual encima), el arquitecto marcó (Screenshot_474/475/476) falsos positivos de línea central de ventana y falsos negativos que rompen cuerpo cerrado en varios puntos de N1 y N2. Confirmado con el log real que **no es una regresión de los cambios del día** — es exactamente el bug `MU18` ya documentado en §2.9 (centro de ventana capa `'Ptas Ventanas'` fusionado con muro real, porque `puerta`/`ventana` son solo diagnóstico), visible ahora en varios puntos más porque es la primera vez que se compara contra salida cruda en vez de contra `backfill_v5.png` (que era una corrida corregida a mano, no la salida real del pipeline). Mismo fix pendiente: clasificador línea-sola (§2.9) + cuerpo cerrado (§2.8), sin portar todavía.

### 2.12 Achurado — implementado 2026-08-21, pero la detección de leyenda tiene un bug real en PdV

**Vigente e implementado**: el achurado — el relleno diagonal — **siempre se ignora como geometría**. Solo la **silueta** del elemento cuenta como candidato a muro (el filtro angular de §2.4d ya descarta las líneas de achurado a 45°, que nunca son ortogonales). El color se usa **únicamente** para etiquetar el elemento como `agregado` o `eliminado`, leyendo la leyenda **SIMBOLOGÍA real del PDF**, nunca hardcodeado. `_es_amarillo` **fue eliminada por completo del código** (no dejada muerta) en `21aug_1445.ipynb` — el filtro angular ya no excluye por color. Cada `muros_geo` tiene campo `estado` (`agregado`/`eliminado`/`None`).

**🐛 Bug real encontrado al correr `21aug_1516.ipynb` en Colab (2026-08-21)**: `_detectar_leyenda_simbologia` no encontró ninguna leyenda en el PDF de PdV, pese a que existe (confirmado con capturas del arquitecto — recuadro "SIMBOLOGIA", swatches amarillo "Se retira"/rojo "Se construye", página 2). Causa, auditada con `pdfjs-dist` sin Python local: los 2 swatches están armados como rectángulo cerrado por líneas `'l'` (moveto+lineto×3+cierre), **no** como `'re'`/`'qu'` nativos, y **sin relleno sólido** (`fill=None`, solo `stroke` + líneas de achurado diagonal) — la función exige `op=='re'/'qu'` y `path.get('fill')` truthy, falla en los dos filtros a la vez. Mismo patrón de dibujo (contorno+achurado por líneas, sin primitivas rellenas) que causó el gap de §2.11.

**Fix diseñado, no implementado**: reconocer también un swatch como contorno cerrado de 4-5 puntos armado con `'l'`, con fallback al color de `stroke` cuando no hay `fill`. Sin este fix, la leyenda nunca se detecta en PdV y la regla de override de §2.4a/§2.11 no tiene de dónde sacar el color clasificado.

**🆕 Pendiente de producto, agregado 2026-08-21**: en vez de confiar 100% en la detección automática de la leyenda, el sistema debe **proponerle al arquitecto** las leyendas detectadas por página (color + texto) en una interfaz propia, y el arquitecto **confirma, descarta o agrega** antes de procesar. No implementado.

El mecanismo de "desproteger por achurado" (`ACHURADO_DESPROTEGER_ACTIVO`) está en `False` y **no debe documentarse ni razonarse como activo**: hoy solo alimenta un contador de diagnóstico. Se desactivó porque el supuesto de "cluster local acotado" no se sostiene con agrupamiento transitivo — el grupo puede terminar abarcando gran parte de la página y "aprobar" el chequeo de extensión perpendicular sin que haya relleno 2D real en ningún punto.

### 2.13 Tolerancias: todas en metros reales

**Ninguna tolerancia de medición vive en píxeles.** Todas se definen en metros y se convierten a píxeles por página vía `mpx`, porque un valor en píxeles no generaliza entre planos de distinta escala o resolución.

El patrón obligatorio es siempre el mismo:

```python
TOL_X_M  = 0.21
TOL_X_PX = TOL_X_M / mpx if mpx else 35    # el literal es solo fallback
```

**Si aparece un `TOL_X_PX = 35` sin su `TOL_X_M` correspondiente, es código viejo o incorrecto.**

Constantes vigentes (valor en metros):

| Constante | m | Para qué |
|---|---|---|
| `UMBRAL_MURO_M` | 1.5 | Span mínimo de cadena para proteger como muro |
| `TOL_MURO_M` | 0.21 | Conectividad entre segmentos de la cadena de muro |
| `TOL_DIAMETRO_CLUSTER_M` | 0.35 | Tope de diámetro del clustering de nodos |
| `TOL_FUSION_MUROS_M` | 0.06 | Fusión de entradas `muros_geo` por proximidad |
| `TOL_PERP_M` | 0.12 | Tolerancia perpendicular (líneas de referencia) |
| `TOL_GAP_M` | 0.41 | Gap admisible en línea de referencia periódica |
| `UMBRAL_DASH_M` | 1.0 | Span mínimo de cadena discontinua |
| `TOL_DASH_GAP_M` | 0.24 | Gap entre guiones de una misma cadena |
| `UMBRAL_MARCA_M` | 0.20 | Largo máximo de marca de cota |
| `UMBRAL_PORTADOR_M` | 0.5 | Largo mínimo de línea portadora de cota |
| `TOL_MARCA_CERCA_M` | 0.09 | Marca de cota cerca del portador |
| `TOL_MARCA_A_TEXTO_M` | 0.35 | Marca de cota a su texto |
| `TOL_CRUZ_EXTREMO_M` | 0.15 | Cruz cerca del extremo del portador |
| `TOL_CRUZ_ENTRE_MARCAS_M` | 0.07 | Marca perpendicular ↔ diagonal entre sí |
| `TOL_MIN_LARGO_LINEA_M` | 0.01 | Descarta puntos degenerados |
| `RADIO_ACHURADO_M` | 0.35 | Radio de agrupamiento del diagnóstico de achurado |
| `MIN_EXTENSION_PERPENDICULAR_M` | 0.47 | Extensión perpendicular mínima (diagnóstico) |
| `UMBRAL_RADIO_BEZIER_MIN_M` | 0.5 | Piso de radio para aceptar un arco Bézier como puerta |
| `UMBRALES_COTA_M` | (3 niveles) | Umbrales de diagnóstico de cota |

Únicas excepciones deliberadas, porque son operaciones de píxel de imagen y no mediciones del mundo real: `PADDING_TEXTO_PX` (borrar texto en una máscara) y `MARGEN_BORDE_PX` (chequear si un contorno toca el borde del recorte).

### 2.14 Recintos y superficies (OpenCV)

Después de la extracción vectorial, y usándola:

1. Se **borra del raster gris** el texto (con las posiciones exactas del vector — el texto no debe limitar el área de un recinto) y las líneas discontinuas ya identificadas (deslinde, línea de edificación, ejes).
2. Se binariza y se segmentan los recintos cerrados → `mediciones_geometricas` con área en m², ancho mínimo (`minAreaRect`) y estado `cumple_geo`.
3. `incumplimientos_geo` marca área insuficiente, ancho insuficiente y `discrepancia_area_declarada` (este último con esquema de claves propio: `medido`/`declarado`/`diff_pct`, no `minimo`/`deficit`).
4. Si `PAGINA_CUADRO_SUPERFICIES` está seteada, el cuadro de superficies se extrae como **texto exacto vía PyMuPDF** (no se adivina desde la imagen) y se cruza contra las áreas medidas.

Nota de alcance vigente: el área se calcula por segmentación de lo que está encerrado por muros protegidos. Un recinto delimitado por una ventana, un vano abierto o un cambio de pavimento en vez de un muro sólido probablemente no se segmenta bien hoy. Ver §4.

### 2.15 Capa semántica (Claude Vision)

Se llama al Worker con la imagen de la página y devuelve `analisis_semantico`: tipo de plano, nivel, uso del proyecto, recintos con nombre y `bbox`, `elementos_detectados` (conteos por categoría) y observaciones normativas preliminares. Después se cruza contra la geometría por nombre normalizado (ASCII, sin tildes).

Su rol vigente es **semántico, no geométrico**. `rampas` no tiene conteo semántico (no se extrae en `elementos_detectados`) — queda en 0; es un gap conocido, no un bug.

### 2.16 Salida

Por página (`resultados_paginas[i]`): `entry_idx`, `fname_tag`, `pagina`, `escala`, `mpp`, `imagen_w_px`/`imagen_h_px`, `mediciones_geometricas`, `incumplimientos_geo`, `analisis_semantico`, **`muros_geo`**, **`puertas_geo`**, `muros_excluidos_por_referencia`.

Archivo final: `archicheck_geometrico_{slug}_{DDmes_HHMM}.json` con `resumen_global` (páginas, área total, recintos, incumplimientos, conteo de elementos y su fuente) + un PNG anotado por página. Ambos se suben al portal.

### 2.17 Diagnósticos de solo lectura

Corren e imprimen, **nunca cambian un resultado ni se aplican automáticamente**:
- `EJES/COTAS RELAJADO v2` — solo si no hay capa mapeada para esa categoría; si la hay, imprime por qué se omite.
- Distribución de capas, dashes nativos, metadata del PDF, TOC.
- `ZONAS_DIAGNOSTICO_MURO_PERDIDO` (§2.11).
- Contador de achurado (§2.12).
- `detectar_figuras_lamina()` — analiza la lámina completa sin recortar y **sugiere** qué poner en `PAGINAS_Y_ESCALAS`, para reducir el trabajo manual de definir recortes.

---

## 3. Convenciones y reglas permanentes

Esta sección es la parte más reutilizable del documento: son reglas confirmadas explícitamente por el arquitecto o por el usuario, que aplican a **todo** el proyecto y a cualquier funcionalidad futura, no solo a donde se descubrieron.

### 3.1 Escala manual, siempre
La escala del plano se ingresa a mano (`PAGINAS_Y_ESCALAS`) y **nunca** se infiere con Claude Vision. Se equivoca, y toda la conversión a metros depende de ese valor. Mismo criterio para `MAPEO_CAPAS`: se completa a mano por proyecto, no se adivina por palabras clave.

### 3.2 Nunca dejar pasar errores en silencio
Definición permanente del usuario, formulada a propósito como principio general de todo el proyecto — código, notebook, portal, cualquier automatización futura.

Ante cualquier condición donde algo podría no coincidir, no encontrarse, fallar parcialmente o comportarse distinto de lo esperado (typo, dato faltante, capa que no matchea, API que responde distinto), hay que **avisar explícitamente y de forma imposible de pasar por alto**. No alcanza con que el dato "esté ahí" en un log si hay que leerlo con cuidado para notarlo.

Ya implementado como ejemplo canónico: la Celda 3 valida tanto los *nombres de capa* contra los reales del PDF como las *claves de categoría* (`eje`, `cota`, `mobiliario`, `ignorar` — las únicas con lógica real) contra typos de mayúscula/espacio que las harían pasar como categoría nueva sin aviso; y la Celda 4 avisa si una categoría con capas mapeadas termina con 0 coincidencias reales en una página.

### 3.3 Al corregir un patrón, auditar todo lo ya construido
Cuando se encuentra y corrige un patrón de error en un elemento, hay que revisar **de inmediato todos los demás elementos ya construidos** por ese mismo patrón y corregirlos también — antes de seguir a la siguiente tarea. No esperar a que el arquitecto los reporte uno por uno.

Aplica a **cualquier categoría**, no solo puertas: muros, ventanas, escaleras, lo que sea. Y aplica también a elementos de sesiones anteriores, no solo a los de la sesión en curso.

### 3.4 Verificar con overlay contra el plano real antes de presentar
Ninguna geometría reconstruida se reporta como terminada sin:
1. **Declarar qué fuente de datos se usó** — vectorial real (`segmentos`) o medida a mano.
2. **Usar los datos vectoriales reales cuando existen**, todos los puntos, revisando el residuo del ajuste — no resumirlos a una forma sin verificar que el ajuste sea bueno, y no alternar arbitrariamente entre dato preciso y estimación a ojo.
3. **Generar un crop del resultado dibujado directamente sobre el plano base sin editar**, en las mismas coordenadas, y compararlo deliberadamente. "Se ve bien" en una mirada rápida no es suficiente.

Corolario importante: **la autoverificación es señal débil, no confirmación.** Cuando la misma pasada construye y revisa, un error de interpretación de fondo (qué curva es un arco vs. un fixture, qué muro es cuál, qué lado es "izquierda") se repite idéntico en ambos pasos. Preferir siempre un dato independiente contra el cual cruzar — el arco de referencia ya impreso en el plano original es la mejor opción, porque calzar pixel a pixel contra él sí es confirmación fuerte. Cuando no hay nada independiente, presentar el resultado como **candidato explícito** y pedir confirmación, no como hallazgo cerrado.

Y un caso concreto ya visto dos veces: una conclusión visual sobre a qué elemento corresponde una coordenada reportada en un log **no es válida hasta confirmarla por color/pixel exacto**. Dos elementos a 30–50 px son fácilmente confundibles a simple vista en un plano denso.

### 3.5 Excluir siempre cortes y rasantes
*"Siempre excluye los cortes y rasantes."* — En **cualquier** plano nuevo, antes de dar un conteo de muros por bueno, hay que buscar y excluir explícitamente las líneas de corte (patrón guión-punto, símbolo círculo + triángulo en los extremos, etiquetas "CORTE A/B/…") y las líneas de rasante/nivel/deslinde/línea oficial. No solo cuando se nota contaminación evidente.

Estas líneas se fragmentan en muchos candidatos sueltos que la heurística geométrica no distingue de un muro real, y cada dash sobrevive como su propio grupo porque no se tocan entre sí.

### 3.6 La geometría de cuerpo cerrado manda sobre heurísticas posicionales
Si un elemento tiene estructura real de muro (dos bordes enfrentados, cuerpo que cierra), no se excluye por dónde está. "Está cerca del deslinde" no es motivo de exclusión.

La contracara también es regla: **no todo lo que actúa como muro en el plano ES un muro.** Una reja se comporta geométricamente igual y `muros_geo` la clasifica igual — antes de aplicar reglas que dependen del tipo de elemento (por ejemplo, dónde va el gozne), conviene confirmar qué es realmente: muro, pilar o reja.

### 3.7 Notebook: versionado y forma de editarlo
- **Timestamp fresco en cada edición del archivo vivo.** El paso final de toda edición es: (1) escribir el contenido nuevo en un archivo con nombre fresco `ArchiCheck_Base {DD}{mes}_{HHMM}.ipynb`, (2) **mover** (no copiar) el archivo con el nombre viejo a `Versiones anteriores/`. Nunca dos archivos "vivos" coexistiendo. Hacer un backup antes de editar in-place **no** cumple la misma función.
- Aplica a **cualquier** `.ipynb` del proyecto (pipeline principal, benchmarks, futuros), cada uno con su propia carpeta `Versiones anteriores/`.
- **Nunca asumir de memoria el nombre del archivo vivo** — verificarlo con un listado antes de indicarle al usuario qué subir a Colab, porque cambia en cada edición.
- **`NotebookEdit` no se puede usar**: el archivo es demasiado grande y `Read` falla (offset/limit no ayudan, cada celda es una línea JSON gigante). Para leer una celda: parsear el `.ipynb` como JSON con Node y volcar `cells[i].source` a un `.py` aparte. Para editar: escribir el código nuevo completo y un script Node que respalde, parsee, reemplace `cells[idx].source` (array de líneas terminadas en `\n` salvo la última), limpie `outputs`/`execution_count` y reescriba el JSON. Verificar después que siga siendo parseable.

### 3.8 Render de arcos y elementos curvos
- **Siempre línea continua y completa**, nunca punteada, aunque los datos de origen traigan micro-saltos entre segmentos consecutivos. Esos huecos son artefacto del muestreo, no evidencia de elementos distintos.
- **No fusionar dos elementos porque "calzan visualmente".** Eso es una hipótesis a proponer al arquitecto, no una fusión a aplicar.

### 3.9 Verificación humana obligatoria
Ningún conteo, ninguna fusión y ningún elemento se dan por cerrados sin confirmación del arquitecto. La automatización propone; el humano dispone. Esto es estructural en el producto, no una etapa transitoria: el gate de revisión gráfica (§1.5) existe justamente para hacerlo escalable.

### 3.10 Reglas reusables, no datos hardcodeados
Decisión explícita del arquitecto: **no** reinyectar al pipeline los datos construidos a mano para un proyecto puntual (puertas o muros específicos de PdV) — eso no generaliza. Lo que se captura del trabajo manual son **las reglas aprendidas** (el arco define la posición del gozne, el gozne es el centro de la hoja, la verificación pixel a pixel es obligatoria) para que el pipeline las aplique en cualquier plano nuevo, en vez de replicar un caso de memoria.

### 3.11 Presentar opciones antes de implementar cambios de diseño/UX
Ante una decisión real A vs. B, pausar y presentar las opciones. Para lo demás, proceder sin pedir confirmación.

### 3.12 Sincronización de documentación
- Cada actualización del roadmap `.md` se refleja en la misma sesión en `archicheck/Fase 2/Roadmap_ArchiCheck.html`.
- Toda actualización de roadmap se refleja también en la memoria del proyecto, en la misma pasada.
- **Este documento** debe mantenerse sincronizado con el mismo criterio: cuando un diseño acordado pasa a implementado, se actualiza acá, no solo en el roadmap.

---

## 4. Lo que NO está implementado

Lista explícita de lo que está diseñado, acordado o detectado pero **no** existe como código funcionando en el pipeline.

### 4.1 En el pipeline geométrico

| Ítem | Estado | Detalle |
|---|---|---|
| **Test de cuerpo cerrado** | Diseño acordado completo (§2.8), sin una línea escrita | Es la validación que debería reemplazar al umbral ciego de fusión. Bloquea la calidad del conteo de muros |
| **Clasificador "línea sola = ventana" portado a Python** | Validado en Node con 0 falsos rechazos (§2.9), no está en el notebook | Listo para portar como filtro pre-fusión |
| **Segmentos cortos (≤ 0.45 m) sin veredicto** | Gap conocido, hallazgo 2026-08-21 (§2.9) | Hoy quedan en limbo (gris) en vez de evaluarse. Diseño correcto: aplicarles el mismo test de cuerpo cerrado para clasificarlos activamente como pilar/parteluz |
| **Achurado por leyenda real** | ✅ Implementado en `21aug_1445.ipynb` (§2.12), `_es_amarillo` eliminada | Corrida real 2026-08-21: la **detección de la leyenda falla** en PdV (bug real, causa identificada — swatches por líneas sin fill, ver §2.12), fix diseñado sin portar |
| **Override: color de leyenda prima sobre capa `'ignorar'`** | Diseño acordado (§2.4a/§2.11), no implementado | Depende del fix de detección de leyenda de arriba. Deprioritizado detrás de cuerpo cerrado |
| **Capa como señal/prior, nunca autoridad dura** | Decisión de fondo confirmada 2026-08-21 (§2.4a), no implementado | Hoy `ignorar`/`mobiliario` excluyen duro y `puerta`/`ventana` son no-op puro — ninguno de los dos se contrasta contra geometría. Cuerpo cerrado es el mecanismo elegido para resolverlo |
| **Interfaz de confirmación de leyenda por página** | Pendiente de producto, agregado 2026-08-21 (§2.12) | El sistema debe proponer las leyendas detectadas (color+texto) y el arquitecto confirma/descarta/agrega, en vez de confiar 100% en la detección automática |
| **Causa raíz del gap de extracción (Baño Universal)** | ✅ Identificada 2026-08-21 (§2.11) — capa `'Proyecciones'` reusada para obra nueva | No es un caso aislado: el mismo patrón aparece en varios tramos de N1 y N2 (`mapeo_muros_n1/n2_21ago1921.png`). Fix = override de arriba, no implementado |
| **`ventanas_geo` — clasificador geométrico de ventanas** | No existe | Hoy las ventanas dependen de la estimación de Claude Vision, con la misma imprecisión que muros y puertas tenían antes de tener clasificador propio (hay casos documentados de ventana alucinada). Punto de partida acordado: un rectángulo cuyo lado más largo tiene una tercera línea paralela al medio — *"como un muro recto con una línea al centro"*. Más simple que el arco de puerta: no requiere ajuste de curva |
| **Filtro de clasificación upstream completo** | Parcial | El clasificador de línea sola cubre un caso. Falta excluir pilares y otros elementos que hoy entran a la lista de candidatos a muro |
| **Puertas dibujadas como rectángulo sin arco** | Sin resolver (§2.7) | El clasificador da 0 candidatos por diseño; no hay forma confiable de ubicar esos rectángulos todavía |
| **Relajar el filtro angular de muros** | Acordado, secuenciado después del cuerpo cerrado | El ángulo debe pasar de filtro excluyente a prioridad (§2.4d) |
| **Usar el valor numérico de las cotas** | No implementado | `cotas_texto` se extrae y se usa para limpiar el raster, pero **no** se cruza sistemáticamente contra ningún segmento específico para validar la medida real contra la declarada |
| **Validar la capa `Superficies` contra el cuadro** | No implementado | Existe la validación contra `PAGINA_CUADRO_SUPERFICIES`, falta el cruce a nivel de capa nativa |
| **Superficies con ventanas y otros divisores** | Pendiente explícito, no iniciar todavía | Un recinto delimitado por ventana / vano abierto / cambio de pavimento probablemente no se segmenta bien hoy. Se retoma después de tener ventanas con la precisión ya lograda en puertas |
| **Contaminación por grilla de piso** | Sin resolver | Un detalle con baldosas produjo cientos de falsos "muros"; esa sub-lámina quedó excluida del trabajo |
| **Muros curvos** | Cubiertos por el diseño de cuerpo cerrado, sin implementar | Se resuelven con 2 bordes enfrentados a separación consistente, sin ingesta especial de Bézier |
| **Distinguir muro real de reja** | Sin regla automática | Depende de criterio caso a caso / del arquitecto |

### 4.2 En el portal

| Ítem | Estado |
|---|---|
| **Highlight visual del recinto seleccionado** en el canvas | No existe; el feedback es solo texto |
| **Cambiar la categoría de un elemento ya creado** | No existe; hay que eliminar y volver a marcar |
| **Etiqueta/medida en el momento del clic** | No existe. El clic solo captura posición y calcula `ancho_estimado_m`; `ubicacion_o_recinto` nace vacío. Se puede editar **después** desde `PanelRetag` |
| **"Iluminar" todas las instancias de una categoría o de una capa** sobre el plano | Diseñado, no implementado |
| **Marcar una capa como "ignorar" desde el portal** | Diseñado, no implementado — hoy esa decisión solo se toma en Colab, a mano, vía `MAPEO_CAPAS['ignorar']` |
| **Chat bidireccional de resolución de dudas** sobre el plano | Sin diseño de interfaz ni de propagación de la corrección hacia el pipeline |

### 4.3 A nivel de producto

| Ítem | Estado |
|---|---|
| **Base de datos de proyectos / repositorio versionado** | No existe |
| **API backend propia** | No existe (solo el Worker como proxy) |
| **Gestión de usuarios, multi-tenancy, billing** | No existe |
| **Ingesta de DWG/DXF y de PDF escaneado** | Fuera de alcance por decisión de producto |
| **Modelo externo de extracción integrado** (MitUNet, Raster2Seq, Floor Plan API…) | Ninguno integrado. El patrón acordado si alguna vez se integra es "fuente en paralelo + detector de discrepancias", nunca reemplazo |
| **Motor de reglas determinista** | Pendiente. Depende de tener el inventario geométrico completo para poder correr sus chequeos sobre todos los elementos reales |
| **Análisis de dossier completo** (más allá del plano) | Fase posterior, no iniciada |

---

## 5. Cómo levantar el entorno y correr el pipeline

### 5.1 Pipeline geométrico (Colab)

1. Ubicar el notebook vivo: el `ArchiCheck_Base *.ipynb` con el timestamp más reciente en `archicheck/Fase 2/Desarrollos/Test/`. **Verificarlo con un listado, no de memoria.**
2. Subirlo a Google Colab. **Runtime CPU** — no requiere GPU.
3. **Celda 1** — instala dependencias (~60 s).
4. **Celda 2** — subir el PDF. Valida que sea vectorizado (rechaza escaneados) y lo convierte a imágenes.
5. **Celda 3 — la única que se edita.** Correrla **primero con `MAPEO_CAPAS` vacío**: imprime la lista real de capas OCG del PDF. Copiar/pegar de esa lista (no reescribir a mano) los nombres exactos en las categorías que correspondan y volver a correrla. Completar también `NOMBRE_PROYECTO`, `PAGINAS_Y_ESCALAS` (con recorte si la lámina trae varias figuras) y, si aplica, `PAGINA_CUADRO_SUPERFICIES`. La celda muestra un preview de cada página con el recorte en rojo y el `m/px` resultante: **si el preview no es correcto, no seguir**.
6. **Celda 4** — el procesamiento completo por página: Claude Vision + extracción vectorial + OpenCV + cruce. Es la celda larga; su log es la fuente principal de diagnóstico (mapeo por capa, exclusiones con desglose, muros protegidos/fusionados, pares bloqueados por puerta, avisos).
7. **Celda 5** — visualización con detecciones superpuestas.
8. **Celda 6** — informe en consola + guarda `archicheck_geometrico_{slug}_{timestamp}.json`.
9. **Celda 7** — descarga el JSON y los PNG al PC.

Notas prácticas:
- El PDF de prueba principal es PdV (restaurante Plaza Pedro de Valdivia, Providencia), con Nivel 1 y Nivel 2 en la página 2. Otros planos de referencia con datos ya generados: Beauchef, Isla de Pascua, Campo Lindo, cada uno en su subcarpeta de `Fase 2/Desarrollos/Test/`.
- Ground truth validado disponible para PdV: **Nivel 1 = 28 muros, Nivel 2 = 33 muros**, confirmados por el arquitecto contra el plano real. Es la vara contra la que se mide cualquier cambio en el conteo. (Conteos crudos previos como "122/94" no representan muros en el sentido del arquitecto y no deben usarse como referencia.)
- **Descargar siempre el JSON** al terminar. Hay proyectos que corrieron el notebook pero cuyo `.json` nunca se bajó, lo que obliga a re-correr Colab antes de poder trabajar sobre ellos.

### 5.2 Portal (frontend)

```bash
cd C:\Users\nicolas.estragues\Documents\Claude\archicheck
npm install          # solo la primera vez
npm run dev          # http://localhost:5174/
npm run build        # build de producción
npm run lint
```

`archicheck/.env` define `VITE_WORKER_URL`.

⚠️ **No dejar `npm run dev` corriendo en background durante una sesión larga de revisión gráfica** — causó pérdida real de datos.

Deploy: push a `main` → Vercel despliega solo. https://archicheck-xi.vercel.app/

### 5.3 Flujo completo end-to-end

```
Colab (§5.1) → JSON + PNGs
   ↓  subir en la sección "RESULTADOS COLAB" del portal
Portal: gate de revisión gráfica (obligatorio)
   ↓  el arquitecto corrige/agrega/elimina geometría
Análisis normativo (Capa 1 + Capa 2, Claude + GPT-4o en paralelo vía Worker + RAG)
   ↓
Informe + PNGs revisados descargables
```

### 5.4 Worker

```bash
# desde archicheck-worker/
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY     # también OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY
```

Confirmado (§1.2): la config activa es `archicheck-worker/wrangler.toml` (`name = "archicheck-worker"`). `laude` está desactivado desde 2026-07-23 y no debe usarse como referencia de deploy.

### 5.5 Pipeline local heredado (`ArchiCheck_Pipeline.ps1`) — OBSOLETO

Existe en la raíz `Documents/Claude/` un orquestador PowerShell (`ArchiCheck_Pipeline.cmd` / `.ps1`) que toma PDF + página + escala y produce un PNG anotado y un informe Word, usando Windows.Data.Pdf para el render y el Worker para el análisis.

**Confirmado obsoleto**, reemplazado por el flujo Colab → portal: el archivo no se modifica desde mayo, y la única mención reciente en el roadmap lo cita solo como referencia de un mecanismo de renderizado (Windows.Data.Pdf/WinRT), no como flujo activo. Se documenta como herramienta de una fase anterior del producto, no como parte del pipeline vigente.

Nota operativa si alguna vez se retoma: los `.ps1` no se ejecutan directamente (política de ejecución); usar el `.cmd`, o `powershell -ExecutionPolicy Bypass -File ...`. Y todo `.ps1` del proyecto se escribe **solo en ASCII**.

---

## Anexo — Puntos que estaban pendientes de confirmar (resueltos 2026-08-21)

Los 7 puntos que este documento no pudo determinar con certeza en su primera versión ya se verificaron contra datos/archivos reales (no de memoria) y quedaron reflejados en el cuerpo del documento. Se deja el registro acá por trazabilidad.

1. **Worker vigente y ruta de deploy** (§1.2, §5.4) — **Resuelto: `archicheck-worker`, no `laude`.** Verificado con archivos reales: `archicheck/.env` → `VITE_WORKER_URL=https://archicheck-worker.nestragues.workers.dev`; `archicheck-worker/wrangler.toml` existe y es la config activa; en la raíz `Documents/Claude/` no hay `wrangler.jsonc` activo, solo `wrangler.jsonc.disabled_2026-07-23_apuntaba-a-laude`. `laude` fue desactivado el 2026-07-23 y el frontend nunca volvió a apuntarle. (La memoria de Claude decía lo contrario — ya se corrigió.) Deploy: `npx wrangler deploy` desde `archicheck-worker/`.

2. **`ArchiCheck_Pipeline.ps1` / `.cmd`** (§5.5) — **Resuelto: obsoleto.** El archivo no se modifica desde mayo, y la única mención reciente en el roadmap lo cita solo como referencia de un mecanismo de renderizado (Windows.Data.Pdf/WinRT), no como flujo activo. Documentado como herramienta de una fase anterior, no como parte del pipeline vigente.

3. **Alcance real del filtro de color de achurado en el código actual** (§2.12) — **Resuelto: sigue activo, diseño superado sin portar todavía.** `_es_amarillo` sigue en el código hoy. El diseño acordado el 2026-08-21 (achurado siempre ignorado como geometría; color solo etiqueta `agregado`/`eliminado` vía leyenda SIMBOLOGÍA real del PDF, nunca hardcodeado) todavía no está implementado. El documento describe ambos estados: el código activo y el diseño que lo reemplaza.

4. **Ingesta de Bézier como borde de muro** — **Confirmado correcto tal como estaba documentado.** Descartado a favor de cuerpo cerrado (líneas enfrentadas). Sin cambios.

5. **Exclusión de ejes: ¿capa manda sola, o siempre además la heurística?** — **Confirmado correcto tal como estaba documentado.** "Capa manda sola" coincide con el código y con el hallazgo de 0 % de precisión de la heurística geométrica cuando hay capa mapeada. Sin cambios.

6. **Estado del `test_linea_sola_v2`** (§2.9) — **Resuelto: el gris NO es una tercera categoría permanente.** Es un gap identificado el 2026-08-21 a partir del feedback del arquitecto sobre las capturas Cap7/8/10. Umbral real usado en el prototipo de Node: segmentos ≤ 0.5 × espesor máximo de búsqueda (0.9 m × 0.5 = **0.45 m**) quedan "sin veredicto". El diseño correcto (no implementado) es evaluarlos con el mismo criterio de cuerpo cerrado para clasificarlos activamente como pilar/parteluz, nunca dejarlos en limbo.

7. **Alcance de `mediciones_geometricas` vs. el gap de extracción** (§2.11) — **Resuelto para el caso confirmado: NO afecta áreas de recinto.** Verificado con datos reales del JSON de la corrida de hoy: "Baño Universal" tiene área 29.72 m² correcta en `mediciones_geometricas` pese a que sus muros no están en `muros_geo` — el cálculo de área usa una señal independiente (probablemente el raster/threshold directo, no depende de `muros_geo`). Confirmado solo para este caso puntual, no probado como garantía general.
