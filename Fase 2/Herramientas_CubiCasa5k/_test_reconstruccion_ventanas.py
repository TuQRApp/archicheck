# -*- coding: utf-8 -*-
"""
Prueba del algoritmo generalizado de reconstruccion de ventanas por jamba,
contra el JSON real de Beauchef (pag3-3) -- debe reproducir sin coordenadas
hardcodeadas las mismas 6 ventanas que _reconstruir_ventanas.py armo a mano.
No modifica ningun archivo del pipeline todavia; es solo la validacion.
"""
import json
import math
import sys

sys.path.insert(0, ".")
from cuerpo_cerrado import reconstruir_ventanas_por_jamba

with open(
    "../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_30ago_0356.json",
    encoding="utf-8",
) as f:
    data = json.load(f)

pag = data["paginas"][2]
mpx = pag["mpp"]
excluidos = pag["muros_excluidos_por_referencia"]

ventanas = reconstruir_ventanas_por_jamba(excluidos, mpx)

print(f"Total reconstruidas: {len(ventanas)}")
for v in ventanas:
    print(f"  {v['id']}: x=[{v['x0']},{v['x1']}] ancho={v['ancho_m']}m origen={v['segmentos_origen']}")
