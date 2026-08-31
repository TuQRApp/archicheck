# -*- coding: utf-8 -*-
import json

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
print("claves de la pagina pag3-3:")
for k in pag.keys():
    v = pag[k]
    if isinstance(v, list):
        print(f"  {k}: list, len={len(v)}")
    elif isinstance(v, dict):
        print(f"  {k}: dict, keys={list(v.keys())[:10]}")
    else:
        print(f"  {k}: {type(v).__name__} = {v}")
