# -*- coding: utf-8 -*-
"""
PNG unico de avance para Beauchef pag3-3 (Camarin/Bano): muros, puertas y
ventanas reconstruidas, cada uno en un color vivo distinto, sobre el plano
real -- para ver de un vistazo cuanto detecta hoy el pipeline. No requiere
correr Colab: usa el JSON ya generado (30ago) + la funcion nueva
reconstruir_ventanas_por_jamba (2026-09-04) corrida localmente sobre
muros_excluidos_por_referencia, ya validada contra este mismo caso.
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, "../../../Herramientas_CubiCasa5k")
from cuerpo_cerrado import reconstruir_ventanas_por_jamba

COLOR_MURO = (20, 80, 230)      # azul vivo
COLOR_PUERTA = (255, 130, 0)    # naranja vivo
COLOR_VENTANA = (0, 180, 60)    # verde vivo
GROSOR = 7

with open("archicheck_geometrico_beauchef_30ago_0356.json", "r", encoding="utf-8") as f:
    data = json.load(f)

pag = data["paginas"][2]  # pag3-3
mpp = pag["mpp"]
muros = pag["muros_geo"]
puertas = pag["puertas_geo"]
ventanas = reconstruir_ventanas_por_jamba(pag["muros_excluidos_por_referencia"], mpp)

img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
font_leyenda = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 40)

for m in muros:
    for s in m["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_MURO + (255,), width=GROSOR)

for p in puertas:
    for s in p["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_PUERTA + (255,), width=GROSOR)

for v in ventanas:
    pad = 10
    draw.rectangle(
        [v["x0"] - pad, v["y_top"] - pad, v["x1"] + pad, v["y_bot"] + pad],
        outline=COLOR_VENTANA + (255,), width=GROSOR,
    )

# Leyenda
ly = 40
for color, label, n in [
    (COLOR_MURO, f"Muros ({len(muros)})", None),
    (COLOR_PUERTA, f"Puertas ({len(puertas)})", None),
    (COLOR_VENTANA, f"Ventanas reconstruidas ({len(ventanas)})", None),
]:
    draw.rectangle([40, ly, 90, ly + 40], fill=color + (255,))
    draw.text((100, ly + 3), label, fill=(0, 0, 0, 255), font=font_leyenda)
    ly += 55

crop = img.crop((0, 0, img.width, 2150))
crop.save("AVANCE_muros_puertas_ventanas_pag3-3.png")
print(f"Muros: {len(muros)} | Puertas: {len(puertas)} | Ventanas reconstruidas: {len(ventanas)}")
print("Guardado: AVANCE_muros_puertas_ventanas_pag3-3.png")
