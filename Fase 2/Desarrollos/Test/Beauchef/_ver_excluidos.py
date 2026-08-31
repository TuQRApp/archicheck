# -*- coding: utf-8 -*-
import json

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
excl = pag["muros_excluidos_por_referencia"]
print("total excluidos_por_referencia:", len(excl))
for m in excl:
    s = m["segmentos"][0]
    p1, p2 = s["p1"], s["p2"]
    print(f"{m['id']}: p1={p1} p2={p2} largo={m['largo_total_m']}m ancho={m['ancho_linea_prom']}m")
