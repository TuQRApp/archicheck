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
import math
from collections import Counter
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.placement
import ifcopenshell.util.unit
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Polygon as MplPolygon
from shapely.affinity import translate
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
    # Schependomlaan (residencial holandes, dataset academico muy citado) --
    # agregado 2026-09-19. 6 niveles reales, 100 IfcSpace, mezcla IfcWall (652)
    # + IfcWallStandardCase (282) en el mismo archivo.
    r"Archivos ejemplo/Schependomlaan/IFC_Schependomlaan.ifc",
]


def ruta_salida(ifc_path: str) -> str:
    origen = Path(ifc_path)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    return str(origen.parent / f"{origen.stem}_plano_{timestamp}.pdf")


# Filtro de vanos "no reales" (marcos de obra sin terminar, hardware no
# transitable) -- hallazgo real 2026-09-19: el usuario desconfio con razon de
# "80 puertas, 84 ventanas" en una sola planta de Schependomlaan. Resultaron
# ser "stelkozijn" (holandes: contramarco de OBRA en hormigon, previo a
# instalar la puerta/ventana final -- Psets de hormigon armado,
# "betonkwaliteit"/"wapening kg/m3", 65 de 205 IfcDoor + 182 de 259
# IfcWindow en todo el edificio) y "liftdeur" (panel del mecanismo de un
# ascensor, geometria de 0.039 m2 rotada, no una puerta de circulacion).
#
# La primera version de este filtro fue por NOMBRE ("stelkozijn"/"liftdeur")
# -- el usuario senalo con razon (2026-09-19) que eso es especifico del
# exportador holandes de ESTE archivo y no serviria para un IFC chileno con
# los mismos nombres en espanol. Reemplazado por una señal geometrica, sin
# depender de idioma: en Schependomlaan, "tiene OverallWidth O OverallHeight
# declarado" separa EXACTO las 104 puertas reales de las 101 falsas (0 casos
# se cuelan en ningun sentido, verificado) -- pero eso solo es una señal
# valida cuando ALGUNOS elementos del archivo SI declaran dimension. HouseZ
# tiene sus 15 puertas y 22 ventanas reales con CERO dimension declarada en
# TODAS -- ahi la ausencia no distingue nada, es como exporta ese archivo
# (dato ausente legitimo, ya contabilizado como real en toda la sesion). Por
# eso el filtro es adaptativo POR ARCHIVO Y POR CATEGORIA (puerta y ventana
# por separado): si existe al menos un elemento con dimension, los que no
# tienen ninguna se excluyen; si NINGUNO la tiene, se mantienen todos.
def filtrar_vanos_reales(elementos_de_un_tipo):
    """Filtra una lista de IfcDoor o de IfcWindow (todos del MISMO tipo,
    typicamente `modelo.by_type("IfcDoor")` completo) dejando solo los que
    son aberturas reales -- ver nota de cabecera arriba. Devuelve una nueva
    lista; no muta la de entrada."""
    con_dimension = [e for e in elementos_de_un_tipo if e.OverallWidth is not None or e.OverallHeight is not None]
    if not con_dimension:
        return list(elementos_de_un_tipo)  # sin señal en este archivo -- se mantienen todos
    ids_con_dimension = {e.GlobalId for e in con_dimension}
    return [e for e in elementos_de_un_tipo if e.GlobalId in ids_con_dimension]


