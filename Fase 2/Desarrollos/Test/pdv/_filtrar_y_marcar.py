# -*- coding: utf-8 -*-
"""
Filtra los candidatos crudos de _ventanas_local_pag2-*.json (ruido obvio:
lineas muy largas = cotas/ejes; grupos de 3+ candidatos casi identicos y
equiespaciados = peldanos de escalera, no ventanas) y los dibuja numerados
sobre el plano base real para que el arquitecto los revise.
"""
import json
from PIL import Image, ImageDraw, ImageFont
from collections import defaultdict

LARGO_MIN_M, LARGO_MAX_M = 0.15, 1.3

def es_grupo_escalera(candidatos):
    """3+ candidatos de largo casi identico (+-3%) -> patron repetitivo
    (peldanos), se descarta el grupo entero."""
    por_largo = defaultdict(list)
    for c in candidatos:
        clave = round(c["largo_m"] / 0.03)  # bucket de 3cm
        por_largo[clave].append(c)
    descartar_ids = set()
    for clave, grupo in por_largo.items():
        if len(grupo) >= 3:
            for c in grupo:
                descartar_ids.add(id(c))
    return descartar_ids

paginas_info = [
    ("pag2-1", "archicheck_geometrico_pdv_31ago_1307_pag2-1.png", "Nivel 1"),
    ("pag2-2", "archicheck_geometrico_pdv_31ago_1307_pag2-2.png", "Nivel 2"),
]

font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 30)

for tag, png_path, nivel in paginas_info:
    with open(f"_ventanas_local_{tag}.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    candidatos = data["candidatos"]
    n_crudo = len(candidatos)

    en_rango = [c for c in candidatos if LARGO_MIN_M <= c["largo_m"] <= LARGO_MAX_M]
    ids_escalera = es_grupo_escalera(en_rango)
    finales = [c for c in en_rango if id(c) not in ids_escalera]

    print(f"{tag}: {n_crudo} crudos -> {len(en_rango)} en rango [{LARGO_MIN_M},{LARGO_MAX_M}]m -> "
          f"{len(finales)} tras descartar {len(ids_escalera)} de patron repetitivo (escalera)")

    img = Image.open(png_path).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")
    leyenda = []
    for num, c in enumerate(finales, start=1):
        p1, p2 = c["p1"], c["p2"]
        x0, x1 = min(p1[0], p2[0]), max(p1[0], p2[0])
        y0, y1 = min(p1[1], p2[1]), max(p1[1], p2[1])
        pad = 25
        draw.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=(220, 0, 0, 255), width=6)
        label = str(num)
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        lx, ly = cx - tw / 2 - 6, y0 - pad - th - 16
        draw.rectangle([lx - 5, ly - 3, lx + tw + 13, ly + th + 11], fill=(220, 0, 0, 235))
        draw.text((lx + 4, ly - 5), label, fill=(255, 255, 255, 255), font=font)
        leyenda.append((num, p1, p2, c["largo_m"]))

    img.save(f"plano_ventanas_{tag}.png")
    with open(f"_leyenda_{tag}.txt", "w", encoding="utf-8") as f:
        for num, p1, p2, largo in leyenda:
            f.write(f"{num}: p1={p1} p2={p2} largo={largo}m\n")
    print(f"  guardado plano_ventanas_{tag}.png ({nivel}), {len(finales)} candidatos numerados")
