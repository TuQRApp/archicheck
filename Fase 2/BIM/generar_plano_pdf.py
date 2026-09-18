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
from collections import Counter
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.placement
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Polygon as MplPolygon
from shapely.geometry import MultiPoint

# Regla del proyecto (2026-09-18): todo archivo generado a partir de un IFC/BIM
# se guarda junto al archivo de origen, con el nombre del origen + timestamp de
# generacion -- nunca un nombre fijo/generico que se pise entre corridas.
ARCHIVOS = [
    r"Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc",
    r"Archivos ejemplo/Basic House/BasicHouse.ifc",
    r"Archivos ejemplo/FZK/AC20-FZK-Haus.ifc",
    r"Archivos ejemplo/HouseZ/ISSUE_034_HouseZ.ifc",
    # DuplexHouse.ifc: MD5 identico a BasicHouse.ifc cuando se verifico por
    # primera vez (2026-09-18) -- pero el archivo en disco cambio despues
    # (52.7MB -> 2.4MB, MD5 distinto) sin aviso. Es un archivo real y
    # distinto ahora (4 niveles propios) -- reverificado antes de procesar,
    # no asumido.
    r"Archivos ejemplo/Duplex house/DuplexHouse.ifc",
    # Dataset LTU (Lulea University of Technology) -- 9 archivos de un mismo
    # proyecto sueco multi-disciplina, extraidos de LTU_A-House_2014-09-25_ifc.zip
    # el 2026-09-18. Solo K-modell y redesign tienen muros (arquitectura/
    # estructura); los otros 7 son instalaciones puras (MEP) y usan el modo
    # rapido "instalaciones" (ver generar_mep()).
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_K-modell.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_redesign.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_Air.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_Cooling.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_Ducting.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_Heating.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_Plumbing.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_Sanitation.ifc",
    r"Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_VOIDS.ifc",
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
    # Mismo estilo para IfcWall generico -- HouseZ usa esta clase en vez del
    # subtipo IfcWallStandardCase (bug real, revision cruzada 2026-09-18):
    # el.is_a() devuelve la clase EXACTA de la instancia, asi que ambas
    # entradas conviven sin doble conteo.
    "IfcWall": dict(facecolor="#2b2b2b", edgecolor="black", linewidth=1.1, zorder=3, label="Muro"),
    "IfcColumn": dict(facecolor="#555555", edgecolor="black", linewidth=0.8, zorder=3, label="Pilar"),
    "IfcDoor": dict(facecolor="#3b82f6", edgecolor="#1d4ed8", linewidth=0.6, zorder=4, label="Puerta"),
    "IfcCurtainWall": dict(facecolor="#93c5fd", edgecolor="#1d4ed8", linewidth=0.5, zorder=2, label="Muro cortina"),
    "IfcPlate": dict(facecolor="#bfdbfe", edgecolor="#60a5fa", linewidth=0.3, zorder=1, label="Paño vidrio"),
    "IfcStairFlight": dict(facecolor="#f59e0b", edgecolor="black", linewidth=0.6, zorder=3, label="Escalera"),
    "IfcRailing": dict(facecolor="none", edgecolor="#9333ea", linewidth=0.8, zorder=5, label="Baranda"),
    "IfcWindow": dict(facecolor="#7dd3fc", edgecolor="#0369a1", linewidth=0.8, zorder=4, label="Ventana"),
    "IfcFurnishingElement": dict(facecolor="#d9c9a3", edgecolor="#78350f", linewidth=0.3, zorder=2, label="Mobiliario"),
}
ORDEN_DIBUJO = ["IfcPlate", "IfcCurtainWall", "IfcFurnishingElement", "IfcWallStandardCase", "IfcWall", "IfcColumn",
                "IfcStairFlight", "IfcDoor", "IfcWindow", "IfcRailing"]

settings = ifcopenshell.geom.settings()
settings.set("use-world-coords", True)
# Encontrado 2026-09-18 con redesign.ifc (2623 muros, 2785 IfcOpeningElement):
# la resta booleana (CSG) de cada vano en cada muro es lenta a esta escala --
# el proceso quedo "Not Responding" en Windows incluso DESPUES de reemplazar
# la union de shapely por convex hull (ver footprint_2d), confirmando que el
# cuello de botella real esta en ifcopenshell.geom (triangulacion con
# booleanas), no en el post-procesado en Python. Se desactiva la resta de
# vanos: el impacto visual es nulo en este script porque puertas/ventanas ya
# se dibujan aparte, encima del muro (zorder mayor) -- el hueco booleano en
# el propio poligono del muro nunca se veia de todos modos.
settings.set("disable-opening-subtractions", True)


