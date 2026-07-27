# Ground truth — validación P1 (Grounding DINO + SAM 2)

**Por qué existe este archivo:** de las 5 corridas guardadas del pipeline DINO+SAM2, ninguna se comparó nunca contra un conteo verificado a mano — no existe ground truth en ningún archivo del proyecto. Sin esto, "validar precisión" no se puede medir, solo opinar. Este es el primer ground truth del proyecto.

**Caso elegido:** `05+06 Planos Rest Pza PdV (021 06 21).pdf`, página 2, escala 1:50 — es el único plano con corridas DINO+SAM2 previas guardadas (`archicheck\Startup Chile\archicheck_geometrico*.json`), así que sirve para comparar directamente contra el próximo resultado tras el fix del prompt (ver notebook, Celda 4c, fix 2026-07-20).

## Cómo llenar `ground_truth_pdv_pag2.csv`

1. Abrir el PDF en esa página (o el PNG ya generado en una corrida anterior, ej. `archicheck_geometrico Dino + SAM 30jun 1709.png`, que ya tiene el plano visible aunque sin las cajas DINO superpuestas de forma útil).
2. Contar a mano, mirando el plano directamente (no el resultado de ningún modelo): cada puerta, ventana, escalera, rampa, columna y salida de emergencia visible.
3. Por cada elemento, agregar una fila al CSV con:
   - `id`: correlativo (GT01, GT02, ...)
   - `tipo`: puerta / ventana / escalera / rampa / columna / salida_emergencia
   - `cx_rel`, `cy_rel`: posición aproximada como fracción del ancho/alto de la imagen (0.0–1.0), igual que el campo que ya usa el JSON del pipeline — no hace falta exactitud de píxel, con ubicarlo a ojo (ej. "como al 30% del ancho, 60% del alto") alcanza para poder emparejar contra las detecciones del modelo después.
   - `ancho_aprox_m`: si se puede leer la cota en el plano, poner el valor real; si no, dejar vacío.
   - `notas`: cualquier ambigüedad (ej. "puerta doble, ¿cuenta como 1 o 2?", "podría ser ventana o vano sin cerrar").

## Cómo se usa después

Cuando se vuelva a correr la Celda 4c (ya con el fix del prompt aplicado), comparar el `elementos_dino[]` del JSON resultante contra este CSV:
- **Recall** = cuántos elementos del ground truth fueron detectados por DINO (con cualquier confianza, antes del filtro `MIN_CONFIANZA`) / total de elementos en el ground truth.
- **Precisión** = cuántas detecciones de DINO corresponden a un elemento real del ground truth / total de detecciones de DINO.
- Emparejar por proximidad de `cx_rel`/`cy_rel` (igual que ya hace el propio notebook para cruzar recintos OpenCV vs. Claude, función `mejor_match` en Celda 4) y por tipo coincidente.

Esto da el primer número real de precisión del pipeline — hasta ahora todo lo que existe es la estimación teórica del propio notebook (~60-75% recall, sin validar empíricamente).