# Bug real encontrado 2026-09-19 (revision cruzada DeepSeek, sobre el codigo de
# hoy): analizar_todos.py y generar_json_colab.py comparaban OverallWidth
# CRUDO (sin escala_m) contra el umbral OGUC de 0.80 m -- en archivos cuya
# unidad de longitud es milimetros (BasicHouse, HouseZ, Schependomlaan: 3 de
# los 6 archivos con arquitectura real de esta sesion), cualquier ancho crudo
# (ej. 680) es siempre >= 0.80, asi que el chequeo NUNCA podia fallar sin
# importar el ancho real. Verificado con datos: Schependomlaan tiene 12
# puertas reales bajo 0.80 m real (0.63-0.68 m) que el JSON generado antes de
# este fix reportaba con CERO incumplimientos de ancho.
#
# La misma clase de bug NO aplica igual al AREA de un recinto (Qto de
# superficie): IFC permite declarar AREAUNIT de forma INDEPENDIENTE de
# LENGTHUNIT -- confirmado con evidencia real (no asumido): BasicHouse y
# Schependomlaan declaran LENGTHUNIT=milimetro pero AREAUNIT=metro_cuadrado
# explicito (patron real de exportadores Revit: longitud en mm por precision,
# area en m2 por legibilidad) -- sus areas de recinto YA estan en m2
# correctos, aplicarles escala_m**2 las habria roto (0.72 m2 reales
# convertidos, por error, a 0.00000072). HouseZ no declara ningun AREAUNIT
# propio -- para ese caso (sin caso de ventilacion calculable todavia en
# ningun archivo de esta sesion, asi que sin impacto visible hoy) se deriva
# como el cuadrado de la escala de longitud, comportamiento correcto segun el
# estandar IFC cuando AREAUNIT no se declara aparte.
def escala_area(modelo):
    """Factor de escala para valores de AREA (ej. NetFloorArea de un Qto de
    recinto) a m2 real -- NUNCA asumir que es escala_m**2, ver nota de
    cabecera: usa el AREAUNIT propio del proyecto si existe, y solo deriva de
    LENGTHUNIT al cuadrado cuando el proyecto no declara AREAUNIT en
    absoluto."""
    proyectos = modelo.by_type("IfcProject")
    contexto_unidades = proyectos[0].UnitsInContext if proyectos else None
    tiene_area_unit = bool(contexto_unidades) and any(
        getattr(u, "UnitType", None) == "AREAUNIT" for u in contexto_unidades.Units
    )
    if tiene_area_unit:
        return ifcopenshell.util.unit.calculate_unit_scale(modelo, "AREAUNIT")
    return ifcopenshell.util.unit.calculate_unit_scale(modelo) ** 2

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
    # IfcStair agregado (2026-09-19, hallazgo real en Schependomlaan): 3 de
    # sus IfcStair NO tienen ningun IfcStairFlight hijo (decomposicion vacia),
    # pero el propio IfcStair SI tiene geometria 3D real y usable
    # (footprint_2d funciona directo sobre el, 2.2-3.9 m2) -- antes esa
    # geometria nunca se dibujaba porque "IfcStair" no estaba en este catalogo,
    # aunque el contador de escaleras (elementos.py/analizar_todos.py) ya lo
    # contaba bien via el fallback de conteo. Mismo estilo que IfcStairFlight
    # a proposito: es la MISMA escalera, solo que este archivo no modelo el
    # tramo como objeto separado.
    "IfcStair": dict(facecolor="#f59e0b", edgecolor="black", linewidth=0.6, zorder=3, label="Escalera"),
    # Rampas (2026-09-20, pedido explicito del usuario tras la auditoria de
    # cobertura -- ver seccion 30 del diario BIM): IfcRamp/IfcRampFlight
    # agregados con el MISMO patron ya verificado para escalera/IfcStairFlight
    # (decomposicion + fallback al contenedor cuando no hay tramo hijo, ver
    # mas abajo en el loop principal). Color propio (turquesa) para no
    # confundirse visualmente con escalera en el plano. NINGUN archivo de
    # ejemplo de esta sesion tiene una IfcRamp real (0/8, ver Convenciones_BIM.md
    # seccion "Rampas") -- se implementa el mismo mecanismo de dibujo/conteo
    # que ya esta probado para escaleras, pero SIN chequeo de pendiente/ancho
    # normativo (OGUC 4.1.7): eso requeriria calibrar contra un caso real, y
    # este proyecto no inventa un umbral sin evidencia (principio 0.4 de
    # Convenciones_BIM.md). Queda como deteccion/registro, no como evaluacion.
    "IfcRampFlight": dict(facecolor="#2dd4bf", edgecolor="#0f766e", linewidth=0.6, zorder=3, label="Rampa"),
    "IfcRamp": dict(facecolor="#2dd4bf", edgecolor="#0f766e", linewidth=0.6, zorder=3, label="Rampa"),
    "IfcRailing": dict(facecolor="none", edgecolor="#9333ea", linewidth=0.8, zorder=5, label="Baranda"),
    "IfcWindow": dict(facecolor="#7dd3fc", edgecolor="#0369a1", linewidth=0.8, zorder=4, label="Ventana"),
    "IfcFurnishingElement": dict(facecolor="#d9c9a3", edgecolor="#78350f", linewidth=0.3, zorder=2, label="Mobiliario"),
    # Pisos/cubiertas (2026-09-19, hallazgo real investigando Schependomlaan
    # nivel "04 dak" contra Altiro: nuestro PDF dibujaba solo 22 elementos ahi
    # -- las 3 clases de abajo triangulan bien (148/158, 9/9, 11/11
    # verificado), nunca fue limite de geometria, era que no estaban en este
    # catalogo). A pedido explicito del usuario, estas 3 se agregan SOLO para
    # el nivel de cubierta -- existen en cantidades mucho mayores en TODOS
    # los demas niveles del edificio (ej. planta baja de Schependomlaan:
    # 252 IfcCovering + 80 IfcSlab + 24 IfcBeam) y ahi se siguen ignorando a
    # proposito: un piso/cubrimiento a pagina completa taparia muros/puertas/
    # ventanas en una planta normal. Ver ORDEN_DIBUJO_CUBIERTA y
    # es_nivel_cubierta() mas abajo -- la seleccion de CUAL nivel es la
    # cubierta es geometrica (el de mayor cota), nunca por nombre/idioma.
    "IfcSlab": dict(facecolor="#94a3b8", edgecolor="#475569", linewidth=0.4, zorder=1, label="Losa/cubierta"),
    "IfcCovering": dict(facecolor="#d6d3d1", edgecolor="#78716c", linewidth=0.3, zorder=2, label="Revestimiento/cubierta"),
    "IfcBeam": dict(facecolor="#b45309", edgecolor="#78350f", linewidth=0.5, zorder=3, label="Viga"),
}
ORDEN_DIBUJO = ["IfcPlate", "IfcCurtainWall", "IfcFurnishingElement", "IfcWallStandardCase", "IfcWall", "IfcColumn",
                "IfcStairFlight", "IfcStair", "IfcRampFlight", "IfcRamp", "IfcDoor", "IfcWindow", "IfcRailing"]
