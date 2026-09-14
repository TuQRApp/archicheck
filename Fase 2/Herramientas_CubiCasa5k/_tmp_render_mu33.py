# -*- coding: utf-8 -*-
"""Zoom a MU33 (PdV pagina 1) sobre el plano real -- el usuario senalo que
incluye un muro achurado amarillo a la derecha que no corresponde."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import _tmp_correr_celda4_local as runner
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = runner.REPO_ROOT
PDF_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf')
JSON_PATH = os.path.join(os.path.dirname(__file__), '_tmp_diag_out', '_muros_geo_pdv.json')
OUT_DIR = os.path.join(os.path.dirname(__file__), '_tmp_diag_out')

with open(JSON_PATH, encoding='utf-8') as f:
    d = json.load(f)
muros = {m['id']: m for m in d['muros_geo']}

doc, paginas, ZOOM, DPI = runner.celda2_local(PDF_PATH)
plano_full = paginas[1]
h_f, w_f = plano_full.shape[:2]
x1, y1 = 0, 0
x2, y2 = int(0.40 * w_f), int(1.0 * h_f)
plano = plano_full[y1:y2, x1:x2].copy()

img = Image.fromarray(plano).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')

for mid, m in muros.items():
    if mid == 'MU33':
        continue
    for s in m['segmentos']:
        draw.line([tuple(s['p1']), tuple(s['p2'])], fill=(150, 150, 150, 140), width=2)

for s in muros['MU33']['segmentos']:
    draw.line([tuple(s['p1']), tuple(s['p2'])], fill=(230, 30, 30, 255), width=6)

try:
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 26)
except Exception:
    font = ImageFont.load_default()

todos_pts = [p for s in muros['MU33']['segmentos'] for p in (s['p1'], s['p2'])]
xs = [p[0] for p in todos_pts]
ys = [p[1] for p in todos_pts]
margen = 150
zx0, zx1 = max(0, min(xs) - margen), max(xs) + margen
zy0, zy1 = max(0, min(ys) - margen), max(ys) + margen
zoom_crop = img.crop((zx0, zy0, zx1, zy1))
factor = 4
zoom_crop = zoom_crop.resize((zoom_crop.width * factor, zoom_crop.height * factor), Image.NEAREST)
zoom_crop.save(os.path.join(OUT_DIR, '_zoom_MU33.png'))
print('Guardado:', os.path.join(OUT_DIR, '_zoom_MU33.png'))
