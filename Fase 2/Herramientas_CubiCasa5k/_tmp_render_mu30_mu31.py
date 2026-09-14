# -*- coding: utf-8 -*-
"""
Genera una imagen mostrando el caso MU30/MU31 (muesca en U, PdV pagina 1)
sobre el plano real, para que el usuario vea de que se esta hablando en el
diagnostico del bug de cuerpo cerrado (2026-09-13). Usa el mismo rasterizado
(ZOOM=3) y el mismo crop que usa la Celda 4 real -- no reinventa nada.
"""
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
mpx = d['mpx']

doc, paginas, ZOOM, DPI = runner.celda2_local(PDF_PATH)
plano_full = paginas[1]  # PAGINA_PLANTA=2 (1-indexado) -> indice 1
h_f, w_f = plano_full.shape[:2]
x1f, y1f, x2f, y2f = (0.0, 0.0, 0.40, 1.0)
x1, y1 = int(x1f * w_f), int(y1f * h_f)
x2, y2 = int(x2f * w_f), int(y2f * h_f)
plano = plano_full[y1:y2, x1:x2].copy()

img = Image.fromarray(plano).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')

COLOR_OTROS = (150, 150, 150, 140)
COLOR_MU30 = (20, 120, 230, 255)   # azul
COLOR_MU31 = (230, 30, 30, 255)    # rojo
GROSOR = 5

for mid, m in muros.items():
    if mid in ('MU30', 'MU31'):
        continue
    for s in m['segmentos']:
        draw.line([tuple(s['p1']), tuple(s['p2'])], fill=COLOR_OTROS, width=2)

for s in muros['MU30']['segmentos']:
    draw.line([tuple(s['p1']), tuple(s['p2'])], fill=COLOR_MU30, width=GROSOR)
for s in muros['MU31']['segmentos']:
    draw.line([tuple(s['p1']), tuple(s['p2'])], fill=COLOR_MU31, width=GROSOR)

try:
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 28)
except Exception:
    font = ImageFont.load_default()

# Punto de contacto (comun a ambos, ver diagnostico): [911, 2240]
cx, cy = 911, 2240
pad_ctx = 40
draw.ellipse([cx - pad_ctx, cy - pad_ctx, cx + pad_ctx, cy + pad_ctx], outline=(255, 210, 0, 255), width=4)

img.save(os.path.join(OUT_DIR, '_overview_MU30_MU31.png'))
print('Guardado overview:', os.path.join(OUT_DIR, '_overview_MU30_MU31.png'))

# Zoom a la zona de la muesca (bbox de MU30+MU31 con margen)
todos_pts = [p for s in muros['MU30']['segmentos'] + muros['MU31']['segmentos'] for p in (s['p1'], s['p2'])]
xs = [p[0] for p in todos_pts]
ys = [p[1] for p in todos_pts]
margen = 150
zx0, zx1 = max(0, min(xs) - margen), max(xs) + margen
zy0, zy1 = max(0, min(ys) - margen), max(ys) + margen
zoom_crop = img.crop((zx0, zy0, zx1, zy1))
factor = 4
zoom_crop = zoom_crop.resize((zoom_crop.width * factor, zoom_crop.height * factor), Image.NEAREST)
zd = ImageDraw.Draw(zoom_crop)
zd.rectangle([10, 10, 340, 100], fill=(255, 255, 255, 230))
zd.rectangle([25, 20, 55, 45], fill=COLOR_MU30)
zd.text((65, 20), 'MU30', fill=(0, 0, 0), font=font)
zd.rectangle([25, 55, 55, 80], fill=COLOR_MU31)
zd.text((65, 55), 'MU31 (34px = 0.20m)', fill=(0, 0, 0), font=font)
zoom_crop.save(os.path.join(OUT_DIR, '_zoom_MU30_MU31.png'))
print('Guardado zoom:', os.path.join(OUT_DIR, '_zoom_MU30_MU31.png'))
