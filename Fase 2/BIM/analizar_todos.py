# Primer ejercicio real de "análisis normativo desde IFC": arma el JSON
# canonico (mismo espiritu que archicheck_geometrico_*.json del pipeline PDF:
# muros_geo/puertas_geo/ventanas_geo/recintos_geo/incumplimientos_geo) para
# cada IFC de ejemplo, y corre contra el las reglas OGUC que ya estan
# verificadas en el propio codigo de ArchiCheck -- no se inventa ningun
# umbral nuevo para este ejercicio.
#
# Reglas aplicadas (ids y umbrales ya existentes en el proyecto, no nuevos):
#   - puerta_ancho_libre: OGUC Art. 4.1.7 N°4, ancho >= 0.90 m -- vive en
#     Fase 2/reglas_normativas.py (OGUC_REGLAS['puerta_ancho_libre']),
#     importado directo aca (2026-09-20, ver Proyecto/Diseno_Funcional_
#     ArchiCheck.md S3.15 -- "todas las reglas... de manera unificada para
#     que sean usados en ambos pipeline"). Antes de esa fecha este umbral
#     se habia verificado de forma independiente (piloto IDS) y despues
#     vivio como copia manual en este archivo -- ver auditoria completa en
#     Fase 2/Convenciones_BIM.md seccion E. CORREGIDO 2026-09-21: el valor
#     citado antes (0.80 m, "N6") era el de un caso especifico distinto
#     (puerta de bano accesible, N°6 letra b) -- el caso general que este
#     chequeo evalua (toda puerta, sin distinguir destino) es 0.90 m, N°4.
#     Ver reglas_normativas.py para el detalle completo, verificado contra
#     el texto integro del articulo (oguc_pdf.json) y DDU 351.
#   - muro_fire_rating: OGUC Art. 4.3.3, exige Pset_WallCommon.FireRating
#     declarado (chequeo de dato faltante, no de valor) -- mismo modulo
#     compartido (OGUC_REGLAS['muro_fire_rating']), mismo motivo.
#   - ventilacion_iluminacion: OGUC_REGLAS['ventilacion_iluminacion_pct'] en
#     Fase 2/reglas_normativas.py, ventana >= 10% de la superficie del
#     recinto. CORREGIDO 2026-09-21 (curacion OGUC completa): la cita que
#     traia antes (reglas_verificacion.json, "OGUC Art. 4.2.5-4.2.6") era
#     FALSA -- verificado el texto integro de ambos articulos, ninguno
#     trata ventanas ni porcentajes. El articulo real de ventilacion de
#     locales habitables (4.1.2) es cualitativo, sin porcentaje. Se
#     mantiene el 10% (decision del usuario) pero marcado SIN VERIFICAR de
#     forma honesta -- ver reglas_normativas.py para el detalle completo.
#
# Robustez aprendida HOY mismo, aplicada aca:
#   - IfcWall (no solo IfcWallStandardCase) -- HouseZ usa la clase generica
#   - ifcopenshell.util.element.get_psets() en vez de nombres de Pset
#     hardcodeados -- cubre BaseQuantities/Qto_*/nombres en otros idiomas
#   - IfcSpace via decomposicion Y via contencion (ver generar_plano_pdf.py)
#   - todo campo ausente se reporta como tal, nunca se asume un valor

import datetime
import json
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element as elutil
import ifcopenshell.util.unit

# Python embeddable (sin instalacion normal) no agrega el directorio del
# script a sys.path por su cuenta -- sin esto, "import generar_plano_pdf"
# (modulo hermano en esta misma carpeta) falla con ModuleNotFoundError.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import generar_plano_pdf as g

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # Fase 2/, para reglas_normativas.py
from reglas_normativas import OGUC_REGLAS, TIPOS_RECINTO_OGUC, pendiente_maxima_rampa_pct

_ANCHO_MIN_PUERTA_M = OGUC_REGLAS['puerta_ancho_libre'][1]
_CAMPO_FIRE_RATING = OGUC_REGLAS['muro_fire_rating']['campo_requerido']  # "Pset_WallCommon.FireRating"
_PSET_FIRE_RATING, _PROP_FIRE_RATING = _CAMPO_FIRE_RATING.split('.', maxsplit=1)
_ANCHO_MIN_RAMPA_M = OGUC_REGLAS['rampa'][1]
_REF_RAMPA_ANCHO = OGUC_REGLAS['rampa'][2]
# Misma cita que ya usa el pipeline CAD para este mismo chequeo (ver
# _celda4_actual.py, bloque "if tipo == 'rampa':") -- no una redaccion nueva.
_REF_RAMPA_PENDIENTE = ('Art. 4.1.7 N°2 OGUC — pendiente max. 8% (desarrollo >=9m) a 12% '
                        '(desarrollo <=1,5m), formula i%=12,8-0,5333*L entre esos valores')
# Punto 4 de S3.15 (integrar el piloto de escalera IDS al analizador
# principal) -- mismo valor que ya usaba piloto_ids_oguc.py, importado de
# la misma fuente unica, nunca copiado a mano por segunda vez.
_ANCHO_MIN_ESCALERA_M = OGUC_REGLAS['escalera'][1]
# Ventilacion/iluminacion natural -- migrado 2026-09-21 (curacion OGUC
# completa), ver reglas_normativas.py para el detalle del hallazgo real
# (cita previa falsa, valor mantenido SIN VERIFICAR por decision del
# usuario). Antes vivia hardcodeado por separado aca y en
# generar_json_colab.py -- ambos importan de la misma fuente ahora.
_VENTILACION_MIN_PCT = OGUC_REGLAS['ventilacion_iluminacion_pct'][0]
_REF_VENTILACION = OGUC_REGLAS['ventilacion_iluminacion_pct'][1]
_REF_ESCALERA_ANCHO = OGUC_REGLAS['escalera'][2]

# Guardia de plausibilidad geometrica -- hallazgo real 2026-09-20, encontrado
# EMPIRICAMENTE al validar punto 3 (rampa) contra los 2 archivos reales con
# IfcRamp (Esplanades, FOJAB Landsarkivet): footprint_2d()/ancho_min_footprint()
# pueden devolver un resultado NO None pero fisicamente imposible (ancho de
# footprint de 2-6 mm) en vez de fallar. Causa raiz identificada (verificada
# comparando coordenadas LOCALES del Brep, ~1-5 m reales, contra el resultado
# de create_shape(use_world_coords=True), que colapsa a ~mm): ambos archivos
# ubican su IfcSite en coordenadas absolutas de terreno reales (confirmado:
# y~6.175.287 m, x~131.251 m -- coordenadas de grilla sueca reales, no un
# placeholder) -- una magnitud de coordenada absoluta tan grande frente al
# tamano real del objeto (unos pocos metros) es un caso conocido de perdida
# de precision de punto flotante en kernels de geometria tipo OpenCascade.
#
# Al buscar el minimo real en los 8 archivos YA validados en los puntos 1/2
# (antes de asumir que el problema era exclusivo de los 2 archivos nuevos) se
# encontro el MISMO patron, mas acotado, ya latente ahi: HouseZ tiene un
# IfcSpace "Living Room" (clasificado tipo_oguc='living') con ancho_m=0.0045 m
# real -- sin impacto visible hoy porque OGUC_REGLAS['living'] no define
# ancho_min (cumple_ancho_min ya daba None por ese motivo, no por esta
# guardia), pero el VALOR en si ya era un dato erroneo expuesto en recintos_geo
# antes de esta guardia. No es un problema nuevo introducido hoy, es uno
# preexistente que punto 3 expuso al mirar el minimo real por primera vez.
#
# NO se corrige la causa de fondo (tocar use-world-coords/footprint_2d() de
# forma general exigiria revalidar los 8 archivos ya validados en puntos 1/2,
# fuera de alcance hoy). Se agrega esta guardia explicita en su lugar:
# cualquier medida de footprint bajo este umbral se trata como "no medible"
# (None), nunca como un valor real -- un ancho de pocos mm es fisicamente
# imposible para un recinto o una rampa real; presentarlo como dato valido
# seria peor que no tener dato (viola "nunca fallar en silencio" en la
# direccion opuesta: confiar en geometria corrupta en vez de avisar que no
# se pudo medir). Verificado contra los 8 archivos originales antes de
# aplicar esta guardia: ningun OTRO recinto real de esos 8 archivos tiene un
# lado corto bajo este umbral fuera del caso HouseZ ya descrito (que de
# todos modos no genera ningun incumplimiento, con o sin la guardia).
#
# ACLARACION 2026-09-20 (Revision Ing SW Paso 2, hallazgo real de DeepSeek):
# 0.05 es una ESTIMACION TECNICA propia (mismo espiritu que "SIN VERIFICAR"
# para umbrales normativos, pero esto no es un umbral normativo -- es un
# limite de plausibilidad geometrica, calibrado contra el rango real
# observado: colapso real encontrado de 2-6 mm vs. medidas reales plausibles
# de >=0,5 m, 5 cm queda cómodo en medio de ese rango, no pegado a ninguno
# de los 2 extremos). No tiene cita de OGUC/LGUC/PRC porque no es un minimo
# normativo, es un limite de "esto no puede ser geometria real" -- se marca
# aca explicitamente como estimacion, no como valor verificado contra una
# fuente externa.
#
# ALCANCE -- cubre solo XY (footprint 2D), no Z (desnivel_m, calculado en
# geometria_3d_cruda() para rampas): mismo `create_shape()` de origen, asi
# que si el colapso de precision afecta XY casi seguro afecta Z tambien (es
# una sola transformacion de matriz de mundo), pero no hay guardia
# INDEPENDIENTE sobre desnivel_m -- se cubre indirectamente HOY porque
# pendiente_calculada_pct exige `desarrollo_m` no-None (que SI pasa por esta
# guardia) antes de calcularse. Si algun archivo futuro corrompe Z sin
# corromper XY (no visto todavia, hipotetico), esa combinacion no quedaria
# cubierta -- documentado como limite conocido, no una garantia absoluta.
_MEDIDA_MIN_PLAUSIBLE_M = 0.05  # 5 cm -- ningun recinto/rampa real es mas angosto que esto

