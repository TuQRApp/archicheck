# -*- coding: utf-8 -*-
"""Zoom a la zona donde estaba MU33 (ahora MU32, sin el marco de achurado)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import _tmp_correr_celda4_local as runner
from PIL import Image, ImageDraw

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
plano = plano_full[0:int(1.0 * h_f), 0:int(0.40 * w_f)].copy()

img = Image.fromarray(plano).convert('RGB')
draw = ImageDraw.Draw(img, 'RGBA')
for mid, m in muros.items():
    if mid != 'MU32':
        continue
    for s in m['segmentos']:
        draw.line([tuple(s['p1']), tuple(s['p2'])], fill=(230, 30, 30, 255), width=6)

crop = img.crop((1500, 2950, 2350, 3300))
crop = crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST)
crop.save(os.path.join(OUT_DIR, '_zoom_MU32_postfix.png'))
print('Guardado:', os.path.join(OUT_DIR, '_zoom_MU32_postfix.png'))
