# Genera un plano en planta (PDF, una pagina por nivel) directamente desde la
# geometria del IFC, sin pasar por Colab/heuristica de PDF. Piloto para
# comparar contra el pipeline PDF existente de ArchiCheck sobre el MISMO
# edificio: si algun dia se consigue el PDF timbrado real de este proyecto,
# se puede correr la Celda 4 sobre el y comparar muros_geo/puertas_geo contra
# lo que sale de aca (extraido directo del IFC, sin heuristica).
#
# Metodo: para cada elemento en cada nivel, se triangula su geometria 3D
# (ifcopenshell.geom, coordenadas de mundo) y se proyecta cada triangulo al
# plano XY (se descarta Z) armando su silueta real via union de shapely --
# no es un bounding-box ni un convex hull, sigue la forma real del elemento
# incluidos muros curvos o plates no rectangulares.

import ifcopenshell
import ifcopenshell.geom
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Polygon as MplPolygon
from shapely.geometry import Polygon
from shapely.ops import unary_union

IFC_PATH = r"Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc"
OUT_PDF = r"Archivos ejemplo/plano_generado_desde_ifc.pdf"

ESTILOS = {
    "IfcWallStandardCase": dict(facecolor="#2b2b2b", edgecolor="none", zorder=3, label="Muro"),
    "IfcColumn": dict(facecolor="#555555", edgecolor="none", zorder=3, label="Pilar"),
    "IfcDoor": dict(facecolor="#3b82f6", edgecolor="none", zorder=4, label="Puerta"),
    "IfcCurtainWall": dict(facecolor="#93c5fd", edgecolor="#1d4ed8", linewidth=0.3, zorder=2, label="Muro cortina"),
    "IfcPlate": dict(facecolor="#bfdbfe", edgecolor="none", zorder=1, label="Paño vidrio"),
    "IfcStairFlight": dict(facecolor="#f59e0b", edgecolor="none", zorder=3, label="Escalera"),
    "IfcRailing": dict(facecolor="none", edgecolor="#9333ea", linewidth=0.6, zorder=5, label="Baranda"),
}
ORDEN_DIBUJO = ["IfcPlate", "IfcCurtainWall", "IfcWallStandardCase", "IfcColumn",
                "IfcStairFlight", "IfcDoor", "IfcRailing"]

settings = ifcopenshell.geom.settings()
settings.set("use-world-coords", True)


def footprint_2d(elemento):
    """Proyecta la geometria 3D real del elemento al plano XY (planta)."""
    try:
        shape = ifcopenshell.geom.create_shape(settings, elemento)
    except Exception:
        return None
    verts = shape.geometry.verts
    faces = shape.geometry.faces
    pts = [(verts[i], verts[i + 1]) for i in range(0, len(verts), 3)]
    tris = []
    for i in range(0, len(faces), 3):
        a, b, c = faces[i], faces[i + 1], faces[i + 2]
        tri = Polygon([pts[a], pts[b], pts[c]])
        if tri.area > 1e-9:
            tris.append(tri.buffer(0))
    if not tris:
        return None
    return unary_union(tris)


def dibujar_geom(ax, geom, estilo):
    if geom is None or geom.is_empty:
        return
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    for poly in polys:
        if poly.is_empty:
            continue
        xy = list(poly.exterior.coords)
        ax.add_patch(MplPolygon(xy, closed=True, **estilo))


def main():
    modelo = ifcopenshell.open(IFC_PATH)
    niveles = sorted(modelo.by_type("IfcBuildingStorey"), key=lambda s: s.Elevation)

    # Origen comun para que las coordenadas no salgan en UTM real (~720000, ~4376000)
    todos_muros = modelo.by_type("IfcWallStandardCase")
    ox, oy = None, None
    for w in todos_muros[:1]:
        shp = ifcopenshell.geom.create_shape(settings, w)
        vv = shp.geometry.verts
        ox, oy = vv[0], vv[1]
        break

    with PdfPages(OUT_PDF) as pdf:
        for nivel in niveles:
            rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                    if r.RelatingStructure == nivel]
            elementos = []
            for r in rels:
                elementos.extend(r.RelatedElements)

            por_tipo = {}
            for el in elementos:
                t = el.is_a()
                if t in ESTILOS:
                    por_tipo.setdefault(t, []).append(el)

            fig, ax = plt.subplots(figsize=(11.69, 8.27))  # A4 apaisado

            for tipo in ORDEN_DIBUJO:
                for el in por_tipo.get(tipo, []):
                    geom = footprint_2d(el)
                    if geom is None:
                        continue
                    from shapely.affinity import translate
                    geom = translate(geom, xoff=-ox, yoff=-oy)
                    dibujar_geom(ax, geom, {k: v for k, v in ESTILOS[tipo].items() if k != "label"})

            ax.set_aspect("equal")
            ax.autoscale()
            ax.set_title(f"{nivel.Name}  ·  cota {nivel.Elevation:.2f} m  ·  generado desde IFC (no PDF)")
            ax.set_xlabel("m")
            ax.set_ylabel("m")
            handles = [MplPolygon([(0, 0)], closed=True, facecolor=ESTILOS[t]["facecolor"],
                                   edgecolor=ESTILOS[t].get("edgecolor", "none"), label=ESTILOS[t]["label"])
                       for t in ORDEN_DIBUJO if por_tipo.get(t)]
            if handles:
                ax.legend(handles=handles, loc="upper right", fontsize=7, framealpha=0.9)
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)
            print(f"Nivel {nivel.Name}: {sum(len(v) for v in por_tipo.values())} elementos dibujados")

    print(f"\nListo: {OUT_PDF}")


if __name__ == "__main__":
    main()