# Guardia de RECTILINEIDAD para tramos rectos (rampas Y escaleras) --
# hallazgo real de DeepSeek (Revision Ing SW Paso 2, punto 3): el lado
# LARGO del rectangulo minimo rotado del footprint solo es un proxy valido
# de "desarrollo" (rampa) si el elemento es un tramo recto -- para un
# elemento en L/U/con giro (real en este proyecto: los 6 `IfcRamp` de
# Esplanades no tienen `IfcRampFlight` hijos, caen en `rampas_dedup` como
# el contenedor completo, que puede describir un recorrido con giros, no
# un tramo unico), el lado largo del rectangulo envolvente es la DIAGONAL
# de la envolvente, no la longitud real recorrida. Usar esos numeros como
# si fueran un tramo recto fabricaria una medicion con apariencia real
# pero sin significado normativo.
#
# Se reutiliza la MISMA guardia para escaleras (punto 4 de S3.15, ver
# `ancho_escalera_footprint()` mas abajo): el problema es identico pero en
# la direccion contraria -- ahi lo que se necesita es el lado CORTO
# (ancho del tramo), y ese lado tambien queda mal representado si el
# elemento es una escalera en L/U sin descomponer en tramos (verificado
# con el mismo poligono en L de prueba: el lado corto de su rectangulo
# envolvente da 4.0 m, muy lejos del ancho real de tramo de 1.2 m).
#
# Verificado EMPIRICAMENTE (no asumido) con shapely real que el `fill_ratio`
# (area real del footprint / area de su rectangulo minimo rotado) separa
# limpio los 2 casos: un tramo recto (rectangulo real) da fill_ratio=1.0
# exacto, invariante a la rotacion (probado en 0/30/45/73/90 grados); una
# forma en L (2 tramos de 1.2x4m formando una L) da 0.51; una forma en U
# con descanso (tramos de 1.2x3m con retorno) da 0.73 -- ambas muy por
# debajo de 1.0. El umbral de abajo es una ESTIMACION TECNICA propia (no
# una cita normativa, mismo criterio de honestidad que
# _MEDIDA_MIN_PLAUSIBLE_M), calibrada para dejar margen sobre el caso U
# (0.73, el mas alto de los 2 casos de giro probados) sin excluir un tramo
# recto real con imperfecciones menores de dibujo (que sigue dando
# fill_ratio muy cercano a 1.0).
_FILL_RATIO_MIN_TRAMO_RECTO = 0.85

ARCHIVOS = [
    ("Administrativo (ES)", "Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc"),
    ("BasicHouse", "Archivos ejemplo/Basic House/BasicHouse.ifc"),
    ("FZK-Haus", "Archivos ejemplo/FZK/AC20-FZK-Haus.ifc"),
    ("HouseZ", "Archivos ejemplo/HouseZ/ISSUE_034_HouseZ.ifc"),
    # DuplexHouse.ifc: el 2026-09-18 se confirmo MD5 identico a BasicHouse.ifc
    # (mismo archivo duplicado). Mas tarde, el mismo dia, el archivo en disco
    # cambio (tamano 52.7MB -> 2.4MB, MD5 distinto) sin que nadie lo anunciara
    # -- es un archivo real y distinto ahora (4 niveles: T/FDN, Level 1,
    # Level 2, Roof -- la "Duplex House" publica de Autodesk). Reverificado
    # antes de asumir que seguia siendo el duplicado.
    ("DuplexHouse", "Archivos ejemplo/Duplex house/DuplexHouse.ifc"),
    # Dataset LTU (proyecto sueco multi-disciplina): solo K-modell y redesign
    # tienen muros/puertas/ventanas -- los otros 7 archivos del dataset son
    # instalaciones puras (MEP), sin nada que aporte a estas 3 reglas
    # (puerta/muro/ventilacion son todas de arquitectura), se omiten aca a
    # proposito (si se agregaran, `muros`/`puertas`/`ventanas` darian 0 en
    # los 7 sin ningun valor informativo nuevo).
    ("LTU K-modell", "Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_K-modell.ifc"),
    ("LTU redesign", "Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_redesign.ifc"),
    ("Schependomlaan", "Archivos ejemplo/Schependomlaan/IFC_Schependomlaan.ifc"),
    # Agregados 2026-09-20 (punto 3 de S3.15, pendiente/ancho de rampa): de
    # todos los IFC bajo "Archivos ejemplo/", estos son los UNICOS 2 con
    # IfcRamp/IfcRampFlight reales (escaneado exhaustivo, no una suposicion) --
    # los 8 archivos de arriba dan rampas=0 en el resumen. Varios otros
    # archivos del directorio fallan directo al abrir con ifcopenshell.open()
    # ("Unable to parse IFC SPF header") -- no investigado, fuera de alcance.
    ("Esplanades", "Archivos ejemplo/Esplanades/1807_EP_AR_v18.ifc"),
    ("FOJAB Landsarkivet", "Archivos ejemplo/FOJAB_Landsarkivet/FOJAB_Landsarkivet.ifc"),
]

# "GSA BIM Area" agregado 2026-09-18: encontrado en DuplexHouse.ifc (convencion
# de EE.UU. -- GSA = General Services Administration), en un Pset propio
# ("GSA Space Areas") que ninguna clave anterior cubria -- otra convención
# mas de nombrar lo mismo, confirmando el patron de toda la sesion.
CLAVES_AREA_RECINTO = ["NetFloorArea", "GrossFloorArea", "Area", "Fläche", "Flache", "NetArea", "GSA BIM Area"]


def buscar_area(qtos: dict):
    # Orden de busqueda por CLAVE primero, no por Pset primero (bug real
    # encontrado por revision cruzada con DeepSeek 2026-09-18): iterar Psets
    # en el orden en que get_psets() los devuelve (no garantizado, depende del
    # IFC) podia devolver GrossFloorArea antes que NetFloorArea si el area
    # bruta vivia en un Pset que ifcopenshell listaba primero -- el umbral de
    # ventilacion (10% de superficie UTIL) exige NetFloorArea con prioridad
    # real, no accidental.
    for clave in CLAVES_AREA_RECINTO:
        for pset in qtos.values():
            if isinstance(pset, dict) and clave in pset and isinstance(pset[clave], (int, float)):
                return pset[clave], clave
    return None, None


def _sin_tildes(txt):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', txt) if unicodedata.category(c) != 'Mn')


