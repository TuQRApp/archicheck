# -*- coding: utf-8 -*-
"""
Overlay de verificacion (regla del proyecto: nunca dar por terminado sin
comparar contra el plano real) -- corre el algoritmo GENERALIZADO
(cuerpo_cerrado.py:reconstruir_ventanas_por_jamba, sin coordenadas
hardcodeadas) y dibuja el resultado sobre el PNG real de pag3-3, igual que
plano_ventanas_v3_final.png (la version a mano), para comparar lado a lado.
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, "../../../Herramientas_CubiCasa5k")
from cuerpo_cerrado import reconstruir_ventanas_por_jamba

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
mpp = pag["mpp"]
ventanas = reconstruir_ventanas_por_jamba(pag["muros_excluidos_por_referencia"], mpp)

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


for v in ventanas:
    etiqueta(v["x0"], v["y_top"], v["x1"], v["y_bot"], v["id"], (0, 170, 0))

crop = img.crop((500, 550, 4200, 2100))
crop.save("plano_ventanas_GENERALIZADO_verificacion.png")
print(f"Ventanas reconstruidas (algoritmo generalizado): {len(ventanas)}")
for v in ventanas:
    print(f"  {v['id']}: x=[{v['x0']},{v['x1']}] ancho={v['ancho_m']}m")
