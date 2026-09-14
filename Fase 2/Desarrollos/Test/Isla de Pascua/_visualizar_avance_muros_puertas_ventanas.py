# -*- coding: utf-8 -*-
"""
PNG unico de avance para Isla de Pascua pag2: muros (ya cortados por ventana
donde corresponde) y puertas, sobre el plano real. Usa _harness_resultado.json
(harness local del 2026-09-05, mismos 3 fixes que Beauchef).

OJO -- a diferencia de Beauchef, aqui NO se dibujan las "ventanas": el
harness devolvio 6472 'ventanas_simples_por_linea_central', un numero
absurdo (el proyecto historicamente tiene 0 ventanas detectadas, ver
Convenciones_CAD.md). Al inspeccionar las muestras, son lineas de achurado
paralelas y repetidas que el clasificador D1-D3 confunde con el patron
"par de lineas + linea central" de una ventana. La causa mas probable: este
proyecto corre con MAPEO_CAPAS vacio (su log real es anterior a que existiera
esa funcion), asi que no hay una capa 'achurado' que excluir antes de aplicar
la heuristica geometrica -- a diferencia de Beauchef, que sí mapea 'HATCH'.
Dibujar esas 6472 cajas verdes seria ruido puro y ocultaria el hallazgo real.
Este es un bug pendiente, no una eleccion de diseno: falta acotar D1-D3 (o
excluir achurado por heuristica) antes de confiar en ventanas simples para
proyectos sin MAPEO_CAPAS. Ver tambien: 1028 muros fueron cortados por estas
"ventanas" falsas -- ese numero de muros_geo (3750 tramos) tambien esta
inflado por el mismo bug y no debe tomarse como bueno todavia.
"""
import json

from PIL import Image, ImageDraw, ImageFont

COLOR_MURO = (20, 80, 230)      # azul vivo
COLOR_PUERTA = (255, 130, 0)    # naranja vivo
GROSOR = 5

with open("_harness_resultado.json", "r", encoding="utf-8") as f:
    data = json.load(f)

muros = data["muros_geo"]
puertas = data["puertas_geo"]
n_ventanas_sospechosas = len(data.get("ventanas_simples_por_linea_central", []))

img = Image.open("archicheck_geometrico_pascua_01ago_0338_pag2.png").convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")
font_leyenda = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 46)
font_warn = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 38)

for m in muros:
    for s in m["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_MURO + (255,), width=GROSOR)

for p in puertas:
    for s in p["segmentos"]:
        draw.line([tuple(s["p1"]), tuple(s["p2"])], fill=COLOR_PUERTA + (255,), width=GROSOR)

# Leyenda
ly = 40
for color, label in [
    (COLOR_MURO, f"Muros ({len(muros)} tramos -- posiblemente sobre-cortados, ver nota)"),
    (COLOR_PUERTA, f"Puertas ({len(puertas)})"),
]:
    draw.rectangle([40, ly, 100, ly + 46], fill=color + (255,))
    draw.text((112, ly + 3), label, fill=(0, 0, 0, 255), font=font_leyenda)
    ly += 62

draw.rectangle([40, ly + 10, 100, ly + 56], fill=(200, 0, 0, 255))
draw.text(
    (112, ly + 13),
    f"Ventanas NO dibujadas: {n_ventanas_sospechosas} detectadas, todas sospechosas (falsos positivos de achurado)",
    fill=(160, 0, 0, 255), font=font_warn,
)

img.save("AVANCE_muros_puertas_pag2.png")
print(f"Muros: {len(muros)} | Puertas: {len(puertas)} | Ventanas detectadas pero NO dibujadas (sospechosas): {n_ventanas_sospechosas}")
print("Guardado: AVANCE_muros_puertas_pag2.png")