# Nivel de cubierta = el de mayor cota (Elevation) del edificio, unico criterio
# geometrico disponible sin depender de nombre/idioma del nivel (mismo
# principio que el resto del proyecto: nunca filtrar por nombre cuando hay
# una senal estructural). No es infalible (un atico/terraza intermedia bajo
# una cubierta real quedaria mal clasificado), pero es la mejor senal
# disponible sin inventar una heuristica de nombre -- documentado como tal.
ORDEN_DIBUJO_CUBIERTA = ["IfcSlab", "IfcCovering"] + ORDEN_DIBUJO + ["IfcBeam"]


def es_nivel_cubierta(nivel, niveles):
    """True si `nivel` es el de mayor Elevation entre `niveles` (lista ya
    ordenada o no) -- ver nota de cabecera de ORDEN_DIBUJO_CUBIERTA."""
    cotas = [n.Elevation for n in niveles if n.Elevation is not None]
    if not cotas or nivel.Elevation is None:
        return False
    return nivel.Elevation == max(cotas)

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


def etiquetar_recintos(ax, elementos, ox, oy):
    """Nombre de cada IfcSpace en el plano, en letra pequena -- no se dibuja
    su poligono (taparia el resto), solo el texto, para dar la referencia
    funcional que tiene un plano real sin saturar el dibujo de lineas.

    Regla del proyecto (2026-09-19): todo plano generado desde IFC debe
    llevar SIEMPRE los nombres de recinto, en letra pequena -- aplica a
    cualquier script que dibuje una planta (generar_plano_pdf.py,
    generar_json_colab.py, y los que vengan despues). Se etiqueta cada
    NOMBRE distinto como maximo 3 veces por pagina -- con cientos de
    IfcSpace repetidos (ej. 176 "APARCAMIENTO COCHE" en un solo nivel de
    redesign.ifc), repetir el mismo texto cientos de veces es ruido, no
    detalle.
    """
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


# Sentido de apertura de puertas (2026-09-19, pedido explicito del usuario).
# Algunos exportadores (ej. la familia "D1R"/"D2R" de Schependomlaan) ya
# modelan el arco de giro como parte de la geometria 3D del propio IfcDoor --
# footprint_2d lo capta solo con el convex hull. PERO (2026-09-19, corregido
# el mismo dia): se probo detectar esos casos por vertices/ancho del
# rectangulo minimo para NO dibujar "?" encima, y no hay separacion
# confiable -- "D1R" (arco real confirmado a mano, transformando sus
# vertices al sistema local) da un lado corto de 0.17 m, exactamente en el
# mismo rango (0.11-0.20 m) que puertas SIN ningun indicio real. No existe
# hoy una señal barata y confiable para saber si el hull "rico" de una
# puerta es un arco real o solo detalle de marco/jamba -- se prefiere seguir
# marcando "?" en esos casos (incertidumbre transparente) antes que
# arriesgarse a ocultar la ausencia de dato por error.
#
# Estas funciones son el RESPALDO para puertas sin arco propio en la
# geometria: sintetizan el simbolo estandar (arco de 90 grados + linea de la
# hoja abierta) a partir de IfcDoorStyle.OperationType.
#
# Convencion verificada de forma EMPIRICA (no solo leida en el texto de la
# especificacion) contra una puerta real de Schependomlaan que SI trae el
# arco en su geometria: se transformaron sus vertices reales al sistema de
# coordenadas LOCAL de la puerta (su ObjectPlacement) y se confirmo que la
# bisagra queda en X local = 0 (el extremo que buildingSMART llama
# "izquierdo", visto mirando hacia +Y local) y el barrido va hacia +Y local
# ("hacia afuera") -- consistente con la definicion oficial de
# IfcDoorStyleOperationEnum (standards.buildingsmart.org).
#
# DOUBLE_DOOR_SINGLE_SWING agregado (2026-09-19, hallazgo real: 5 de 35
# puertas del piso base de Schependomlaan declaran este tipo -- dato real,
# no ausente, que antes caia a "?" solo por no estar implementado) -- 2
# hojas, cada una la mitad del ancho total, bisagras en los 2 extremos
# opuestos del vano, ambas abriendo hacia +Y local (definicion oficial:
# "una abre hacia la izquierda, la otra hacia la derecha").
OPERACIONES_SWING_SIMPLE = {"SINGLE_SWING_LEFT": 0.0, "SINGLE_SWING_RIGHT": 1.0}
OPERACIONES_SWING_DOBLE = {"DOUBLE_DOOR_SINGLE_SWING"}


