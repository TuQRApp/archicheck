# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
import json

font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 34)

def marcar(png_in, png_out, items, color):
    img = Image.open(png_in).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")
    for num, p1, p2 in items:
        x0, x1 = min(p1[0], p2[0]), max(p1[0], p2[0])
        y0, y1 = min(p1[1], p2[1]), max(p1[1], p2[1])
        pad = 30
        draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=color + (255,), width=7)
        label = str(num)
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        cx = (x0 + x1) / 2
        lx, ly = cx - tw / 2 - 6, y0 - pad - th - 18
        draw.rectangle([lx - 5, ly - 3, lx + tw + 13, ly + th + 11], fill=color + (235,))
        draw.text((lx + 4, ly - 5), label, fill=(255, 255, 255, 255), font=font)
    img.save(png_out)

# Solo los candidatos plausibles (descartados: rasante, pavimento podotactil,
# leyenda SIMBOLOGIA, zona escalera) -- coordenadas ya confirmadas en la
# corrida anterior.
n1_plausibles = [
    (4, [2259, 2326], [2259, 2386]),
    (6, [2251, 2255], [2251, 2333]),
    (7, [2247, 2333], [2248, 2255]),
    (8, [2263, 2312], [2263, 2393]),
    (10, [2485, 2486], [2297, 2486]),
    (11, [2485, 2529], [2297, 2529]),
]
n2_plausibles = [
    (1, [800, 2054], [766, 2054]),
]

marcar("archicheck_geometrico_pdv_31ago_1307_pag2-1.png", "plano_ventanas_pag2-1_limpio.png", n1_plausibles, (220, 0, 0))
marcar("archicheck_geometrico_pdv_31ago_1307_pag2-2.png", "plano_ventanas_pag2-2_limpio.png", n2_plausibles, (220, 0, 0))
print("listo")