def clasificar_tipo_recinto(nombre_ifc):
    """Intenta calzar el nombre/LongName real de un IfcSpace contra un tipo
    de OGUC_REGLAS (dormitorio/sala/.../rampa) sobre el texto normalizado
    (minusculas, sin tildes).

    CORREGIDO 2026-09-20 (Revisión Ing SW Paso 2, hallazgo real de DeepSeek
    -- verificado contra el codigo, no aceptado a ciegas): la version
    anterior afirmaba "mismo espiritu que tipo.lower().split('/')[0].strip()
    del pipeline CAD" pero NO lo era -- CAD parte el nombre por '/' y usa
    SOLO el primer segmento como tipo exacto; esta version hacia substring
    bidireccional sobre el nombre COMPLETO, sin partir por '/'. Caso real
    encontrado en Administrativo (ES): "COMEDOR/SALA DE DESCANSO" -- CAD
    clasificaria 'comedor' (primer segmento), la version anterior de esto
    clasificaba 'sala' (porque 'sala' aparece en el string completo y viene
    antes que 'comedor' en TIPOS_RECINTO_OGUC) -- el MISMO nombre de
    recinto se hubiera evaluado contra un umbral de area distinto segun el
    pipeline (sala=10.0m2 vs comedor=8.0m2). Corregido partiendo por '/' y
    usando solo el primer segmento, igual que CAD.

    CORREGIDO EN LA MISMA REVISION (hallazgo real de Codex): la direccion
    `n in tipo` (nombre corto contenido DENTRO de la palabra tipo, ej. un
    nombre abreviado "sa" matchearia 'sala') se elimino -- es redundante
    para el caso de match exacto (un nombre literal "sala" ya matchea via
    `tipo in n`) y solo agregaba riesgo de falsos positivos con nombres
    cortos/abreviados sin aportar ningun caso real nuevo (verificado: los
    30 recintos reales clasificados en Administrativo (ES) siguen
    clasificando igual sin esa direccion).

    Aca el tipo viene directo del nombre que el arquitecto/BIM-modeler puso
    en el IfcSpace -- a diferencia de CAD, no hay un paso de clasificacion
    semantica (Claude Vision) antes de esto.

    LIMITACION REAL, sin resolver hoy: de los 8 IFC de prueba de este
    proyecto, la mayoria tiene nombres de recinto en otro idioma (holandes,
    ingles) o son de una tipologia (oficina/parking) que no tiene
    equivalente 1:1 en los 6 tipos residenciales de OGUC_REGLAS -- el unico
    archivo en español ("Administrativo (ES)") es un edificio de oficinas/
    estacionamientos, no residencial, asi que tampoco calza bien contra
    dormitorio/sala/cocina/bano. Este matcher deliberadamente NO inventa
    sinonimos en otros idiomas ni mapea "office"->"sala" sin evidencia real
    de que sea el criterio correcto -- se deja documentado como cobertura
    real baja hasta que haya un IFC chileno residencial de verdad en el set
    de prueba (ver Proyecto/Diseno_Funcional_ArchiCheck.md S3.15)."""
    if not nombre_ifc:
        return None
    primer_segmento = nombre_ifc.split('/')[0]
    n = _sin_tildes(primer_segmento.strip().lower())
    for tipo in TIPOS_RECINTO_OGUC:
        if tipo in n:
            return tipo
    return None


def ancho_min_footprint(sp, escala_m):
    """Ancho aproximado de un IfcSpace: lado mas corto del rectangulo
    minimo rotado (oriented bounding box) que contiene su footprint 2D
    (g.footprint_2d, reusa la misma geometria/convex-hull que ya usa
    generar_plano_pdf.py para dibujar). Se usa el rectangulo ROTADO, no el
    bounding box alineado a ejes, porque un pasillo/escalera puede estar en
    cualquier angulo respecto de los ejes globales del modelo -- un bbox
    alineado a ejes sobreestimaria el ancho real de un recinto en diagonal.

    Aproximacion reconocida, mismo nivel de rigor que ya acepta el proyecto
    en otros calculos geometricos 2D (ver rampa/escalera en
    Fase 2/reglas_normativas.py): es el ancho del ESPACIO completo, no el
    ancho libre real (no descuenta columnas/mobiliario que puedan angostar
    el paso). Devuelve None si la geometria no se puede triangular (mismo
    caso ya documentado para elementos Curve2D-only en Convenciones_BIM.md).

    CORREGIDO 2026-09-20 (Revision Ing SW Paso 2, hallazgo real de DeepSeek):
    la version anterior tenia un chequeo `if len(coords) < 4: return None`
    pensado como defensivo para geometria degenerada -- pero verificado con
    shapely real, un `minimum_rotated_rectangle` degenerado (de un Point o
    LineString, no un Polygon) NO expone `.exterior` en absoluto -- el
    codigo hubiera reventado con AttributeError en la linea de arriba,
    nunca hubiera llegado a chequear `len(coords)`. Era código muerto que
    prometia una proteccion que no daba. `footprint_2d()` ya filtra a
    Polygon/MultiPolygon con area real antes de devolver, asi que este
    caso no se vio en los 8 IFC de prueba -- pero se protege de verdad
    con try/except en vez de un chequeo que nunca se ejecutaba.

    CORREGIDO 2026-09-20 (hallazgo real durante punto 3, ver
    _MEDIDA_MIN_PLAUSIBLE_M mas arriba para el detalle completo): se agrega
    una guardia de plausibilidad -- un resultado bajo ese umbral se trata
    como no medible (None), nunca como un ancho de pocos mm real."""
    poly = g.footprint_2d(sp)
    if poly is None:
        return None
    try:
        rect = poly.minimum_rotated_rectangle
        coords = list(rect.exterior.coords)
    except AttributeError:
        return None
    lado_a = g.math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
    lado_b = g.math.hypot(coords[2][0] - coords[1][0], coords[2][1] - coords[1][1])
    resultado = min(lado_a, lado_b) * escala_m
    return resultado if resultado >= _MEDIDA_MIN_PLAUSIBLE_M else None


_PALABRAS_ACCESIBILIDAD = ('accesible', 'universal', 'pmr', 'discapacita')


def es_candidato_accesible(nombre_ifc):
    """¿El nombre del IfcSpace sugiere que es un recinto que DEBE cumplir
    accesibilidad universal (y por lo tanto necesita circulo de giro)?

    Punto 2 del plan de Proyecto/Diseno_Funcional_ArchiCheck.md S3.15.
    MECANISMO DELIBERADAMENTE DISTINTO al de CAD (ver Fase 2/reglas_
    normativas.py, entrada 'circulo_giro_accesible_m', para la explicacion
    completa): en CAD, 'es_accesible_universal' viene de Claude Vision
    LEYENDO el rotulo del plano -- aca no hay ese paso, se usa el mismo
    patron de deteccion por nombre que clasificar_tipo_recinto() (con la
    misma limitacion real de cobertura: depende de que el modelador BIM
    haya nombrado el recinto de forma reconocible, en español, con alguna
    de estas palabras)."""
    if not nombre_ifc:
        return False
    n = _sin_tildes(nombre_ifc.strip().lower())
    return any(palabra in n for palabra in _PALABRAS_ACCESIBILIDAD)


def circulo_cabe_en_footprint(sp, escala_m, diametro_m):
    """¿Cabe un circulo de `diametro_m` de diametro DENTRO del footprint
    2D real del IfcSpace? Calculo geometrico real (no una lectura visual
    como en CAD, ver es_candidato_accesible() arriba) -- si el poligono
    erosionado hacia adentro por el radio (poly.buffer(-radio)) NO queda
    vacio, existe al menos un punto del recinto a mas de `radio` de
    distancia de cualquier borde, es decir, un circulo de ese diametro
    cabe centrado ahi. Tecnica estandar (erosion morfologica), sin
    dependencias nuevas -- shapely ya es dependencia del proyecto.

    Mas riguroso que el chequeo equivalente de CAD (que solo transcribe si
    el arquitecto dibujo el simbolo, sin verificar si geometricamente cabe
    de verdad) -- ver nota completa en Fase 2/reglas_normativas.py.

    Devuelve None (no True/False) si la geometria no es procesable -- NO
    es lo mismo "no cabe" (recinto real, muy chico) que "no se pudo medir"
    (footprint_2d no pudo triangular la geometria).

    CORREGIDO 2026-09-20 (Revision Ing SW Paso 2, 2 hallazgos reales de
    Codex y DeepSeek sobre esta misma funcion, ambos verificados antes de
    corregir):
    (a) Codex: `radio_px = (diametro_m/2)/escala_m` quedaba FUERA del
        try/except -- si escala_m llegara 0 (bug de unidades, ya paso una
        vez en este proyecto segun el comentario de num_o_none_escalado),
        revienta con ZeroDivisionError sin control, no con un None
        prolijo. Movido dentro del try.
    (b) DeepSeek: `except Exception` era demasiado amplio -- tragaba
        cualquier fallo (incluido un bug de programacion real) como "no
        se pudo medir", sin dejar rastro. Verificado EMPIRICAMENTE con
        shapely real (no adivinado) que buffer() con radio no-finito
        (NaN/inf, el caso real de escala_m=0 o invalido) levanta
        `ValueError` puro -- se combina con el mismo AttributeError ya
        usado en ancho_min_footprint para los 2 fallos reales conocidos,
        en vez de un except generico."""
    poly = g.footprint_2d(sp)
    if poly is None:
        return None
    try:
        radio_px = (diametro_m / 2) / escala_m
        erosionado = poly.buffer(-radio_px)
    except (ZeroDivisionError, ValueError, AttributeError):
        return None
    return not erosionado.is_empty