def mapa_operacion_puertas(modelo):
    """GlobalId de IfcDoor -> OperationType declarado en su IfcDoorStyle
    vinculado (via IfcRelDefinesByType). NOTDEFINED/USERDEFINED quedan en el
    mapa tal cual (son valores reales, informan que se reviso y no traia
    dato util) -- una puerta sin ninguna relacion a IfcDoorStyle simplemente
    no aparece en el mapa."""
    mapa = {}
    for r in modelo.by_type("IfcRelDefinesByType"):
        if not r.RelatingType.is_a("IfcDoorStyle"):
            continue
        op = r.RelatingType.OperationType
        for obj in r.RelatedObjects:
            if obj.is_a("IfcDoor"):
                mapa[obj.GlobalId] = op
    return mapa


# Salidas de emergencia (2026-09-20, auditoria de cobertura -- ver seccion 30
# del diario BIM): el catalogo se habia documentado como "0% construido, no
# existe ningun mecanismo IFC que las etiquete directamente" -- verificado que
# eso es PARCIALMENTE falso: `Pset_DoorCommon.FireExit` SI es un campo
# estandar real de IFC (buildingSMART), y aparece declarado en 1 de las 8
# IFC de ejemplo (FZK-Haus, 1 de 5 puertas, valor False). No resuelve el
# problema completo (carga de ocupacion + trazado de rutas sigue sin
# implementar), pero cerrar la parte que SI es dato real evita el hardcode
# "salidas_emergencia": 0 que antes no distinguia "0 encontradas" de "nunca se
# evaluo".
#
# Hallazgo real al verificar (no solo leer el nombre del campo): DuplexHouse.ifc
# trae `PSet_Revit_Type_Other.IsFireExit` en TODAS sus puertas, pero el valor
# declarado es el string "IsFireExit" (el nombre del propio campo) en vez de
# un booleano -- inspeccionado a mano (`IfcPropertySingleValue('IsFireExit',
# $, IfcLabel('IsFireExit'), $)`), es un export de Revit roto/mal armado, no
# nuestro bug. Se filtra explicitamente por `isinstance(valor, bool)` para no
# tratar ese string como una senal real -- mismo principio del proyecto de
# nunca confiar en un dato que "existe con un nombre parecido" sin verificar
# que mide lo que dice medir (ver Convenciones_BIM.md, seccion C, ancho de
# puerta).
def mapa_salida_emergencia(modelo):
    """GlobalId de IfcDoor -> True/False cuando `Pset_DoorCommon.FireExit`
    (o el equivalente de Revit `IsFireExit`, SOLO si su valor es un booleano
    real) esta declarado y es utilizable. Una puerta sin ninguno de los 2
    campos, o con un valor no booleano (ver nota de cabecera), simplemente no
    aparece en el mapa -- dato ausente, no False."""
    mapa = {}
    for d in modelo.by_type("IfcDoor"):
        psets = ifcopenshell.util.element.get_psets(d, qtos_only=False)
        valor = psets.get("Pset_DoorCommon", {}).get("FireExit")
        if not isinstance(valor, bool):
            valor = psets.get("PSet_Revit_Type_Other", {}).get("IsFireExit")
        if isinstance(valor, bool):
            mapa[d.GlobalId] = valor
    return mapa


