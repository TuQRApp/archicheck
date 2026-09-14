# -*- coding: utf-8 -*-
"""
Overlay de verificacion del resultado REAL del harness (extraccion vectorial
fresca contra el PDF, con el fix de hoy) -- para confirmar visualmente que
los muros de Camarin/Bano siguen completos y correctos, y que las ventanas
simples quedan donde corresponde. Compara contra el PNG real ya generado.
"""
import json

from PIL import Image, ImageDraw, ImageFont

with open("_harness_resultado.json", "r", encoding="utf-8") as f:
    datos = json.load(f)

muros_geo = datos["muros_geo"]
ventanas_simples = datos["ventanas_simples_por_linea_central"]

img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 22)

COLOR_MURO = (20, 80, 230)
COLOR_VENTANA = (0, 180, 60)

# NOTA: el harness corrio con su propio crop_px absoluto de pagina completa
# (no el crop relativo del JSON viejo) -- las coordenadas de 'segmentos' de
# extraer_datos_vectoriales ya vienen ajustadas (ajustar()) al crop, en el
# mismo sistema que el PNG pag3-3 recortado. Se dibujan tal cual.
for m in muros_geo:
    for s in m["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_MURO + (255,), width=6)

for v in ventanas_simples:
    for s in v["segmentos"]:
        p1, p2 = s["p1"], s["p2"]
        xs = [p1[0], p2[0]]
        ys = [p1[1], p2[1]]
        pad = 12
        draw.rectangle([min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad],
                       outline=COLOR_VENTANA + (255,), width=5)

crop = img.crop((0, 0, img.width, 2150))
crop.save("HARNESS_overlay_pag3-3.png")
print(f"muros_geo dibujados: {len(muros_geo)}")
print(f"ventanas_simples dibujadas: {len(ventanas_simples)}")
