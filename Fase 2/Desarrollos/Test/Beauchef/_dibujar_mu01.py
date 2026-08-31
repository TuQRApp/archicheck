# -*- coding: utf-8 -*-
import json
from PIL import Image, ImageDraw, ImageFont

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]
mu01 = next(m for m in pag["muros_geo"] if m["id"] == "MU01")
segs = mu01["segmentos"]

img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 14)

for i, s in enumerate(segs, start=1):
    p1, p2 = tuple(s["p1"]), tuple(s["p2"])
    draw.line([p1, p2], fill=(255, 0, 0, 255), width=1)
    mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
    draw.text((mx + 2, my - 6), str(i), fill=(0, 100, 255, 255), font=font)

img.save("plano_mu01_segmentos.png")
print(f"{len(segs)} segmentos dibujados -> plano_mu01_segmentos.png")

# Bbox de MU01 para el crop de zoom
xs = [p for s in segs for p in (s["p1"][0], s["p2"][0])]
ys = [p for s in segs for p in (s["p1"][1], s["p2"][1])]
print("bbox:", min(xs), max(xs), min(ys), max(ys))
