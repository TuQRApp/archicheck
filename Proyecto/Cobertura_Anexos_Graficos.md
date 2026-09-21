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
| **OGUC** | 30 | **14** | 16 |
| **DDU** (Libro completo + 351 + 447 + índice) | 68 | 0 | 68 |
| **PRC Providencia** | 99 | 0 | 99 |
| **PRC Santiago** | 13 | 0 | 13 |
| **PRC Ñuñoa** | 2 | 0 | 2 |
| **PRC Isla de Pascua** | 1 | 0 | 1 |
| **LGUC** | 1 | 0 | 1 |
| **Ley 19.300** | 1 | 0 | 1 |
| **TOTAL** | **215** | **14** | **201** |

Además hay **306 páginas con figuras vectoriales** (PRC Santiago 123, PRC Ñuñoa 64, Providencia 62, DDU 32, Isla de Pascua 25): diagramas dibujados con líneas y texto suelto, que **no aparecen como imagen embebida**. El manifiesto ya las lista; procesarlas requiere renderizar la página.

### Qué descarta el filtro — auditado, no supuesto

Se enumeró **toda** imagen de todo PDF y se clasificó lo excluido. Lo único que se descarta es:

| Qué | Cuántas | Por qué |
|---|---|---|
| Membrete de Ley Chile (580×102) y logos institucionales | 6 | Se repiten en más de 3 páginas |
| Ícono 90×90 de Ley Chile, logo 61×46 | 4 | Área < 15.000 px |
| Números de página **escaneados** del PRC Santiago (99×94) | 146 | Área < 15.000 px. Verificado abriendo uno: es un "1" |

**Ninguna fórmula ni tabla queda fuera del filtro.** Lo que sí queda fuera del *análisis* es todo lo que está extraído pero aún sin transcribir.

### Fórmulas encontradas en OGUC

Las 3 que existen como imagen, todas extraídas y transcritas:

| Fórmula | Artículo | Llega al prompt |
|---|---|---|
| `% = (Densidad de ocupación × 11) / 2.000` — porcentaje de cesión | 2.2.5 bis | **No** (artículo fuera de los 43) |
| `SMV = StPV × (%mV / 100%)` — superficie máxima de ventana | 4.1.10 | **No** (artículo fuera de los 43) |
| `Upvm = ((Um·Sm) + (Uv·Sv)) / (Sm + Sv)` — transmitancia ponderada | 4.1.10 | **No** (artículo fuera de los 43) |

Las 3 estaban entre las que el filtro original descartaba por forma.

### Transcritas y verificadas (14 imágenes, 13 anexos)

| Anexo | Artículo | ¿Entra al prompt? |
|---|---|---|
| Tabla de % de vanos por región | **4.5.5** | Sí |
| Tabla de densidad de carga combustible | **4.3.4** | Sí |
| **Ángulo de las rasantes por región** (80°/70°/60°) | **2.6.3** | Sí |
| Superficie de patio en establecimientos educacionales | **4.5.7** | Sí |
| Ángulos de sombra proyectada por región | 2.6.13 | No |
| Circulaciones peatonales (ancho/altura libre) | 2.2.8 | No |
| Anchos mínimos de pasajes | 2.3.3 | No |
| Tabla con fórmula de % de cesión | 2.2.5 bis | No |
| TABLA 15, tamaño de muestra de ensayo | 4.1.10 | No |
| Rangos de orientación (N/O/S/P) | 4.1.10 | No |
| Fórmula SMV | 4.1.10 | No |
| Fórmula Upvm | 4.1.10 | No |
| Logo BCN de portada | — | Clasificado como **decoración** |

> **El ángulo de las rasantes es el hallazgo más importante de esta tanda.** Es un chequeo urbanístico central del producto y **existía solo como imagen**: el texto del Art. 2.6.3 dice *"no podrán sobrepasar en ningún punto las rasantes que se indican más adelante"* y nunca da el número. Ahora sí llega al análisis.

### Lo que falta en OGUC

Las 16 pendientes son **todas del Art. 4.1.10** (acondicionamiento térmico, páginas 195–215): transmitancia U y resistencia Rt por zona térmica, porcentaje máximo de ventana por zona y orientación, aislación de sobrecimientos, permeabilidad al aire e infiltración por provincia. Son de alto valor técnico, pero **el Art. 4.1.10 no está entre los 43 artículos del prompt**, así que hoy no llegarían al análisis aunque se transcriban.

---

## ACH-DATA-013 — RESUELTO el 2026-09-21

`limpiar_texto_normativo.mjs` aplanaba los saltos de línea con `.replace(/\s+/g,' ')`, así que las tablas que sí están en la capa de texto perdían su estructura de filas.

**Ya no.** Al pasar el descarte de marginalia a un criterio **posicional** (ver ACH-DATA-014), aplanar dejó de ser necesario: los patrones de limpieza existían para sacar marginalia intercalada, y ahora esa marginalia ni siquiera entra. El limpiador conserva los saltos y `App.jsx` dejó de aplanar al inyectar.

Medido: el Art. 4.3.3 pasa de **1 línea corrida a 46 líneas**, el 4.2.4 a 81 y el 2.6.3 a 203. La matriz `|a |F-180|F-120|…` llega al modelo con sus filas.