def footprint_2d(elemento):
    """Proyecta la geometria 3D real del elemento al plano XY (planta).

    Cambio 2026-09-18: la version anterior armaba un Polygon por triangulo
    (Polygon+buffer(0)) y los unia con unary_union -- con `redesign.ifc`
    (2623 muros + 976 ventanas + 606 puertas en 5 niveles, LTU) el proceso
    quedo "Not Responding" en Windows con 7+ minutos de CPU y 2GB de RAM
    (confirmado con tasklist, terminado a mano) -- exactamente el riesgo que
    señalo la revision cruzada con DeepSeek ("unary_union por elemento es el
    cuello de botella... va a explotar en tiempo" y el bug de winding-order
    que puede perder triangulos). Se reemplaza por un unico convex hull sobre
    TODOS los vertices del elemento: una sola operacion O(n log n), sin loop
    de triangulos, sin buffer(0), inmune al problema de winding. Para
    extrusiones convexas (muros, puertas, ventanas, columnas, mobiliario
    simple -- la gran mayoria de lo que dibuja este script) el resultado es
    identico a la silueta real. Se pierde precision solo en elementos
    genuinamente concavos (ej. una columna en L), caso no encontrado todavia
    en ninguno de los IFC de esta sesion.
    """
    try:
        shape = ifcopenshell.geom.create_shape(settings, elemento)
    except Exception:
        return None
    verts = shape.geometry.verts
    if len(verts) < 9:  # menos de 3 puntos
        return None
    pts = [(verts[i], verts[i + 1]) for i in range(0, len(verts), 3)]
    hull = MultiPoint(pts).convex_hull
    if hull.geom_type not in ("Polygon", "MultiPolygon") or hull.area <= 1e-9:
        return None
    return hull


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


CLASES_SUSTANTIVAS_NIVEL = {"IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
                             "IfcBeam", "IfcRoof", "IfcStairFlight", "IfcStair"}

# Modo "instalaciones" (MEP) -- LTU_A-House_{Air,Cooling,Ducting,Heating,
# Plumbing,Sanitation,VOIDS}.ifc no tienen NINGUN muro (confirmado por barrido
# de clases 2026-09-18): son miles de ductos/tuberias (7.000-60.000 elementos
# por archivo). Triangular cada uno con ifcopenshell.geom + shapely (el modo
# "arquitectura" de mas abajo) es demasiado lento a esa escala -- en vez de
# eso se ubica cada elemento por su punto de insercion (ObjectPlacement
# resuelto a coordenadas de mundo, sin triangular geometria) y se dibuja como
# punto de color por clase. Mucho mas rapido, sigue siendo una verificacion
# visual real de donde esta el trazado, no un plano de detalle.
CLASES_MEP = {
    "IfcFlowSegment": "#0ea5e9", "IfcFlowFitting": "#6366f1", "IfcFlowTerminal": "#dc2626",
    "IfcFlowController": "#16a34a", "IfcFlowTreatmentDevice": "#ca8a04",
    "IfcFlowMovingDevice": "#db2777", "IfcEnergyConversionDevice": "#ea580c",
    "IfcCovering": "#94a3b8", "IfcBuildingElementProxy": "#78716c",
}


def punto_insercion(elemento):
    try:
        m = ifcopenshell.util.placement.get_local_placement(elemento.ObjectPlacement)
        return float(m[0, 3]), float(m[1, 3])
    except Exception:
        return None


def validar_niveles(modelo, niveles):
    """Regla del proyecto (2026-09-18): nunca reportar la cantidad de niveles
    de un IFC solo porque asi lo declara IfcBuildingStorey -- cruzar contra
    evidencia real. Un nivel con 0 elementos sustantivos (solo, por ejemplo,
    una cubierta suelta -- caso real: BasicHouse.ifc "Floor 1") no es
    necesariamente una planta habitable independiente. Devuelve un reporte,
    no lanza excepcion -- el llamador decide que hacer con las alertas.
    """
    filas = []
    for nivel in niveles:
        rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                if r.RelatingStructure == nivel]
        elementos = []
        for r in rels:
            elementos.extend(r.RelatedElements)
        clases = Counter(e.is_a() for e in elementos)
        sustantivos = sum(v for k, v in clases.items() if k in CLASES_SUSTANTIVAS_NIVEL)
        filas.append({
            "nombre": nivel.Name, "elevacion": nivel.Elevation,
            "total_elementos": len(elementos), "elementos_sustantivos": sustantivos,
            "sospechoso": sustantivos == 0,
        })

    elevaciones = [f["elevacion"] for f in filas if f["elevacion"] is not None]
    cotas_duplicadas = len(elevaciones) != len(set(elevaciones))

    contenidos = set()
    for r in modelo.by_type("IfcRelContainedInSpatialStructure"):
        for e in r.RelatedElements:
            contenidos.add(e.id())
    huerfanos = [e for e in modelo.by_type("IfcElement") if e.id() not in contenidos]

    alertas = []
    for f in filas:
        if f["sospechoso"]:
            alertas.append(f"nivel '{f['nombre']}' sin elementos sustantivos "
                            f"(solo {f['total_elementos']} elemento(s) total) -- "
                            f"revisar si es una planta real o solo cubierta/nivel nominal")
    if cotas_duplicadas:
        alertas.append("hay niveles con la MISMA elevacion declarada -- posible nivel duplicado")
    if huerfanos:
        alertas.append(f"{len(huerfanos)} elemento(s) fisico(s) sin ningun nivel asignado "
                        f"(fuera de IfcRelContainedInSpatialStructure) -- podrian faltar del conteo por nivel")

    return {"niveles": filas, "cotas_duplicadas": cotas_duplicadas,
            "huerfanos": len(huerfanos), "alertas": alertas}


