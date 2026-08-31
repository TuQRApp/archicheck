# -*- coding: utf-8 -*-
"""
Misma funcion real del pipeline (identificar_lineas_centrales), pero con
CONTEXTO LOCAL por segmento via grid espacial (no O(n^2) puro Python, no la
pagina completa) -- la primera corrida a escala de pagina reprodujo el bug ya
diagnosticado en el proyecto el 22/25-ago (explosion de falsos positivos por
fragmentos de arco lejanos).
"""
import sys
import json
import time
from collections import defaultdict
sys.path.insert(0, r"C:\Users\nicolas.estragues\Documents\Claude\archicheck\Fase 2\Herramientas_CubiCasa5k")
from cuerpo_cerrado import identificar_lineas_centrales

MARGEN_M = 1.2

with open("archicheck_geometrico_pdv_31ago_1307.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for pag in data["paginas"]:
    t0 = time.time()
    tag = pag["fname_tag"]
    mpp = pag["mpp"]
    margen_px = MARGEN_M / mpp
    trazos_raw = pag["datos_vectoriales"]["trazos"]

    segmentos = []
    for t in trazos_raw:
        if t.get("tipo") != "l":
            continue
        pts = t.get("puntos", [])
        if len(pts) != 2:
            continue
        segmentos.append({"p1": tuple(pts[0]), "p2": tuple(pts[1]), "ancho_linea": t.get("ancho_linea")})

    n = len(segmentos)
    cell = margen_px  # tamano de celda = margen, asi el vecindario cabe en 3x3 celdas
    grid = defaultdict(list)
    bboxes = []
    for i, s in enumerate(segmentos):
        x0 = min(s["p1"][0], s["p2"][0]); x1 = max(s["p1"][0], s["p2"][0])
        y0 = min(s["p1"][1], s["p2"][1]); y1 = max(s["p1"][1], s["p2"][1])
        bboxes.append((x0, x1, y0, y1))
        cx0, cx1 = int(x0 // cell), int(x1 // cell)
        cy0, cy1 = int(y0 // cell), int(y1 // cell)
        for gx in range(cx0, cx1 + 1):
            for gy in range(cy0, cy1 + 1):
                grid[(gx, gy)].append(i)

    MAX_CONTEXTO = 150  # misma logica de red de seguridad que MAX_CONTEXTO_PAR_SEGMENTOS
    # real (30-ago, Beauchef) -- un cluster denso (arco descompuesto en muchos
    # segmentos casi colineales) puede disparar O(k^2) sobre cientos de vecinos.
    n_saltados = 0
    encontrados = []
    for i, s in enumerate(segmentos):
        x0, x1, y0, y1 = bboxes[i]
        cx0, cx1 = int((x0 - margen_px) // cell), int((x1 + margen_px) // cell)
        cy0, cy1 = int((y0 - margen_px) // cell), int((y1 + margen_px) // cell)
        vecinos_idx = set()
        for gx in range(cx0, cx1 + 1):
            for gy in range(cy0, cy1 + 1):
                vecinos_idx.update(grid.get((gx, gy), ()))
        vecinos_idx.discard(i)
        if len(vecinos_idx) > MAX_CONTEXTO:
            n_saltados += 1
            continue
        contexto_local = [s] + [segmentos[j] for j in vecinos_idx]
        centrales = identificar_lineas_centrales(contexto_local, mpp)
        if id(s) in centrales:
            largo = ((s["p2"][0]-s["p1"][0])**2 + (s["p2"][1]-s["p1"][1])**2) ** 0.5 * mpp
            encontrados.append((s, round(largo, 3)))

    dt = time.time() - t0
    print(f"\n=== {tag}: {n} segmentos, MARGEN_M={MARGEN_M}, tiempo={dt:.1f}s, saltados_por_cluster_denso={n_saltados} ===")
    print(f"Candidatos a ventana (contexto local): {len(encontrados)}")
    for s, largo in sorted(encontrados, key=lambda t: -t[1])[:50]:
        print(f"  p1={s['p1']} p2={s['p2']} ancho_linea={s['ancho_linea']} largo={largo}m")

    out = {
        "tag": tag, "mpp": mpp,
        "candidatos": [{"p1": s["p1"], "p2": s["p2"], "ancho_linea": s["ancho_linea"], "largo_m": largo}
                       for s, largo in encontrados],
    }
    with open(f"_ventanas_local_{tag}.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
