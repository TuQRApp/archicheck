# -*- coding: utf-8 -*-
"""Overlay de todos los muros finales de PdV pagina 1 (post-fix de contacto
directo, 2026-09-13), cada uno con un color distinto, para inspeccion visual
-- confirmar que no hay sobre-fusion tipo 'MU01 gigante' antes de aceptar el
fix."""
import json
import os
import sys
import colorsys

sys.path.insert(0, os.path.dirname(__file__))
import _tmp_correr_celda4_local as runner
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = runner.REPO_ROOT
PDF_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf')
JSON_PATH = os.path.join(os.path.dirname(__file__), '_tmp_diag_out', '_muros_geo_pdv.json')
OUT_DIR = os.path.join(os.path.dirname(__file__), '_tmp_diag_out')

with open(JSON_PATH, encoding='utf-8') as f:
    d = json.load(f)
muros = d['muros_geo']

doc, paginas, ZOOM, DPI = runner.celda2_local(PDF_PATH)
plano_full = paginas[1]
h_f, w_f = plano_full.shape[:2]
x1, y1 = 0, 0
x2, y2 = int(0.40 * w_f), int(1.0 * h_f)
plano = plano_full[y1:y2, x1:x2].copy()

img = Image.fromarray(plano).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')

try:
    font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 22)
except Exception:
    font = ImageFont.load_default()

n = len(muros)
for i, m in enumerate(sorted(muros, key=lambda m: m['id'])):
    hue = (i * 0.6180339887) % 1.0  # golden ratio, colores bien separados
    r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.85, 0.9)]
    for s in m['segmentos']:
        draw.line([tuple(s['p1']), tuple(s['p2'])], fill=(r, g, b, 255), width=6)
    if m['segmentos']:
        p = m['segmentos'][0]['p1']
        draw.text((p[0] + 5, p[1] - 15), m['id'], fill=(r, g, b, 255), font=font)

img.save(os.path.join(OUT_DIR, '_overview_pdv_pag1_postfix.png'))
print('Guardado:', os.path.join(OUT_DIR, '_overview_pdv_pag1_postfix.png'))
