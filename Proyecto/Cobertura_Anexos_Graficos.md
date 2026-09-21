# Cobertura de anexos gráficos de la normativa

**Regla del proyecto (usuario, 2026-09-21), no opcional:**

> *Las tablas deben ser leídas completas: texto, números, fórmulas. También las otras imágenes (cualquiera) deben ser extraídas e incorporadas. Esto es para OGUC, LGUC, DDU, la Ley 19.300 y los PRC actuales y los que vayamos incorporando.*

Este archivo es el seguimiento de esa regla, en la línea de [Regla: cobertura 100% de normativa](../CLAUDE.md) — toda fuente incorporada debe llegar a 100% extraída, verificada y conectada, con archivo de seguimiento por corpus.

---

## Por qué existe esto

En los PDF oficiales (Ley Chile y municipales) hay **contenido normativo que no está en la capa de texto**: está embebido como imagen. La extracción verbatim captura la prosa que rodea la tabla y **descarta los números** — y los números son la norma.

El caso testigo es el **Art. 4.5.5 de la OGUC**. El texto extraído dice literalmente:

> *"…deberán consultar vanos cuyas superficies mínimas corresponderán al porcentaje de la superficie interior del respectivo recinto que se indica en la siguiente tabla: **% SUPERFICIE DEL RECINTO..**"*

…y ahí se corta. Entregarle eso a un modelo es **peor que no entregarle nada**: el artículo promete un número que nunca llega, que es exactamente el mecanismo por el que nació el "1/6" falso de ACH-DATA-007.

---

## Mecanismo

| Pieza | Qué hace |
|---|---|
| `normativa/extraer_imagenes_normativa.py` | Recorre los PDF, descarta la decoración (membrete/logo repetido en muchas páginas), exporta cada imagen de contenido a PNG y le asigna el artículo al que pertenece. Escribe el **manifiesto**. |
| `normativa/anexos_graficos.json` | Manifiesto **regenerable**: procedencia de cada imagen (pdf + página 1-based + xref + bbox). |
| `normativa/anexos_graficos/*.png` | Las imágenes exportadas. |
| `normativa/_zoom_anexo.py` | Recorta y amplía una región para leer sin error las zonas densas. **No es opcional para grillas**: en la tabla del Art. 4.3.4 la ampliación corrigió 3 celdas mal leídas a resolución original. |
| `normativa/anexos_transcripciones.json` | La **lectura**. Nunca se sobrescribe automáticamente. Cada anexo declara sus imágenes de origen y cómo se verificó. |
| `normativa/generar_articulos_prompt.mjs` | Adjunta los anexos al artículo, en el campo `anexos`, **separado de `texto`**. |
| `normativa/test_articulos_prompt.mjs` | Verifica que cada anexo exista en el archivo de transcripciones con el mismo contenido y declare procedencia. |
| `src/App.jsx` | Inyecta el anexo en el prompt, rotulado `[ANEXO GRÁFICO de este artículo — …]` con su fuente. |

**Por qué `anexos` va separado de `texto`**: `texto` se deriva verbatim de la capa de texto del PDF y un test lo compara contra ella carácter a carácter. Un anexo es la transcripción de una imagen: otra procedencia, otra forma de verificarse. Mezclarlos haría imposible seguir verificando el texto — y esa verificación es lo que cierra ACH-DATA-007.

**Verificado que el gate muerde**: se alteró a mano un valor de la tabla del 4.5.5 en el archivo generado (`14` → `16`) y el test salió con código 1. Regenerado, vuelve a 0.

---

## Estado — 2026-09-21

| Corpus | Imágenes de contenido | Transcritas | Pendientes |
|---|---|---|---|
| **OGUC** | 30 | 4 | **26** |
| **DDU** (Libro completo + 351 + 447) | 68 | 0 | **68** |
| **PRC Providencia** | 32 | 0 | **32** |
| **LGUC** | 1 | 0 | **1** |
| **TOTAL** | **131** | **4** | **127** |

