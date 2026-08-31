# -*- coding: utf-8 -*-
import json

with open("archicheck_geometrico_pdv_31ago_1307.json", "r", encoding="utf-8") as f:
    data = json.load(f)

paginas = data["paginas"]
print("n paginas:", len(paginas))
for i, p in enumerate(paginas):
    print(f"[{i}] entry_idx={p.get('entry_idx')} fname_tag={p.get('fname_tag')} pagina={p.get('pagina')} "
          f"n_muros={len(p.get('muros_geo', []))} n_excluidos_ref={len(p.get('muros_excluidos_por_referencia', []))} "
          f"n_puertas={len(p.get('puertas_geo', []))} mpp={p.get('mpp')}")
    dv = p.get("datos_vectoriales", {})
    print(f"     n_trazos={dv.get('n_trazos')} imagen_w_px={p.get('imagen_w_px')} imagen_h_px={p.get('imagen_h_px')}")
