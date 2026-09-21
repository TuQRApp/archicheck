# Cobertura de anexos gráficos de la normativa

**Regla del proyecto (usuario, 2026-09-21), no opcional:**

> *Las tablas deben ser leídas completas: texto, números, fórmulas. También las otras imágenes (cualquiera) deben ser extraídas e incorporadas. Esto es para OGUC, LGUC, DDU, la Ley 19.300 y los PRC actuales y los que vayamos incorporando.*

---

## Estado: 215 de 215 imágenes leídas

| Corpus | Imágenes | Leídas | Anexos |
|---|---|---|---|
| **OGUC** | 30 | 30 | 27 |
| **DDU** (Libro completo, 351, 447, índice) | 68 | 68 | 12 |
| **PRC Providencia** | 99 | 99 | 9 |
| **PRC Santiago** | 13 | 13 | 5 |
| **PRC Ñuñoa** | 2 | 2 | 2 |
| **LGUC** | 1 | 1 | 1 |
| **Ley 19.300** | 1 | 1 | (mismo anexo que LGUC) |
| **PRC Isla de Pascua** | 1 | 1 | 1 |
| **TOTAL** | **215** | **215** | **59** |

### Las 306 páginas "vectoriales" — auditadas y cerradas

El extractor marca como candidata toda página con más de 40 trazos. Eran 306. **Auditadas una por una, ninguna contiene una figura sin leer.**

| Qué resultaron ser | Cuántas |
|---|---|
| Rejillas de tabla: trazos que son líneas rectas de menos de 1,5 pt de grosor | 224 |
| Sombreado de celdas y letras de la marca de agua (sobre todo la ordenanza de Providencia, 56 págs.) | 60 |
| Figuras reales **ya procesadas** (esquemas de fachada del PRC Santiago, figuras de la DDU) | 22 |

El criterio de descarte no fue visual: se contaron las formas **no lineales** por página y se verificó que el contenido de esas páginas **sí está en la capa de texto**. Comprobado sobre muestras de los 4 PDF con más candidatas — el catálogo de inmuebles de Santiago (págs. 46–52) tiene 4.264 caracteres de texto por página, y las tablas de la DDU‑447 también.

### Qué descarta el filtro — auditado imagen por imagen

| Qué | Cuántas | Por qué |
|---|---|---|
| Membrete de Ley Chile y logos institucionales | 6 | Se repiten en más de 3 páginas |
| Ícono 90×90 de Ley Chile, logo 61×46 | 4 | Área < 15.000 px |
| Números de página **escaneados** del PRC Santiago (99×94) | 146 | Área < 15.000 px. Verificado abriendo uno: es un "1" |

**Ninguna fórmula ni tabla queda fuera del filtro.**

---

## Las 6 fórmulas del corpus

Todas extraídas y transcritas. Ninguna estaba en la capa de texto.

| Fórmula | Fuente | ¿Llega al prompt hoy? |
|---|---|---|
| `S = (a×b) + (d×e)` y `Superficie construida = S − Z` — cómputo de superficie edificada por piso (Z = vacíos, ductos verticales y escaleras de evacuación) | DDU, Art. 5.1.11 | **Sí** |
| `punto promedio = (a+b)/2` — altura de adosamiento en terreno inclinado | DDU, Art. 2.6.2 | **Sí** |
| `% = (Densidad de ocupación × 11) / 2.000` — porcentaje de cesión | OGUC 2.2.5 bis | **Sí** |
| `SMV = StPV × (%mV/100%)` — superficie máxima de ventana | OGUC 4.1.10 | No |
| `Upvm = ((Um·Sm) + (Uv·Sv)) / (Sm + Sv)` — transmitancia ponderada | OGUC 4.1.10 | No |
| `Densidad de ocupación = (carga nueva − carga demolida) × 10.000 / superficie bruta` | DDU 447 | **Sí** (Art. 2.2.5 bis) |

**Ampliación aplicada el 2026-09-21**: la lista pasó de 43 a **48 artículos OGUC**. Se agregaron `4.2.18` (ancho de pasillos), `5.1.11` (cómputo de superficie edificada), `2.6.13` (sombra proyectada), `2.3.3` (anchos de pasajes) y `2.2.5 bis` (cesiones por densificación). Costo real: **+9,1%** del bloque normativo, de 46k a **50k tokens**.

Se dejaron **fuera a propósito** el Art. 4.1.10 (acondicionamiento térmico, ~14k tokens) y el 2.2.8 (~7k): sus exigencias son valores U, R100 y permeabilidad, que se acreditan con especificaciones técnicas y ensayos, **no se leen de una planta**. Quedan transcritos y disponibles para el RAG.

---

## Hallazgos que solo existían en imágenes

Ordenados por gravedad.

**1. PRC Ñuñoa — la Zona Z-7 tiene su cuadro normativo completo en el texto y encima un sello que dice que no aplica.** *"ESTA ZONA NO ES APLICABLE EN EL TERRITORIO COMUNAL"*, en diagonal sobre la página 37. El sello existe **únicamente como imagen**; el texto entrega subdivisión 300 m², COS 0,6, constructibilidad 1,5, altura 8 m y antejardín 5 m sin ninguna advertencia. Es el reverso del problema del Art. 4.5.5: allí **faltaba** un número, acá **sobra** un cuadro entero.

