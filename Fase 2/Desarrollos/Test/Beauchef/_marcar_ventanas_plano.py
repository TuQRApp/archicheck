# -*- coding: utf-8 -*-
import json
from PIL import Image, ImageDraw, ImageFont

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]  # pag3-3
muros_por_id = {m["id"]: m for m in pag["muros_geo"]}

# Ventanas confirmadas en esta conversacion (MU-id -> numero de referencia para la respuesta)
ventana_ids = ["MU02", "MU03", "MU04", "MU05", "MU06", "MU07", "MU08", "MU09", "MU10",
               "MU11", "MU12", "MU13", "MU14", "MU15", "MU18", "MU19", "MU20", "MU21",
               "MU23", "MU24", "MU25", "MU26"]

img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")

try:
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 34)
    font_leg = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 40)
except Exception:
    font = ImageFont.load_default()
    font_leg = font

leyenda = []
for num, mu_id in enumerate(ventana_ids, start=1):
    m = muros_por_id.get(mu_id)
    if m is None:
        print(f"  ! {mu_id} no encontrado")
        continue
    segs = m["segmentos"]
    xs = [p for s in segs for p in (s["p1"][0], s["p2"][0])]
    ys = [p for s in segs for p in (s["p1"][1], s["p2"][1])]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    pad = 18
    draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=(0, 140, 255, 255), width=6)
    # etiqueta con fondo blanco para que se lea sobre el plano
    label = str(num)
    tb = draw.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    lx, ly = cx - tw / 2 - 6, y0 - pad - th - 14
    draw.rectangle([lx - 4, ly - 2, lx + tw + 12, ly + th + 10], fill=(0, 140, 255, 235))
    draw.text((lx + 3, ly - 4), label, fill=(255, 255, 255, 255), font=font)
    leyenda.append((num, mu_id))

# Recorte a la zona relevante (con margen) en vez de la lamina completa
x0, x1 = 500, 4200
y0, y1 = 550, 2100
crop = img.crop((x0, y0, x1, y1))

# Barra de leyenda simple: numero -> MU id, en un archivo de texto aparte (mas legible que
# amontonar 22 etiquetas en la imagen)
with open("_leyenda_ventanas.txt", "w", encoding="utf-8") as f:
    for num, mu_id in leyenda:
        f.write(f"{num} = {mu_id}\n")

crop.save("plano_ventanas_marcadas.png")
print(f"Marcadas {len(leyenda)} ventanas. Guardado: plano_ventanas_marcadas.png")