# Bisagra por geometria -- ULTIMO recurso cuando no hay OperationType util
# (2026-09-19, mismo dia, pedido explicito del usuario tras revisar la
# pagina 5 del PDF: "todas abren para el lado que sobresale el trapezoide...
# seguro no hay datos y se deberia hacer por geometria?"). Distinto del
# heuristico ya descartado arriba (ese buscaba "esta puerta ya trae arco
# propio, para no dibujar el sintetizado encima" -- aca la pregunta es otra:
# "el footprint YA disponible, sin arco identificable, ¿de todos modos
# insinua hacia que lado se abre?").
#
# Calibrado contra el UNICO caso de verdad conocida en este archivo: "D1R"
# (GlobalId 3BDarYIf1EXRuu7o6glIV$), la puerta cuyo arco real (bisagra en X
# local=0, barrido hacia +Y local) ya se habia verificado a mano. Esa misma
# puerta, con el metodo de abajo (separar el footprint en mitad
# izquierda/derecha del ancho y comparar el rango de Y de cada mitad), da
# una asimetria clara y consistente con ese dato conocido: mitad cercana a
# la bisagra real, rango_y=0.120 m; mitad lejana (donde la hoja barre al
# abrir), rango_y=0.173 m -- la mitad de MENOR rango es la bisagra. Decenas
# de puertas de Schependomlaan comparten esta misma geometria "rica"
# (~500-514 vertices, misma magnitud de asimetria ~0.05 m) via un
# IfcRepresentationMap reutilizado -- sugiere que SI tienen el mismo arco
# embebido en su propia geometria que D1R, solo que sin OperationType
# declarado para saberlo por el camino normal.
#
# ADVERTENCIA (por eso se usa solo como ultimo recurso): es una calibracion
# de UN SOLO caso, no una validacion estadistica -- no hay en este archivo
# ninguna otra puerta con OperationType DECLARADO que ademas tenga esta
# geometria "rica" para cruzar el resultado de forma independiente. El
# propio usuario pidio explicitamente dejar esto como ultima opcion, detras
# de preguntarle al arquitecto -- por eso el resultado se marca SIEMPRE
# distinto de un arco con dato declarado (ver "fuente" en
# arco_apertura_puerta) y nunca se presenta como si fuera un dato cierto.
UMBRAL_ASIMETRIA_BISAGRA_M = 0.02
# Guardia contra falsos positivos (2026-09-19, hallazgo real de la revision
# cruzada con DeepSeek sobre este mismo metodo): la separacion izquierda/
# derecha usa el ancho NOMINAL declarado (ancho_m/2), no el rango real de X
# del hull -- si el hull se extiende bastante mas alla de [0, ancho_m] (por
# marco/jamba, o por cualquier asimetria que no tenga nada que ver con un
# arco de giro real: bisagra fisica embebida, tope de piso), la asimetria de
# Y medida puede no corresponder en absoluto a la bisagra real. Calibrado
# contra D1R: su hull real va de -0.0575 a 0.970 m (ancho_m=0.93) -- una
# desviacion maxima de ~0.058 m respecto de [0, ancho_m], que este margen
# deja pasar con holgura. Si el hull se extiende MAS que este margen, se
# descarta la señal por completo (no se arriesga una bisagra mal inferida).
UMBRAL_MARGEN_HULL_M = 0.08
COLOR_ARCO_GEOMETRIA = "#D97706"  # ambar -- distinto de "#1d4ed8" (puerta con dato declarado) y "#DC2626" (sin dato en absoluto)


def bisagra_por_geometria(puerta, ancho_m, origen, eje_x, eje_y):
    """None si no hay señal utilizable (footprint simetrico, sin geometria,
    eje degenerado, o footprint que se extiende mucho mas alla del ancho
    nominal del vano); si no, la posicion local de la bisagra: 0.0 (extremo
    izquierdo) o ancho_m (extremo derecho) -- ver nota de cabecera."""
    geom = footprint_2d(puerta)
    if geom is None:
        return None
    eje = np.array([eje_x, eje_y]).T
    if abs(np.linalg.det(eje)) < 1e-9:
        return None
    eje_inv = np.linalg.inv(eje)
    coords = np.array(geom.exterior.coords)
    locales = (coords - origen) @ eje_inv.T
    xs, ys = locales[:, 0], locales[:, 1]
    if xs.min() < -UMBRAL_MARGEN_HULL_M or xs.max() > ancho_m + UMBRAL_MARGEN_HULL_M:
        return None
    mitad = ancho_m / 2
    y_izq = ys[xs < mitad]
    y_der = ys[xs >= mitad]
    if len(y_izq) == 0 or len(y_der) == 0:
        return None
    rango_izq = y_izq.max() - y_izq.min()
    rango_der = y_der.max() - y_der.min()
    if abs(rango_izq - rango_der) < UMBRAL_ASIMETRIA_BISAGRA_M:
        return None
    return 0.0 if rango_izq < rango_der else ancho_m


