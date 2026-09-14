# -*- coding: utf-8 -*-
"""Colorea las lineas color (1.0,0.749,0.0) de PdV pagina 1 por angulo:
~45 grados (achurado real) en un color, 0/90 grados (marco recto) en otro
-- para que el usuario vea la diferencia real sobre el plano."""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(__file__))
import _tmp_correr_celda4_local as runner
import fitz
from PIL import Image, ImageDraw

REPO_ROOT = runner.REPO_ROOT
PDF_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf')
OUT_DIR = os.path.join(os.path.dirname(__file__), '_tmp_diag_out')

doc, paginas, ZOOM, DPI = runner.celda2_local(PDF_PATH)
page = doc[1]  # PAGINA_PLANTA=2 (1-indexado) -> indice 1
plano_full = paginas[1]

lineas_45 = []
lineas_recta = []
for path in page.get_drawings():
    if path.get('fill'):
        continue
    stroke = path.get('color')
    items_path = path.get('items', [])
    if not stroke or len(stroke) < 3 or len(items_path) != 1 or items_path[0][0] != 'l':
        continue
    color_key = tuple(round(c, 3) for c in stroke[:3])
    if not (abs(color_key[0] - 1.0) < 0.05 and abs(color_key[1] - 0.75) < 0.05):
        continue
    p1, p2 = items_path[0][1], items_path[0][2]
    ang = math.degrees(math.atan2(p2.y - p1.y, p2.x - p1.x)) % 180
    ang_cerca_recta = min(ang, abs(ang - 90), abs(ang - 180)) < 5
    (lineas_recta if ang_cerca_recta else lineas_45).append((p1, p2))

print(f"Lineas ~45 grados (achurado real): {len(lineas_45)}")
print(f"Lineas 0/90 grados (marco recto): {len(lineas_recta)}")

img = Image.fromarray(plano_full).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')


def to_px(pt):
    # misma transformacion que to_px() dentro de extraer_datos_vectoriales real
    # (la pagina tiene rotation=270 -- get_drawings() da coordenadas SIN rotar)
    p = pt * page.rotation_matrix
    return (p.x * ZOOM, p.y * ZOOM)


for p1, p2 in lineas_45:
    a, b = to_px(p1), to_px(p2)
    draw.line([a, b], fill=(255, 140, 0, 255), width=2)  # naranja = achurado real (45)
for p1, p2 in lineas_recta:
    a, b = to_px(p1), to_px(p2)
    draw.line([a, b], fill=(0, 200, 255, 255), width=4)  # celeste = marco recto (0/90)

img.save(os.path.join(OUT_DIR, '_overview_lineas_amarillas.png'))
print('Guardado overview completo:', os.path.join(OUT_DIR, '_overview_lineas_amarillas.png'))

# Zoom a la zona de MU33 (donde vimos el marco recto) + zoom a la leyenda (solo achurado)
todos = [(p.x * ZOOM, p.y * ZOOM) for par in (lineas_45 + lineas_recta) for p in par]


def guardar_zoom(cx, cy, nombre, margen=250):
    crop = img.crop((cx - margen, cy - margen, cx + margen, cy + margen))
    crop = crop.resize((crop.width * 3, crop.height * 3), Image.NEAREST)
    crop.save(os.path.join(OUT_DIR, nombre))
    print('Guardado:', os.path.join(OUT_DIR, nombre))


# MU33 esta en px locales (crop pag1) ~ (1693-2246, 3069-3218) -- mismo pixel
# space que plano_full directo (sin offset, x1=0,y1=0 para pagina1).
guardar_zoom(1970, 3150, '_zoom_lineas_amarillas_MU33.png')
# Leyenda 'Se retira' en pt PDF (150-167, 897-933) -> convertir a px correctamente (con rotacion)
import fitz as _fitz
_centro_leyenda_px = to_px(_fitz.Point(158.75, 915))
guardar_zoom(int(_centro_leyenda_px[0]), int(_centro_leyenda_px[1]), '_zoom_lineas_amarillas_leyenda.png')
