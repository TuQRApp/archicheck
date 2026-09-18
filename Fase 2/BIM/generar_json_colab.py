# Adaptador: reempaqueta los datos reales extraidos de un IFC (mismo metodo
# que analizar_todos.py, pero desglosado por NIVEL en vez de agregado por
# edificio) en el esquema exacto que espera el portal de ArchiCheck para el
# JSON de "Resultados Colab" -- verificado leyendo src/App.jsx directamente
# (handleColabJson exige `paginas` o `tabla_cruzada`; buildColabTexto en
# adelante consume pagina/escala/analisis_semantico/mediciones_geometricas/
# incumplimientos_geo/resumen_global).
#
# Limites honestos de este adaptador, para que quede registrado:
# - muros_geo/puertas_geo/ventanas_* del portal esperan segmentos en
#   coordenadas de PIXEL sobre el PNG (formato OpenCV) -- no tenemos eso
#   (nuestros datos son geometria 3D real, no deteccion 2D sobre raster).
#   Se dejan vacios a proposito: la revision grafica del portal (etapa 8,
#   "requerido para analizar") no tendra nada que revisar en esas listas.
# - FireRating de muros no tiene ningun campo natural en este esquema (esta
#   pensado para hallazgos de recinto/puerta, no de muro individual) -- se
#   omite, no se fuerza a un campo que no le corresponde.
# - "escala" es nominal (el dibujo ya esta en metros reales, no impreso a
#   escala de papel) -- declarada como texto para que el prompt tenga algo
#   que mostrar, no para recalibrar nada.
# - Ventilacion (%) no se fuerza en incumplimientos_geo (esa lista asume
#   unidades de metro/m2, un porcentaje ahi seria enganoso) -- va como
#   cumple_oguc + observacion por recinto en analisis_semantico, que es
#   exactamente el campo que el prompt real del portal ya lee para eso.

import datetime
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element as elutil
import matplotlib.pyplot as plt
from shapely.affinity import translate

import generar_plano_pdf as g
import analizar_todos as a

IFC_PATH = r"Archivos ejemplo/Duplex house/DuplexHouse.ifc"


def render_nivel_png(modelo, nivel, elementos, ox, oy, ruta_png):
    por_tipo = {}
    for el in elementos:
        t = el.is_a()
        if t in g.ESTILOS:
            por_tipo.setdefault(t, []).append(el)

    fig, ax = plt.subplots(figsize=(11.69, 8.27))  # A4 apaisado, mas parecido a un plano subido real
    for tipo in g.ORDEN_DIBUJO:
        for el in por_tipo.get(tipo, []):
            geom = g.footprint_2d(el)
            if geom is None:
                continue
            geom = translate(geom, xoff=-ox, yoff=-oy)
            g.dibujar_geom(ax, geom, {k: v for k, v in g.ESTILOS[tipo].items() if k != "label"})
            if tipo == "IfcColumn":
                g.marcar_centroide(ax, geom, color="black", zorder=6)
    ax.set_aspect("equal")
    ax.autoscale()
    ax.axis("off")  # sin ejes/ticks -- se parece mas a un plano real subido por un arquitecto
    elev_txt = f"{nivel.Elevation:.2f} m" if nivel.Elevation is not None else "sin cota"
    ax.set_title(f"{nivel.Name} · cota {elev_txt} · generado desde IFC (DuplexHouse)", fontsize=9)
    fig.tight_layout()
    dpi = 150
    fig.savefig(ruta_png, dpi=dpi, facecolor="white")
    w_px = int(fig.get_size_inches()[0] * dpi)
    h_px = int(fig.get_size_inches()[1] * dpi)
    plt.close(fig)
    return w_px, h_px, dpi


