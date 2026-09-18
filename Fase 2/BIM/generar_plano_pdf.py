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

import datetime
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Polygon as MplPolygon
from shapely.geometry import Polygon
from shapely.ops import unary_union

# Regla del proyecto (2026-09-18): todo archivo generado a partir de un IFC/BIM
# se guarda junto al archivo de origen, con el nombre del origen + timestamp de
# generacion -- nunca un nombre fijo/generico que se pise entre corridas.
ARCHIVOS = [
    r"Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc",
    r"Archivos ejemplo/Basic House/BasicHouse.ifc",
]


def ruta_salida(ifc_path: str) -> str:
    origen = Path(ifc_path)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    return str(origen.parent / f"{origen.stem}_plano_{timestamp}.pdf")

ESTILOS = {
    # linewidth aca es a proposito MAS grueso que el espesor real del muro:
    # a escala de edificio completo (~60-70 m) en una pagina A3, un muro de
    # 0.15-0.20 m real mide <1 mm en el papel -- practicamente invisible sin
    # exagerar el trazo, exactamente como un plano de arquitectura tambien
    # exagera el poche de muro a escalas chicas. La geometria (contorno) sigue
    # siendo la real, no se infla el poligono, solo el ancho de linea.
    "IfcWallStandardCase": dict(facecolor="#2b2b2b", edgecolor="black", linewidth=1.1, zorder=3, label="Muro"),
    "IfcColumn": dict(facecolor="#555555", edgecolor="black", linewidth=0.8, zorder=3, label="Pilar"),
    "IfcDoor": dict(facecolor="#3b82f6", edgecolor="#1d4ed8", linewidth=0.6, zorder=4, label="Puerta"),
    "IfcCurtainWall": dict(facecolor="#93c5fd", edgecolor="#1d4ed8", linewidth=0.5, zorder=2, label="Muro cortina"),
    "IfcPlate": dict(facecolor="#bfdbfe", edgecolor="#60a5fa", linewidth=0.3, zorder=1, label="Paño vidrio"),
    "IfcStairFlight": dict(facecolor="#f59e0b", edgecolor="black", linewidth=0.6, zorder=3, label="Escalera"),
    "IfcRailing": dict(facecolor="none", edgecolor="#9333ea", linewidth=0.8, zorder=5, label="Baranda"),
    "IfcWindow": dict(facecolor="#7dd3fc", edgecolor="#0369a1", linewidth=0.8, zorder=4, label="Ventana"),
    "IfcFurnishingElement": dict(facecolor="#d9c9a3", edgecolor="#78350f", linewidth=0.3, zorder=2, label="Mobiliario"),
}
ORDEN_DIBUJO = ["IfcPlate", "IfcCurtainWall", "IfcFurnishingElement", "IfcWallStandardCase", "IfcColumn",
                "IfcStairFlight", "IfcDoor", "IfcWindow", "IfcRailing"]

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


def marcar_centroide(ax, geom, **kwargs):
    """Punto de tamano FIJO en pantalla (no a escala real) para que un pilar
    de 30x30 cm siga siendo visible aunque su huella real sea sub-milimetrica
    en la pagina."""
    if geom is None or geom.is_empty:
        return
    c = geom.centroid
    ax.plot(c.x, c.y, marker="s", markersize=3.2, **kwargs)


def main(ifc_path):
    out_pdf = ruta_salida(ifc_path)
    modelo = ifcopenshell.open(ifc_path)
    niveles = sorted(modelo.by_type("IfcBuildingStorey"), key=lambda s: s.Elevation)

    # Origen comun para que las coordenadas no salgan en UTM real (~720000, ~4376000)
    todos_muros = modelo.by_type("IfcWallStandardCase")
    ox, oy = None, None
    for w in todos_muros[:1]:
        shp = ifcopenshell.geom.create_shape(settings, w)
        vv = shp.geometry.verts
        ox, oy = vv[0], vv[1]
        break

    with PdfPages(out_pdf) as pdf:
        for nivel in niveles:
            rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                    if r.RelatingStructure == nivel]
            elementos = []
            for r in rels:
                elementos.extend(r.RelatedElements)

            # IfcSpace en este archivo NO llega por IfcRelContainedInSpatialStructure
            # (como muros/puertas) sino por IfcRelAggregates (decomposicion del
            # nivel) -- confirmado inspeccionando Space.Decomposes directamente.
            # Un extractor que solo mire "contained in" pierde el 100% de los
            # recintos en silencio. Se agregan aparte, vía la utilidad que
            # cubre ambos mecanismos.
            espacios = [e for e in ifcopenshell.util.element.get_decomposition(nivel, is_recursive=False)
                        if e.is_a("IfcSpace")]
            elementos.extend(espacios)

            por_tipo = {}
            for el in elementos:
                t = el.is_a()
                if t in ESTILOS:
                    por_tipo.setdefault(t, []).append(el)

            fig, ax = plt.subplots(figsize=(16.54, 11.69))  # A3 apaisado -- mas espacio para detalle

            from shapely.affinity import translate

            for tipo in ORDEN_DIBUJO:
                for el in por_tipo.get(tipo, []):
                    geom = footprint_2d(el)
                    if geom is None:
                        continue
                    geom = translate(geom, xoff=-ox, yoff=-oy)
                    dibujar_geom(ax, geom, {k: v for k, v in ESTILOS[tipo].items() if k != "label"})
                    if tipo == "IfcColumn":
                        marcar_centroide(ax, geom, color="black", zorder=6)

            # Nombres de recinto (IfcSpace) -- no se dibuja su poligono (taparia
            # el resto), solo el texto, para dar la referencia funcional que
            # tiene un plano real sin saturar el dibujo de lineas.
            # Se etiqueta cada NOMBRE distinto como maximo 3 veces por pagina --
            # con 176 IfcSpace en un solo nivel (ej. PS1, estacionamiento),
            # repetir "APARCAMIENTO COCHE" 176 veces es ruido, no detalle.
            espacios = [e for e in elementos if e.is_a("IfcSpace")]
            conteo_nombre = {}
            for sp in espacios:
                nombre = (sp.LongName or sp.Name or "").strip()
                if not nombre:
                    continue
                conteo_nombre[nombre] = conteo_nombre.get(nombre, 0) + 1
                if conteo_nombre[nombre] > 3:
                    continue
                geom = footprint_2d(sp)
                if geom is None:
                    continue
                geom = translate(geom, xoff=-ox, yoff=-oy)
                c = geom.centroid
                ax.text(c.x, c.y, nombre, fontsize=4.5, ha="center", va="center",
                        zorder=7, color="#111827",
                        bbox=dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none", alpha=0.7))

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

    print(f"\nListo: {out_pdf}")


if __name__ == "__main__":
    for ifc_path in ARCHIVOS:
        print(f"\n=== {ifc_path} ===")
        try:
            main(ifc_path)
        except PermissionError as e:
            print(f"  (omitido -- archivo de salida bloqueado: {e})")
