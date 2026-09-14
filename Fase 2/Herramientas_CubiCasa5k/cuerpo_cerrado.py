# -*- coding: utf-8 -*-
"""
Cuerpo cerrado -- puerto Python de _tmp_cuerpo_cerrado.mjs (Node.js), validado
11/11 en el prototipo (ver Roadmap_Revision_Dossier_ArchiCheck.md, entrada
2026-08-21/22). Generador Y confirmador de muros: decide que par de caras
paralelas tiene "ancho real" de muro (ancho_por_emparejamiento) y si dos
grupos de segmentos forman un cuerpo cerrado real (cuerpo_cerrado_fusiona) --
reemplaza tanto el filtro duro de tipo/angulo/capa del generador (Paso 2 de
extraer_datos_vectoriales) como la fusion ciega por proximidad del
confirmador (_fusionar_muros_por_proximidad).

Diferencia deliberada respecto al prototipo Node.js: usa cv2/numpy (ya
dependencias del pipeline, ver Celda 4) para rasterizado/dilatacion/
componente-conexa en vez de los loops de pixeles a mano que el prototipo
uso porque Node no tenia OpenCV disponible. La logica geometrica (que
pares son validos, que es una linea central de ventana, como se rellena
una esquina) es 1:1 con el .mjs -- ver ese archivo para el historial de
los 3 bugs de fondo ya corregidos y los comentarios de diseño completos.

Formato de segmento: dict {'p1': (x, y), 'p2': (x, y), ...} -- mismo
formato que segmentos_l en extraer_datos_vectoriales (Celda 4). Cualquier
clave adicional (color, fill, layer...) se ignora aqui.

Sin validar contra Colab todavia -- ver test_cuerpo_cerrado.py (mismos 4
casos de regresion, con sub-casos, que ya se corrieron contra el
prototipo .mjs). Correr ese test antes de integrar a la Celda 4 real.

Parametros (tolerancias) leidos desde catalogo_tipologias.py, no como
constantes locales -- ver Principio 2 de project_archicheck_objetivo_etapa_
aprendizaje.md (memoria permanente): un valor parametrico debe vivir en UN
solo lugar rastreable contra Convenciones_CAD.md, nunca duplicado a mano
en cada modulo que lo usa.
"""
import math
import numpy as np
import cv2

from catalogo_tipologias import parametro as _param

_TOL_MIN_M = _param('D1-ancho-emparejamiento', 'tol_min_m', 0.08)
_TOL_MAX_M = _param('D1-ancho-emparejamiento', 'tol_max_m', 0.9)
_TOL_SIMETRIA_M = _param('D1-D3-ventana-lineas-centrales', 'tol_simetria_m', 0.05)
_TOL_VERTICE_M = _param('D2-hoja-vano-firma-relativa', 'tol_vertice_m', 0.03)
_ANCHO_MAX_HOJA_CONFIRMADA_M = _param('D2-hoja-vano-firma-relativa', 'ancho_max_hoja_confirmada_m', 0.10)
_MARGEN_CONTEXTO_M = _param('D1-encuentro-de-brazos', 'margen_contexto_m', 0.6)
_TOL_CONECTOR_ESQUINA_M = _param('D1-encuentro-de-brazos', 'tol_conector_esquina_m', 0.03)
_TOL_JAMBA_M = _param('D3-ventana-reconstruccion-por-jamba', 'tol_jamba_m', 0.03)
_ANCHO_VENTANA_MIN_M = _param('D3-ventana-reconstruccion-por-jamba', 'ancho_min_m', 0.15)
_ANCHO_VENTANA_MAX_M = _param('D3-ventana-reconstruccion-por-jamba', 'ancho_max_m', 3.0)
_MAX_SPREAD_VERTICAL_M = _param('D3-ventana-reconstruccion-por-jamba', 'max_spread_vertical_m', 2.0)
_TOL_CROSS_M = _param('D3-ventana-corta-muro', 'tol_cross_m', 0.15)


def _validar_mpx(mpx, nombre_fn):
    """mpx (metros/pixel) se usa como divisor en todas las conversiones de
    tolerancia a pixeles de este modulo -- confirmado por ejecucion real
    (2026-08-30) que mpx=0/None revienta con ZeroDivisionError/TypeError
    poco claros en identificar_lineas_centrales, ancho_por_emparejamiento e
    identificar_hojas_de_puerta. Si mpx llega invalido (ej. fallo de
    parseo de la escala en la Celda 4), esto falla rapido con un mensaje
    que apunta a la causa real en vez de un traceback generico."""
    if not isinstance(mpx, (int, float)) or isinstance(mpx, bool) or mpx <= 0:
        raise ValueError(
            f"{nombre_fn}: mpx invalido ({mpx!r}) -- debe ser un numero positivo "
            f"(metros/pixel). Revisa que la escala del plano (ESCALA_MANUAL / "
            f"Celda 3) se haya parseado correctamente antes de llamar a este pipeline."
        )


# ── utilidades geometricas basicas ──────────────────────────────────────
def _angulo(s):
    return math.atan2(s['p2'][1] - s['p1'][1], s['p2'][0] - s['p1'][0])


def _dist_perp_entre_paralelas(a, b):
    """Distancia perpendicular entre 2 lineas casi paralelas, usando el
    punto medio de `a` proyectado sobre la recta de `b`."""
    mx = (a['p1'][0] + a['p2'][0]) / 2
    my = (a['p1'][1] + a['p2'][1]) / 2
    dx = b['p2'][0] - b['p1'][0]
    dy = b['p2'][1] - b['p1'][1]
    length = math.hypot(dx, dy) or 1
    nx, ny = -dy / length, dx / length  # normal unitaria de b
    return abs((mx - b['p1'][0]) * nx + (my - b['p1'][1]) * ny)


def _dist_perp_con_signo(a, b):
    """Igual que _dist_perp_entre_paralelas pero conserva el signo (de que
    lado de b esta a) -- necesario para saber si 2 vecinos de una linea
    central estan en lados OPUESTOS, no del mismo lado."""
    mx = (a['p1'][0] + a['p2'][0]) / 2
    my = (a['p1'][1] + a['p2'][1]) / 2
    dx = b['p2'][0] - b['p1'][0]
    dy = b['p2'][1] - b['p1'][1]
    length = math.hypot(dx, dy) or 1
    nx, ny = -dy / length, dx / length
    return (mx - b['p1'][0]) * nx + (my - b['p1'][1]) * ny