def main():
    modelo = ifcopenshell.open(IFC_PATH)
    niveles = sorted(modelo.by_type("IfcBuildingStorey"),
                      key=lambda s: s.Elevation if s.Elevation is not None else 0.0)

    todos_muros = modelo.by_type("IfcWall")
    ox, oy = 0.0, 0.0
    for w in todos_muros[:1]:
        try:
            shp = ifcopenshell.geom.create_shape(g.settings, w)
            ox, oy = shp.geometry.verts[0], shp.geometry.verts[1]
        except Exception:
            pass
        break

    origen = Path(IFC_PATH)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    carpeta_png = origen.parent
    paginas = []
    total_puertas = total_ventanas = total_escaleras = 0

    for idx, nivel in enumerate(niveles):
        rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                if r.RelatingStructure == nivel]
        elementos = []
        for r in rels:
            elementos.extend(r.RelatedElements)
        espacios_nivel = [e for e in ifcopenshell.util.element.get_decomposition(nivel, is_recursive=False)
                          if e.is_a("IfcSpace")]
        elementos_con_espacios = elementos + espacios_nivel

        # PNG del nivel, junto al IFC (misma convencion de nombres: origen + timestamp)
        nombre_nivel_seguro = "".join(c if c.isalnum() else "_" for c in nivel.Name)
        ruta_png = carpeta_png / f"DuplexHouse_pagina{idx + 1}_{nombre_nivel_seguro}_{timestamp}.png"
        w_px, h_px, dpi = render_nivel_png(modelo, nivel, elementos_con_espacios, ox, oy, ruta_png)

        # --- datos reales por nivel (mismo metodo que analizar_todos.py) ---
        puertas = [e for e in elementos if e.is_a("IfcDoor")]
        ventanas = [e for e in elementos if e.is_a("IfcWindow")]
        muros = [e for e in elementos if e.is_a("IfcWall")]
        # Bug real encontrado 2026-09-18 al revisar el informe final generado por
        # el portal con este JSON: escaleras quedaba fija en 0 (nunca se contaban
        # IfcStairFlight/IfcStair reales) -- DuplexHouse.ifc SI tiene 2 de cada
        # una. No invalida el incumplimiento que el informe genero sobre la
        # escalera (la geometria de la escalera de todos modos nunca se carga en
        # muros_geo, sigue sin representacion grafica), pero era una cuenta
        # incorrecta que debia corregirse antes de reusar este adaptador.
        escaleras = [e for e in elementos if e.is_a("IfcStairFlight") or e.is_a("IfcStair")]

        ventanas_geo_nivel = []
        for v in ventanas:
            ancho = a.num_o_none(v.OverallWidth)
            alto = a.num_o_none(v.OverallHeight)
            ventanas_geo_nivel.append({
                "id": v.GlobalId,
                "area_m2": (ancho * alto) if (ancho is not None and alto is not None) else None,
            })
        ventanas_por_id = {vv["id"]: vv for vv in ventanas_geo_nivel}

        recintos_semantico = []
        mediciones_geometricas = []
        for sp in espacios_nivel:
            qtos = elutil.get_psets(sp, qtos_only=True)
            area, _ = a.buscar_area(qtos)
            nombre = (sp.LongName or sp.Name or "").strip() or f"Recinto {sp.GlobalId[:6]}"
            area_ventanas = 0.0
            for b in sp.BoundedBy:
                el = b.RelatedBuildingElement
                if el is not None and el.is_a("IfcWindow"):
                    vg = ventanas_por_id.get(el.GlobalId)
                    if vg and vg["area_m2"] is not None:
                        area_ventanas += vg["area_m2"]
            pct = (area_ventanas / area * 100) if (area and area > 0) else None
            cumple = (pct >= 10.0) if pct is not None else None
            obs = None
            if pct is not None:
                obs = f"Ventilación natural medida desde IFC: {pct:.1f}% de la superficie (mínimo OGUC 10%)."
            recintos_semantico.append({
                "nombre": nombre, "tipo": "recinto",
                "area_estimada_m2": round(area, 2) if area is not None else None,
                "cumple_oguc": cumple, "observacion": obs,
            })
            mediciones_geometricas.append({
                "nombre": nombre, "id": sp.GlobalId[:8], "tipo": "recinto",
                "area_m2": round(area, 2) if area is not None else None,
                "cumple_geo": cumple,
            })

        incumplimientos_geo = []
        for d in puertas:
            ancho = a.num_o_none(d.OverallWidth)
            if ancho is not None and ancho < 0.80:
                incumplimientos_geo.append({
                    "tipo": "ancho", "recinto": d.Name or "Puerta",
                    "medido": round(ancho, 2), "minimo": 0.80,
                    "ref": "OGUC Art. 4.1.7 N°6 (ancho libre mínimo accesibilidad)",
                })

        total_puertas += len(puertas)
        total_ventanas += len(ventanas)
        total_escaleras += len(escaleras)

        paginas.append({
            "pagina": idx + 1,
            "entry_idx": idx,
            "fname_tag": nivel.Name,
            "escala": "1:50 (nominal -- dibujo generado a escala real en metros desde IFC, no impreso a escala de papel)",
            "imagen_w_px": w_px, "imagen_h_px": h_px, "mpp": None,
            "analisis_semantico": {
                "tipo_plano": "planta", "nivel": nivel.Name,
                "recintos": recintos_semantico,
                "incumplimientos_oguc": [],  # ver nota de cabecera -- no se fabrican candidatas
                "elementos_detectados": {
                    "puertas": len(puertas), "ventanas": len(ventanas),
                    "escaleras": len(escaleras), "salidas_emergencia": 0,
                },
            },
            "mediciones_geometricas": mediciones_geometricas,
            "incumplimientos_geo": incumplimientos_geo,
            "muros_geo": [], "puertas_geo": [],
        })
        print(f"Página {idx + 1} ({nivel.Name}): {len(muros)} muros, {len(puertas)} puertas, "
              f"{len(ventanas)} ventanas, {len(espacios_nivel)} recintos -> {ruta_png.name}")

    resultado = {
        "proyecto": "DuplexHouse (IFC de ejemplo, piloto BIM ArchiCheck)",
        "dpi": 150,
        "generado_desde": "IFC via ifcopenshell (no PDF/Colab-OpenCV) -- ver Proyecto/bim_exploracion_mercado_y_viabilidad.md",
        "paginas": paginas,
        "resumen_global": {
            "incumplimientos_geo_total": sum(len(p["incumplimientos_geo"]) for p in paginas),
            "puertas_detectadas": total_puertas,
            "ventanas_detectadas": total_ventanas,
            "escaleras_detectadas": total_escaleras,
            "rampas_detectadas": 0,
        },
    }

    ruta_json = carpeta_png / f"DuplexHouse_colab_{timestamp}.json"
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    print(f"\nJSON listo: {ruta_json}")


if __name__ == "__main__":
    main()