> **Corrección del filtro (2026-09-21)**: la primera versión exigía **120 px de lado mínimo** en ambos lados, y eso descartaba justo las **fórmulas**, que son imágenes anchas y bajas. Se perdían 10 imágenes de contenido real, entre ellas la tabla con fórmula del **Art. 2.2.5 bis** (`% = Densidad de ocupación × 11 / 2.000`, porcentaje de cesión) y la **TABLA 15 del Art. 4.1.10**. El criterio ahora es de **área**, que no discrimina por forma.

### Transcritas y verificadas

| Anexo | Artículo | Verificación |
|---|---|---|
| Tabla de % de vanos por región | **OGUC 4.5.5** | 2 imágenes (x545 encabezado + norte/centro, x546 sur). Los 12 valores coinciden exactamente con `ART_455_DOCENTE` de `Fase 2/reglas_normativas.py`, obtenido antes por una lectura independiente. |
| Tabla de densidad de carga combustible | **OGUC 4.3.4** | Leída en 2 pasadas (original + ampliación 5×). La ampliación **corrigió 3 celdas** de la grilla de letras. |
| Tabla con fórmula de % de cesión | **OGUC 2.2.5 bis** | `% = (Densidad de ocupación × 11) / 2.000` hasta 8.000 pers/ha; 44% sobre eso. Recuperada al corregir el filtro. |
| TABLA 15, tamaño de muestra de ensayo | **OGUC 4.1.10** | Leída ampliada 4× (original 371×52 px). Recuperada al corregir el filtro. |

Las dos últimas **todavía no llegan al prompt**: sus artículos (2.2.5 bis y 4.1.10) no están entre los 43 seleccionados. Quedan en banco, listas para cuando se agreguen.

---

## Pendiente — qué falta y en qué orden

1. **OGUC, 21 imágenes.** Prioridad alta: es el cuerpo que más pesa en el análisis. Concentradas en dos zonas — Arts. 2.1.25 a 2.1.33 (páginas 195–215, equipamiento y escalas) y Arts. 2.6.11 / 2.6.13 (rasantes, páginas 147 y 155). La de 4.5.7 (página 257, 1500×1320) está pendiente.
2. **DDU, 67 imágenes.** Ojo: [la auditoría de integridad](../CLAUDE.md) ya registró que 3 JSON de DDU (279, 320, 390) están fabricados o sin fuente. Antes de transcribir conviene resolver eso, para no construir sobre una base sin respaldo.
3. **PRC Providencia, 30 imágenes.** Son en su mayoría **planos cartográficos** de gran formato (láminas de 1 página), no tablas. Necesitan un tratamiento distinto al de una tabla: probablemente recorte por zona y lectura dirigida, no transcripción completa.
4. **82 páginas con figuras VECTORIALES** (21 en DDU, 61 en PRC Providencia). No aparecen como imagen embebida porque están dibujadas con líneas y texto suelto. Requieren **renderizar la página**, no extraer la imagen. El extractor ya las detecta y las lista en `paginas_con_figuras_vectoriales` del manifiesto, pero **todavía no las procesa**.
5. **Ley 19.300**: no hay PDF en el repo, solo `normativa/nacional/Fuentes/ley19300.json`. **No se puede auditar su contenido gráfico hasta conseguir el PDF oficial.**
6. **PRC Ñuñoa y Santiago**: sin PDF en el repo. Mismo caso.

---

## Hallazgo colateral abierto — ACH-DATA-013

`normativa/limpiar_texto_normativo.mjs:54` hace `.replace(/\s+/g, ' ')`, que **aplana los saltos de línea**. Las tablas que sí están en la capa de texto pierden su estructura de filas: la matriz de resistencia al fuego del **Art. 4.3.3** llega al modelo como una sola línea corrida (`|a |F-180|F-120|…`). Los valores están todos y el patrón de pipes permite recuperar las filas, así que está degradado, no perdido.

**No se arregló en el acto a propósito**: los patrones de limpieza de marginalia operan sobre el texto aplanado, porque el ruido del decreto viene intercalado por la maqueta a dos columnas del PDF. Preservar los saltos obliga a rediseñar esa limpieza para que sea consciente de las líneas. Es un cambio cuidadoso, no un parche.
