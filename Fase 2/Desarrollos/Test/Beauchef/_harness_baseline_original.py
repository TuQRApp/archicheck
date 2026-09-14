# -*- coding: utf-8 -*-
"""
Harness local (sin Colab) para validar el fix de GAP-GEO-VENT-001 (2026-09-05)
corriendo la extraccion vectorial REAL (extraer_datos_vectoriales, Celda 4)
contra el PDF real de Beauchef -- no contra un JSON ya generado.

MAPEO_CAPAS/PAGINAS_Y_ESCALAS reconstruidos desde:
  - Celda4_log_30aug_0359.txt (recorte/escala reales impresos en esa corrida,
    y varias entradas de MAPEO_CAPAS visibles en warnings de 0 coincidencias)
  - Capas OCG reales del PDF (via doc.get_ocgs(), fuente de verdad)
No es garantia de ser IDENTICO a lo que el usuario tipeo el 30-ago -- es
reconstruccion best-effort. Por eso el primer paso de este harness es
validarse a si mismo: correr SIN el fix de hoy (usando una copia de las
funciones ANTES del cambio) y comparar contra el JSON real ya generado.
Si matchea, el harness es confiable para validar el fix.
"""
import sys
import json
import os

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _THIS_DIR)
sys.path.insert(0, os.path.normpath(os.path.join(_THIS_DIR, "..", "..", "..", "Herramientas_CubiCasa5k")))

import fitz  # noqa: E402  (mismo import que usa la Celda 2 real)
import _celda4_funciones_ORIGINAL as c4  # noqa: E402

ZOOM = 3
DPI = 72 * ZOOM

# ── MAPEO_CAPAS reconstruido (ver docstring) ──────────────────────────
MAPEO_CAPAS = {
    "muro": ["MUROS"],
    "puerta": ["Puertas"],
    "ventana": ["Ventanas"],
    "mobiliario": ["MUEBLES", "ARTEFACTOS", "MOBILIARIO"],
    "ignorar": ["0", "PROYECCION", "PROYECCIONES", "Muros Proy", "FORMATO"],
    "cota": ["COTAS"],
    "deslinde_terreno": ["LINEA TERRENO ORIGINAL"],
    "accesibilidad": ["Accesibilidad"],
    "achurado": ["HATCH"],
    "corte_elevacion": ["MARCADOR CORTES-ELEVACIONES"],
}

# pag3-3 (Camarin/Bano) -- tercer crop de la pagina 3, confirmado en el log real
CROP_FRAC = (0.04, 0.48, 0.69, 0.98)
ESCALA = "1:50"

doc = fitz.open("CC-BEAUCHEFF_DOM Planos.pdf")
pdf_page = doc[2]  # pagina 3 (0-indexed)

mat = fitz.Matrix(ZOOM, ZOOM)
pix = pdf_page.get_pixmap(matrix=mat, alpha=False)
w_f, h_f = pix.width, pix.height
print(f"Pagina 3 renderizada: {w_f}x{h_f} px (zoom={ZOOM})")

x1f, y1f, x2f, y2f = CROP_FRAC
x1, y1 = int(x1f * w_f), int(y1f * h_f)
x2, y2 = int(x2f * w_f), int(y2f * h_f)
crop_px = (x1, y1, x2, y2)
print(f"Crop pag3-3: fraccion={CROP_FRAC} -> px={crop_px}")

scale_ratio = int(ESCALA.split(":")[1])
MPX = 0.0254 * scale_ratio / DPI
print(f"MPX calculado: {MPX:.6f} (esperado segun JSON real: 0.00588 aprox)")

_leyenda_cruda = c4._detectar_leyenda_simbologia(doc)
mapa_estado_por_color = {}
if _leyenda_cruda:
    for color, texto in _leyenda_cruda.items():
        mapa_estado_por_color[color] = c4._clasificar_estado_por_texto_leyenda(texto)
print(f"Leyenda detectada: {_leyenda_cruda}")

datos = c4.extraer_datos_vectoriales(
    pdf_page, ZOOM, MPX, crop_px,
    mapeo_capas=MAPEO_CAPAS,
    mapa_estado_por_color=mapa_estado_por_color,
)

muros_geo = datos["muros_geo"]
ventanas_simples = datos.get("ventanas_simples_por_linea_central", [])
ventanas_jamba_input = datos.get("muros_excluidos_por_referencia", [])
puertas_geo = datos["puertas_geo"]

print(f"\n=== RESULTADO ===")
print(f"muros_geo: {len(muros_geo)}")
print(f"ventanas_simples_por_linea_central: {len(ventanas_simples)}")
print(f"muros_excluidos_por_referencia: {len(ventanas_jamba_input)}")
print(f"puertas_geo: {len(puertas_geo)}")

with open("_harness_resultado_ORIGINAL.json", "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False, indent=1)
print("\nGuardado: _harness_resultado_ORIGINAL.json")