def geometria_3d_cruda(elemento):
    """Vertices 3D reales (x,y,z) del elemento, en las mismas world-coords
    que ya usa g.footprint_2d() (settings.set('use-world-coords', True)).
    A diferencia de footprint_2d(), que proyecta a XY y descarta Z a
    proposito (solo le importa la silueta en planta), esta funcion
    necesita Z -- es la unica forma de calcular el desnivel (rise) real
    de una rampa: ningun IFC de este dataset declara Pset/Qto de
    pendiente en sus IfcRamp/IfcRampFlight (verificado 2026-09-20 en los 2
    archivos reales con rampas -- Esplanades y FOJAB Landsarkivet, ver
    Convenciones_BIM.md seccion E), asi que debe calcularse desde la
    geometria 3D cruda, no leerse de un campo declarado.

    Mismo criterio de fallo que footprint_2d (bare `except Exception` para
    create_shape -- los errores reales de este call son internos de
    ifcopenshell/OCC, no enumerables de forma especifica, mismo patron ya
    aceptado en footprint_2d) -- devuelve None si la geometria no se
    puede triangular.

    Trazabilidad (Revision Ing SW Paso 2, hallazgo real de DeepSeek/Codex):
    este `except` no deja rastro del elemento/motivo puntual, pero no hace
    falta uno nuevo -- cuando esta funcion devuelve None, la rampa completa
    ya queda registrada en incumplimientos_geo como 'pendiente_rampa_sin_
    dato'/'ancho_sin_dato' (severidad dato_faltante) CON el nombre real del
    elemento (`rp['nombre']`), no desaparece en silencio. No se agrega un
    log de la excepcion cruda encima de eso -- seria una segunda fuente de
    verdad para el mismo hecho."""
    try:
        shape = g.ifcopenshell.geom.create_shape(g.settings, elemento)
    except Exception:
        return None
    verts = shape.geometry.verts
    if len(verts) < 9:  # menos de 3 puntos
        return None
    return [(verts[i], verts[i + 1], verts[i + 2]) for i in range(0, len(verts), 3)]


def dimensiones_rampa_footprint(elemento, escala_m):
    """(ancho_m, desarrollo_m) de un elemento IfcRamp/IfcRampFlight: lado
    corto y lado largo del rectangulo minimo rotado que contiene su
    footprint 2D -- misma tecnica que ancho_min_footprint() mas arriba,
    pero aca se necesitan AMBOS lados: el largo es el proxy de
    "desarrollo" de la formula de pendiente de OGUC Art. 4.1.7 N2 (ver
    reglas_normativas.pendiente_maxima_rampa_pct) -- mas literal que el
    proxy que usa CAD (el bounding rect del RECINTO que CONTIENE la
    rampa, leido de la geometria vectorizada del plano, no del elemento
    de rampa mismo -- ver _celda4_actual.py). Devuelve (None, None) si la
    geometria no se puede triangular (mismo caso ya documentado para
    ancho_min_footprint).

    Aplica la misma guardia de plausibilidad que ancho_min_footprint (ver
    _MEDIDA_MIN_PLAUSIBLE_M): un footprint valido pero de pocos mm de lado
    se trata como (None, None), no como una medida real -- este fue
    exactamente el caso real encontrado en Esplanades/FOJAB Landsarkivet,
    los 2 archivos que motivaron agregar esta guardia.

    Aplica ademas una guardia de RECTILINEIDAD (ver _FILL_RATIO_MIN_TRAMO_
    RECTO mas arriba, hallazgo real de DeepSeek): si el footprint real no
    llena razonablemente su propio rectangulo minimo rotado, es senal de
    una rampa en L/U/con giro -- el lado largo del rectangulo ahi es la
    diagonal de la envolvente, no un "desarrollo" real recorrido en linea
    recta, y devolverlo como si lo fuera fabricaria una pendiente sin
    significado normativo. Tambien (None, None) en ese caso."""
    poly = g.footprint_2d(elemento)
    if poly is None:
        return None, None
    try:
        rect = poly.minimum_rotated_rectangle
        coords = list(rect.exterior.coords)
    except AttributeError:
        return None, None
    if rect.area <= 1e-9 or (poly.area / rect.area) < _FILL_RATIO_MIN_TRAMO_RECTO:
        return None, None
    lado_a = g.math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
    lado_b = g.math.hypot(coords[2][0] - coords[1][0], coords[2][1] - coords[1][1])
    ancho_m = min(lado_a, lado_b) * escala_m
    desarrollo_m = max(lado_a, lado_b) * escala_m
    if ancho_m < _MEDIDA_MIN_PLAUSIBLE_M or desarrollo_m < _MEDIDA_MIN_PLAUSIBLE_M:
        return None, None
    return ancho_m, desarrollo_m


def ancho_escalera_footprint(elemento, escala_m):
    """Ancho de tramo de escalera (punto 4 de S3.15 -- integracion del
    piloto IDS, `piloto_ids_oguc.py`, al analizador principal).

    El piloto original consultaba `Qto_StairFlightBaseQuantities.Width`
    declarado en el IFC -- verificado hoy contra los 10 archivos de
    prueba del proyecto (los 8 originales + Esplanades + FOJAB
    Landsarkivet): NINGUNO declara esa Qto, ni ninguna otra con una clave
    "Width" en ningun Pset/Qto de sus IfcStairFlight (revisado tambien
    Pset_StairFlightCommon y los atributos nativos -- solo hay
    NumberOfRiser/NumberOfTreads/RiserHeight/TreadLength, nunca un ancho).
    Mismo patron ya visto en punto 3 (rampa): sin dato declarado en
    ningun archivo real, se calcula desde la geometria 3D real en vez de
    quedar sin cobertura -- mas riguroso que limitarse a leer un campo
    que hoy no existe en ningun archivo del dataset.

    Lado CORTO del rectangulo minimo rotado del footprint 2D -- misma
    tecnica que ancho_min_footprint()/dimensiones_rampa_footprint(), pero
    escrita aparte (no reusando ancho_min_footprint) a proposito: esta
    funcion aplica ademas la guardia de rectilineidad
    (_FILL_RATIO_MIN_TRAMO_RECTO), que ancho_min_footprint() no tiene (ver
    esa guardia mas arriba: sin ella, una escalera en L/U sin descomponer
    en tramos daria un "ancho" fabricado desde la diagonal de su
    envolvente, no el ancho real del tramo -- verificado con el mismo
    poligono en L de prueba de la guardia, el lado corto de su
    rectangulo da 4.0 m, muy lejos del ancho real de 1.2 m). No se agrega
    esa guardia a ancho_min_footprint() en si (funcion ya validada en
    punto 1, no se toca sin revalidar los 8 archivos originales, mismo
    criterio de cautela que el resto de esta sesion).

    Devuelve None si la geometria no se puede triangular, si la forma no
    es razonablemente recta, o si el resultado no supera la guardia de
    plausibilidad geometrica (_MEDIDA_MIN_PLAUSIBLE_M) -- nunca un valor
    fabricado."""
    poly = g.footprint_2d(elemento)
    if poly is None:
        return None
    try:
        rect = poly.minimum_rotated_rectangle
        coords = list(rect.exterior.coords)
    except AttributeError:
        return None
    if rect.area <= 1e-9 or (poly.area / rect.area) < _FILL_RATIO_MIN_TRAMO_RECTO:
        return None
    lado_a = g.math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
    lado_b = g.math.hypot(coords[2][0] - coords[1][0], coords[2][1] - coords[1][1])
    ancho_m = min(lado_a, lado_b) * escala_m
    return ancho_m if ancho_m >= _MEDIDA_MIN_PLAUSIBLE_M else None


def num_o_none(v):
    return v if isinstance(v, (int, float)) else None


def num_o_none_escalado(v, escala_m):
    """Como num_o_none, pero convierte a metros -- OverallWidth/OverallHeight
    son atributos de LONGITUD (siempre en la unidad cruda que declara el
    archivo, sin excepcion posible via AREAUNIT/VOLUMEUNIT propio, a
    diferencia del area de un recinto -- ver g.escala_area()). Bug real
    corregido 2026-09-19 (revision cruzada DeepSeek): antes se comparaba el
    valor CRUDO contra el umbral de 0.80 m -- en archivos con LENGTHUNIT en
    milimetros (BasicHouse, HouseZ, Schependomlaan: 3 de los 6 archivos con
    arquitectura real de esta sesion), cualquier ancho crudo (ej. 680) es
    siempre >= 0.80, asi que el chequeo NUNCA podia fallar sin importar el
    ancho real. Verificado con datos: Schependomlaan tiene 12 puertas reales
    bajo 0.80 m real (0.63-0.68 m) que quedaban sin reportar por este bug."""
    v = num_o_none(v)
    return v * escala_m if v is not None else None


