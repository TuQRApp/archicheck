# -*- coding: utf-8 -*-
import json
from PIL import Image, ImageDraw, ImageFont

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
muros_por_id = {m["id"]: m for m in pag["muros_geo"]}

# Reagrupado segun correccion del usuario (2-12 no son 11 ventanas sueltas,
# son 4 ventanas reales, cada una fragmentada en varios MU por el pipeline)
grupos = [
    (["MU11", "MU12", "MU13"], "A"),
    (["MU09", "MU10"], "B"),
    (["MU07", "MU08"], "C"),
    (["MU03", "MU04", "MU05", "MU06"], "D"),
]

img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)

leyenda = []
for ids, label in grupos:
    xs, ys = [], []
    for mu_id in ids:
        m = muros_por_id[mu_id]
        for s in m["segmentos"]:
            xs += [s["p1"][0], s["p2"][0]]
            ys += [s["p1"][1], s["p2"][1]]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    pad = 20
    draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=(30, 200, 60, 255), width=6)
    tb = draw.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    cx = (x0 + x1) / 2
    lx, ly = cx - tw / 2 - 6, y0 - pad - th - 16
    draw.rectangle([lx - 5, ly - 3, lx + tw + 13, ly + th + 11], fill=(30, 200, 60, 235))
    draw.text((lx + 4, ly - 5), label, fill=(255, 255, 255, 255), font=font)
    ancho_m = round((x1 - x0) * pag["mpp"], 2)
    leyenda.append((label, ids, ancho_m))
    print(f"Ventana {label}: {ids} -> ancho span = {ancho_m} m")

crop = img.crop((500, 1850, 3200, 2100))
crop.save("plano_ventanas_v2_zona.png")
print("guardado")
