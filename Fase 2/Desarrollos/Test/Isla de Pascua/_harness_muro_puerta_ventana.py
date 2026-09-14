# -*- coding: utf-8 -*-
"""
Harness local (mismo mecanismo que Beauchef) para Isla de Pascua -- corre
extraer_datos_vectoriales() real contra el PDF, con los 3 fixes de hoy
(D1-D3 excluye ventana simple, reconstruccion por jamba, corte de muro por
ventana). Config real (pagina 2, escala 1:50, recorte (8%,2%)-(71%,70%))
confirmada contra 'Celda 4 Pascua.txt' (log real, 31-jul). MAPEO_CAPAS
vacio -- ese log es anterior a que existiera MAPEO_CAPAS en el pipeline
(introducido 09-ago), corria solo con la heuristica geometrica de eje/cota.
"""
import sys
import json
import os

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _THIS_DIR)
sys.path.insert(0, os.path.normpath(os.path.join(_THIS_DIR, "..", "..", "..", "Herramientas_CubiCasa5k")))

import fitz  # noqa: E402
import _celda4_funciones as c4  # noqa: E402

ZOOM = 3
DPI = 72 * ZOOM

MAPEO_CAPAS = {}  # ver docstring -- este proyecto no tiene capas OCG mapeadas, corre por heuristica

CROP_FRAC = (0.08, 0.02, 0.71, 0.70)
ESCALA = "1:50"

doc = fitz.open("SPE Isla de Pascua (09 05 14).pdf")
pdf_page = doc[1]  # pagina 2 (0-indexed)

mat = fitz.Matrix(ZOOM, ZOOM)
pix = pdf_page.get_pixmap(matrix=mat, alpha=False)
w_f, h_f = pix.width, pix.height
print(f"Pagina 2 renderizada: {w_f}x{h_f} px (zoom={ZOOM})")

x1f, y1f, x2f, y2f = CROP_FRAC
x1, y1 = int(x1f * w_f), int(y1f * h_f)
x2, y2 = int(x2f * w_f), int(y2f * h_f)
crop_px = (x1, y1, x2, y2)
print(f"Crop: fraccion={CROP_FRAC} -> px={crop_px}")

scale_ratio = int(ESCALA.split(":")[1])
MPX = 0.0254 * scale_ratio / DPI
print(f"MPX calculado: {MPX:.6f} (esperado segun log real: 0.00588)")

_leyenda_cruda = c4._detectar_leyenda_simbologia(doc)
mapa_estado_por_color = {}
if _leyenda_cruda:
    for color, texto in _leyenda_cruda.items():
        mapa_estado_por_color[color] = c4._clasificar_estado_por_texto_leyenda(texto)

datos = c4.extraer_datos_vectoriales(
    pdf_page, ZOOM, MPX, crop_px,
    mapeo_capas=MAPEO_CAPAS,
    mapa_estado_por_color=mapa_estado_por_color,
)

muros_geo = datos["muros_geo"]
ventanas_simples = datos.get("ventanas_simples_por_linea_central", [])
ventanas_jamba = datos.get("ventanas_reconstruidas_por_jamba", [])
puertas_geo = datos["puertas_geo"]

print(f"\n=== RESULTADO ===")
print(f"muros_geo: {len(muros_geo)}")
print(f"ventanas_simples_por_linea_central: {len(ventanas_simples)}")
print(f"ventanas_reconstruidas_por_jamba: {len(ventanas_jamba)}")
print(f"puertas_geo: {len(puertas_geo)}")

with open("_harness_resultado.json", "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False, indent=1)
print("\nGuardado: _harness_resultado.json")
