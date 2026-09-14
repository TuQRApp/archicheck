# -*- coding: utf-8 -*-
"""
PNG unico de avance para Beauchef pag3-3 (Camarin/Bano): muros (ya cortados
por ventana), puertas y ventanas (ambos tipos: simple por linea central y
reconstruida por jamba), cada uno en un color vivo, sobre el plano real.

A diferencia de la version anterior (que leia el JSON estatico del 30-ago y
recalculaba solo las ventanas por jamba en el momento), esta version lee
_harness_resultado.json -- la salida completa y actual del harness local, que
ya incluye los 3 fixes de 2026-09-05 (D1-D3 excluye ventana simple del
export de muros, reconstruccion por jamba, y el corte geometrico del muro en
la ventana). Por eso muros_geo aqui ya viene CORTADO (161 tramos en vez de
los 63 muros originales sin cortar).
"""
import json

from PIL import Image, ImageDraw, ImageFont

COLOR_MURO = (20, 80, 230)      # azul vivo
COLOR_PUERTA = (255, 130, 0)    # naranja vivo
COLOR_VENTANA = (0, 180, 60)    # verde vivo
GROSOR = 7

with open("_harness_resultado.json", "r", encoding="utf-8") as f:
    data = json.load(f)

muros = data["muros_geo"]
puertas = data["puertas_geo"]
ventanas_simples = data.get("ventanas_simples_por_linea_central", [])
ventanas_jamba = data.get("ventanas_reconstruidas_por_jamba", [])

img = Image.open("archicheck_geometrico_beauchef_30ago_0356_pag3-3.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font_leyenda = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 40)

for m in muros:
    for s in m["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_MURO + (255,), width=GROSOR)

for p in puertas:
    for s in p["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_PUERTA + (255,), width=GROSOR)

pad = 14
for v in ventanas_simples:
    s = v["segmentos"][0]
    x0, x1 = sorted([s["p1"][0], s["p2"][0]])
    y0, y1 = sorted([s["p1"][1], s["p2"][1]])
    draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=COLOR_VENTANA + (255,), width=GROSOR)

for v in ventanas_jamba:
    draw.rectangle(
        [v["x0"] - pad, v["y_top"] - pad, v["x1"] + pad, v["y_bot"] + pad],
        outline=COLOR_VENTANA + (255,), width=GROSOR,
    )

n_ventanas = len(ventanas_simples) + len(ventanas_jamba)

# Leyenda
ly = 40
for color, label in [
    (COLOR_MURO, f"Muros ({len(muros)} tramos, ya cortados en ventanas)"),
    (COLOR_PUERTA, f"Puertas ({len(puertas)})"),
    (COLOR_VENTANA, f"Ventanas ({n_ventanas}: {len(ventanas_simples)} simples + {len(ventanas_jamba)} por jamba)"),
]:
    draw.rectangle([40, ly, 90, ly + 40], fill=color + (255,))
    draw.text((100, ly + 3), label, fill=(0, 0, 0, 255), font=font_leyenda)
    ly += 55

crop = img.crop((0, 0, img.width, 2150))
crop.save("AVANCE_muros_puertas_ventanas_pag3-3.png")
print(f"Muros: {len(muros)} | Puertas: {len(puertas)} | Ventanas: {n_ventanas} ({len(ventanas_simples)} simples + {len(ventanas_jamba)} jamba)")
print("Guardado: AVANCE_muros_puertas_ventanas_pag3-3.png")