def generar_mep(modelo, niveles, out_pdf, ox, oy):
    """Modo rapido para archivos sin muros (instalaciones/MEP): un punto por
    elemento en su punto de insercion real, sin triangular geometria."""
    with PdfPages(out_pdf) as pdf:
        for nivel in niveles:
            rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                    if r.RelatingStructure == nivel]
            elementos = []
            for r in rels:
                elementos.extend(r.RelatedElements)

            por_tipo = {}
            for el in elementos:
                t = el.is_a()
                if t in CLASES_MEP:
                    por_tipo.setdefault(t, []).append(el)

            fig, ax = plt.subplots(figsize=(16.54, 11.69))
            for tipo, color in CLASES_MEP.items():
                pts = [punto_insercion(el) for el in por_tipo.get(tipo, [])]
                pts = [(x - ox, y - oy) for p in pts if p is not None for x, y in [p]]
                if not pts:
                    continue
                xs, ys = zip(*pts)
                ax.scatter(xs, ys, s=4, color=color, label=f"{tipo} ({len(pts)})", zorder=2)

            ax.set_aspect("equal")
            ax.autoscale()
            elev_txt = f"{nivel.Elevation:.2f} m" if nivel.Elevation is not None else "sin cota"
            total = sum(len(v) for v in por_tipo.values())
            ax.set_title(f"{nivel.Name}  ·  cota {elev_txt}  ·  MODO INSTALACIONES "
                         f"(puntos de insercion, sin geometria solida) · {total} elementos")
            ax.set_xlabel("m")
            ax.set_ylabel("m")
            if any(por_tipo.values()):
                ax.legend(loc="upper right", fontsize=7, framealpha=0.9)
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)
            print(f"Nivel {nivel.Name}: {total} elementos (modo instalaciones)")

    print(f"\nListo (modo instalaciones): {out_pdf}")


def main(ifc_path):
    out_pdf = ruta_salida(ifc_path)
    modelo = ifcopenshell.open(ifc_path)
    # Elevation puede venir None en un IFC valido (bug real senalado por
    # revision cruzada, Codex 2026-09-18) -- sorted() con key=None explota.
    niveles = sorted(modelo.by_type("IfcBuildingStorey"),
                      key=lambda s: s.Elevation if s.Elevation is not None else 0.0)

    # Regla del proyecto (2026-09-18): validar SIEMPRE la cantidad de niveles
    # contra evidencia real antes de reportarla, no solo contar IfcBuildingStorey.
    validacion = validar_niveles(modelo, niveles)
    print(f"  [{len(niveles)} nivel(es) declarados]")
    for f in validacion["niveles"]:
        marca = " <-- SOSPECHOSO" if f["sospechoso"] else ""
        elev = f"{f['elevacion']:.2f}" if f["elevacion"] is not None else "SIN COTA"
        print(f"    {f['nombre']!r} (cota {elev}): {f['total_elementos']} elementos "
              f"({f['elementos_sustantivos']} sustantivos){marca}")
    for alerta in validacion["alertas"]:
        print(f"  ALERTA: {alerta}")

    # Origen comun para que las coordenadas no salgan en UTM real (~720000, ~4376000).
    # Bug real encontrado por revision cruzada (Codex + DeepSeek, 2026-09-18):
    # IfcWallStandardCase puede no existir (HouseZ usa IfcWall generico) y
    # ox/oy quedaban en None, rompiendo el primer translate() del script mas
    # abajo. Se usa IfcWall (incluye el subtipo) con fallback a (0, 0) si el
    # archivo no tiene ningun muro en absoluto.
    todos_muros = modelo.by_type("IfcWall")
    ox, oy = 0.0, 0.0
    for w in todos_muros[:1]:
        try:
            shp = ifcopenshell.geom.create_shape(settings, w)
            vv = shp.geometry.verts
            ox, oy = vv[0], vv[1]
        except Exception:
            pass
        break

    if not todos_muros:
        # Sin ningun muro en todo el archivo -> modo instalaciones (MEP), ver
        # CLASES_MEP mas arriba. No tiene sentido intentar el modo
        # arquitectura (que asume muros/puertas/ventanas) sobre un archivo de
        # ductos/tuberias puro.
        generar_mep(modelo, niveles, out_pdf, ox, oy)
        return

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
            elev_txt = f"{nivel.Elevation:.2f} m" if nivel.Elevation is not None else "sin cota"
            ax.set_title(f"{nivel.Name}  ·  cota {elev_txt}  ·  generado desde IFC (no PDF)")
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
