# -*- coding: utf-8 -*-
import json

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]

def cerca(x, y, tol=15):
    for coleccion, nombre in [(pag["muros_geo"], "muros_geo"), (pag["muros_excluidos_por_referencia"], "excluidos_ref")]:
        for m in coleccion:
            for s in m["segmentos"]:
                for p in (s["p1"], s["p2"]):
                    if abs(p[0] - x) <= tol and abs(p[1] - y) <= tol:
                        print(f"  match en {nombre}: {m['id']} p={p} (largo={m['largo_total_m']}, ancho={m['ancho_linea_prom']})")

print("Buscando vertical cerca de x=1651, y=1958-1986:")
cerca(1651, 1972, tol=20)

print("\nBuscando tambien en trazos crudos (datos_vectoriales.trazos):")
trazos = pag["datos_vectoriales"]["trazos"]
for t in trazos:
    pts = t["puntos"]
    for p in pts:
        if abs(p[0] - 1651) <= 8 and 1950 <= p[1] <= 1995:
            print(" trazo:", t)
            break
