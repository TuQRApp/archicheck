# -*- coding: utf-8 -*-
"""
Corre la funcion REAL del pipeline (cuerpo_cerrado.identificar_lineas_centrales,
firma D1-D3: 2 lineas paralelas + 1 central) contra los trazos crudos del JSON
de PdV Nivel 1 y Nivel 2 -- no una reimplementacion propia, el modulo tal cual
vive en produccion.
"""
import sys
import json
sys.path.insert(0, r"C:\Users\nicolas.estragues\Documents\Claude\archicheck\Fase 2\Herramientas_CubiCasa5k")
from cuerpo_cerrado import identificar_lineas_centrales

with open("archicheck_geometrico_pdv_31ago_1307.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for pag in data["paginas"]:
    tag = pag["fname_tag"]
    mpp = pag["mpp"]
    trazos_raw = pag["datos_vectoriales"]["trazos"]

    # Convertir al formato {'p1':(x,y), 'p2':(x,y)} que espera cuerpo_cerrado.
    # Solo trazos tipo 'l' (linea) con exactamente 2 puntos son candidatos.
    segmentos = []
    for t in trazos_raw:
        if t.get("tipo") != "l":
            continue
        pts = t.get("puntos", [])
        if len(pts) != 2:
            continue
        segmentos.append({"p1": tuple(pts[0]), "p2": tuple(pts[1]), "ancho_linea": t.get("ancho_linea")})

    print(f"\n=== {tag}: {len(segmentos)} segmentos tipo 'l' de {len(trazos_raw)} trazos totales ===")

    centrales_ids = identificar_lineas_centrales(segmentos, mpp)
    print(f"Lineas centrales (candidatas a ventana) encontradas: {len(centrales_ids)}")

    candidatos = [s for s in segmentos if id(s) in centrales_ids]
    # Guardar para el siguiente paso (dibujar)
    out = {
        "tag": tag,
        "mpp": mpp,
        "candidatos": [{"p1": s["p1"], "p2": s["p2"], "ancho_linea": s["ancho_linea"]} for s in candidatos],
    }
    with open(f"_ventanas_detectadas_{tag}.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    for s in candidatos[:20]:
        largo = ((s["p2"][0]-s["p1"][0])**2 + (s["p2"][1]-s["p1"][1])**2) ** 0.5 * mpp
        print(f"  p1={s['p1']} p2={s['p2']} ancho_linea={s['ancho_linea']} largo={round(largo,2)}m")
    if len(candidatos) > 20:
        print(f"  ... y {len(candidatos) - 20} mas")
