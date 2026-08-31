# -*- coding: utf-8 -*-
"""
Reconstruccion desde cero de las ventanas de pag3-3, usando la firma D1-D3
(2 lineas paralelas + 1 central) contra el JSON real -- no contra los IDs de
muros_geo a ciegas. Las 6 ventanas de la zona MU03-13 se arman con las lineas
horizontales top/centro/bottom que el pipeline calculo pero excluyo del
export (muros_excluidos_por_referencia) -- confirmado a mano contra las
coordenadas reales, no supuesto.
"""
import json
from PIL import Image, ImageDraw, ImageFont

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
mpp = pag["mpp"]

# Ventanas simples ya confirmadas por el arquitecto (1 solo fragmento = la
# linea central real, sin anomalia de ancho)
simples = ["MU02", "MU14", "MU15", "MU18", "MU19", "MU20", "MU21", "MU23", "MU24", "MU25", "MU26"]

# Ventanas de la zona MU03-13, reconstruidas por jamba izq/der real (verificado
# contra muros_excluidos_por_referencia: cada trio top/centro/bottom conecta
# exactamente estos 2 x). La jamba izquierda de la 1ra ventana es la esquina
# de MU01 (x=1651), no un MU suelto.
reconstruidas = [
    (1651, 1745, [1958, 1986]),  # jamba izq = esquina de MU01
    (1756, 1838, [1958, 1986]),
    (2061, 2153, [1958, 1986]),
    (2551, 2646, [1963, 1986]),
    (2860, 2949, [1963, 1986]),
    (2959, 3052, [1963, 1986]),
]

muros_por_id = {m["id"]: m for m in pag["muros_geo"]}
img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)

def etiqueta(x0, y0, x1, y1, num, color):
    pad = 18
    draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=color + (255,), width=6)
    label = str(num)
    tb = draw.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    cx = (x0 + x1) / 2
    lx, ly = cx - tw / 2 - 6, y0 - pad - th - 16
    draw.rectangle([lx - 5, ly - 3, lx + tw + 13, ly + th + 11], fill=color + (235,))
    draw.text((lx + 4, ly - 5), label, fill=(255, 255, 255, 255), font=font)

leyenda = []
num = 1
for mu_id in simples:
    m = muros_por_id[mu_id]
    xs = [p for s in m["segmentos"] for p in (s["p1"][0], s["p2"][0])]
    ys = [p for s in m["segmentos"] for p in (s["p1"][1], s["p2"][1])]
    etiqueta(min(xs), min(ys), max(xs), max(ys), num, (0, 140, 255))
    leyenda.append((num, mu_id, None))
    num += 1

for x0, x1, yr in reconstruidas:
    ancho_m = round((x1 - x0) * mpp, 2)
    etiqueta(x0, min(yr), x1, max(yr), num, (150, 0, 200))
    leyenda.append((num, f"jambas x={x0}-{x1}", ancho_m))
    num += 1

crop = img.crop((500, 550, 4200, 2100))
crop.save("plano_ventanas_v3_final.png")

with open("_leyenda_ventanas_v3.txt", "w", encoding="utf-8") as f:
    for n, ref, ancho in leyenda:
        f.write(f"{n} = {ref}" + (f" ({ancho}m)" if ancho else "") + "\n")

print(f"Total marcadas: {num - 1} (11 simples + 6 reconstruidas)")
