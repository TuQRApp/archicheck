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
"""
import math
import numpy as np
import cv2


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


def identificar_lineas_centrales(contexto, mpx, tol_min_m=0.08, tol_max_m=0.9, tol_simetria_m=0.05):
    """Devuelve un set de id(segmento) -- identidad de objeto, no de
    valor, igual que el Set de objetos del prototipo .mjs."""
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
def ancho_por_emparejamiento(grupo, contexto, mpx, tol_min_m=0.08, tol_max_m=0.9):
    """Para cada segmento de `grupo`, busca en `contexto` (pool completo
    de segmentos cercanos, incluye el propio grupo) un segmento aprox.
    paralelo a distancia perpendicular entre tol_min_m y tol_max_m. Si lo
    encuentra, ese segmento tiene "ancho real" (viene de 2 caras). Si
    ninguno de los segmentos del grupo tiene par, el grupo entero es
    linea suelta."""
    tol_min_px = tol_min_m / mpx
    tol_max_px = tol_max_m / mpx
    # lineas centrales de ventana: se excluyen por completo del pool de
    # posibles "caras de muro" -- ni pueden ser s, ni pueden ser
    # aceptadas como c de otra linea.
    centrales_ids = identificar_lineas_centrales(contexto, mpx, tol_min_m, tol_max_m)
    mejor_ancho = None
    detalle = []
    for s in grupo:
        if id(s) in centrales_ids:
            detalle.append({'segmento': s, 'anchoPx': None, 'par': None})
            continue
        ang_s = math.degrees(_angulo(s)) % 180
        candidatos = []
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
    return {
        's_p1': s['p1'], 's_p2': s['p2'], 's_largo_m': round(largo_s * mpx, 3),
        'top_candidatos': candidatos[:top_n],
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


def _relleno_solido(contexto_con_pares, box, todos_los_segmentos, objetivo_ids, mpx, tol_min_m=0.08, tol_max_m=0.9):
    """Rellena el AREA SOLIDA real de cada segmento con par -- el
    cuadrilatero entre el segmento y su cara enfrentada (equivale a
    "verter agua entre las 2 caras"), mas el remate de esquinas
    (exteriores E interiores) donde 2+ piernas de ancho real se juntan
    en un vertice -- ver docstring completo en _tmp_cuerpo_cerrado.mjs
    (funcion rellenoSolido)."""
    w, h = _dims(box)
    bin_arr = np.zeros((h, w), dtype=np.uint8)

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


def construir_contexto_con_pares(contexto_local, mpx, tol_min_m=0.08, tol_max_m=0.9):
    """Precalcula, para cada segmento de contexto_local, su ancho real
    emparejado (o None si es linea suelta). O(n^2) sobre contexto_local
    -- mismo costo que hace cuerpo_cerrado_fusiona internamente, pero
    NO depende del par (grupo_a, grupo_b) que se este evaluando. Si se
    va a llamar cuerpo_cerrado_fusiona muchas veces sobre el mismo
    contexto_local (ej. una pasada de fusion sobre todos los muros de
    una pagina), calcular esto una sola vez y pasarlo via
    con_pares_precalculados evita repetir el trabajo O(n^2) en cada
    llamada -- ver _fusionar_muros_por_proximidad en la Celda 4."""
    con_pares = []
    for s in contexto_local:
        r = ancho_por_emparejamiento([s], contexto_local, mpx, tol_min_m, tol_max_m)
        if r['anchoPx'] is None:
            continue
        con_pares.append({'segmento': s, 'par': r['detalle'][0]['par'], 'anchoPx': r['anchoPx']})
    return con_pares


# ── Funcion principal ────────────────────────────────────────────────────
def cuerpo_cerrado_fusiona(grupo_a, grupo_b, contexto_local, mpx, margen_m=0.6, piso_min_px=2, con_pares_precalculados=None):
    """Decide si grupo_a y grupo_b (2 grupos de segmentos candidatos a
    fusionarse en un solo muro) son en realidad el mismo cuerpo cerrado:
    ambos deben tener ancho real emparejado (no ser lineas sueltas tipo
    ventana/referencia) Y quedar conectados en el relleno solido tras
    cerrar micro-gaps con tolerancia proporcional al ancho minimo.
    Devuelve dict con 'fusiona' (bool), 'motivo', y los anchos medidos.

    `con_pares_precalculados`: opcional, resultado de
    construir_contexto_con_pares(contexto_local, mpx) ya calculado por
    el llamador -- evita recalcularlo en cada llamada cuando se evaluan
    muchos pares sobre el mismo contexto_local (ver esa funcion)."""
    ancho_a = ancho_por_emparejamiento(grupo_a, contexto_local, mpx)
    ancho_b = ancho_por_emparejamiento(grupo_b, contexto_local, mpx)

    if ancho_a['anchoPx'] is None:
        return {'fusiona': False, 'motivo': 'grupo A sin par paralelo -- linea suelta (ventana/ref), no muro',
                'anchoA': ancho_a, 'anchoB': ancho_b}
    if ancho_b['anchoPx'] is None:
        return {'fusiona': False, 'motivo': 'grupo B sin par paralelo -- linea suelta (ventana/ref), no muro',
                'anchoA': ancho_a, 'anchoB': ancho_b}

    ancho_min_px = min(ancho_a['anchoPx'], ancho_b['anchoPx'])
    tol_px = max(0.10 * ancho_min_px, piso_min_px)

    margen_px = margen_m / mpx
    box = _bbox(list(grupo_a) + list(grupo_b), margen_px)

    con_pares = con_pares_precalculados if con_pares_precalculados is not None else construir_contexto_con_pares(contexto_local, mpx)
    bin_arr, w, h = _relleno_solido(con_pares, box, contexto_local, None, mpx)
    dil_bin = _dilatar(bin_arr, tol_px)

    pax, pay = _punto_medio(grupo_a)
    componente = _componente_desde_punto(dil_bin, pax - box['x0'], pay - box['y0'])

    conectado = _grupo_toca_componente(grupo_b, componente, box)

    if not conectado:
        return {'fusiona': False, 'motivo': 'no conectados incluso tras cerrar micro-gaps (hueco real, ej. puerta/ventana)',
                'anchoA': ancho_a, 'anchoB': ancho_b, 'tolPx': tol_px}

    return {'fusiona': True, 'motivo': 'cuerpo cerrado: conectados + ambos con ancho real emparejado',
            'anchoA': ancho_a, 'anchoB': ancho_b, 'tolPx': tol_px}


def relleno_solido_de_contexto(contexto_local, mpx, margen_m=0.6, objetivo=None):
    """Exporta el relleno solido real (sin dilatar) de un pool de
    segmentos, para dibujarlo directamente como prueba visual -- esto es
    lo que se debe mostrar como "cuerpo cerrado", no lineas de color
    sobre el trazo original. `objetivo`: subconjunto de contexto_local
    que se PINTA de verdad -- el resto solo aporta ancho real y evidencia
    de vertices de union, nunca se pinta a si mismo."""
    box = _bbox(objetivo if objetivo else contexto_local, margen_m / mpx)
    objetivo_ids = {id(s) for s in objetivo} if objetivo else None
    con_pares = construir_contexto_con_pares(contexto_local, mpx)
    bin_arr, w, h = _relleno_solido(con_pares, box, contexto_local, objetivo_ids, mpx)
    return {'box': box, 'w': w, 'h': h, 'bin': bin_arr}
