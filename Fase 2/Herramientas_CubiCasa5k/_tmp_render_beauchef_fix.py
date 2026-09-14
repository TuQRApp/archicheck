# -*- coding: utf-8 -*-
"""Overlay de todos los muros finales de Beauchef pag3 (post-fix de contacto
directo), cada uno con un color distinto, para inspeccion visual."""
import json
import os
import sys
import colorsys

sys.path.insert(0, os.path.dirname(__file__))
import _tmp_correr_celda4_local as runner
from PIL import Image, ImageDraw

REPO_ROOT = runner.REPO_ROOT
PDF_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Beauchef', 'CC-BEAUCHEFF_DOM Planos.pdf')
JSON_PATH = os.path.join(os.path.dirname(__file__), '_tmp_diag_out', '_muros_geo_beauchef.json')
OUT_DIR = os.path.join(os.path.dirname(__file__), '_tmp_diag_out')

with open(JSON_PATH, encoding='utf-8') as f:
    d = json.load(f)
muros = d['muros_geo']

doc, paginas, ZOOM, DPI = runner.celda2_local(PDF_PATH)
plano = paginas[2]  # pagina 3 (1-indexado) -> indice 2, sin crop (config real de Beauchef)

img = Image.fromarray(plano).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')

for i, m in enumerate(sorted(muros, key=lambda m: m['id'])):
    hue = (i * 0.6180339887) % 1.0
    r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.85, 0.9)]
    for s in m['segmentos']:
        draw.line([tuple(s['p1']), tuple(s['p2'])], fill=(r, g, b, 255), width=5)

img.save(os.path.join(OUT_DIR, '_overview_beauchef_postfix.png'))
print('Guardado:', os.path.join(OUT_DIR, '_overview_beauchef_postfix.png'))
