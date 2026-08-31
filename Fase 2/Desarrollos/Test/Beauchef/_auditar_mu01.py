# -*- coding: utf-8 -*-
"""
Audita los 142 segmentos de MU01 (Beauchef pag3-3) buscando espesor real
(ancho_linea), recuperandolo de datos_vectoriales.trazos via matching
geometrico (distancia perpendicular a la recta + proyeccion dentro del
rango), no coincidencia exacta de endpoints -- los segmentos exportados
pasaron por ajustes de Paso 1.5/1.6 (cierre de micro-gaps) que mueven los
extremos unos px respecto al trazo crudo original.
"""
import json
import math

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
mu01 = next(m for m in pag["muros_geo"] if m["id"] == "MU01")
segs_mu01 = mu01["segmentos"]
trazos = [t for t in pag["datos_vectoriales"]["trazos"] if t.get("tipo") == "l" and len(t.get("puntos", [])) == 2]

def dist_perp_y_proyeccion(p1, p2, q):
    """Distancia perpendicular de q a la recta p1-p2, y el parametro t de
    la proyeccion de q sobre el segmento (0..1 si cae dentro)."""
    x1, y1 = p1; x2, y2 = p2; x0, y0 = q
    dx, dy = x2 - x1, y2 - y1
    largo2 = dx * dx + dy * dy
    if largo2 == 0:
        return math.hypot(x0 - x1, y0 - y1), 0.0
    t = ((x0 - x1) * dx + (y0 - y1) * dy) / largo2
    proj_x, proj_y = x1 + t * dx, y1 + t * dy
    d = math.hypot(x0 - proj_x, y0 - proj_y)
    return d, t

TOL_PERP = 4  # px de distancia perpendicular maxima para considerar match
MARGEN_T = 0.15  # margen fuera de [0,1] permitido en la proyeccion

resultados = []
for i, s in enumerate(segs_mu01, start=1):
    p1, p2 = tuple(s["p1"]), tuple(s["p2"])
    mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    mejor = None
    for t in trazos:
        a, b = tuple(t["puntos"][0]), tuple(t["puntos"][1])
        # angulo similar (colineal), tolerancia amplia por redondeos
        ang_s = math.degrees(math.atan2(p2[1]-p1[1], p2[0]-p1[0])) % 180
        ang_t = math.degrees(math.atan2(b[1]-a[1], b[0]-a[0])) % 180
        d_ang = min(abs(ang_s-ang_t), 180-abs(ang_s-ang_t))
        if d_ang > 5:
            continue
        d_perp, tt = dist_perp_y_proyeccion(a, b, mid)
        if d_perp > TOL_PERP:
            continue
        if tt < -MARGEN_T or tt > 1 + MARGEN_T:
            continue
        if mejor is None or d_perp < mejor[0]:
            mejor = (d_perp, t)
    if mejor:
        resultados.append((i, s, mejor[1].get("ancho_linea"), mejor[0]))
    else:
        resultados.append((i, s, None, None))

con_match = [r for r in resultados if r[2] is not None]
sin_match = [r for r in resultados if r[2] is None]
sin_espesor = [r for r in con_match if r[2] == 0]

print(f"Total: {len(segs_mu01)} | con match: {len(con_match)} | sin match: {len(sin_match)} | ancho==0: {len(sin_espesor)}")
print("\nDistribucion de anchos encontrados:")
from collections import Counter
print(Counter(r[2] for r in con_match))

print("\n--- Segmentos SIN espesor (ancho==0) ---")
for i, s, ancho, dperp in sin_espesor:
    print(f"  #{i}: p1={s['p1']} p2={s['p2']} (dist_perp_match={round(dperp,1)}px)")

print("\n--- Segmentos SIN match geometrico (revisar a mano) ---")
for i, s, _, _ in sin_match:
    largo = math.hypot(s['p2'][0]-s['p1'][0], s['p2'][1]-s['p1'][1])
    print(f"  #{i}: p1={s['p1']} p2={s['p2']} largo_px={round(largo,1)}")

out = {
    "sin_espesor": [{"num": i, "p1": s["p1"], "p2": s["p2"]} for i, s, a, d in sin_espesor],
    "con_espesor": [{"num": i, "p1": s["p1"], "p2": s["p2"], "ancho": a} for i, s, a, d in con_match if a != 0],
    "sin_match": [{"num": i, "p1": s["p1"], "p2": s["p2"]} for i, s, a, d in sin_match],
}
with open("_mu01_auditoria.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
