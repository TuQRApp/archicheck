# -*- coding: utf-8 -*-
import json

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
dv = pag["datos_vectoriales"]
print("n_trazos:", dv.get("n_trazos"))
print("n_muro_protegido:", dv.get("n_muro_protegido"))
trazos = dv.get("trazos", [])
print("len(trazos):", len(trazos))
if trazos:
    print("primer trazo:", json.dumps(trazos[0], ensure_ascii=False)[:500])

print("\n--- analisis_semantico.ventanas_detalle ---")
vd = pag["analisis_semantico"].get("ventanas_detalle")
print(json.dumps(vd, ensure_ascii=False, indent=1)[:2000] if vd else "vacio/None")

print("\n--- muros_excluidos_por_referencia (primeros 5) ---")
for m in pag["muros_excluidos_por_referencia"][:5]:
    print(json.dumps(m, ensure_ascii=False)[:300])
