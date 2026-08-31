# -*- coding: utf-8 -*-
import json

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
mu01 = next(m for m in pag["muros_geo"] if m["id"] == "MU01")
segs = mu01["segmentos"]
print("n_segmentos:", len(segs))

xs = [p for s in segs for p in (s["p1"][0], s["p2"][0])]
ys = [p for s in segs for p in (s["p1"][1], s["p2"][1])]
print("bbox x:", min(xs), max(xs))
print("bbox y:", min(ys), max(ys))
print("imagen_w_px/h_px:", pag["imagen_w_px"], pag["imagen_h_px"])

for i, s in enumerate(segs[:15]):
    print(i, s)