**2. PRC Providencia — la ordenanza refundida se declara a sí misma no oficial.** Marca de agua *"DOCUMENTO DE TRABAJO"* en todas sus páginas, *"REFUNDIDO DE TRABAJO"* en las 4 láminas, y la portada dice textual *"DOCUMENTO DE TRABAJO – NO OFICIAL – 30-06-2020"*. Nada de eso está en la capa de texto.

**3. OGUC Art. 2.6.3 — el ángulo de las rasantes por región (80°/70°/60°) existía solo como imagen.** El texto dice *"no podrán sobrepasar en ningún punto las rasantes que se indican más adelante"* y nunca da el número. Es un chequeo urbanístico central del producto. **Ya llega al análisis.**

**4. PRC Providencia lámina L4/4 — el PDF tiene cero caracteres de texto.** Leyenda y los 6 catálogos de bienes protegidos (9 ZT, 18 MH, 23 ZCH, **82 ICH**, 5 ZEMoI, 13 ZIM, 3 Planos de Detalle) existen solo como gráfico. Un análisis basado en texto no ve **nada** de esta lámina.

**5. Discrepancias verificadas entre documentos oficiales de Providencia** — el Resumen Ejecutivo lista `EC 2 + A 5` y la lámina L2 no; la L2 lista `E5 (C+A)` y el Resumen no. La Modificación N°6 no figura como incorporada en ningún refundido. La lámina L3 describe `UpEC` con el texto de `UpR y ECr` — error de la propia lámina.

**6. Documentos vinculantes que faltan en el repositorio** — los 3 Planos de Detalle de Providencia (fijan "con exactitud" diseño, agrupamiento y características arquitectónicas) y las Fichas de Valoración Circular DDU 240 de cada ZCH e ICH.

---

## Catálogos de la lámina L4 de Providencia — transcritos

**153 filas**, leídas renderizando la lámina a 190–215 dpi por tramos. El PDF no tiene capa de texto: todo esto solo existía como gráfico.

| Catálogo | Filas | Contenido |
|---|---|---|
| **ZT** Zonas Típicas | 9 | N.º de decreto, fecha de declaratoria, nombre, direcciones y tramo |
| **MH** Monumentos Históricos | 18 | N.º de decreto, fecha, denominación y dirección |
| **ZCH** Zonas de Conservación Histórica | 23 | Nombre, calles con numeración y referencia |
| **ICH** Inmuebles de Conservación Histórica | 82 | Denominación y dirección |
| **ZEMoI** Equipamiento Metropolitano | 5 | Identificación y dirección |
| **ZIM** Interés Metropolitano | 13 | Identificación y dirección |
| **PD** Planos de Detalle | 3 | Nombre |

**Control cruzado**: los 7 totales coinciden exactamente con los que declara el Resumen Ejecutivo del PRCP (9, 18, 23, 82, 5, 13, 3). Eso confirma que no falta ninguna fila.

---

## Mecanismo

| Pieza | Qué hace |
|---|---|
| `normativa/extraer_imagenes_normativa.py` | Recorre los PDF, descarta decoración, exporta cada imagen y le asigna su artículo. Escribe el manifiesto. |
| `normativa/anexos_graficos.json` | Manifiesto regenerable: pdf + página + xref + bbox de cada imagen. |
| `normativa/_zoom_anexo.py` | Recorta y amplía. **No es opcional en grillas densas.** |
| `normativa/_render_pagina.py` | Renderiza página o región. Necesario para figuras vectoriales y para los rásters que son solo un fondo blanco. |
| `normativa/anexos_transcripciones.json` | La lectura. Nunca se sobrescribe automáticamente. |
| `normativa/generar_articulos_prompt.mjs` | Adjunta los anexos al artículo, en campo separado de `texto`. |
| `normativa/test_articulos_prompt.mjs` | Verifica cada anexo contra su transcripción y su procedencia. |
| `src/App.jsx` | Los inyecta rotulados `[ANEXO GRÁFICO …]` con su fuente. |

**Por qué `anexos` va separado de `texto`**: `texto` se compara verbatim contra el PDF carácter a carácter; un anexo es transcripción de imagen, con otra procedencia. Mezclarlos rompería la verificación que cierra ACH-DATA-007.

**Verificado que el gate muerde**: se alteró a mano un valor de la tabla del 4.5.5 (`14`→`16`) y el test salió con código 1.

**El zoom atrapó errores reales**, tres veces: 3 celdas de la grilla del Art. 4.3.4 y la fila D de muros de la TABLA 1 del 4.1.10, que a resolución original parece idéntica a la TABLA 10.

---

## Lo que queda pendiente, acotado

1. **Conseguir los documentos faltantes** de Providencia (3 Planos de Detalle, Fichas de Valoración).
2. **Una cota ilegible declarada, no rellenada**: en la FIGURA 1 de la DDU 351 las medidas menores de la huella podotáctil no son legibles en el escaneo oficial ni ampliadas 5×. La fuente para esas medidas es la NCh 3180.