def arco_apertura_puerta(puerta, operation_type, escala_m, n_segmentos=8):
    """(arcos, fuente) -- arcos es una lista de arcos (uno por hoja: 1 para
    puerta simple, 2 para DOUBLE_DOOR_SINGLE_SWING), cada uno una lista de
    puntos (x,y) en coordenadas de MUNDO (antes de restar ox,oy) que trazan
    el simbolo estandar de apertura: arco de 90 grados centrado en la
    bisagra + linea recta de la hoja abierta. fuente es "declarado"
    (IfcDoorStyle.OperationType util) o "geometria" (ULTIMO recurso, ver
    bisagra_por_geometria -- debe marcarse distinto en el dibujo, nunca como
    si fuera un dato cierto). (None, None) si no se pudo determinar nada
    (falta ancho/placement, y ni el dato declarado ni la geometria dan
    señal)."""
    if n_segmentos <= 0:  # guardia defensiva (Codex, 2026-09-19) -- ningun llamado actual usa otro valor que el default
        return None, None
    ancho = puerta.OverallWidth
    if ancho is None or ancho <= 0:
        return None, None
    ancho_m = ancho * escala_m
    try:
        mat = ifcopenshell.util.placement.get_local_placement(puerta.ObjectPlacement)
    except Exception:
        return None, None
    origen = mat[:2, 3] * escala_m
    eje_x, eje_y = mat[:2, 0], mat[:2, 1]

    def a_mundo(lx, ly):
        return origen + lx * eje_x + ly * eje_y

    def arco_de_una_hoja(h, radio):
        # Arco centrado en la bisagra (h, 0) local, radio = ancho de ESA
        # hoja -- de angulo 0 (bisagra en el extremo izquierdo del tramo que
        # le corresponde) o 180 (extremo derecho) hasta 90 (siempre hacia
        # +Y local = "hacia afuera", ver nota de cabecera).
        ang_cerrado = 0.0 if h <= ancho_m / 2 else math.pi
        ang_abierto = math.pi / 2
        puntos = []
        for i in range(n_segmentos + 1):
            t = i / n_segmentos
            ang = ang_cerrado + (ang_abierto - ang_cerrado) * t
            puntos.append(a_mundo(h + radio * math.cos(ang), radio * math.sin(ang)))
        puntos.append(a_mundo(h, 0.0))  # linea de la hoja abierta, de vuelta a la bisagra
        return puntos

    if operation_type in OPERACIONES_SWING_SIMPLE:
        h = OPERACIONES_SWING_SIMPLE[operation_type] * ancho_m  # bisagra: 0 (izq) o ancho_m (der)
        return [arco_de_una_hoja(h, ancho_m)], "declarado"

    if operation_type in OPERACIONES_SWING_DOBLE:
        # DOUBLE_DOOR_SINGLE_SWING: 2 hojas de ancho_m/2 cada una, bisagras
        # en los 2 extremos opuestos del vano completo (ver nota de cabecera).
        mitad = ancho_m / 2
        return [arco_de_una_hoja(0.0, mitad), arco_de_una_hoja(ancho_m, mitad)], "declarado"

    # Sin OperationType util -- ultimo recurso, ver nota de cabecera de
    # bisagra_por_geometria.
    h = bisagra_por_geometria(puerta, ancho_m, origen, eje_x, eje_y)
    if h is None:
        return None, None
    return [arco_de_una_hoja(h, ancho_m)], "geometria"


def marcar_apertura_sin_dato(ax, geom_trasladada):
    """Marca "?" roja sobre la puerta cuando NO se pudo determinar el sentido
    de apertura (OperationType ausente/NOTDEFINED, falta OverallWidth/
    placement, y tampoco dio señal el ultimo recurso por geometria -- ver
    bisagra_por_geometria) -- pedido explicito del usuario
    (2026-09-19): "el sentido de apertura debe quedar siempre señalado en el
    pdf/png", nunca ausente en silencio. Mismo principio de "incertidumbre
    transparente" que ya rige otros elementos sinteticos/sin dato del
    proyecto (ver App.jsx, elementos con posicion sintetica se dibujan
    punteados en vez de ocultarse). `geom_trasladada` es el footprint de la
    puerta ya trasladado (-ox,-oy), para no recalcularlo en el llamador."""
    if geom_trasladada is None or geom_trasladada.is_empty:
        return
    c = geom_trasladada.centroid
    ax.text(c.x, c.y, "?", fontsize=6, ha="center", va="center", zorder=8,
            color="#DC2626", fontweight="bold")