def _solapan_en_direccion(a, b):
    """Exige solape real de proyeccion a lo largo del eje de b, no solo
    paralelismo a distancia -- si no, dos lineas paralelas lejanas sin
    relacion contarian como "par"."""
    dx = b['p2'][0] - b['p1'][0]
    dy = b['p2'][1] - b['p1'][1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length

    def proy(p):
        return (p[0] - b['p1'][0]) * ux + (p[1] - b['p1'][1]) * uy

    a0, a1 = sorted([proy(a['p1']), proy(a['p2'])])
    b0, b1 = sorted([0, length])
    return max(a0, b0) < min(a1, b1)


# ── deteccion de lineas centrales (ventana) -- categoria propia ─────────
# Definicion permanente confirmada por el arquitecto: 2 lineas enfrentadas
# CON una linea central entre medio (recta o curva, da igual) es SIEMPRE
# ventana, nunca muro -- aunque geometricamente cumpla cuerpo cerrado. La
# linea central nunca representa el ancho real: la ventana en si es
# angosta (2-3cm), el simbolo de 2 lineas + centro es solo convencion de
# dibujo.
#
# Se identifica ANTES de emparejar, como su propia categoria -- no se
# puede detectar "por par" porque la propia linea central suele estar mas
# cerca de una de las 2 caras que la cara opuesta, y terminaria
# aceptandose a si misma como "la cara real" (bug ya encontrado y
# corregido en el prototipo .mjs). Una linea central real tiene 2 vecinos
# paralelos, EN LADOS OPUESTOS (signo contrario de distancia con signo),
# aproximadamente simetricos, cuya separacion total cae en el rango de
# espesor de muro (tol_min_m .. tol_max_m).
def _sign(x):
    if x > 0:
        return 1
    if x < 0:
        return -1
    return 0


_CACHE_CENTRALES = {'contexto': None, 'params': None, 'resultado': None}


def identificar_lineas_centrales(contexto, mpx, tol_min_m=_TOL_MIN_M, tol_max_m=_TOL_MAX_M, tol_simetria_m=_TOL_SIMETRIA_M):
    """Devuelve un set de id(segmento) -- identidad de objeto, no de
    valor, igual que el Set de objetos del prototipo .mjs.

    CACHE de 1 slot (bug real encontrado 2026-08-27, corrida Beauchef
    truncada por lentitud): cuerpo_cerrado_fusiona llama a
    clasificar_no_muro en CADA una de las O(n^2) evaluaciones de pares
    del loop de fusion (Celda 4) -- y clasificar_no_muro, mas
    identificar_hojas_de_puerta y construir_contexto_con_pares mas abajo
    en la MISMA llamada, recalculaban esta funcion (O(n^2) cada vez)
    varias veces sobre el MISMO `contexto_local`. Un cache de 1 slot,
    valido solo mientras `contexto` sea el mismo objeto (identidad, no
    valor) y los parametros no cambien, elimina esa redundancia sin
    cambiar el resultado -- se invalida solo con que llegue un
    `contexto` distinto (list nueva por cada par i,j en el loop de
    fusion), asi que nunca sirve un resultado stale."""
    _validar_mpx(mpx, 'identificar_lineas_centrales')
    _params = (mpx, tol_min_m, tol_max_m, tol_simetria_m)
    if _CACHE_CENTRALES['contexto'] is contexto and _CACHE_CENTRALES['params'] == _params:
        return _CACHE_CENTRALES['resultado']
    tol_min_px = tol_min_m / mpx
    tol_max_px = tol_max_m / mpx
    tol_sim_px = tol_simetria_m / mpx
    centrales = set()
    for l in contexto:
        ang_l = (math.degrees(_angulo(l))) % 180
        vecinos = []
        for o in contexto:
            if o is l:
                continue
            ang_o = (math.degrees(_angulo(o))) % 180
            d_ang = abs(ang_l - ang_o)
            if d_ang > 90:
                d_ang = 180 - d_ang
            if d_ang > 10:
                continue
            if not _solapan_en_direccion(l, o) and not _solapan_en_direccion(o, l):
                continue
            vecinos.append((o, _dist_perp_con_signo(o, l)))
        encontrado = False
        for i in range(len(vecinos)):
            if encontrado:
                break
            for j in range(i + 1, len(vecinos)):
                d_x, d_y = vecinos[i][1], vecinos[j][1]
                if _sign(d_x) == _sign(d_y):
                    continue  # deben quedar a lados opuestos de l
                separacion = abs(d_x) + abs(d_y)
                if separacion < tol_min_px or separacion > tol_max_px:
                    continue  # separacion total = espesor de muro plausible
                if abs(abs(d_x) - abs(d_y)) > tol_sim_px:
                    continue  # l debe quedar cerca de la mitad, no pegada a una cara
                centrales.add(id(l))
                encontrado = True
                break
    _CACHE_CENTRALES['contexto'] = contexto
    _CACHE_CENTRALES['params'] = _params
    _CACHE_CENTRALES['resultado'] = centrales
    return centrales


def _hay_linea_central_entre(s, c, contexto, centrales_ids, d, tol_centro_px=8):
    """Dado un par candidato (s,c) a distancia d, ¿alguna linea central
    real (ya identificada en centrales_ids) cae aprox. a mitad de camino
    entre ambas, cubriendo la zona de contacto? Si es asi, (s,c) son las
    2 caras de una ventana, no de un muro."""
    if not centrales_ids:
        return False
    dx = c['p2'][0] - c['p1'][0]
    dy = c['p2'][1] - c['p1'][1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length

    def t(p):
        return (p[0] - c['p1'][0]) * ux + (p[1] - c['p1'][1]) * uy

    t_a, t_b = t(s['p1']), t(s['p2'])
    s_min, s_max = sorted([t_a, t_b])
    lote_min, lote_max = max(s_min, 0), min(s_max, length)
    if lote_max <= lote_min:
        return False
    ang_c = math.degrees(_angulo(c)) % 180
    for l in contexto:
        if id(l) not in centrales_ids:
            continue
        ang_l = math.degrees(_angulo(l)) % 180
        d_ang = abs(ang_l - ang_c)
        if d_ang > 90:
            d_ang = 180 - d_ang
        if d_ang > 10:
            continue
        d_l = _dist_perp_entre_paralelas(l, c)
        if abs(d_l - d / 2) > tol_centro_px:
            continue
        t_l1, t_l2 = t(l['p1']), t(l['p2'])
        l_min, l_max = sorted([t_l1, t_l2])
        solape_real = min(lote_max, l_max) - max(lote_min, l_min)
        if solape_real < 0.3 * (lote_max - lote_min):
            continue
        return True
    return False


def _segmento_bloqueado_por_ventana(s, contexto, mpx, tol_min_m, tol_max_m, centrales_ids):
    """Un segmento esta "bloqueado por ventana" si tuvo al menos un
    candidato de pareja geometricamente valido (angulo+distancia+solape)
    pero TODOS fueron rechazados por _hay_linea_central_entre -- distinto
    de "sin candidatos" (linea realmente aislada). Marca especificamente
    las 2 caras/tapas de una ventana para que el remate de esquinas NO
    rellene un cuadrado ahi."""
    if id(s) in centrales_ids:
        return True
    tol_min_px = tol_min_m / mpx
    tol_max_px = tol_max_m / mpx
    ang_s = math.degrees(_angulo(s)) % 180
    hubo_candidato = False
    for c in contexto:
        if c is s or id(c) in centrales_ids:
            continue
        ang_c = math.degrees(_angulo(c)) % 180
        d_ang = abs(ang_s - ang_c)
        if d_ang > 90:
            d_ang = 180 - d_ang
        if d_ang > 10:
            continue
        d = _dist_perp_entre_paralelas(s, c)
        if d < tol_min_px or d > tol_max_px:
            continue
        if not _solapan_en_direccion(s, c):
            continue
        hubo_candidato = True
        if not _hay_linea_central_entre(s, c, contexto, centrales_ids, d):
            return False  # par valido real -- no bloqueada
    return hubo_candidato  # hubo candidato(s) pero todos bloqueados por ventana


# ── Paso A: ancho por emparejamiento de lineas paralelas ────────────────
def ancho_por_emparejamiento(grupo, contexto, mpx, tol_min_m=_TOL_MIN_M, tol_max_m=_TOL_MAX_M, hoja_ids=None, centrales_ids=None):
    """Para cada segmento de `grupo`, busca en `contexto` (pool completo
    de segmentos cercanos, incluye el propio grupo) un segmento aprox.
    paralelo a distancia perpendicular entre tol_min_m y tol_max_m. Si lo
    encuentra, ese segmento tiene "ancho real" (viene de 2 caras). Si
    ninguno de los segmentos del grupo tiene par, el grupo entero es
    linea suelta.

    `hoja_ids`: set opcional de id(segmento) ya identificados como
    hoja/vano de puerta (ver identificar_hojas_de_puerta, Tipologia B de
    Convenciones_CAD D.2) -- se excluyen del pool de posibles "caras de
    muro" con el mismo criterio que las lineas centrales de ventana.

    `centrales_ids`: set opcional ya calculado por identificar_lineas_
    centrales(contexto, ...) -- BUG REAL encontrado 2026-08-26 (corrida
    real contra PdV, N2 ~834 segmentos protegidos, no terminaba en mas
    de 1 hora): sin este parametro, esta funcion recalculaba
    identificar_lineas_centrales (ya O(n^2)) desde cero CADA VEZ que se
    la llamaba -- identificar_hojas_de_puerta la llama una vez POR
    SEGMENTO del contexto, multiplicando un O(n^2) por N, o sea O(n^3)
    real. Si se pasa ya calculado (mismo contexto, no cambia entre
    llamadas dentro de una misma pasada), se evita ese recalculo
    redundante sin cambiar ningun resultado -- mismo criterio exacto,
    solo se computa una vez en vez de N veces."""
    _validar_mpx(mpx, 'ancho_por_emparejamiento')
    tol_min_px = tol_min_m / mpx
    tol_max_px = tol_max_m / mpx
    # lineas centrales de ventana: se excluyen por completo del pool de
    # posibles "caras de muro" -- ni pueden ser s, ni pueden ser
    # aceptadas como c de otra linea.
    if centrales_ids is None:
        centrales_ids = identificar_lineas_centrales(contexto, mpx, tol_min_m, tol_max_m)
    hoja_ids = hoja_ids or set()
    mejor_ancho = None
    detalle = []
    for s in grupo:
        if id(s) in centrales_ids or id(s) in hoja_ids:
            detalle.append({'segmento': s, 'anchoPx': None, 'par': None})
            continue
        ang_s = math.degrees(_angulo(s)) % 180
        candidatos = []
        for c in contexto:
            if c is s or id(c) in centrales_ids or id(c) in hoja_ids:
                continue
            ang_c = math.degrees(_angulo(c)) % 180
            d_ang = abs(ang_s - ang_c)
            if d_ang > 90:
                d_ang = 180 - d_ang
            if d_ang > 10:
                continue
            d = _dist_perp_entre_paralelas(s, c)
            if d < tol_min_px or d > tol_max_px:
                continue
            if not _solapan_en_direccion(s, c):
                continue
            candidatos.append((c, d))
        candidatos.sort(key=lambda x: x[1])
        par_encontrado, par_seg = None, None
        for c, d in candidatos:
            if _hay_linea_central_entre(s, c, contexto, centrales_ids, d):
                continue
            par_encontrado, par_seg = d, c
            break  # el candidato valido mas cercano
        detalle.append({'segmento': s, 'anchoPx': par_encontrado, 'par': par_seg})
        if par_encontrado is not None and (mejor_ancho is None or par_encontrado < mejor_ancho):
            mejor_ancho = par_encontrado
    return {
        'anchoPx': mejor_ancho,
        'anchoM': mejor_ancho * mpx if mejor_ancho is not None else None,
        'detalle': detalle,
    }


_CACHE_HOJAS = {'contexto': None, 'params': None, 'resultado': None}


def identificar_hojas_de_puerta(contexto, mpx, tol_min_m=_TOL_MIN_M, tol_max_m=_TOL_MAX_M, tol_vertice_m=_TOL_VERTICE_M, ancho_max_confirmado_m=_ANCHO_MAX_HOJA_CONFIRMADA_M):
    """Tipologia B (Convenciones_CAD D.2, confirmado por el arquitecto
    2026-08-24, revision visual de N2): un vano/hoja de puerta es un par
    de bordes opuestos MAS FINOS (menor separacion entre caras) que el
    muro/pilar real en sus extremos -- firma RELATIVA (se compara contra
    el vecino real que toca sus extremos), a diferencia de la firma de
    ventana (2 caras + linea central, ver identificar_lineas_centrales),
    que es absoluta y NO se generaliza a otros elementos -- aclaracion
    explicita del arquitecto: "la regla de 2 lineas centrales queda solo
    para ventanas". Un muro real tiene una separacion entre caras
    consistente con su propio espesor donde sea que se mida -- no deberia
    existir un vecino con ancho mayor que lo contradiga justo en su
    propio extremo; si existe, ese par mas fino es la hoja/vano de una
    puerta, no un muro.

    Calcula un ancho INGENUO por segmento primero (sin excluir hojas
    todavia -- 2 pasadas, evita la dependencia circular con
    ancho_por_emparejamiento, que a su vez necesita ESTE resultado via el
    parametro hoja_ids).

    UMBRAL DE CONFIRMACION (2026-08-26, corrida real PdV N2 -- caso
    MU54/MU55): un muro real de 0.20m junto a un muro real de 0.30m
    quedaba excluido como "hoja de puerta" -- la regla de arriba
    ("cualquier vecino mas ancho") no distingue "es una hoja real" de
    "es un muro real mas angosto que su vecino", que Convenciones_CAD
    D.1 ya reconoce como caso normal (anchos distintos entre brazos).
    Aclaracion del arquitecto: los vertices de una hoja de puerta NO
    necesariamente coinciden con un vertice del muro/pilar adyacente
    (limitacion conocida de esta deteccion por coincidencia de vertice,
    sin resolver todavia -- ver roadmap 26-ago). Mientras tanto, en vez
    de inventar un margen/ratio sin dato real que lo respalde: todo
    candidato con ancho propio > ancho_max_confirmado_m (0.10m = 10cm
    por defecto, pedido explicito del arquitecto) NO se excluye como
    muro (sigue siendo candidato real) pero se separa en
    `hoja_dudosa_ids` para levantarse como duda (Principio 3, D.9 /
    TablaDudas) en vez de asumir en silencio que es hoja o que es muro.
    Solo lo mas fino (<=10cm, tamaño real de una hoja de puerta) se
    excluye con confianza como antes.

    Devuelve {'hoja_ids': set, 'hoja_dudosa_ids': set} -- en ambos casos
    se marcan AMBOS lados del par (el segmento que toca al vecino mas
    ancho, y su propia pareja), no solo uno.

    PERFORMANCE (bug real encontrado 2026-08-26): `centrales_ids` se
    calcula UNA sola vez aca y se pasa a cada llamada de
    ancho_por_emparejamiento -- antes se recalculaba adentro de esa
    funcion en cada una de las N iteraciones de este loop, multiplicando
    un calculo ya O(n^2) por N (o sea O(n^3) real). Mismo contexto en
    todo este loop, mismo resultado siempre -- no cambia nada del
    criterio, solo evita el recalculo redundante.

    CACHE de 1 slot adicional (2026-08-27, mismo bug de fondo que arriba
    pero un nivel mas afuera): _firma_hoja_vano_puerta y
    _firma_hoja_vano_puerta_duda (FIRMAS_NO_MURO) llaman a ESTA funcion
    completa cada una, con los mismos argumentos, dentro de la MISMA
    llamada a clasificar_no_muro -- duplicando el O(n^2) de este loop
    sin necesidad. Igual criterio de invalidacion que
    identificar_lineas_centrales: solo sirve si `contexto` es el MISMO
    objeto y los parametros no cambiaron."""
    _validar_mpx(mpx, 'identificar_hojas_de_puerta')
    _params = (mpx, tol_min_m, tol_max_m, tol_vertice_m, ancho_max_confirmado_m)
    if _CACHE_HOJAS['contexto'] is contexto and _CACHE_HOJAS['params'] == _params:
        return _CACHE_HOJAS['resultado']
    tol_px = tol_vertice_m / mpx
    _centrales_cache = identificar_lineas_centrales(contexto, mpx, tol_min_m, tol_max_m)
    con_pares_ingenuo = []
    for s in contexto:
        r = ancho_por_emparejamiento([s], contexto, mpx, tol_min_m, tol_max_m, centrales_ids=_centrales_cache)
        if r['anchoPx'] is None:
            continue
        con_pares_ingenuo.append({'segmento': s, 'par': r['detalle'][0]['par'], 'anchoPx': r['anchoPx']})

    hoja_ids = set()
    hoja_dudosa_ids = set()
    for item in con_pares_ingenuo:
        s, ancho_s = item['segmento'], item['anchoPx']
        encontrado = False
        for extremo in (s['p1'], s['p2']):
            if encontrado:
                break
            for otro in con_pares_ingenuo:
                vecino, ancho_v = otro['segmento'], otro['anchoPx']
                if vecino is s:
                    continue
                # Guarda de plausibilidad (mismo criterio ya usado en
                # _relleno_solido/remate de esquinas, "ancho_px > largo_s"):
                # si el ancho ingenuo del vecino supera su propio largo, es
                # un emparejamiento espurio a larga distancia (ver bug #1
                # del roadmap, 2026-08-20/21), no una referencia real de
                # espesor de muro -- no debe poder disparar la exclusion de
                # una hoja de puerta real vecina.
                largo_vecino = math.hypot(vecino['p2'][0] - vecino['p1'][0], vecino['p2'][1] - vecino['p1'][1])
                if ancho_v > largo_vecino:
                    continue
                for extremo_v in (vecino['p1'], vecino['p2']):
                    d = math.hypot(extremo[0] - extremo_v[0], extremo[1] - extremo_v[1])
                    if d <= tol_px and ancho_v > ancho_s:
                        _destino = hoja_ids if (ancho_s * mpx) <= ancho_max_confirmado_m else hoja_dudosa_ids
                        _destino.add(id(s))
                        if item.get('par') is not None:
                            _destino.add(id(item['par']))
                        encontrado = True
                        break
                if encontrado:
                    break
    _resultado = {'hoja_ids': hoja_ids, 'hoja_dudosa_ids': hoja_dudosa_ids}
    _CACHE_HOJAS['contexto'] = contexto
    _CACHE_HOJAS['params'] = _params
    _CACHE_HOJAS['resultado'] = _resultado
    return _resultado


# ── Clasificacion en 2 pasos + deteccion de conflictos (Principio 3) ────
# Convenciones_CAD D.9 + project_archicheck_objetivo_etapa_aprendizaje.md
# (memoria permanente): un conflicto entre tipologias NUNCA se resuelve en
# silencio por el orden en que corrio el codigo -- se levanta a proposito.
#
# El pipeline ya hacia esto en 2 pasos, pero solo el paso 1 era explicito:
#   Paso 1 (exclusion -- "¿es candidato a muro?"): ancho_por_emparejamiento
#   ya descarta un segmento del pool de caras de muro si esta en
#   centrales_ids (ventana) O en hoja_ids (vano/puerta). Eso decide SOLO
#   "no es muro", nunca decide QUE es.
#   Paso 2 (clasificacion en merito propio -- "si no es muro, ¿que es?"):
#   antes no existia como paso separado -- un segmento excluido quedaba
#   simplemente "fuera", sin registro de por cual firma ni si mas de una
#   firma lo reclamaba. clasificar_no_muro() corre CADA firma conocida de
#   forma independiente (nunca se detiene en el primer match) y devuelve,
#   por segmento, la lista completa de tipologias que lo aceptan. Si esa
#   lista tiene 2+ elementos, es un CONFLICTO real -- se registra en
#   'conflictos', listo para levantarse como pregunta en TablaDudas (D.9),
#   nunca resuelto adivinando cual tipologia "vale mas".
#
# Extensible: hoy compone las 3 firmas que viven en este modulo (ventana,
# hoja/vano de puerta confirmada, hoja/vano de puerta duda -- ver umbral
# 26-ago en identificar_hojas_de_puerta). Los detectores de eje/cota/corte-
# rasante (D.6) viven en la Celda 4 sobre `segmentos_l`/indices, no sobre
# id(segmento) -- se pueden sumar via el parametro `sets_externos` sin
# tocar esta funcion, convirtiendo esos indices a sets de id(segmento)
# del lado del llamador.
def _firma_ventana(contexto, mpx, tol_min_m, tol_max_m):
    return identificar_lineas_centrales(contexto, mpx, tol_min_m, tol_max_m)


def _firma_hoja_vano_puerta(contexto, mpx, tol_min_m, tol_max_m):
    return identificar_hojas_de_puerta(contexto, mpx, tol_min_m, tol_max_m)['hoja_ids']


def _firma_hoja_vano_puerta_duda(contexto, mpx, tol_min_m, tol_max_m):
    # Candidatos a hoja/vano mas anchos que ancho_max_hoja_confirmada_m
    # (2026-08-26, caso real MU54/MU55 PdV N2) -- NO se excluyen como
    # muro (ver identificar_hojas_de_puerta), pero se levantan aca como
    # duda real para TablaDudas (D.9) en vez de decidirse en silencio.
    return identificar_hojas_de_puerta(contexto, mpx, tol_min_m, tol_max_m)['hoja_dudosa_ids']


FIRMAS_NO_MURO = {
    'ventana': _firma_ventana,                 # Convenciones_CAD D.1/D.3
    'hoja_vano_puerta': _firma_hoja_vano_puerta,  # Convenciones_CAD D.2
    'hoja_vano_puerta_duda': _firma_hoja_vano_puerta_duda,  # Convenciones_CAD D.2, umbral 26-ago
}


def clasificar_no_muro(contexto, mpx, tol_min_m=_TOL_MIN_M, tol_max_m=_TOL_MAX_M, sets_externos=None):
    """Corre TODAS las firmas de FIRMAS_NO_MURO (mas las que el llamador
    sume via `sets_externos`, dict nombre->set(id(segmento))) sobre el
    contexto completo, de una sola vez. Devuelve:
      'sets_por_tipologia': dict nombre -> set(id(segmento)) (por si el
          llamador necesita reusar un set individual, ej. hoja_ids).
      'clasificacion': dict id(segmento) -> lista de nombres de tipologia
          que lo aceptaron (longitud 0, 1, o 2+).
      'conflictos': dict id(segmento) -> lista de nombres, SOLO para los
          que tienen 2+ tipologias -- estos son los que deben levantarse
          como duda (Convenciones_CAD D.9), nunca resolverse eligiendo
          una tipologia sobre otra por orden de ejecucion."""
    sets_por_tipologia = {nombre: firma(contexto, mpx, tol_min_m, tol_max_m)
                           for nombre, firma in FIRMAS_NO_MURO.items()}
    if sets_externos:
        sets_por_tipologia.update(sets_externos)
    clasificacion = {}
    for nombre, ids in sets_por_tipologia.items():
        for sid in ids:
            clasificacion.setdefault(sid, []).append(nombre)
    conflictos = {sid: tipos for sid, tipos in clasificacion.items() if len(tipos) > 1}
    return {'sets_por_tipologia': sets_por_tipologia, 'clasificacion': clasificacion, 'conflictos': conflictos}


def diagnosticar_candidatos(s, contexto, mpx, top_n=5):
    """DIAGNOSTICO (no se usa en produccion): para un segmento `s` que
    ancho_por_emparejamiento no logro emparejar, calcula para TODOS los
    demas segmentos de `contexto` su angulo, distancia perpendicular y si
    hay solape de proyeccion -- SIN aplicar ningun umbral -- y devuelve
    los `top_n` mas cercanos por distancia. Sirve para ver si el
    candidato real esta ahi pero falla por angulo/distancia/solape (y por
    cuanto), en vez de asumir que "no hay nada cerca". Agregado 2026-08-22
    para investigar por que muchas entradas reales de muros_geo (PdV)
    salian 'sin par' pese a que el arquitecto confirmo que todos los
    muros del plano tienen 2 caras paralelas."""
    ang_s = math.degrees(_angulo(s)) % 180
    largo_s = math.hypot(s['p2'][0] - s['p1'][0], s['p2'][1] - s['p1'][1])
    candidatos = []
    for c in contexto:
        if c is s:
            continue
        ang_c = math.degrees(_angulo(c)) % 180
        d_ang = abs(ang_s - ang_c)
        if d_ang > 90:
            d_ang = 180 - d_ang
        d_px = _dist_perp_entre_paralelas(s, c)
        solapa = _solapan_en_direccion(s, c)
        largo_c = math.hypot(c['p2'][0] - c['p1'][0], c['p2'][1] - c['p1'][1])
        candidatos.append({
            'p1': c['p1'], 'p2': c['p2'],
            'dif_angulo_deg': round(d_ang, 1),
            'distancia_m': round(d_px * mpx, 3),
            'solapa_en_direccion': solapa,
            'largo_m': round(largo_c * mpx, 3),
        })
    candidatos.sort(key=lambda x: x['distancia_m'])
    # NUEVO (2026-08-23): separar los candidatos que SI solapan en proyeccion
    # de los que no -- ordenar todo junto por distancia cruda esconde al
    # candidato geometricamente relevante (con solape real) detras de
    # coincidencias irrelevantes mas cercanas en distancia pura pero sin
    # ninguna relacion real (duplicados del propio segmento, u otro muro
    # no relacionado que pasa cerca sin solapar). Confirmado con datos
    # reales de PdV (MU03, 3.6m de largo): los 3 candidatos mas cercanos
    # por distancia cruda tenian los 3 solapa=False, incluyendo un
    # duplicado exacto del propio segmento a 0m -- el candidato real
    # (si existe) puede estar mas lejos en distancia pero SI solapar.
    candidatos_con_solape = [c for c in candidatos if c['solapa_en_direccion']]
    return {
        's_p1': s['p1'], 's_p2': s['p2'], 's_largo_m': round(largo_s * mpx, 3),
        'top_candidatos': candidatos[:top_n],
        'top_candidatos_con_solape': candidatos_con_solape[:top_n],
    }


# ── Paso B: rasterizar relleno solido + cerrar micro-gaps + conectividad ─
def _bbox(segmentos, margen_px):
    xs = [p[0] for s in segmentos for p in (s['p1'], s['p2'])]
    ys = [p[1] for s in segmentos for p in (s['p1'], s['p2'])]
    return {'x0': min(xs) - margen_px, 'y0': min(ys) - margen_px,
            'x1': max(xs) + margen_px, 'y1': max(ys) + margen_px}


def _dims(box):
    w = max(1, math.ceil(box['x1'] - box['x0']))
    h = max(1, math.ceil(box['y1'] - box['y0']))
    return w, h


def _fill_quad(bin_arr, box, p1, p2, p3, p4):
    pts = np.array([
        [p1[0] - box['x0'], p1[1] - box['y0']],
        [p2[0] - box['x0'], p2[1] - box['y0']],
        [p3[0] - box['x0'], p3[1] - box['y0']],
        [p4[0] - box['x0'], p4[1] - box['y0']],
    ], dtype=np.int32)
    cv2.fillPoly(bin_arr, [pts], 1)


def _relleno_solido(contexto_con_pares, box, todos_los_segmentos, objetivo_ids, mpx, tol_min_m=_TOL_MIN_M, tol_max_m=_TOL_MAX_M, segmentos_ancho_forzado=None):
    """Rellena el AREA SOLIDA real de cada segmento con par -- el
    cuadrilatero entre el segmento y su cara enfrentada (equivale a
    "verter agua entre las 2 caras"), mas el remate de esquinas
    (exteriores E interiores) donde 2+ piernas de ancho real se juntan
    en un vertice -- ver docstring completo en _tmp_cuerpo_cerrado.mjs
    (funcion rellenoSolido).

    `segmentos_ancho_forzado`: lista opcional de (segmento, ancho_px)
    para CONECTORES de esquina/jog sin cara propia (ver
    _ancho_heredado_de_conector) -- se dibujan como trazo grueso
    directo (cv2.line, sin pasar por el calculo de cuadrilatero por
    solape) usando el ancho heredado del vecino, porque el chequeo
    normal `ancho_px > largo_s` (mas abajo) los rechazaria: un conector
    corto puede heredar un ancho mayor que su propio largo (ej. un jog
    de 15cm pegado a un muro de 30cm), y eso es legitimo para un
    conector aunque seria inverosimil para una cara real. Ademas
    participan del remate de esquinas (mas abajo) como cualquier otra
    pierna -- ver GENERALIZADO 2026-08-23 en ese bloque: el cierre de un
    vertice con anchos distintos, angulos no rectos, o 3+ piernas sale
    de la UNION de las extensiones pareadas de cada pierna (real o
    conector) contra cada una de las demas, sin asumir cuadrilatero
    regular ni angulo recto -- el numero de lados del poligono
    resultante depende solo de cuantas piernas convergen ahi."""
    w, h = _dims(box)
    bin_arr = np.zeros((h, w), dtype=np.uint8)

    if segmentos_ancho_forzado:
        for s, ancho_px in segmentos_ancho_forzado:
            if objetivo_ids is not None and id(s) not in objetivo_ids:
                continue
            grosor = max(1, round(ancho_px))
            p1 = (round(s['p1'][0] - box['x0']), round(s['p1'][1] - box['y0']))
            p2 = (round(s['p2'][0] - box['x0']), round(s['p2'][1] - box['y0']))
            cv2.line(bin_arr, p1, p2, 1, thickness=grosor)

    for item in contexto_con_pares:
        s, c, ancho_px = item['segmento'], item['par'], item['anchoPx']
        if c is None:
            continue
        if objetivo_ids is not None and id(s) not in objetivo_ids:
            continue  # el contexto solo da ancho, no se pinta el mismo
        largo_s = math.hypot(s['p2'][0] - s['p1'][0], s['p2'][1] - s['p1'][1])
        if ancho_px > largo_s:
            continue  # inverosimil como cara real (ver nota en el .mjs)

        dx = c['p2'][0] - c['p1'][0]
        dy = c['p2'][1] - c['p1'][1]
        length = math.hypot(dx, dy) or 1
        ux, uy = dx / length, dy / length

        def t(p):
            return (p[0] - c['p1'][0]) * ux + (p[1] - c['p1'][1]) * uy

        def punto_en_eje(tt):
            return (c['p1'][0] + ux * tt, c['p1'][1] + uy * tt)

        t_a, t_b = t(s['p1']), t(s['p2'])
        s_min, s_max = sorted([t_a, t_b])
        c_min, c_max = sorted([0, length])
        lote_min, lote_max = max(s_min, c_min), min(s_max, c_max)
        if lote_max <= lote_min:
            continue  # sin solape real, no rellenar nada

        def punto_en_s(lote_val):
            u = (lote_val - t_a) / (t_b - t_a if t_b != t_a else 1)
            return (s['p1'][0] + (s['p2'][0] - s['p1'][0]) * u,
                    s['p1'][1] + (s['p2'][1] - s['p1'][1]) * u)

        p1_, p2_ = punto_en_s(lote_min), punto_en_s(lote_max)
        c1_, c2_ = punto_en_eje(lote_min), punto_en_eje(lote_max)
        _fill_quad(bin_arr, box, p1_, p2_, c2_, c1_)

    # ── Remate de esquinas ────────────────────────────────────────────
    snap_px = 3

    def v_key(p):
        return (round(p[0] / snap_px), round(p[1] / snap_px))

    pool_completo = todos_los_segmentos if todos_los_segmentos is not None else [x['segmento'] for x in contexto_con_pares]
    centrales_ctx = identificar_lineas_centrales(pool_completo, mpx, tol_min_m, tol_max_m) if mpx else set()

    vertices = {}
    for s in pool_completo:
        es_objetivo = objetivo_ids is None or id(s) in objetivo_ids
        es_ventana = _segmento_bloqueado_por_ventana(s, pool_completo, mpx, tol_min_m, tol_max_m, centrales_ctx) if mpx else False
        for p in (s['p1'], s['p2']):
            k = v_key(p)
            v = vertices.setdefault(k, {'pt': p, 'tocaObjetivo': False, 'tocaVentana': False, 'piernas': []})
            if es_objetivo:
                v['tocaObjetivo'] = True
            if es_ventana:
                v['tocaVentana'] = True

    for item in contexto_con_pares:
        s, c, ancho_px = item['segmento'], item['par'], item['anchoPx']
        if ancho_px is None or c is None:
            continue
        if objetivo_ids is not None and id(s) not in objetivo_ids:
            continue
        largo_seg = math.hypot(s['p2'][0] - s['p1'][0], s['p2'][1] - s['p1'][1])
        if ancho_px > largo_seg:
            continue
        for p in (s['p1'], s['p2']):
            k = v_key(p)
            if k in vertices:
                vertices[k]['piernas'].append({'segmento': s, 'par': c, 'anchoPx': ancho_px, 'punta': p})

    # NUEVO (2026-08-23): los conectores de esquina/jog (segmentos_ancho_forzado,
    # ver cuerpo_cerrado_fusiona) tambien son "piernas" para el remate -- sin
    # cara propia (par=None), pero con ancho heredado real. Sin esto, un
    # conector nunca participa del remate de esquinas y el vertice donde se
    # une a un brazo real queda sin cerrar. largo_seg NO se chequea aqui a
    # proposito (a diferencia del loop de arriba): un conector corto con
    # ancho heredado de un vecino mas grueso es legitimo, ver docstring de
    # _ancho_heredado_de_conector.
    if segmentos_ancho_forzado:
        for s, ancho_px in segmentos_ancho_forzado:
            if objetivo_ids is not None and id(s) not in objetivo_ids:
                continue
            for p in (s['p1'], s['p2']):
                k = v_key(p)
                if k in vertices:
                    vertices[k]['piernas'].append({'segmento': s, 'par': None, 'anchoPx': ancho_px, 'punta': p})

    for v in vertices.values():
        if not v['tocaObjetivo']:
            continue  # no rellenar esquinas puramente del contexto
        if v['tocaVentana']:
            continue  # tapa/cara de ventana ya detectada -- nunca rellenar aqui
        piernas = v['piernas']
        for i in range(len(piernas)):
            for j in range(len(piernas)):
                if i == j:
                    continue
                pi, pj = piernas[i], piernas[j]
                d_ang = abs((math.degrees(_angulo(pi['segmento'])) - math.degrees(_angulo(pj['segmento']))) % 180)
                if d_ang > 90:
                    d_ang = 180 - d_ang
                if d_ang < 20:
                    continue  # casi colineales -- continuacion recta, no esquina
                # GENERALIZADO (2026-08-23, pedido del arquitecto): cada
                # pierna se extiende por el semi-ancho de la OTRA -- ya
                # funciona para anchos distintos y angulos no rectos (ver
                # _extender_y_rellenar_esquina) y para N piernas en el mismo
                # vertice (este loop ya recorre TODOS los pares, no solo 2 --
                # la union de las extensiones de a pares cubre el poligono de
                # cierre real sin asumir forma regular, sea triangulo,
                # cuadrilatero o mas lados segun cuantas piernas convergen).
                # Si pi es un conector sin cara propia (par=None), no hay
                # cuadrilatero que proyectar -- se extiende como trazo grueso
                # propio en su misma direccion (ver _extender_conector_sin_par).
                if pi['par'] is None:
                    _extender_conector_sin_par(bin_arr, box, pi['segmento'], pi['punta'], pj['anchoPx'] / 2, pi['anchoPx'])
                else:
                    _extender_y_rellenar_esquina(bin_arr, box, pi['segmento'], pi['par'], pi['punta'], pj['anchoPx'] / 2)

    return bin_arr, w, h


def _extender_y_rellenar_esquina(bin_arr, box, s, c, v, ext_px):
    """Extiende el relleno de la pierna `s` (con su cara par `c`) mas
    alla de su propio extremo `v` -- por `ext_px`, hacia la esquina --
    preservando el espesor REAL de s via su propia pareja c. Cada pierna
    se extiende solo por el semi-ancho real de la OTRA pierna, generando
    un remate rectangular (no un cuadrado isotropico) del tamano exacto
    que corresponde -- ver bug #3 en el roadmap (2026-08-20/21)."""
    if c is None or ext_px <= 0:
        return
    otro_extremo = s['p2'] if (s['p1'][0] == v[0] and s['p1'][1] == v[1]) else s['p1']
    dx, dy = v[0] - otro_extremo[0], v[1] - otro_extremo[1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length
    v_ext = (v[0] + ux * ext_px, v[1] + uy * ext_px)
    cdx, cdy = c['p2'][0] - c['p1'][0], c['p2'][1] - c['p1'][1]
    clen = math.hypot(cdx, cdy) or 1
    cux, cuy = cdx / clen, cdy / clen

    def t_c(p):
        return (p[0] - c['p1'][0]) * cux + (p[1] - c['p1'][1]) * cuy

    def punto_en_eje(tt):
        return (c['p1'][0] + cux * tt, c['p1'][1] + cuy * tt)

    # recorta al tramo real de c -- si c no llega tan lejos como v/v_ext,
    # no se inventa ancho ahi (degenera a area cero, conservador)
    t_v = max(0, min(clen, t_c(v)))
    t_v_ext = max(0, min(clen, t_c(v_ext)))
    c_v, c_v_ext = punto_en_eje(t_v), punto_en_eje(t_v_ext)
    _fill_quad(bin_arr, box, v, v_ext, c_v_ext, c_v)


def _extender_conector_sin_par(bin_arr, box, s, v, ext_px, ancho_propio_px):
    """Equivalente a _extender_y_rellenar_esquina, pero para un CONECTOR
    sin cara propia (par=None) -- no hay cuadrilatero que proyectar
    (no existe una 'otra cara' real), asi que se extiende como trazo
    grueso propio: continua la direccion del conector mas alla del
    vertice por ext_px (semi-ancho de la OTRA pierna en el vertice),
    dibujado con el ancho propio del conector (real o heredado, ver
    _ancho_heredado_de_conector). Union de esto con el trazo grueso
    principal (ver segmentos_ancho_forzado, cuerpo_cerrado_fusiona) es
    lo que cierra el vertice sin asumir cuadrilatero ni angulo recto --
    la union de todas las extensiones pareadas en un vertice con 3+
    piernas es lo que forma el poligono de cierre real, sea cual sea su
    forma."""
    if ext_px <= 0:
        return
    otro_extremo = s['p2'] if (s['p1'][0] == v[0] and s['p1'][1] == v[1]) else s['p1']
    dx, dy = v[0] - otro_extremo[0], v[1] - otro_extremo[1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length
    v_ext = (v[0] + ux * ext_px, v[1] + uy * ext_px)
    grosor = max(1, round(ancho_propio_px))
    p1 = (round(v[0] - box['x0']), round(v[1] - box['y0']))
    p2 = (round(v_ext[0] - box['x0']), round(v_ext[1] - box['y0']))
    cv2.line(bin_arr, p1, p2, 1, thickness=grosor)


def _dilatar(bin_arr, radio_px):
    r = max(1, round(radio_px))
    kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    return cv2.dilate(bin_arr, kernel, iterations=r)


def _componente_desde_punto(bin_arr, px, py):
    """Equivalente a floodFillDesde del .mjs: componente conexa (4-vecinos)
    que contiene (px,py) -- si ese punto exacto no cae sobre un pixel
    "1", busca el pixel "1" mas cercano primero (mismo fallback que el
    prototipo)."""
    h, w = bin_arr.shape
    xi, yi = int(round(px)), int(round(py))
    necesita_mas_cercano = not (0 <= xi < w and 0 <= yi < h and bin_arr[yi, xi])
    if necesita_mas_cercano:
        ys, xs = np.nonzero(bin_arr)
        if len(xs) == 0:
            return np.zeros_like(bin_arr)
        d2 = (xs.astype(np.float64) - px) ** 2 + (ys.astype(np.float64) - py) ** 2
        i = int(np.argmin(d2))
        xi, yi = int(xs[i]), int(ys[i])
    n_labels, labels = cv2.connectedComponents(bin_arr, connectivity=4)
    comp_id = labels[yi, xi]
    if comp_id == 0:
        return np.zeros_like(bin_arr)
    return (labels == comp_id).astype(np.uint8)


def _punto_medio(segmentos):
    sx = sum((s['p1'][0] + s['p2'][0]) / 2 for s in segmentos)
    sy = sum((s['p1'][1] + s['p2'][1]) / 2 for s in segmentos)
    n = len(segmentos)
    return sx / n, sy / n


def _grupo_toca_componente(segmentos, componente, box, paso_px=2):
    """True si ALGUN punto muestreado sobre `segmentos` (no el centroide
    del grupo, que puede caer en el hueco entre 2 caras) pertenece a
    `componente`."""
    h, w = componente.shape
    for s in segmentos:
        largo = math.hypot(s['p2'][0] - s['p1'][0], s['p2'][1] - s['p1'][1])
        n = max(1, round(largo / paso_px))
        for i in range(n + 1):
            t = i / n
            x = round(s['p1'][0] + (s['p2'][0] - s['p1'][0]) * t - box['x0'])
            y = round(s['p1'][1] + (s['p2'][1] - s['p1'][1]) * t - box['y0'])
            if 0 <= x < w and 0 <= y < h and componente[y, x] == 1:
                return True
    return False


def _ancho_heredado_de_conector(grupo, con_pares, mpx, tol_vertice_m=_TOL_CONECTOR_ESQUINA_M):
    """Un grupo sin ancho propio (ver ancho_por_emparejamiento) puede
    igual ser parte real de un muro si es un CONECTOR CORTO de esquina
    o jog -- confirmado por el arquitecto con datos reales de PdV
    (2026-08-23, casos MU02 y MU108): un tramo corto que remata un
    giro o una esquina nunca tiene su propia cara enfrentada, por
    definicion (es la pieza que UNE 2 caras, no una cara en si misma)
    -- eso no lo vuelve una linea suelta tipo ventana/referencia. La
    evidencia de que es un conector real (no una linea aislada) es que
    al menos uno de sus extremos coincide, dentro de tol_vertice_m, con
    el extremo de OTRO segmento del contexto local que SI tiene ancho
    real -- estar fisicamente pegado a una cara de muro real.

    Devuelve el ancho (px) heredado del vecino con ancho mas cercano
    por vertice compartido, o None si ningun extremo del grupo toca a
    un vecino con ancho real (en ese caso si es una linea suelta
    genuina, sin relacion estructural con ningun muro).

    Este es el ancho REPRESENTATIVO del grupo completo (el minimo
    encontrado en cualquiera de sus segmentos) -- usado para decidir si
    el grupo califica como conector real y para el calculo de
    tolerancia de dilatacion. El ancho de CADA segmento individual
    (que puede ser distinto si cada extremo toca un vecino distinto,
    ver _ancho_heredado_de_segmento) se resuelve aparte al armar
    segmentos_ancho_forzado en cuerpo_cerrado_fusiona."""
    mejor = None
    for s in grupo:
        candidato = _ancho_heredado_de_segmento(s, con_pares, mpx, tol_vertice_m)
        if candidato is not None and (mejor is None or candidato < mejor):
            mejor = candidato
    return mejor


def _ancho_heredado_de_segmento(s, con_pares, mpx, tol_vertice_m=_TOL_CONECTOR_ESQUINA_M):
    """Version por-segmento de _ancho_heredado_de_conector -- pedido
    explicito del arquitecto (2026-08-23): los brazos que llegan a un
    conector/esquina/empalme no necesariamente tienen el mismo ancho
    entre si, asi que cada segmento del conector hereda el ancho de SU
    PROPIO vecino mas cercano por vertice compartido, no un valor unico
    para todo el grupo. Devuelve None si ningun extremo de `s` toca a
    un vecino con ancho real."""
    tol_px = tol_vertice_m / mpx
    mejor = None
    for extremo in (s['p1'], s['p2']):
        for item in con_pares:
            c = item['segmento']
            if c is s:
                continue
            for extremo_c in (c['p1'], c['p2']):
                d = math.hypot(extremo[0] - extremo_c[0], extremo[1] - extremo_c[1])
                if d <= tol_px and (mejor is None or item['anchoPx'] < mejor):
                    mejor = item['anchoPx']
    return mejor


def construir_contexto_con_pares(contexto_local, mpx, tol_min_m=_TOL_MIN_M, tol_max_m=_TOL_MAX_M, hoja_ids=None):
    """Precalcula, para cada segmento de contexto_local, su ancho real
    emparejado (o None si es linea suelta). O(n^2) sobre contexto_local
    -- mismo costo que hace cuerpo_cerrado_fusiona internamente, pero
    NO depende del par (grupo_a, grupo_b) que se este evaluando. Si se
    va a llamar cuerpo_cerrado_fusiona muchas veces sobre el mismo
    contexto_local (ej. una pasada de fusion sobre todos los muros de
    una pagina), calcular esto una sola vez y pasarlo via
    con_pares_precalculados evita repetir el trabajo O(n^2) en cada
    llamada -- ver _fusionar_muros_por_proximidad en la Celda 4.

    `hoja_ids`: set opcional ya calculado por identificar_hojas_de_puerta
    -- si no se pasa, se calcula aca mismo (Tipologia B, Convenciones_CAD
    D.2).

    PERFORMANCE (mismo bug real de identificar_hojas_de_puerta, 2026-08-26):
    `centrales_ids` tambien se calcula UNA vez aca y se pasa al loop, en
    vez de dejar que cada llamada de ancho_por_emparejamiento la
    recalcule -- mismo motivo, evita convertir un O(n^2) en O(n^3)."""
    if hoja_ids is None:
        hoja_ids = identificar_hojas_de_puerta(contexto_local, mpx, tol_min_m, tol_max_m)['hoja_ids']
    _centrales_cache = identificar_lineas_centrales(contexto_local, mpx, tol_min_m, tol_max_m)
    con_pares = []
    for s in contexto_local:
        r = ancho_por_emparejamiento([s], contexto_local, mpx, tol_min_m, tol_max_m, hoja_ids=hoja_ids, centrales_ids=_centrales_cache)
        if r['anchoPx'] is None:
            continue
        con_pares.append({'segmento': s, 'par': r['detalle'][0]['par'], 'anchoPx': r['anchoPx']})
    return con_pares


# ── Funcion principal ────────────────────────────────────────────────────
def cuerpo_cerrado_fusiona(grupo_a, grupo_b, contexto_local, mpx, margen_m=_MARGEN_CONTEXTO_M, piso_min_px=_param('D1-encuentro-de-brazos', 'piso_min_px', 2), con_pares_precalculados=None, tol_conector_esquina_m=_TOL_CONECTOR_ESQUINA_M):
    """Decide si grupo_a y grupo_b (2 grupos de segmentos candidatos a
    fusionarse en un solo muro) son en realidad el mismo cuerpo cerrado:
    ambos deben tener ancho real (propio o heredado de un conector, ver
    abajo) Y quedar conectados en el relleno solido tras cerrar
    micro-gaps con tolerancia proporcional al ancho minimo. Devuelve
    dict con 'fusiona' (bool), 'motivo', y los anchos medidos.

    CONECTORES DE ESQUINA/JOG (agregado 2026-08-23, confirmado por el
    arquitecto con datos reales de PdV -- casos MU02 y MU108): un grupo
    sin ancho propio no se rechaza automaticamente como linea suelta.
    Si al menos uno de sus extremos toca (dentro de tol_conector_esquina_m)
    el extremo de otro segmento del contexto local que SI tiene ancho
    real, se trata como conector real -- hereda ese ancho para el
    calculo de tolerancia, y se dibuja con trazo grueso propio en el
    relleno (ver _relleno_solido, segmentos_ancho_forzado) para que la
    conectividad se evalue correctamente a traves de el. Ademas
    participa del remate de esquinas como cualquier pierna real (ver
    GENERALIZADO 2026-08-23 en _relleno_solido) -- el cierre del vertice
    donde el conector se une a uno o mas brazos reales sale de la UNION
    de las extensiones pareadas entre todas las piernas que convergen
    ahi (reales y conectores), sin asumir que tengan el mismo ancho, que
    el angulo entre ellas sea recto, ni que sean solo 2 -- el poligono
    resultante (triangulo, cuadrilatero, o mas lados si convergen 3+)
    sale de esa union, no de una forma asumida de antemano. Solo se
    rechaza como "linea suelta" si NINGUN extremo toca a un vecino con
    ancho real -- ahi si es una linea aislada genuina (ventana, cota,
    referencia).

    `con_pares_precalculados`: opcional, resultado de
    construir_contexto_con_pares(contexto_local, mpx) ya calculado por
    el llamador -- evita recalcularlo en cada llamada cuando se evaluan
    muchos pares sobre el mismo contexto_local (ver esa funcion)."""
    # Tipologia B (Convenciones_CAD D.2): las hojas/vanos de puerta se
    # calculan UNA vez para todo el contexto y se usan tanto para
    # grupo_a/grupo_b como para construir_contexto_con_pares -- deben
    # ser consistentes entre si (un segmento no puede ser "hoja" para un
    # calculo y "muro" para otro dentro de la misma llamada).
    #
    # Se obtiene via clasificar_no_muro (Principio 3) en vez de llamar
    # identificar_hojas_de_puerta directo -- asi el paso 2 (clasificacion
    # en merito propio + deteccion de conflicto ventana<->hoja) corre
    # siempre que se evalua un par, no solo cuando alguien lo pide aparte.
    clasif_no_muro = clasificar_no_muro(contexto_local, mpx)
    hoja_ids = clasif_no_muro['sets_por_tipologia']['hoja_vano_puerta']

    # PRIORIDAD (2026-09-13, regla explicita del arquitecto): el cierre
    # geometrico real -- los grupos se TOCAN, sin separacion explicita --
    # decide antes que ancho_por_emparejamiento, nunca al reves. Caso real
    # que motivo esto (PdV, muesca MU30/MU31): ambos grupos comparten un
    # vertice exacto (0px de distancia) pero un candidato de ancho MAL
    # calculado (tol_min_m descartaba el par cercano real, dejando pasar
    # uno lejano e implausible como "valido") terminaba bloqueando la
    # fusion via un tol_px de dilatacion incoherente con la geometria real.
    # Un ancho equivocado no puede vetar un contacto que ya es un hecho.
    #
    # Excluye explicitamente 'ventana' y 'hoja_vano_puerta' confirmadas --
    # tocar la linea central de una ventana o la hoja de una puerta NO es
    # "mismo cuerpo" aunque compartan un punto (ver CASO 1/4b de
    # test_cuerpo_cerrado.py: el pilar/muro toca la ventana, pero eso es
    # justamente la separacion que la ventana representa). 'hoja_vano_
    # puerta_duda' NO se excluye aca -- sigue contando como muro candidato
    # (ver CASO 9, Convenciones_CAD D.9: una duda no es una exclusion).
    ventana_ids = clasif_no_muro['sets_por_tipologia']['ventana']
    _excluidos_contacto = ventana_ids | hoja_ids

    def _clave_segmento(s):
        return (tuple(s['p1']), tuple(s['p2']))

    # Coordenadas (no id()) de los segmentos excluidos -- grupo_a/grupo_b
    # pueden llegar como copias con las mismas coordenadas pero objetos
    # distintos a los de contexto_local (confirmado con test_cuerpo_
    # cerrado.py CASO 1/4b: el llamador construye grupo_b por separado del
    # contexto). En produccion (_fusionar_muros_por_proximidad) son el
    # mismo objeto, asi que esto no cambia nada ahi -- solo hace la funcion
    # robusta tambien cuando no lo son.
    _coords_excluidas = set()
    for s in contexto_local:
        if id(s) in _excluidos_contacto:
            _coords_excluidas.add(_clave_segmento(s))
            _coords_excluidas.add((tuple(s['p2']), tuple(s['p1'])))
    _grupo_a_es_wall_candidato = not any(_clave_segmento(s) in _coords_excluidas for s in grupo_a)
    _grupo_b_es_wall_candidato = not any(_clave_segmento(s) in _coords_excluidas for s in grupo_b)
    if _grupo_a_es_wall_candidato and _grupo_b_es_wall_candidato:
        tol_contacto_px = tol_conector_esquina_m / mpx
        if _grupos_se_tocan_directamente(grupo_a, grupo_b, tol_contacto_px):
            return {'fusiona': True,
                    'motivo': 'cuerpo cerrado: contacto geometrico directo (prioritario sobre ancho por emparejamiento)',
                    'anchoA': None, 'anchoB': None, 'tolPx': tol_contacto_px,
                    'conflictosTipologia': clasif_no_muro['conflictos']}
    ancho_a = ancho_por_emparejamiento(grupo_a, contexto_local, mpx, hoja_ids=hoja_ids)
    ancho_b = ancho_por_emparejamiento(grupo_b, contexto_local, mpx, hoja_ids=hoja_ids)

    con_pares = con_pares_precalculados if con_pares_precalculados is not None else construir_contexto_con_pares(contexto_local, mpx, hoja_ids=hoja_ids)
    segmentos_ancho_forzado = []

    if ancho_a['anchoPx'] is None:
        heredado = _ancho_heredado_de_conector(grupo_a, con_pares, mpx, tol_conector_esquina_m)
        if heredado is None:
            return {'fusiona': False, 'motivo': 'grupo A sin par paralelo -- linea suelta (ventana/ref), no muro',
                    'anchoA': ancho_a, 'anchoB': ancho_b, 'conflictosTipologia': clasif_no_muro['conflictos']}
        ancho_a = {'anchoPx': heredado, 'anchoM': heredado * mpx, 'detalle': ancho_a['detalle'], 'esConectorEsquina': True}
        # cada segmento del grupo hereda el ancho de SU PROPIO vecino mas
        # cercano (pueden ser distintos entre si, ver
        # _ancho_heredado_de_segmento) -- el heredado del grupo completo
        # (arriba) solo sirve de respaldo para un segmento interior de la
        # cadena que no toca directamente a ningun vecino con ancho real.
        segmentos_ancho_forzado.extend(
            (s, _ancho_heredado_de_segmento(s, con_pares, mpx, tol_conector_esquina_m) or heredado)
            for s in grupo_a
        )
    if ancho_b['anchoPx'] is None:
        heredado = _ancho_heredado_de_conector(grupo_b, con_pares, mpx, tol_conector_esquina_m)
        if heredado is None:
            return {'fusiona': False, 'motivo': 'grupo B sin par paralelo -- linea suelta (ventana/ref), no muro',
                    'anchoA': ancho_a, 'anchoB': ancho_b, 'conflictosTipologia': clasif_no_muro['conflictos']}
        ancho_b = {'anchoPx': heredado, 'anchoM': heredado * mpx, 'detalle': ancho_b['detalle'], 'esConectorEsquina': True}
        segmentos_ancho_forzado.extend(
            (s, _ancho_heredado_de_segmento(s, con_pares, mpx, tol_conector_esquina_m) or heredado)
            for s in grupo_b
        )

    ancho_min_px = min(ancho_a['anchoPx'], ancho_b['anchoPx'])
    tol_fusion_pct = _param('D1-encuentro-de-brazos', 'tol_fusion_pct', 0.10)
    tol_px = max(tol_fusion_pct * ancho_min_px, piso_min_px)

    margen_px = margen_m / mpx
    box = _bbox(list(grupo_a) + list(grupo_b), margen_px)

    bin_arr, w, h = _relleno_solido(con_pares, box, contexto_local, None, mpx, segmentos_ancho_forzado=segmentos_ancho_forzado or None)
    dil_bin = _dilatar(bin_arr, tol_px)

    pax, pay = _punto_medio(grupo_a)
    componente = _componente_desde_punto(dil_bin, pax - box['x0'], pay - box['y0'])

    conectado = _grupo_toca_componente(grupo_b, componente, box)

    if not conectado:
        return {'fusiona': False, 'motivo': 'no conectados incluso tras cerrar micro-gaps (hueco real, ej. puerta/ventana)',
                'anchoA': ancho_a, 'anchoB': ancho_b, 'tolPx': tol_px, 'conflictosTipologia': clasif_no_muro['conflictos']}

    motivo = 'cuerpo cerrado: conectados + ambos con ancho real emparejado'
    if ancho_a.get('esConectorEsquina') or ancho_b.get('esConectorEsquina'):
        motivo = 'cuerpo cerrado: conectados (conector de esquina/jog sin cara propia, ancho heredado del vecino)'
    return {'fusiona': True, 'motivo': motivo, 'anchoA': ancho_a, 'anchoB': ancho_b, 'tolPx': tol_px,
            'conflictosTipologia': clasif_no_muro['conflictos']}


def relleno_solido_de_contexto(contexto_local, mpx, margen_m=_MARGEN_CONTEXTO_M, objetivo=None):
    """Exporta el relleno solido real (sin dilatar) de un pool de
    segmentos, para dibujarlo directamente como prueba visual -- esto es
    lo que se debe mostrar como "cuerpo cerrado", no lineas de color
    sobre el trazo original. `objetivo`: subconjunto de contexto_local
    que se PINTA de verdad -- el resto solo aporta ancho real y evidencia
    de vertices de union, nunca se pinta a si mismo."""
    _validar_mpx(mpx, 'relleno_solido_de_contexto')
    _pool_bbox = objetivo if objetivo else contexto_local
    if not _pool_bbox:
        raise ValueError(
            "relleno_solido_de_contexto: objetivo y contexto_local estan ambos "
            "vacios -- no hay nada que rellenar (antes esto rompia con "
            "ValueError de _bbox sobre lista vacia, mensaje confuso)."
        )
    box = _bbox(_pool_bbox, margen_m / mpx)
    objetivo_ids = {id(s) for s in objetivo} if objetivo else None
    con_pares = construir_contexto_con_pares(contexto_local, mpx)
    bin_arr, w, h = _relleno_solido(con_pares, box, contexto_local, objetivo_ids, mpx)


def reconstruir_ventanas_por_jamba(muros_excluidos_por_referencia, mpx,
                                    tol_jamba_m=_TOL_JAMBA_M,
                                    ancho_min_m=_ANCHO_VENTANA_MIN_M,
                                    ancho_max_m=_ANCHO_VENTANA_MAX_M,
                                    max_spread_vertical_m=_MAX_SPREAD_VERTICAL_M):
    """Reconstruye ventanas reales desde 'muros_excluidos_por_referencia'
    (D3-ventana-reconstruccion-por-jamba, ver catalogo_tipologias.py).

    Motivacion (caso real MU03-13, Beauchef, Roadmap 2026-08-31/09-04):
    _detectar_lineas_referencia_periodicas excluye cadenas que colineales +
    gap acotado + span largo parecen deslinde/rasante -- pero una fila de
    ventanas repetidas de una fachada cae en ESE MISMO patron geometrico
    (varias lineas horizontales cortas, muy regulares, span largo si se
    mira la fachada completa). Cuando eso pasa, las 3 lineas reales de cada
    ventana (top/centro/bottom, la misma firma D1-D3 de
    identificar_lineas_centrales) quedan enterradas en el excluido en vez de
    llegar a muros_geo como fragmentos sueltos sin sentido (el bug real que
    motivo este fix: 11 fragmentos exportados como MU## sueltos, con
    ancho_linea_prom implausible, en vez de 6 ventanas reales).

    Metodo (generalizado, SIN coordenadas hardcodeadas -- el intento
    anterior de agrupar esos 11 fragmentos por CERCANIA dio una agrupacion
    asimetrica que el arquitecto confirmo incorrecta): agrupar las lineas
    horizontales excluidas por su PAR DE JAMBA (x0, x1) casi identico entre
    si (tol_jamba_m) -- las 3 lineas de una misma ventana comparten
    exactamente el mismo par de jamba, aunque esten en 3 alturas (y)
    distintas. Un grupo de EXACTAMENTE 3 lineas con el mismo par de jamba es
    una ventana (firma D1-D3: 2 bordes + 1 central) -- 2 lineas sin
    tercera es la firma de PUERTA (Convenciones_CAD.md), no se reconstruye
    aca; 1 o 4+ no tiene firma valida conocida, se ignora sin avisar en
    silencio (queda en muros_excluidos_por_referencia tal cual, disponible
    para diagnostico).

    Devuelve una lista de ventanas reconstruidas, cada una:
    {'id': 'VT01', 'x0': int, 'x1': int, 'y_top': int, 'y_bot': int,
     'ancho_m': float, 'segmentos_origen': ['MU19', 'MU21', 'MU20']}
    -- 'segmentos_origen' guarda la trazabilidad (que cadenas excluidas
    armaron esta ventana), nunca se fusiona en silencio.
    """
    _validar_mpx(mpx, 'reconstruir_ventanas_por_jamba')
    tol_jamba_px = tol_jamba_m / mpx

    def _es_horizontal(m):
        s = m['segmentos'][0]
        dx = s['p2'][0] - s['p1'][0]
        dy = s['p2'][1] - s['p1'][1]
        ang = abs(math.degrees(math.atan2(dy, dx))) % 180
        return ang < 10 or ang > 170

    def _bbox_x(m):
        xs = [p[0] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return min(xs), max(xs)

    def _y_extremos(m):
        ys = [p[1] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return min(ys), max(ys)

    horizontales = [m for m in muros_excluidos_por_referencia if _es_horizontal(m)]
    n = len(horizontales)
    bboxes = [_bbox_x(m) for m in horizontales]

    # Union-Find por par de jamba (x0, x1) casi identico -- NUNCA por
    # cercania/proximidad de fragmentos (ese es el metodo que ya fallo).
    parent = list(range(n))

    def _find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def _union(i, k):
        ri, rk = _find(i), _find(k)
        if ri != rk:
            parent[ri] = rk

    for i in range(n):
        for k in range(i + 1, n):
            if abs(bboxes[i][0] - bboxes[k][0]) <= tol_jamba_px and abs(bboxes[i][1] - bboxes[k][1]) <= tol_jamba_px:
                _union(i, k)

    grupos = {}
    for i in range(n):
        grupos.setdefault(_find(i), []).append(i)

    ventanas = []
    for idxs in grupos.values():
        if len(idxs) != 3:
            continue  # firma D1-D3 exige exactamente 2 bordes + 1 central
        miembros = [horizontales[i] for i in idxs]
        x0 = round(sum(bboxes[i][0] for i in idxs) / 3)
        x1 = round(sum(bboxes[i][1] for i in idxs) / 3)
        ancho_m = round((x1 - x0) * mpx, 2)
        if not (ancho_min_m <= ancho_m <= ancho_max_m):
            continue
        y_extremos = [_y_extremos(m) for m in miembros]
        y_top = min(y[0] for y in y_extremos)
        y_bot = max(y[1] for y in y_extremos)
        if (y_bot - y_top) * mpx > max_spread_vertical_m:
            continue
        ventanas.append({
            'x0': x0, 'x1': x1, 'y_top': y_top, 'y_bot': y_bot,
            'ancho_m': ancho_m,
            'segmentos_origen': [m['id'] for m in miembros],
        })

    ventanas.sort(key=lambda v: v['x0'])
    for i, v in enumerate(ventanas, 1):
        v['id'] = f'VT{i:02d}'
    return ventanas


def _distancia(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def _grupos_se_tocan_directamente(grupo_a, grupo_b, tol_px):
    """True si algun EXTREMO de un segmento de grupo_a coincide (dentro de
    tol_px) con un EXTREMO de un segmento de grupo_b -- vertice a vertice,
    el mismo criterio ya validado que usa _ancho_heredado_de_conector para
    reconocer un conector real ("al menos uno de sus extremos coincide...
    con el extremo de OTRO segmento").

    A proposito NO es punto-a-segmento (que si usa el gate de proximidad en
    _fusionar_muros_por_proximidad para PROPONER candidatos, incluyendo
    cruces en T real entre 2 muros) -- para esta decision especifica
    (contacto directo = prioridad sobre ancho_por_emparejamiento) un cruce
    en T generico es demasiado permisivo: confirmado con
    test_cuerpo_cerrado.py CASO 1/4b, donde el extremo de una linea central
    de ventana cae sobre la MITAD de la cara de un pilar/muro real -- eso
    es contacto, pero no es "mismo cuerpo". Un vertice compartido de
    verdad (esquina real donde 2+ piernas rematan juntas) si lo es -- ver
    cuerpo_cerrado_fusiona."""
    for sa in grupo_a:
        for pa in (sa['p1'], sa['p2']):
            for sb in grupo_b:
                for pb in (sb['p1'], sb['p2']):
                    if _distancia(pa, pb) <= tol_px:
                        return True
    return False


def _proyeccion_eje_largo(p1, p2):
    """Para un segmento aprox. horizontal o vertical: devuelve (es_horizontal,
    a1, a2, cruz) -- a1/a2 son el rango en el eje LARGO del segmento (x si es
    horizontal, y si es vertical), 'cruz' es la posicion (aprox. constante)
    en el eje corto. Segmentos claramente diagonales (arco de puerta, etc.)
    no deberian llegar aca -- ver filtro angular de segs_reales en Celda 4."""
    dx, dy = abs(p2[0] - p1[0]), abs(p2[1] - p1[1])
    if dx >= dy:
        return True, min(p1[0], p2[0]), max(p1[0], p2[0]), (p1[1] + p2[1]) / 2
    return False, min(p1[1], p2[1]), max(p1[1], p2[1]), (p1[0] + p2[0]) / 2


def _dividir_en_muros_por_union(segmentos, indices, tol_cluster_px, tol_diametro_cluster_px):
    """
    NUEVO (2026-08-08): reemplaza la exportacion directa de un grupo de
    conectividad completo como UN muro -- causaba el bug real 'Totalmente
    fusionado' descartado a mano por el arquitecto en PdV Nivel 1 (MU01: 638
    segmentos, 351m de 'largo total', cubriendo el 90% del plano). Los muros
    de un edificio SIEMPRE se tocan entre si en cada esquina y cruce en T, asi
    que con conectividad pura (Paso 2 de Celda 4) tarde o temprano toda la red
    de muros del piso cae en un solo componente -- confirmado que NO es un
    problema de calibrar TOL_MURO_PX (ver nota 2026-07-25: bajar a 12px no
    evito la fusion tampoco).

    Construye un grafo (nodo = extremo de segmento, agrupando los que caen
    cerca) y separa 'indices' en cadenas independientes, cortando SOLO en
    nodos donde 3+ segmentos se cruzan (cruce en T/X) o donde un segmento
    termina solo (punta suelta, grado 1). Los nodos de PASO (exactamente 2
    segmentos, ej. una esquina de 90 grados) NO cortan -- la cadena sigue de
    largo a traves de ellos, igual que el arquitecto traza un muro con
    quiebres en el portal (ver MU-A48 del backfill de PdV: 3 segmentos con 2
    quiebres de 90 grados, guardado como un solo muro, no tres).

    El clustering de nodos NO puede ser Union-Find transitivo con un radio
    fijo -- probado con los segmentos reales de MU01 (ver roadmap P1,
    diagnostico 2026-08-08): una fila de puntos mas o menos equiespaciados a
    lo largo de un muro recto (trazos duplicados, marcas de cota que cruzan
    el muro, etc.) se va encadenando de a poco hasta formar un solo 'nodo' de
    decenas de metros de diametro -- se midio un nodo de grado 222 con
    bounding box de 14.79m x 1.35m sobre datos reales, algo arquitectonicamente
    imposible. La correccion: cada cluster acumula un bounding box explicito
    y solo acepta un punto nuevo si el bbox RESULTANTE (no solo la distancia
    al punto mas cercano ya en el cluster) se mantiene bajo
    tol_diametro_cluster_px. Esto no elimina del todo los nodos de grado alto
    (siguen existiendo cruces reales complejos, hasta grado ~17 en los datos
    de prueba), pero los mantiene fisicamente compactos (bbox bajo 0.35m),
    consistente con un cruce real y no con una cadena de puntos lejanos.

    Filosofia (igual que el resto de este Paso 2, ver comentario de
    TOL_MURO_PX): el riesgo es asimetrico. Exportar de mas (un fragmento
    chico que en realidad es ruido, o parte de un muro que no se pudo unir)
    cuesta poco porque el arquitecto revisa y descarta en el portal --
    exportar de menos (perder geometria real) repite la regresion original.
    Por eso esta funcion NO aplica ningun piso de largo minimo por cadena: el
    backfill manual de PdV confirmo muros reales tan cortos como 0.14m
    (MU-A80) que un piso arbitrario habria descartado.
    """
    puntos = []
    for i in indices:
        puntos.append((i, segmentos[i]['p1']))
        puntos.append((i, segmentos[i]['p2']))
    n = len(puntos)
    clusters = []  # cada uno: {'idx_puntos': [...], 'minx','maxx','miny','maxy'}

    def _diag(minx, maxx, miny, maxy):
        return math.hypot(maxx - minx, maxy - miny)

    cell = max(1, tol_cluster_px)
    buckets = {}

    def _claves_bbox(minx, maxx, miny, maxy, margen):
        kx0, kx1 = int((minx - margen) // cell), int((maxx + margen) // cell)
        ky0, ky1 = int((miny - margen) // cell), int((maxy + margen) // cell)
        for kx in range(kx0, kx1 + 1):
            for ky in range(ky0, ky1 + 1):
                yield (kx, ky)

    def _registrar_cluster(ci):
        c = clusters[ci]
        for k in _claves_bbox(c['minx'], c['maxx'], c['miny'], c['maxy'], tol_cluster_px):
            buckets.setdefault(k, set()).add(ci)

    punto_a_cluster = [-1] * n
    for pi in range(n):
        _seg_i, (x, y) = puntos[pi]
        candidatos = set()
        for k in _claves_bbox(x, x, y, y, tol_cluster_px):
            candidatos.update(buckets.get(k, ()))
        mejor_idx, mejor_dist = -1, None
        for ci in candidatos:
            c = clusters[ci]
            dmin = min(_distancia(puntos[pj][1], (x, y)) for pj in c['idx_puntos'])
            if dmin > tol_cluster_px:
                continue
            nminx, nmaxx = min(c['minx'], x), max(c['maxx'], x)
            nminy, nmaxy = min(c['miny'], y), max(c['maxy'], y)
            if _diag(nminx, nmaxx, nminy, nmaxy) > tol_diametro_cluster_px:
                continue
            if mejor_dist is None or dmin < mejor_dist:
                mejor_dist, mejor_idx = dmin, ci
        if mejor_idx >= 0:
            c = clusters[mejor_idx]
            c['idx_puntos'].append(pi)
            c['minx'] = min(c['minx'], x); c['maxx'] = max(c['maxx'], x)
            c['miny'] = min(c['miny'], y); c['maxy'] = max(c['maxy'], y)
            punto_a_cluster[pi] = mejor_idx
            _registrar_cluster(mejor_idx)
        else:
            nuevo_idx = len(clusters)
            clusters.append({'idx_puntos': [pi], 'minx': x, 'maxx': x, 'miny': y, 'maxy': y})
            punto_a_cluster[pi] = nuevo_idx
            _registrar_cluster(nuevo_idx)

    # Nodo por segmento: cada indice original aporto 2 puntos consecutivos (2k, 2k+1)
    nodo_por_indice = {}
    for k, i in enumerate(indices):
        nodo_por_indice[i] = (punto_a_cluster[2 * k], punto_a_cluster[2 * k + 1])

    grado_nodo = [0] * len(clusters)
    for i in indices:
        a, b = nodo_por_indice[i]
        grado_nodo[a] += 1
        grado_nodo[b] += 1

    adyacencia = [[] for _ in clusters]
    for i in indices:
        a, b = nodo_por_indice[i]
        adyacencia[a].append((i, b))
        adyacencia[b].append((i, a))

    visitado = {i: False for i in indices}
    es_corte = [g != 2 for g in grado_nodo]

    def _caminar(nodo_inicio, seg_inicio):
        cadena = [seg_inicio]
        visitado[seg_inicio] = True
        a, b = nodo_por_indice[seg_inicio]
        nodo_actual = b if a == nodo_inicio else a
        while not es_corte[nodo_actual]:
            siguiente = None
            for (seg_j, otro) in adyacencia[nodo_actual]:
                if not visitado[seg_j]:
                    siguiente = (seg_j, otro)
                    break
            if siguiente is None:
                break  # cierre de anillo (todo grado 2) -- ver bucle de abajo
            seg_j, otro = siguiente
            cadena.append(seg_j)
            visitado[seg_j] = True
            nodo_actual = otro
        return cadena

    cadenas = []
    for nodo in range(len(clusters)):
        if not es_corte[nodo]:
            continue
        for (seg_i, _otro) in adyacencia[nodo]:
            if visitado[seg_i]:
                continue
            cadenas.append(_caminar(nodo, seg_i))
    # anillos cerrados sin ningun nodo de corte (simbolos como burbujas de eje)
    for i in indices:
        if visitado[i]:
            continue
        a, _b = nodo_por_indice[i]
        cadenas.append(_caminar(a, i))

    return cadenas


def _sufijo_letras(k):
    """Sufijo tipo columna de planilla (a, b, ..., z, aa, ab, ...) para el k-esimo
    (0-indexado) pedazo de un muro cortado -- a diferencia de ciclar sobre
    'abcdefghijklmnopqrstuvwxyz' con modulo (el metodo anterior), nunca repite
    un sufijo ya usado sin importar cuantos pedazos salgan. Necesario en la
    practica: un muro sobre-fusionado (ver docstring de
    _dividir_en_muros_por_union) puede producir 100+ pedazos al cortarlo por
    ventanas -- con modulo, MU01a/MU01b/... se repetian cada 26 pedazos (caso
    real confirmado, Campo Lindo 2026-09-13: MU01 corto en 113 pedazos),
    dejando ids duplicados en muros_geo."""
    k += 1
    letras = ''
    while k > 0:
        k -= 1
        letras = chr(ord('a') + k % 26) + letras
        k //= 26
    return letras


def cortar_muros_por_ventanas(muros_geo, ventanas, mpx, tol_muro_px, tol_diametro_cluster_px,
                               tol_cross_m=_TOL_CROSS_M):
    """
    NUEVO (2026-09-05, a pedido explicito del usuario -- 'la ventana rompe
    el muro'): hasta esta version, una ventana se identificaba y se sacaba
    de muros_geo (D1-D3 / reconstruccion por jamba), pero las lineas de CARA
    del muro (las que tambien son el borde de la ventana en este estilo de
    dibujo) seguian corriendo continuas a traves de la ventana -- la
    ventana quedaba marcada ENCIMA del muro, no como un corte real. Igual
    que una puerta es 'separacion explicita' que corta la fusion
    (_punto_cerca_de_puerta), una ventana confirmada debe cortar la
    GEOMETRIA del muro, no solo bloquear que se fusione.

    Corre DESPUES de que muros_geo ya esta armado y fusionado (mismo
    patron post-proceso que _detectar_lineas_referencia_periodicas) --
    para cada segmento de cada muro, si el rango de una ventana (mismo eje,
    misma banda de cruce dentro de tol_cross_m) se superpone a su rango,
    se recorta esa porcion. Si el corte deja el muro en 2+ pedazos
    desconectados, se re-evalua con la MISMA logica de
    _dividir_en_muros_por_union (cortar solo en cruces reales/puntas
    sueltas, nunca en nodos de paso) -- nunca se asume que cortar un
    segmento corta el muro entero; una red con mas de un camino (ej. la
    entrada tipo 'MU01' que agrupa todo un piso) puede seguir conectada
    por otro lado.

    `ventanas`: lista de dicts normalizados -- ver _normalizar_ventana_
    para_corte mas abajo. `tol_cross_m` es el tope de distancia perpendicular
    para considerar que un segmento de muro es la cara de ESA ventana (no
    una pared de otra habitacion que por casualidad comparte rango en el
    eje largo) -- por defecto el mismo tope que D1-ancho-emparejamiento
    (0.9m, espesor de muro plausible), generoso pero acotado.

    Devuelve (resultado, mapa_corte). `mapa_corte` es {id_original: [ids_nuevos]}
    -- SOLO para los muros cuyo id cambio de verdad (se partieron en 2+
    pedazos con sufijo a/b/c... o desaparecieron del todo, lista vacia). Un
    muro recortado que queda en UNA sola pieza conserva su id original y no
    aparece aca -- cualquier referencia externa (ej. muro_asociado_id de una
    puerta) sigue siendo valida sin cambios. El llamador usa este mapa para
    reasociar esas referencias por proximidad geometrica real (nunca por un
    umbral arbitrario) contra los pedazos nuevos -- ver caso real Campo
    Lindo 2026-09-05, PG01 con muro_asociado_id='MU03' que una ventana
    partio en 2.
    """
    tol_cross_px = tol_cross_m / mpx
    resultado = []
    mapa_corte = {}
    n_muros_cortados = 0
    n_piezas_totales = 0

    for m in muros_geo:
        piezas_por_segmento = []
        cambiado = False
        for s in m['segmentos']:
            es_horiz, a1, a2, cruz = _proyeccion_eje_largo(s['p1'], s['p2'])
            piezas = [(a1, a2)]
            for v in ventanas:
                if v['horizontal'] != es_horiz:
                    continue
                if abs(v['cruz'] - cruz) > tol_cross_px:
                    continue
                vo1, vo2 = v['along']
                nuevas_piezas = []
                for (b1, b2) in piezas:
                    if vo2 <= b1 or vo1 >= b2:
                        nuevas_piezas.append((b1, b2))
                        continue
                    cambiado = True
                    if vo1 > b1:
                        nuevas_piezas.append((b1, vo1))
                    if vo2 < b2:
                        nuevas_piezas.append((vo2, b2))
                piezas = nuevas_piezas
            for (b1, b2) in piezas:
                if (b2 - b1) < 1:  # pieza degenerada (<1px), la ventana se comio el segmento entero
                    continue
                if es_horiz:
                    piezas_por_segmento.append({'p1': [round(b1), round(cruz)], 'p2': [round(b2), round(cruz)]})
                else:
                    piezas_por_segmento.append({'p1': [round(cruz), round(b1)], 'p2': [round(cruz), round(b2)]})

        if not cambiado:
            resultado.append(m)
            continue

        n_muros_cortados += 1
        if not piezas_por_segmento:
            # la ventana se comio TODO el muro (caso real: un muro cuya
            # unica geometria era, en si misma, la ventana) -- no queda
            # nada real que exportar como muro; se avisa, no se descarta
            # en silencio.
            print(f"  ⚠ Muro {m.get('id')} desaparecio por completo al cortar ventana(s) que lo atravesaban "
                  f"-- no quedo ningun tramo real fuera de la(s) ventana(s)")
            mapa_corte[m['id']] = []
            continue

        cadenas_idx = _dividir_en_muros_por_union(piezas_por_segmento, list(range(len(piezas_por_segmento))),
                                                   tol_muro_px, tol_diametro_cluster_px)
        n_piezas_totales += len(cadenas_idx)
        ids_nuevos = []
        for k, idxs in enumerate(cadenas_idx):
            segs_cadena = [piezas_por_segmento[i] for i in idxs]
            largo = sum(_distancia(s['p1'], s['p2']) for s in segs_cadena) * mpx
            nuevo_id = m['id'] if len(cadenas_idx) == 1 else f"{m['id']}{_sufijo_letras(k)}"
            ids_nuevos.append(nuevo_id)
            resultado.append({
                'id': nuevo_id,
                'segmentos': segs_cadena,
                'largo_total_m': round(largo, 2),
                'ancho_linea_prom': m.get('ancho_linea_prom'),
                'estado': m.get('estado'),
            })
        if len(cadenas_idx) != 1:
            mapa_corte[m['id']] = ids_nuevos

    if n_muros_cortados:
        print(f'  ✓ Ventana rompe muro: {n_muros_cortados} muro(s) cortados por ventanas confirmadas, '
              f'resultando en {n_piezas_totales} tramo(s) (algunos muros se dividen en 2+, otros quedan '
              f'conectados por otro camino y siguen como 1 solo)')
    return resultado, mapa_corte


def reasociar_puertas_tras_corte(puertas_geo, muros_geo, mapa_corte, mpx):
    """
    NUEVO (2026-09-13, caso real Campo Lindo -- ver catalogo_tipologias.py
    D3-ventana-corta-muro): cuando cortar_muros_por_ventanas() parte un muro
    en 2+ pedazos (o lo hace desaparecer del todo), cualquier puerta que
    tuviera ese id como muro_asociado_id queda apuntando a un id que ya no
    existe. Repara esa referencia en el propio `puertas_geo` (in-place) y la
    devuelve para conveniencia del llamador.

    Criterio de reasociacion: puramente geometrico, nunca un umbral arbitrario
    de distancia -- de los pedazos nuevos que vienen del mismo muro original
    (`mapa_corte[muro_asociado_id]`), se elige el que tiene el punto mas
    cercano a los `puntos_union` de la puerta (donde su arco toca la pared
    real) -- son casi siempre 0-2px de distancia real porque ese punto de
    union se calculo justamente pegado al muro. Si el muro desaparecio del
    todo (`mapa_corte[id] == []`) no hay ningun pedazo real para reasociar:
    muro_asociado_id pasa a None, avisado explicitamente, nunca en silencio.
    """
    if not mapa_corte:
        return puertas_geo
    muros_por_id = {m['id']: m for m in muros_geo}

    def _dist_a_muro(punto, muro):
        return min(min(_distancia(punto, s['p1']), _distancia(punto, s['p2'])) for s in muro['segmentos'])

    for pg in puertas_geo:
        mid = pg.get('muro_asociado_id')
        if mid not in mapa_corte:
            continue
        candidatos_ids = mapa_corte[mid]
        if not candidatos_ids:
            print(f"  ⚠ Puerta {pg['id']} tenia muro_asociado_id={mid!r}, que desaparecio por completo al cortar "
                  f"ventana(s) -- muro_asociado_id pasa a None (no queda ningun pedazo real para reasociar)")
            pg['muro_asociado_id'] = None
            continue
        if len(candidatos_ids) == 1:
            pg['muro_asociado_id'] = candidatos_ids[0]
            continue
        puntos_ref = pg.get('puntos_union') or [pt for s in pg['segmentos'] for pt in (s['p1'], s['p2'])]
        mejor_id, mejor_dist = None, None
        for cid in candidatos_ids:
            m_cand = muros_por_id.get(cid)
            if not m_cand:
                continue
            d = min(_dist_a_muro(p, m_cand) for p in puntos_ref)
            if mejor_dist is None or d < mejor_dist:
                mejor_dist, mejor_id = d, cid
        print(f"  ⚠ Puerta {pg['id']} tenia muro_asociado_id={mid!r}, que una ventana corto en {len(candidatos_ids)} "
              f"pedazos ({candidatos_ids}) -- reasociada por proximidad geometrica real a {mejor_id!r} "
              f"(dist={round((mejor_dist or 0) * mpx, 3)}m)")
        pg['muro_asociado_id'] = mejor_id
    return puertas_geo


def _normalizar_ventana_para_corte(v):
    """Convierte una ventana (simple o reconstruida por jamba, formas de
    dict distintas -- ver ventanas_simples_por_linea_central y
    reconstruir_ventanas_por_jamba) al formato comun que necesita
    cortar_muros_por_ventanas: {'horizontal':bool, 'along':(a1,a2), 'cruz':c}."""
    if 'x0' in v:  # ventana por jamba -- siempre horizontal en el diseño actual
        return {'horizontal': True, 'along': (v['x0'], v['x1']), 'cruz': (v['y_top'] + v['y_bot']) / 2}
    # ventana simple -- 1 segmento, cualquier orientacion
    s = v['segmentos'][0]
    es_horiz, a1, a2, cruz = _proyeccion_eje_largo(s['p1'], s['p2'])
    return {'horizontal': es_horiz, 'along': (a1, a2), 'cruz': cruz}