def analizar(nombre_corto, ifc_path):
    modelo = ifcopenshell.open(ifc_path)
    escala_m = ifcopenshell.util.unit.calculate_unit_scale(modelo)
    escala_a = g.escala_area(modelo)

    muros = modelo.by_type("IfcWall")  # incluye IfcWallStandardCase (subtipo)
    # Descarta vanos que no son aberturas reales (marcos de obra en hormigon
    # sin terminar, hardware de ascensor) -- hallazgo real 2026-09-19, ver
    # filtrar_vanos_reales() en generar_plano_pdf.py.
    puertas = g.filtrar_vanos_reales(modelo.by_type("IfcDoor"))
    ventanas = g.filtrar_vanos_reales(modelo.by_type("IfcWindow"))
    recintos = modelo.by_type("IfcSpace")
    # Rampas (2026-09-20, auditoria de cobertura -- ver seccion 30 del diario
    # BIM): conteo a nivel de edificio, MISMO mecanismo de deduplicacion que
    # generar_json_colab.py (tramo real si existe decomposicion, contenedor
    # como fallback si no) -- construido explicito como lista, no como formula,
    # para no repetir el bug de doble conteo ya encontrado con escaleras.
    # Ningun archivo de esta sesion tiene una IfcRamp real -- ver ESTILOS en
    # generar_plano_pdf.py.
    rampas_todas_ifc = modelo.by_type("IfcRamp")
    flights_por_ramp_todo = {rp.GlobalId: [h for h in ifcopenshell.util.element.get_decomposition(rp, is_recursive=False)
                                            if h.is_a("IfcRampFlight")]
                              for rp in rampas_todas_ifc}
    rampas_dedup = []
    ids_rampa_dedup = set()
    for rp in rampas_todas_ifc:
        hijos = flights_por_ramp_todo[rp.GlobalId]
        if hijos:
            for h in hijos:
                if h.GlobalId not in ids_rampa_dedup:
                    ids_rampa_dedup.add(h.GlobalId)
                    rampas_dedup.append(h)
        elif rp.GlobalId not in ids_rampa_dedup:
            ids_rampa_dedup.add(rp.GlobalId)
            rampas_dedup.append(rp)
    total_rampas = len(rampas_dedup)
    # Escaleras (2026-09-20, punto 4 de S3.15 -- integrar el piloto de
    # escalera IDS al analizador principal, ver ancho_escalera_footprint()
    # mas arriba) -- MISMO mecanismo de deduplicacion que rampas arriba y
    # que ya usa generar_plano_pdf.py para el dibujo (tramo real si existe
    # decomposicion, contenedor como fallback si no -- verificado en
    # Schependomlaan: 3 de sus IfcStair no tienen NINGUN IfcStairFlight
    # hijo, decomposicion vacia, pero el propio IfcStair si tiene geometria
    # 3D usable).
    escaleras_todas_ifc = modelo.by_type("IfcStair")
    flights_por_escalera_todo = {
        st.GlobalId: [h for h in ifcopenshell.util.element.get_decomposition(st, is_recursive=False)
                       if h.is_a("IfcStairFlight")]
        for st in escaleras_todas_ifc
    }
    escaleras_dedup = []
    ids_escalera_dedup = set()
    for st in escaleras_todas_ifc:
        hijos = flights_por_escalera_todo[st.GlobalId]
        if hijos:
            for h in hijos:
                if h.GlobalId not in ids_escalera_dedup:
                    ids_escalera_dedup.add(h.GlobalId)
                    escaleras_dedup.append(h)
        elif st.GlobalId not in ids_escalera_dedup:
            ids_escalera_dedup.add(st.GlobalId)
            escaleras_dedup.append(st)
    total_escaleras = len(escaleras_dedup)
    # LIMITACION CONOCIDA, no corregida hoy (Revision Ing SW Paso 2, 2
    # hallazgos reales de DeepSeek/Codex, evaluados y aceptados sin cambio
    # de codigo -- misma limitacion ya heredada, sin corregir, del bloque
    # de rampas de arriba, no introducida hoy):
    # (a) DeepSeek -- un IfcStairFlight cuyo IfcStair padre no aparece en
    #     `modelo.by_type("IfcStair")` (huerfano, exportador atipico) nunca
    #     se visita, desaparece del analisis sin dejar rastro. Sin
    #     evidencia de que esto ocurra en ninguno de los 10 archivos de
    #     prueba -- los 3 casos reales validados (Administrativo,
    #     DuplexHouse, FZK-Haus) quedan cubiertos por la logica actual.
    # (b) Codex -- si un mismo IfcStairFlight quedara descompuesto bajo 2
    #     IfcStair distintos (IFC mal formado), podria contarse el tramo
    #     por un lado y el contenedor vacio del otro IfcStair por el otro,
    #     inflando total_escaleras. Tambien sin evidencia real, y un caso
    #     de IFC genuinamente invalido (la decomposicion deberia ser un
    #     arbol, no un grafo).
    # No se agrega proteccion especulativa para casos sin un ejemplo real
    # que verificar -- mismo criterio que el resto de esta sesion (no
    # inventar un fix para un bug que no se puede confirmar empiricamente).
    # Queda documentado para revisar si aparece evidencia real.
    # Salidas de emergencia (2026-09-20) -- ver g.mapa_salida_emergencia()
    # para el alcance real (solo cuenta el dato IFC de etiquetado que existe,
    # no reemplaza calculo de carga de ocupacion/rutas de evacuacion).
    mapa_salida = g.mapa_salida_emergencia(modelo)
    puertas_salida_emergencia = sum(1 for d in puertas if mapa_salida.get(d.GlobalId) is True)

    # Encontrado al corregir el bug None/0.0 de ventilacion (2026-09-18): sin
    # este limite, un edificio sin NINGUNA IfcWindow (ej. el administrativo
    # espanol, 100% muro cortina -- ver seccion 7) reporta el 100% de sus
    # recintos como "incumplimiento de ventilacion", incluidos estacionamientos
    # subterraneos que normativamente ni requieren ventilacion natural. Eso no
    # es un hallazgo real, es un artefacto de que "ventana" aca solo cuenta
    # IfcWindow -- CurtainWall/Plate no esta contemplado. Se desactiva el
    # chequeo de ventilacion por edificio completo cuando no hay ninguna
    # IfcWindow, en vez de mostrar una avalancha de falsos positivos.
    ventilacion_aplicable = len(ventanas) > 0

    muros_geo = []
    for w in muros:
        psets = elutil.get_psets(w, qtos_only=False)
        wallcommon = psets.get(_PSET_FIRE_RATING, {})
        fire = wallcommon.get(_PROP_FIRE_RATING)
        muros_geo.append({
            "id": w.GlobalId,
            "nombre": w.Name,
            "clase": w.is_a(),
            "fire_rating": fire,
            "fire_rating_declarado": fire is not None,
        })

    puertas_geo = []
    for d in puertas:
        ancho = num_o_none_escalado(d.OverallWidth, escala_m)
        # OJO: None es "sin dato", no "no cumple" -- HouseZ no declara OverallWidth
        # en ninguna puerta, y confundir ambos casos es exactamente el error que
        # este proyecto existe para evitar (ver DF-01/DF-02 del pipeline PDF).
        cumple = None if ancho is None else (ancho >= _ANCHO_MIN_PUERTA_M)
        puertas_geo.append({
            "id": d.GlobalId,
            "nombre": d.Name,
            "ancho_m": ancho,
            "cumple_ancho_min": cumple,  # True / False / None=sin dato
            "referencia": "OGUC Art. 4.1.7 N°4",
        })

    # Bug real encontrado por revision cruzada con Codex + DeepSeek 2026-09-18,
    # confirmado por ambos de forma independiente: usar `if (ancho and alto)`
    # trata 0.0 como "sin dato" (Python trata 0 como falsy) -- exactamente la
    # misma confusion "ausente" vs "invalido/cero" que ya se habia corregido
    # para puertas, reintroducida aca sin querer. Ahora se compara contra None
    # explicitamente en todos lados de este bloque.
    ventanas_geo = []
    for v in ventanas:
        ancho = num_o_none_escalado(v.OverallWidth, escala_m)
        alto = num_o_none_escalado(v.OverallHeight, escala_m)
        ventanas_geo.append({
            "id": v.GlobalId, "nombre": v.Name, "ancho_m": ancho, "alto_m": alto,
            "area_m2": (ancho * alto) if (ancho is not None and alto is not None) else None,
        })
    ventanas_por_id = {v["id"]: v for v in ventanas_geo}

    # Pendiente/ancho de rampa (2026-09-20, punto 3 de S3.15) -- reusa
    # `rampas_dedup` (ya calculado arriba para el conteo total_rampas), sin
    # una segunda deduplicacion paralela que pudiera divergir de esa.
    #
    # MECANISMO DELIBERADAMENTE DISTINTO al de CAD, mismo patron que
    # circulo_giro/ancho de recinto arriba (ver notas en reglas_normativas.py
    # y en _celda4_actual.py, bloque "if tipo == 'rampa':"): CAD lee un
    # ROTULO de texto ("Pendiente 8%") cerca de la rampa via regex sobre las
    # cotas vectorizadas del plano -- no calcula la pendiente, transcribe lo
    # que el arquitecto escribio. Aca, con geometria 3D real disponible, se
    # CALCULA la pendiente real: desnivel_m (rango de Z de la geometria 3D
    # cruda, ver geometria_3d_cruda) dividido por desarrollo_m (lado largo
    # del footprint 2D del elemento mismo, ver dimensiones_rampa_footprint) --
    # mas riguroso que CAD, no solo un port, mismo principio que los puntos
    # 1 y 2 ya implementados.
    rampas_geo = []
    for rp in rampas_dedup:
        ancho_m, desarrollo_m = dimensiones_rampa_footprint(rp, escala_m)
        verts_3d = geometria_3d_cruda(rp)
        desnivel_m = None
        if verts_3d is not None:
            z_vals = [v[2] for v in verts_3d]
            desnivel_m = (max(z_vals) - min(z_vals)) * escala_m
        pendiente_calculada_pct = None
        if desnivel_m is not None and desarrollo_m is not None and desarrollo_m > 1e-6:
            pendiente_calculada_pct = round(desnivel_m / desarrollo_m * 100, 2)
        pendiente_maxima_pct = pendiente_maxima_rampa_pct(desarrollo_m)
        rampas_geo.append({
            "id": rp.GlobalId,
            "nombre": rp.Name,
            "clase": rp.is_a(),
            "ancho_m": round(ancho_m, 2) if ancho_m is not None else None,
            "desarrollo_m": round(desarrollo_m, 2) if desarrollo_m is not None else None,
            "desnivel_m": round(desnivel_m, 2) if desnivel_m is not None else None,
            "pendiente_calculada_pct": pendiente_calculada_pct,
            "pendiente_maxima_oguc_pct": pendiente_maxima_pct,
            "cumple_pendiente": (None if pendiente_calculada_pct is None or pendiente_maxima_pct is None
                                  else pendiente_calculada_pct <= pendiente_maxima_pct),
            "ancho_min_oguc": _ANCHO_MIN_RAMPA_M,
            "cumple_ancho_min": None if ancho_m is None else ancho_m >= _ANCHO_MIN_RAMPA_M,
        })

    # Escaleras -- ancho de tramo (punto 4 de S3.15, integracion del piloto
    # IDS `piloto_ids_oguc.py` al analizador principal). El piloto original
    # leia `Qto_StairFlightBaseQuantities.Width` declarado -- verificado
    # hoy que NINGUNO de los 10 archivos de prueba lo declara (ni esa
    # clave en ningun otro Pset/Qto), asi que se calcula desde la
    # geometria real (ver ancho_escalera_footprint(), con guardia de
    # rectilineidad para no fabricar un ancho desde una escalera en L/U
    # sin descomponer en tramos).
    escaleras_geo = []
    for st in escaleras_dedup:
        ancho_m = ancho_escalera_footprint(st, escala_m)
        escaleras_geo.append({
            "id": st.GlobalId,
            "nombre": st.Name,
            "clase": st.is_a(),
            "ancho_m": round(ancho_m, 2) if ancho_m is not None else None,
            "ancho_min_oguc": _ANCHO_MIN_ESCALERA_M,
            "cumple_ancho_min": None if ancho_m is None else ancho_m >= _ANCHO_MIN_ESCALERA_M,
        })

    recintos_geo = []
    for sp in recintos:
        qtos = elutil.get_psets(sp, qtos_only=True)
        area, campo_area = buscar_area(qtos)
        area = area * escala_a if area is not None else None
        # OJO (DeepSeek, 2026-09-18): IfcRelSpaceBoundary "nivel 1" (el mas
        # comun) suele apuntar al MURO que delimita el recinto, no a la
        # ventana -- la ventana solo aparece aca si el exportador genera
        # boundaries "nivel 2" (ArchiCAD, como este archivo, si lo hace; no
        # es garantia general). Verificado con datos reales que SI funciona
        # para FZK-Haus -- no asumir que funciona igual en otro exportador
        # sin volver a verificar.
        # Fix 2026-09-19 (revision cruzada DeepSeek): antes se contaba
        # CUALQUIER IfcWindow vinculado, incluidos los ya descartados por
        # filtrar_vanos_reales (vanos de obra sin terminar) -- inflaba
        # num_ventanas_vinculadas con vanos falsos, lo que podia cambiar de
        # forma incorrecta el mensaje diagnostico de mas abajo (aunque el
        # gate real de ventilacion, basado en ventanas_con_area_valida, ya
        # estaba filtrado bien). Ahora solo cuenta ventanas REALES.
        ventanas_del_recinto = []
        for b in sp.BoundedBy:
            el = b.RelatedBuildingElement
            if el is not None and el.is_a("IfcWindow") and el.GlobalId in ventanas_por_id:
                ventanas_del_recinto.append(el.GlobalId)
        # Fix 2026-09-19 (revision cruzada DeepSeek): distingue "este recinto
        # no tiene NINGUN IfcRelSpaceBoundary" (el exportador no intento
        # vincularlo -- dato ausente para ESTE recinto puntual) de "tiene
        # boundaries pero ninguno es ventana" (señal mas fuerte de que
        # genuinamente no tiene ventanas). El resguardo de mas abajo
        # (enlace_funciona) es a nivel EDIFICIO -- sirve para saber si el
        # MECANISMO de vinculo funciona en este archivo en absoluto, pero no
        # protege a un recinto puntual sin boundaries de que le apliquen un
        # 0% que en realidad es "no se intento vincular este recinto".
        tiene_boundary = len(sp.BoundedBy) > 0
        area_ventanas = 0.0
        ventanas_con_area_valida = 0
        for vid in ventanas_del_recinto:
            vg = ventanas_por_id.get(vid)
            if vg and vg["area_m2"] is not None:
                area_ventanas += vg["area_m2"]
                ventanas_con_area_valida += 1
        # area_ventanas SIEMPRE es un numero valido (arranca en 0.0 y suma) --
        # un recinto sin ventanas vinculadas da 0.0 legitimo, no "sin dato".
        # Lo que SI puede faltar es el area del recinto (area is None).
        # pct_ventilacion/cumple se completan DESPUES de este loop (ver abajo)
        # -- recien ahi se sabe si el vinculo IfcRelSpaceBoundary funciono en
        # ALGUN recinto del edificio.
        nombre_recinto = (sp.LongName or sp.Name or "").strip()
        tipo_recinto = clasificar_tipo_recinto(nombre_recinto)
        ancho_recinto = ancho_min_footprint(sp, escala_m) if tipo_recinto else None
        area_min, ancho_min, ref_oguc = OGUC_REGLAS.get(tipo_recinto, (None, None, None))
        # Circulo de giro accesible (2026-09-20, punto 2 de S3.15) -- ver
        # es_candidato_accesible()/circulo_cabe_en_footprint() mas arriba
        # para el mecanismo (deliberadamente distinto de CAD: calculo
        # geometrico real, no lectura visual de un simbolo dibujado).
        accesible = es_candidato_accesible(nombre_recinto)
        diametro_giro_m = OGUC_REGLAS['circulo_giro_accesible_m'][0]
        circulo_cabe = circulo_cabe_en_footprint(sp, escala_m, diametro_giro_m) if accesible else None
        recintos_geo.append({
            "nombre": nombre_recinto,
            "area_m2": area,
            "area_campo_origen": campo_area,
            "num_ventanas_vinculadas": len(ventanas_del_recinto),
            "ventanas_con_area_valida": ventanas_con_area_valida,
            "area_ventanas_m2": round(area_ventanas, 3),
            "tiene_boundary": tiene_boundary,
            # Area/ancho minimo por tipo de recinto (2026-09-20, ver
            # Proyecto/Diseno_Funcional_ArchiCheck.md S3.15, punto 1) --
            # mismo OGUC_REGLAS que el pipeline CAD, ver clasificar_tipo_
            # recinto() para la limitacion real de cobertura por idioma/
            # tipologia de los IFC de prueba actuales.
            "tipo_oguc": tipo_recinto,
            "ancho_m": ancho_recinto,
            "area_min_oguc": area_min,
            "ancho_min_oguc": ancho_min,
            "cumple_area_min": (None if area_min is None or area is None else area >= area_min),
            "cumple_ancho_min": (None if ancho_min is None or ancho_recinto is None else ancho_recinto >= ancho_min),
            "ref_oguc": ref_oguc,
            "es_candidato_accesible": accesible,
            "circulo_giro_cabe": circulo_cabe,
        })

    # Segundo hallazgo del mismo tipo (2026-09-18), esta vez en HouseZ: tiene
    # 22 IfcWindow reales, pero `IfcSpace.BoundedBy` viene vacio para todos
    # los recintos (confirmado antes) -- sin este segundo resguardo, los 5
    # recintos habrian dado 0% de ventilacion "real" cuando en verdad el
    # vinculo espacial simplemente no existe en este exportador. Se exige que
    # AL MENOS un recinto del edificio haya logrado vincular una ventana antes
    # de confiar en el 0% de cualquier otro recinto del mismo edificio.
    #
    # Tercer hallazgo del mismo tipo (2026-09-19), en Schependomlaan: el
    # vinculo SI existe para 2 de 100 recintos (num_ventanas_vinculadas > 0),
    # pero esas ventanas vinculadas no tienen OverallWidth/OverallHeight --
    # ventanas_con_area_valida da 0 igual, y las 100 salas (incluidos
    # dormitorios y living con ventanas reales de sobra en la casa) daban 0%
    # "real". El resguardo anterior solo miraba si habia VINCULO, no si ese
    # vinculo traia un AREA calculable -- exactamente el mismo tipo de falla
    # a la que hay que estar atento en esta seccion completa: no basta con
    # que el dato exista, tiene que servir para lo que se le pide.
    enlace_funciona = any(r["ventanas_con_area_valida"] > 0 for r in recintos_geo)
    ventilacion_aplicable = ventilacion_aplicable and enlace_funciona
    for r in recintos_geo:
        area = r["area_m2"]
        # Fix 2026-09-19 (revision cruzada DeepSeek): el resguardo
        # `ventilacion_aplicable` es a nivel EDIFICIO (confirma que el
        # MECANISMO de vinculo funciona en este archivo) -- pero un recinto
        # SIN ningun IfcRelSpaceBoundary propio (`tiene_boundary=False`) no
        # tiene ningun dato para evaluar, aunque el edificio en general si
        # tenga el mecanismo funcionando en otros recintos. Antes, ese
        # recinto recibia pct=0.0/cumple=False (incumplimiento espurio) en
        # vez de "sin dato" -- exactamente el patron "dato ausente vs no
        # cumple" que este proyecto existe para evitar, aplicado aca a nivel
        # de recinto individual, no solo de edificio completo.
        se_puede_evaluar = ventilacion_aplicable and r["tiene_boundary"] and area is not None and area > 0
        pct = (r["area_ventanas_m2"] / area * 100) if se_puede_evaluar else None
        r["pct_ventilacion"] = round(pct, 1) if pct is not None else None
        r["cumple_ventilacion_10pct"] = (pct >= _VENTILACION_MIN_PCT) if pct is not None else None

    incumplimientos = []
    for p in puertas_geo:
        if p["cumple_ancho_min"] is False:
            incumplimientos.append({"tipo": "puerta_ancho_insuficiente", "elemento": p["nombre"],
                                     "valor": p["ancho_m"], "referencia": p["referencia"]})
        elif p["cumple_ancho_min"] is None:
            incumplimientos.append({"tipo": "puerta_ancho_sin_dato", "elemento": p["nombre"],
                                     "referencia": p["referencia"], "severidad": "dato_faltante"})
    for w in muros_geo:
        if not w["fire_rating_declarado"]:
            incumplimientos.append({"tipo": "muro_fire_rating_no_declarado", "elemento": w["nombre"],
                                     "referencia": "OGUC Art. 4.3.3", "severidad": "dato_faltante"})
    for r in recintos_geo:
        if r["cumple_ventilacion_10pct"] is False:
            incumplimientos.append({"tipo": "ventilacion_insuficiente", "elemento": r["nombre"],
                                     "pct_ventilacion": r["pct_ventilacion"],
                                     "referencia": _REF_VENTILACION})
        # Area/ancho minimo por tipo de recinto -- mismos `tipo` ('area'/
        # 'ancho') que ya usa el pipeline CAD en incumplimientos_geo, para
        # que el portal no necesite 2 lecturas distintas segun el origen.
        #
        # DECISION EXPLICITA (Revision Ing SW Paso 2, 2026-09-20, pregunta
        # real de DeepSeek: ¿por que un recinto SIN tipo_oguc clasificado no
        # genera una entrada de "dato faltante", a diferencia de puertas/
        # muros?): no es el mismo tipo de ausencia. Una puerta SIEMPRE
        # deberia declarar OverallWidth -- si no lo hace, es un dato real
        # que falta. Un IfcSpace que no matchea ningun tipo de OGUC_REGLAS
        # (recintos_clasificados_oguc en el resumen) generalmente significa
        # que la regla NO APLICA a ese recinto (una oficina o un
        # estacionamiento no tiene un minimo de area residencial que
        # evaluar) -- no que falte un dato que deberiamos tener. Generar una
        # entrada por cada uno de los ~510/540 recintos sin clasificar del
        # Administrativo (ES) seria ruido, no señal. La cobertura real
        # (cuantos SI se clasificaron) ya queda visible en
        # resumen_global.recintos_clasificados_oguc.
        if r["cumple_area_min"] is False:
            incumplimientos.append({"tipo": "area", "elemento": r["nombre"],
                                     "medido": r["area_m2"], "minimo": r["area_min_oguc"],
                                     "deficit": round(r["area_min_oguc"] - r["area_m2"], 2),
                                     "referencia": r["ref_oguc"]})
        if r["cumple_ancho_min"] is False:
            incumplimientos.append({"tipo": "ancho", "elemento": r["nombre"],
                                     "medido": round(r["ancho_m"], 2), "minimo": r["ancho_min_oguc"],
                                     "deficit": round(r["ancho_min_oguc"] - r["ancho_m"], 2),
                                     "referencia": r["ref_oguc"]})
        # Circulo de giro accesible -- mismo `tipo`/`minimo`/`referencia`
        # que ya usa el pipeline CAD para este incumplimiento (ver
        # _celda4_actual.py, chequeo 'circulo_giro'), aunque el mecanismo
        # de deteccion sea distinto (ver reglas_normativas.py).
        #
        # CORREGIDO 2026-09-20 (Revision Ing SW Paso 2, hallazgo real de
        # DeepSeek): `circulo_giro_cabe is None` puede pasar por 2 motivos
        # bien distintos que antes se trataban igual (ninguno generaba
        # entrada) -- (a) es_candidato_accesible=False, la regla NO APLICA
        # a este recinto (correcto no generar nada, mismo criterio que el
        # resto del archivo); (b) es_candidato_accesible=True pero la
        # geometria no se pudo procesar (footprint_2d fallo, o el buffer
        # reventó) -- ESO es un dato faltante real, mismo patron que
        # puerta_ancho_sin_dato (que SI genera entrada con severidad
        # dato_faltante). Sin esta distincion, un recinto PMR real cuya
        # geometria no triangula desaparecia sin dejar rastro, ni en
        # incumplimientos_geo ni en ningun contador del resumen.
        if r["circulo_giro_cabe"] is False:
            incumplimientos.append({"tipo": "circulo_giro", "elemento": r["nombre"],
                                     "medido": None, "minimo": OGUC_REGLAS['circulo_giro_accesible_m'][0],
                                     "deficit": None, "referencia": OGUC_REGLAS['circulo_giro_accesible_m'][1]})
        elif r["circulo_giro_cabe"] is None and r["es_candidato_accesible"]:
            incumplimientos.append({"tipo": "circulo_giro_sin_dato", "elemento": r["nombre"],
                                     "referencia": OGUC_REGLAS['circulo_giro_accesible_m'][1],
                                     "severidad": "dato_faltante"})

    # Pendiente/ancho de rampa (punto 3 de S3.15) -- a diferencia de
    # "tipo_oguc no clasificado" en recintos (donde None = "la regla no
    # aplica", ver decision explicita mas arriba), aca CADA rampa real
    # (rampas_dedup) SIEMPRE deberia poder medirse geometricamente -- un
    # None en cumple_pendiente/cumple_ancho_min significa que la
    # geometria 3D no se pudo triangular para ESE elemento puntual, mismo
    # tipo de ausencia real que puerta_ancho_sin_dato (no "no aplica").
    for rp in rampas_geo:
        if rp["cumple_pendiente"] is False:
            incumplimientos.append({
                "tipo": "pendiente_rampa", "elemento": rp["nombre"],
                "medido": rp["pendiente_calculada_pct"], "minimo": None,
                "maximo": rp["pendiente_maxima_oguc_pct"], "desarrollo_m": rp["desarrollo_m"],
                "deficit": round(rp["pendiente_calculada_pct"] - rp["pendiente_maxima_oguc_pct"], 2),
                "referencia": _REF_RAMPA_PENDIENTE})
        elif rp["cumple_pendiente"] is None:
            incumplimientos.append({"tipo": "pendiente_rampa_sin_dato", "elemento": rp["nombre"],
                                     "referencia": _REF_RAMPA_PENDIENTE, "severidad": "dato_faltante"})
        if rp["cumple_ancho_min"] is False:
            incumplimientos.append({
                "tipo": "ancho", "elemento": rp["nombre"],
                "medido": rp["ancho_m"], "minimo": rp["ancho_min_oguc"],
                "deficit": round(rp["ancho_min_oguc"] - rp["ancho_m"], 2),
                "referencia": _REF_RAMPA_ANCHO})
        elif rp["cumple_ancho_min"] is None:
            incumplimientos.append({"tipo": "ancho_sin_dato", "elemento": rp["nombre"],
                                     "referencia": _REF_RAMPA_ANCHO, "severidad": "dato_faltante"})

    # Escalera -- ancho de tramo (punto 4 de S3.15). Tipo propio
    # ('escalera_ancho_...'), no reutiliza 'ancho'/'ancho_sin_dato' de
    # rampa/recinto -- mismo patron que puerta_ancho_insuficiente/
    # puerta_ancho_sin_dato (nombre especifico por tipo de elemento,
    # para que el portal pueda distinguir el origen sin ambiguedad).
    for st in escaleras_geo:
        if st["cumple_ancho_min"] is False:
            incumplimientos.append({
                "tipo": "escalera_ancho_insuficiente", "elemento": st["nombre"],
                "medido": st["ancho_m"], "minimo": st["ancho_min_oguc"],
                "deficit": round(st["ancho_min_oguc"] - st["ancho_m"], 2),
                "referencia": _REF_ESCALERA_ANCHO})
        elif st["cumple_ancho_min"] is None:
            incumplimientos.append({"tipo": "escalera_ancho_sin_dato", "elemento": st["nombre"],
                                     "referencia": _REF_ESCALERA_ANCHO, "severidad": "dato_faltante"})

    resultado = {
        "archivo_origen": Path(ifc_path).name,
        "generado": datetime.datetime.now().isoformat(timespec="seconds"),
        "resumen_global": {
            "muros": len(muros_geo),
            "muros_con_fire_rating": sum(1 for w in muros_geo if w["fire_rating_declarado"]),
            "puertas": len(puertas_geo),
            "puertas_ok_ancho_min": sum(1 for p in puertas_geo if p["cumple_ancho_min"] is True),
            "puertas_sin_dato_ancho": sum(1 for p in puertas_geo if p["cumple_ancho_min"] is None),
            "ventanas": len(ventanas_geo),
            "rampas": total_rampas,
            # Pendiente/ancho de rampa (2026-09-20, punto 3 de S3.15) --
            # "medible" cuenta rampas donde SI se pudo calcular (geometria
            # triangulable), no confundir con "cumple".
            "rampas_con_pendiente_medible": sum(1 for rp in rampas_geo if rp["pendiente_calculada_pct"] is not None),
            "rampas_pendiente_ok": sum(1 for rp in rampas_geo if rp["cumple_pendiente"] is True),
            "rampas_ancho_ok": sum(1 for rp in rampas_geo if rp["cumple_ancho_min"] is True),
            # Ancho de escalera (2026-09-20, punto 4 de S3.15). "medido" y
            # "ancho_ok" NO son lo mismo (hallazgo real de DeepSeek, Revision
            # Ing SW Paso 2: rampa ya tenia rampas_con_pendiente_medible para
            # esta misma distincion, escalera se agrego sin su equivalente --
            # sin este contador, "cuantas SI se pudieron medir" quedaba
            # solo deducible por resta, no visible de un vistazo).
            "escaleras": total_escaleras,
            "escaleras_ancho_medido": sum(1 for st in escaleras_geo if st["cumple_ancho_min"] is not None),
            "escaleras_ancho_ok": sum(1 for st in escaleras_geo if st["cumple_ancho_min"] is True),
            "escaleras_ancho_insuficiente": sum(1 for st in escaleras_geo if st["cumple_ancho_min"] is False),
            "escaleras_ancho_sin_dato": sum(1 for st in escaleras_geo if st["cumple_ancho_min"] is None),
            # Salidas de emergencia (2026-09-20) -- ver g.mapa_salida_emergencia():
            # solo cuenta el dato de etiquetado IFC real (Pset_DoorCommon.FireExit/
            # IsFireExit), NO reemplaza un calculo de carga de ocupacion/rutas.
            "puertas_marcadas_salida_emergencia": puertas_salida_emergencia,
            "puertas_con_dato_salida_emergencia": len(mapa_salida),
            "recintos": len(recintos_geo),
            "recintos_con_area": sum(1 for r in recintos_geo if r["area_m2"] is not None),
            "recintos_clasificados_oguc": sum(1 for r in recintos_geo if r["tipo_oguc"] is not None),
            "recintos_candidatos_accesibles": sum(1 for r in recintos_geo if r["es_candidato_accesible"]),
            "recintos_candidatos_accesibles_sin_dato_geometrico": sum(
                1 for r in recintos_geo if r["es_candidato_accesible"] and r["circulo_giro_cabe"] is None),
            "recintos_con_chequeo_ventilacion_posible": sum(1 for r in recintos_geo if r["pct_ventilacion"] is not None),
            "ventilacion_aplicable_al_edificio": ventilacion_aplicable,
            "ventilacion_nota": (
                None if ventilacion_aplicable else
                "Chequeo de ventilacion desactivado: 0 IfcWindow en todo el edificio "
                "(aperturas probablemente modeladas como CurtainWall/Plate, no evaluado aca)."
                if len(ventanas_geo) == 0 else
                "Chequeo de ventilacion desactivado: hay IfcWindow pero ningun IfcSpace.BoundedBy "
                "las vincula a un recinto en todo el edificio -- el exportador no genera boundaries "
                "de nivel 2 (o no los genera en absoluto), no es que los recintos no tengan ventanas."
                if not any(r["num_ventanas_vinculadas"] > 0 for r in recintos_geo) else
                "Chequeo de ventilacion desactivado: hay vinculo recinto-ventana en al menos un caso, "
                "pero ninguna ventana vinculada tiene OverallWidth/OverallHeight declarado (area "
                "calculable) -- el dato de dimension de ventana falta, no el vinculo espacial."
            ),
        },
        "muros_geo": muros_geo,
        "puertas_geo": puertas_geo,
        "ventanas_geo": ventanas_geo,
        "rampas_geo": rampas_geo,
        "escaleras_geo": escaleras_geo,
        "recintos_geo": recintos_geo,
        "incumplimientos_geo": incumplimientos,
    }
    return resultado