CLASES_SUSTANTIVAS_NIVEL = {"IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
                             "IfcBeam", "IfcRoof", "IfcStairFlight", "IfcStair",
                             "IfcRamp", "IfcRampFlight"}

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

    # Sentido de apertura de puertas (2026-09-19) -- ver nota de cabecera junto
    # a arco_apertura_puerta(). escala_m convierte valores crudos del IFC
    # (OverallWidth, ObjectPlacement) a metros segun la unidad declarada por
    # ESTE archivo -- nunca asumir mm (algunos exportadores usan metros como
    # unidad base directamente).
    escala_m = ifcopenshell.util.unit.calculate_unit_scale(modelo)
    mapa_ops = mapa_operacion_puertas(modelo)

    # Ids de puertas/ventanas que SI son aberturas reales -- calculado UNA vez
    # para todo el edificio (ver filtrar_vanos_reales arriba), no por nivel:
    # la señal ("¿existe algun elemento del archivo con dimension declarada?")
    # es una propiedad del archivo/exportador, no de un nivel en particular.
    ids_puertas_reales = {e.GlobalId for e in filtrar_vanos_reales(modelo.by_type("IfcDoor"))}
    ids_ventanas_reales = {e.GlobalId for e in filtrar_vanos_reales(modelo.by_type("IfcWindow"))}

    with PdfPages(out_pdf) as pdf:
        for nivel in niveles:
            rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                    if r.RelatingStructure == nivel]
            elementos = []
            for r in rels:
                elementos.extend(r.RelatedElements)

            # Descarta vanos que no son aberturas reales -- hallazgo real
            # 2026-09-19 en Schependomlaan (ver filtrar_vanos_reales arriba).
            elementos = [e for e in elementos
                         if (not e.is_a("IfcDoor") or e.GlobalId in ids_puertas_reales)
                         and (not e.is_a("IfcWindow") or e.GlobalId in ids_ventanas_reales)]

            # IfcSpace en este archivo NO llega por IfcRelContainedInSpatialStructure
            # (como muros/puertas) sino por IfcRelAggregates (decomposicion del
            # nivel) -- confirmado inspeccionando Space.Decomposes directamente.
            # Un extractor que solo mire "contained in" pierde el 100% de los
            # recintos en silencio. Se agregan aparte, vía la utilidad que
            # cubre ambos mecanismos.
            espacios = [e for e in ifcopenshell.util.element.get_decomposition(nivel, is_recursive=False)
                        if e.is_a("IfcSpace")]
            elementos.extend(espacios)

            # Mismo patron de bug que IfcSpace, encontrado despues (2026-09-19,
            # DuplexHouse.ifc): IfcStair SI llega por "contained in" (por eso
            # el conteo de escaleras en analizar_todos.py/generar_json_colab.py
            # ya daba bien), pero el IfcStairFlight real -- con geometria
            # dibujable -- esta anidado DENTRO de el via IfcRelAggregates. Sin
            # este paso la escalera se cuenta pero nunca se dibuja (footprint_2d
            # sobre un IfcStair contenedor no da nada util) -- EXCEPTO cuando
            # el contenedor no tiene ningun tramo hijo (hallazgo real en
            # Schependomlaan, 2026-09-19: 3 IfcStair con decomposicion VACIA,
            # pero con geometria 3D propia y usable, footprint_2d funciona
            # directo sobre ellos). Cuando SI hay tramos, se dibujan esos y se
            # saca el contenedor de `elementos` (ahora que IfcStair tambien
            # esta en ESTILOS, dejarlo adentro dibujaria 2 veces la misma
            # escalera, superpuestas). Cuando NO hay tramos, el contenedor se
            # queda y se dibuja el solo -- unica geometria disponible.
            stairs_contenidos = [e for e in elementos if e.is_a("IfcStair")]
            flights_escalera = []
            ids_stairs_con_flight = set()
            for st in stairs_contenidos:
                hijos = [h for h in ifcopenshell.util.element.get_decomposition(st, is_recursive=False)
                         if h.is_a("IfcStairFlight")]
                if hijos:
                    flights_escalera.extend(hijos)
                    ids_stairs_con_flight.add(st.GlobalId)
            elementos = [e for e in elementos if not (e.is_a("IfcStair") and e.GlobalId in ids_stairs_con_flight)]
            elementos.extend(flights_escalera)

            # Rampas (2026-09-20) -- MISMO patron que escalera arriba, sin
            # ningun caso real de esta sesion para verificarlo empiricamente
            # (0 IfcRamp en los 8 archivos de ejemplo, ver ESTILOS mas arriba)
            # -- implementado por consistencia con el mecanismo ya probado de
            # IfcStair/IfcStairFlight, que es genuinamente el mismo mecanismo
            # IFC (decomposicion opcional a tramos). Revalidar contra un IFC
            # real con rampas antes de confiar en esto sin reservas.
            ramps_contenidos = [e for e in elementos if e.is_a("IfcRamp")]
            flights_rampa = []
            ids_ramps_con_flight = set()
            for rp in ramps_contenidos:
                hijos = [h for h in ifcopenshell.util.element.get_decomposition(rp, is_recursive=False)
                         if h.is_a("IfcRampFlight")]
                if hijos:
                    flights_rampa.extend(hijos)
                    ids_ramps_con_flight.add(rp.GlobalId)
            elementos = [e for e in elementos if not (e.is_a("IfcRamp") and e.GlobalId in ids_ramps_con_flight)]
            elementos.extend(flights_rampa)

            por_tipo = {}
            for el in elementos:
                t = el.is_a()
                if t in ESTILOS:
                    por_tipo.setdefault(t, []).append(el)

            orden_nivel = ORDEN_DIBUJO_CUBIERTA if es_nivel_cubierta(nivel, niveles) else ORDEN_DIBUJO

            fig, ax = plt.subplots(figsize=(16.54, 11.69))  # A3 apaisado -- mas espacio para detalle
            hubo_puerta_sin_dato = False
            hubo_arco_por_geometria = False

            for tipo in orden_nivel:
                for el in por_tipo.get(tipo, []):
                    geom = footprint_2d(el)
                    if geom is None:
                        continue
                    geom = translate(geom, xoff=-ox, yoff=-oy)
                    dibujar_geom(ax, geom, {k: v for k, v in ESTILOS[tipo].items() if k != "label"})
                    if tipo == "IfcColumn":
                        marcar_centroide(ax, geom, color="black", zorder=6)
                    if tipo == "IfcDoor":
                        # Siempre que haya OperationType util se dibuja el
                        # simbolo estandar sintetizado -- se probo (2026-09-19)
                        # que contar vertices del hull (">=8 = ya trae arco
                        # real") da falsos positivos: varias puertas con
                        # geometria simple (hoja cerrada, sin arco) igual
                        # generan 8 vertices por artefactos de triangulacion.
                        # Dibujar el simbolo sintetizado encima no daña a las
                        # pocas puertas que SI traen su propio arco detallado
                        # en la geometria (ej. "D1R" en Schependomlaan) -- solo
                        # agrega la linea estandar sobre lo que ya se dibuja.
                        op = mapa_ops.get(el.GlobalId)
                        arcos, fuente = arco_apertura_puerta(el, op, escala_m)
                        if arcos:
                            # "geometria" (ultimo recurso, ver
                            # bisagra_por_geometria) se dibuja SIEMPRE distinto
                            # de "declarado" -- punteado y en color de alerta,
                            # nunca como si fuera un dato cierto.
                            color = (ESTILOS["IfcDoor"]["edgecolor"] if fuente == "declarado"
                                     else COLOR_ARCO_GEOMETRIA)
                            estilo_linea = "-" if fuente == "declarado" else "--"
                            for puntos in arcos:
                                xs = [p[0] - ox for p in puntos]
                                ys = [p[1] - oy for p in puntos]
                                ax.plot(xs, ys, color=color, linewidth=0.7 if fuente == "geometria" else 0.5,
                                         linestyle=estilo_linea, zorder=4)
                            if fuente == "geometria":
                                hubo_arco_por_geometria = True
                        else:
                            # Regla del proyecto (2026-09-19): el sentido de
                            # apertura debe quedar SIEMPRE señalado -- si no
                            # se pudo sintetizar (sin OperationType util, sin
                            # ancho, puerta doble no soportada, y tampoco dio
                            # señal la geometria), se marca la ausencia en vez
                            # de dejar la puerta muda.
                            marcar_apertura_sin_dato(ax, geom)
                            hubo_puerta_sin_dato = True

            etiquetar_recintos(ax, elementos, ox, oy)

            ax.set_aspect("equal")
            ax.autoscale()
            elev_txt = f"{nivel.Elevation:.2f} m" if nivel.Elevation is not None else "sin cota"
            ax.set_title(f"{nivel.Name}  ·  cota {elev_txt}  ·  generado desde IFC (no PDF)")
            ax.set_xlabel("m")
            ax.set_ylabel("m")
            handles = [MplPolygon([(0, 0)], closed=True, facecolor=ESTILOS[t]["facecolor"],
                                   edgecolor=ESTILOS[t].get("edgecolor", "none"), label=ESTILOS[t]["label"])
                       for t in orden_nivel if por_tipo.get(t)]
            if hubo_arco_por_geometria:
                handles.append(plt.Line2D([0], [0], color=COLOR_ARCO_GEOMETRIA, linestyle="--", linewidth=1.2,
                                           label="Puerta: apertura inferida por geometría (sin dato, confirmar con arquitecto)"))
            if hubo_puerta_sin_dato:
                handles.append(plt.Line2D([0], [0], marker="$?$", color="#DC2626", linestyle="none",
                                           markersize=8, label="Puerta: sentido de apertura sin dato"))
            if handles:
                ax.legend(handles=handles, loc="upper right", fontsize=7, framealpha=0.9)
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)
            # Bug real encontrado 2026-09-19, mismo dia que se agrego
            # ORDEN_DIBUJO_CUBIERTA: por_tipo se arma filtrando solo por
            # pertenencia a ESTILOS (agnostico del nivel), asi que sumar TODOS
            # sus valores conto elementos que jamas se dibujaron en pisos que
            # no son cubierta (IfcSlab/IfcCovering/IfcBeam quedan en por_tipo
            # pero orden_nivel para un piso normal no los itera). El conteo
            # real debe sumar solo lo que orden_nivel efectivamente recorrio.
            print(f"Nivel {nivel.Name}: {sum(len(por_tipo.get(t, [])) for t in orden_nivel)} elementos dibujados")

    print(f"\nListo: {out_pdf}")


if __name__ == "__main__":
    for ifc_path in ARCHIVOS:
        print(f"\n=== {ifc_path} ===")
        try:
            main(ifc_path)
        except PermissionError as e:
            print(f"  (omitido -- archivo de salida bloqueado: {e})")