def main():
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    resumenes = []
    for nombre_corto, ifc_path in ARCHIVOS:
        print(f"\n=== {nombre_corto} ===")
        try:
            resultado = analizar(nombre_corto, ifc_path)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        origen = Path(ifc_path)
        out_json = origen.parent / f"{origen.stem}_analisis_{timestamp}.json"
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print(f"  guardado: {out_json}")
        r = resultado["resumen_global"]
        print(f"  muros={r['muros']} (fire_rating={r['muros_con_fire_rating']}) "
              f"puertas={r['puertas']} (ok_ancho_min={r['puertas_ok_ancho_min']}) "
              f"ventanas={r['ventanas']} rampas={r['rampas']} "
              f"(pendiente_medible={r['rampas_con_pendiente_medible']}, "
              f"pendiente_ok={r['rampas_pendiente_ok']}, ancho_ok={r['rampas_ancho_ok']}) "
              f"escaleras={r['escaleras']} (ancho_ok={r['escaleras_ancho_ok']}, "
              f"sin_dato={r['escaleras_ancho_sin_dato']}) "
              f"recintos={r['recintos']} "
              f"(con_area={r['recintos_con_area']}, clasificados_oguc={r['recintos_clasificados_oguc']}, "
              f"candidatos_accesibles={r['recintos_candidatos_accesibles']}, "
              f"chequeo_ventilacion_posible={r['recintos_con_chequeo_ventilacion_posible']}) "
              f"salida_emergencia_con_dato={r['puertas_con_dato_salida_emergencia']} "
              f"(marcadas={r['puertas_marcadas_salida_emergencia']})")
        resumenes.append((nombre_corto, resultado))

    print("\n\n=== TABLA CRUZADA ===")
    print(f"{'Archivo':22} {'Muros':>6} {'FireRat':>8} {'Puertas':>8} {'OKAncho':>8} {'Ventanas':>9} {'Recintos':>9} {'ConVentil.':>11}")
    for nombre_corto, resultado in resumenes:
        r = resultado["resumen_global"]
        print(f"{nombre_corto:22} {r['muros']:6d} {r['muros_con_fire_rating']:8d} {r['puertas']:8d} "
              f"{r['puertas_ok_ancho_min']:8d} {r['ventanas']:9d} {r['recintos']:9d} {r['recintos_con_chequeo_ventilacion_posible']:11d}")


if __name__ == "__main__":
    main()
