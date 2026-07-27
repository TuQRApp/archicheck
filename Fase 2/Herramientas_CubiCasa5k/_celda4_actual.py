# ══════════════════════════════════════════════════════════
# CELDA 4 — PROCESAR TODAS LAS PÁGINAS
#   Por cada página: Claude Vision + extracción vectorial + OpenCV + cruce
# ══════════════════════════════════════════════════════════
import base64, json, requests, re, math
import cv2, numpy as np
from datetime import datetime

WORKER_URL = 'https://archicheck-worker.nestragues.workers.dev'

# FIX 2026-07-26 (auditoria completa contra oguc_articulos.json, fuente verificada):
#   - 'pasillo' y 'escalera' citaban el articulo EQUIVOCADO uno del otro: 4.2.2 es
#     "escaleras_minimos" (no pasillos) y 4.2.4 es "carga_ocupacion" (tabla de
#     personas/m2, no ancho de escalera). El ancho minimo real de escalera de uso
#     comun (1.20 m) esta en 4.2.2; el ancho minimo real de pasillo/corredor de uso
#     comun (1.20 m) esta en 4.2.5 ("ancho_vias_evacuacion": "...el ancho minimo de
#     corredores de uso comun es 1,20 m"). Los VALORES (1.20 m ambos) eran correctos,
#     solo la cita estaba cruzada -- ya corregido abajo.
#   - Los minimos de AREA (dormitorio/sala/living/comedor/cocina/bano) citaban Art.
#     4.1.7 OGUC, que verificamos es INTEGRAMENTE sobre accesibilidad universal (ruta
#     accesible, rampas, puertas, ascensores, banos accesibles) -- no contiene NINGUN
#     minimo de superficie por tipo de recinto. Se revisaron ademas 4.1.1/4.1.2/4.1.3/
#     4.5.7 (los unicos otros articulos cargados que mencionan dormitorio/sala/living)
#     y tampoco fijan m2 minimos -- solo alturas, ventilacion e iluminacion. No se
#     encontro en ninguna fuente cargada una base real para estos 6 valores de area;
#     mismo patron de error que la formula de rampa fabricada por Revi (ver roadmap).
#   - FIX 2026-07-26 (b): investigado DS49 (Fondo Solidario de Eleccion de Vivienda,
#     2011, Cuadro Normativo Abreviado MINVU) como candidato. CONFIRMADO QUE NO ES LA
#     FUENTE: (1) los valores no coinciden -- DS49 exige Estar+Comedor COMBINADO 9.40 m2
#     (no separa 'sala'/'living' 10.0 de 'comedor' 8.0 como hace este dict), Dormitorio
#     Principal 7.20 m2 / Segundo Dormitorio 7.00 m2 (no un unico 'dormitorio' 8.0),
#     Cocina 4.00-5.00 m2 (mas exigente que nuestro 3.0, o sea nuestro umbral dejaria
#     pasar cocinas que DS49 rechazaria), Bano 2.50-3.50 m2 (mas exigente que nuestro
#     1.5, mismo problema). (2) Aunque coincidieran, DS49 SOLO aplica a proyectos del
#     programa de vivienda social subsidiada -- no es una norma general OGUC, no aplica
#     a un restaurante ni a vivienda de mercado. Conclusion: estos 6 valores no tienen
#     fuente identificada, ni en OGUC ni en DS49 -- se mantienen SIN VERIFICAR.
#     Se dejan ACTIVOS pero marcados como SIN VERIFICAR -- no se inventa una cita ni
#     se borra el chequeo, se marca la incertidumbre (mismo criterio que
#     'sin_nombre_confirmar' para recintos). Pendiente: decidir si se retiran del motor
#     de reglas o se dejan solo como referencia no vinculante mientras no haya fuente.
OGUC_REGLAS = {
    'dormitorio': (8.0,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'sala'      : (10.0, None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'living'    : (10.0, None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'comedor'   : (8.0,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'cocina'    : (3.0,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    'bano'      : (1.5,  None, 'SIN VERIFICAR — sin base confirmada en OGUC (revisar antes de confiar)'),
    # FIX 2026-07-26 (d) -- auditado 'pasillo' y 'escalera' contra oguc_pdf.json
    # (extraccion completa, 770 articulos). Confirmado que 4.2.1/4.2.3/4.2.4 SI
    # coinciden textualmente con lo que ya teniamos -- la numeracion no esta rota
    # en general. Pero:
    #   - 'escalera' citaba Art. 4.2.2 -- FALSO. El Art. 4.2.2 real es sobre
    #     "cambio de destino" (autorizacion, informe de profesional), no tiene nada
    #     que ver con escaleras. El articulo real es 4.2.10: "La cantidad y ancho
    #     minimo requerido para las escaleras que forman parte de una via de
    #     evacuacion, conforme a la carga de ocupacion del area servida" -- es una
    #     TABLA por carga de ocupacion (hasta 50 personas: 1,10 m; 51-100: 1,20 m;
    #     101-150: 1,30 m; 151-200: 1,40 m; 201-250: 1,50 m; sobre 250 se exigen 2
    #     escaleras), NO un valor fijo de 1,20 m. No calculamos carga de ocupacion
    #     todavia (requeriria area servida x factor m2/persona del Art. 4.2.4) --
    #     se usa 1,10 m como PISO conservador (el minimo de la tabla, aplica
    #     siempre sin importar ocupacion) en vez de 1,20 m: asi solo se marca
    #     incumplimiento cuando es inequivocamente insuficiente para cualquier
    #     ocupacion, sin arriesgar falsos positivos contra escaleras que si
    #     cumplen para su carga real (que hoy no medimos). Pendiente: implementar
    #     carga de ocupacion real para aplicar la tabla completa.
    #   - 'pasillo' cita Art. 4.2.5 -- el articulo SI es el correcto en tema (el
    #     texto real confirma que el ancho de vias de evacuacion, exceptuando
    #     escaleras, se determina "en base a la carga de ocupacion de la
    #     superficie que sirve"), pero el valor especifico "1,20 m para corredores
    #     de uso comun" que veniamos usando NO aparece textualmente en el articulo
    #     -- no se encontro en esta pasada la tabla equivalente a la de escaleras
    #     (4.2.10) para pasillos/corredores generales. Se mantiene el valor por
    #     ahora (es un minimo de uso muy extendido en la practica) pero queda
    #     marcado como parcialmente verificado, no confirmado al 100%.
    'pasillo'   : (None, 1.20, 'Art. 4.2.5 OGUC — ancho min corredores de uso comun 1,20 m (cita y tema confirmados; valor exacto no verificado al 100% -- ver comentario)'),
    'escalera'  : (None, 1.10, 'Art. 4.2.10 OGUC — tabla por carga de ocupacion, 1,10 m es el piso minimo (hasta 50 personas); puede exigir hasta 1,50 m o 2 escaleras segun ocupacion, no calculado todavia'),
    # FIX 2026-07-26 (c) -- CORRECCION IMPORTANTE tras auditar contra oguc_pdf.json
    # (extraccion completa del PDF oficial, 770 articulos, distinta de la fuente
    # curada oguc_articulos.json que se uso para el fix anterior). El Art. 4.1.7 N°2
    # real es MUCHO mas largo y matizado que el resumen que teniamos: el ancho de
    # rampa NO es un valor fijo de 1,50 m para todas las rampas -- el texto real dice
    # "su ancho debera corresponder a la via de evacuacion que enfrenta o de la que
    # es parte" (variable, 1,10-1,50 m segun el punto 1 de este mismo articulo,
    # 1,50 m especificamente para rutas que conducen a recintos con atencion de
    # publico) Y "las rampas que NO pertenezcan a esas vias del edificio podran
    # tener un ancho minimo de 0,90 m". No hay forma de saber desde la geometria
    # sola si una rampa es "parte de la ruta obligatoria" o no. Se mantiene 1,50 m
    # como default porque el caso de prueba (rampa de acceso a un restaurante,
    # recinto con atencion de publico) cae en ese supuesto -- pero es una
    # simplificacion, no la regla general. Ver tambien el fix de PENDIENTE mas abajo
    # en el bloque "if tipo == 'rampa':", que SI se corrigio a la formula real.
    'rampa'     : (None, 1.50, 'Art. 4.1.7 N°2 OGUC — ancho min 1,50 m (supone ruta a recinto con atencion de publico; puede ser 0,90-1,50 m segun el caso, ver comentario)'),
}

def mejorar_contraste_nitidez(img_rgb):
    """
    CAMBIO 2026-07-23: se descarto la hipotesis de que el 0% de deteccion de
    ventanas fuera un problema de prompt (se probo en vivo, ver roadmap P1) —
    pero el contraste/nitidez de la imagen sigue siendo sospechoso: los
    simbolos de ventana son lineas finas dentro de un vano de muro, y el
    relleno de color de los recintos reduce el contraste justo ahi.
    Esta funcion NO reemplaza la imagen original — genera una segunda version
    con CLAHE (contraste adaptativo) + nitidez, que se manda como imagen
    adicional a Claude, no en vez de la original.
    """
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    contraste = clahe.apply(gray)
    kernel_nitidez = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    nitido = cv2.filter2D(contraste, -1, kernel_nitidez)
    return cv2.cvtColor(nitido, cv2.COLOR_GRAY2RGB)

def _distancia(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def _agrupar_segmentos(segmentos, radio_busqueda_px, criterio_fn):
    """
    NUEVO 2026-07-24 (reemplaza el enfoque por ancho/patron de guiones de
    path['dashes'], ambos descartados con datos reales — ver roadmap P1,
    diagnostico 2026-07-24: el ancho de linea de un muro y de un simbolo
    tienen la MISMA distribucion en este PDF, y 'dashes' siempre da solido).

    Agrupa indices de 'segmentos' (cada uno con 'p1','p2' en px) en
    componentes conexas via Union-Find, usando criterio_fn(s1, s2) -> bool
    para decidir si dos segmentos se conectan. radio_busqueda_px acota la
    busqueda de candidatos con un bucketing espacial simple, para no
    comparar los ~3000 segmentos de una pagina entre si (O(n^2) es
    demasiado lento en Python puro).
    """
    n = len(segmentos)
    parent = list(range(n))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    cell = max(1, radio_busqueda_px)
    buckets = {}
    def claves(s):
        xs = [s['p1'][0], s['p2'][0]]; ys = [s['p1'][1], s['p2'][1]]
        kx0, kx1 = int((min(xs) - radio_busqueda_px) // cell), int((max(xs) + radio_busqueda_px) // cell)
        ky0, ky1 = int((min(ys) - radio_busqueda_px) // cell), int((max(ys) + radio_busqueda_px) // cell)
        for kx in range(kx0, kx1 + 1):
            for ky in range(ky0, ky1 + 1):
                yield (kx, ky)

    for i, s in enumerate(segmentos):
        for k in claves(s):
            buckets.setdefault(k, []).append(i)

    evaluados = set()
    for i, s in enumerate(segmentos):
        candidatos = set()
        for k in claves(s):
            candidatos.update(buckets.get(k, []))
        for j in candidatos:
            if j <= i or find(i) == find(j):
                continue
            par = (i, j)
            if par in evaluados:
                continue
            evaluados.add(par)
            if criterio_fn(s, segmentos[j]):
                union(i, j)

    grupos = {}
    for i in range(n):
        r = find(i)
        grupos.setdefault(r, []).append(i)
    return list(grupos.values())

def _span_grupo(segmentos, indices):
    """Diagonal del bounding box de todos los extremos del grupo — mide qué
    tan 'extendido' esta la cadena de segmentos conectados, no la cantidad."""
    xs, ys = [], []
    for i in indices:
        xs += [segmentos[i]['p1'][0], segmentos[i]['p2'][0]]
        ys += [segmentos[i]['p1'][1], segmentos[i]['p2'][1]]
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))

def _angulo_segmento(s):
    dx = s['p2'][0] - s['p1'][0]
    dy = s['p2'][1] - s['p1'][1]
    return math.degrees(math.atan2(dy, dx)) % 180

def extraer_datos_vectoriales(pdf_page, zoom, mpx, crop_px=None, max_largo_trazo_m=3.0):
    """
    Extrae texto y trazos vectoriales directamente del PDF (objeto fitz.Page),
    en vez de adivinarlos desde pixeles. Convierte las coordenadas al mismo
    espacio de pixeles que usa el resto del pipeline (aplicando ZOOM), y
    recorta a crop_px = (x1,y1,x2,y2) en pixeles si se especifica.

    REDISEÑO 2026-07-24 — clasifica cada segmento tipo 'l' en 3 categorias
    por CONECTIVIDAD y GEOMETRIA, no por largo ni ancho de linea individual
    (ambos descartados empiricamente, ver nota arriba):
      1. MURO (protegido, nunca se borra): el segmento pertenece a una
         componente conexa (segmentos que comparten extremo, como una
         cadena de tramos de muro doblando en esquinas) cuyo span total
         supera ~1.5m. Un tramo corto de esquina se protege igual porque
         esta conectado a una cadena larga — esto es lo que faltaba y
         causo la regresion del intento anterior (borrar por largo
         individual punzaba esquinas de muro real).
      2. LINEA DISCONTINUA (se borra): segmentos NO protegidos como muro,
         agrupados por colinealidad + gap regular (patron de guiones
         dibujado a mano con trazos cortos separados, ya que el atributo
         path['dashes'] no sirve en este PDF — siempre da solido).
      3. TRAZO/SIMBOLO (se borra, candidato a puerta/ventana/artefacto):
         el resto — segmentos cortos aislados, curvas bezier, rectangulos
         chicos (iconos de sanitarios, arcos de puerta, etc.)

    Retorna:
      'cotas_texto'         : [{'texto','x','y','w','h'}, ...] — reemplaza el OCR
      'trazos'               : [{'tipo':'l'|'c'|'re'|'qu','puntos':[(x,y),...],'ancho_linea'}, ...]
      'lineas_discontinuas'  : [{'puntos':[(x,y),...],'ancho_linea'}, ...]
      'n_texto', 'n_trazos', 'n_muro_protegido', 'n_lineas_discontinuas', 'n_cadenas_discontinuas'
    """
    def to_px(pt):
        return (pt.x * zoom, pt.y * zoom)

    def dentro_crop(x, y):
        if crop_px is None:
            return True
        cx1, cy1, cx2, cy2 = crop_px
        return cx1 <= x <= cx2 and cy1 <= y <= cy2

    def ajustar(x, y):
        if crop_px is None:
            return (x, y)
        cx1, cy1, _, _ = crop_px
        return (x - cx1, y - cy1)

    # ── Texto: cotas y nombres de recintos, con posicion exacta ──
    # Reemplaza la necesidad de OCR (PaddleOCR) para PDF vectorizados.
    cotas_texto = []
    texto_dict = pdf_page.get_text('dict')
    for block in texto_dict.get('blocks', []):
        for line in block.get('lines', []):
            for span in line.get('spans', []):
                texto = span['text'].strip()
                if not texto:
                    continue
                bbox = span['bbox']  # (x0,y0,x1,y1) en puntos PDF
                x0, y0 = bbox[0] * zoom, bbox[1] * zoom
                x1, y1 = bbox[2] * zoom, bbox[3] * zoom
                cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
                if not dentro_crop(cx, cy):
                    continue
                ax0, ay0 = ajustar(x0, y0)
                cotas_texto.append({
                    'texto': texto,
                    'x': round(ax0), 'y': round(ay0),
                    'w': round(x1 - x0), 'h': round(y1 - y0),
                })

    # ── Paso 1: recolectar todos los segmentos 'l' (linea recta, 2 puntos)
    #    dentro del crop, con su ancho — son los unicos candidatos a "muro
    #    hecho de tramos cortos" o "cadena de guiones". 'c'/'re'/'qu' se
    #    procesan aparte, mas abajo, con reglas propias mas simples.
    segmentos_l = []
    otros_items = []  # (op, puntos_px, ancho_linea) para 'c'/'re'/'qu'
    UMBRAL_MURO_M = 1.5
    UMBRAL_MURO_PX = UMBRAL_MURO_M / mpx if mpx else float('inf')

    for path in pdf_page.get_drawings():
        ancho_linea = path.get('width') or 0
        for item in path.get('items', []):
            op = item[0]
            if op == 'l':
                p1, p2 = to_px(item[1]), to_px(item[2])
                if not (dentro_crop(*p1) or dentro_crop(*p2)):
                    continue
                segmentos_l.append({'p1': p1, 'p2': p2, 'ancho_linea': ancho_linea})
            elif op == 'c':
                pts = [to_px(p) for p in item[1:5]]
                cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
                if dentro_crop(cx, cy):
                    otros_items.append(('c', pts, ancho_linea))
            elif op == 're':
                r = item[1]
                pts = [to_px(r.tl), to_px(r.tr), to_px(r.br), to_px(r.bl)]
                cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
                if dentro_crop(cx, cy):
                    otros_items.append(('re', pts, ancho_linea))
            elif op == 'qu':
                q = item[1]
                pts = [to_px(q.ul), to_px(q.ur), to_px(q.lr), to_px(q.ll)]
                cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
                if dentro_crop(cx, cy):
                    otros_items.append(('qu', pts, ancho_linea))

    # ── Paso 2: proteger como MURO cualquier segmento conectado (comparte
    #    extremo con tolerancia) a una cadena cuyo span total supere
    #    UMBRAL_MURO_M. Un tramo corto de esquina se protege igual porque
    #    esta conectado a la cadena larga del resto del muro.
    # AJUSTE 2026-07-25: la version con TOL_MURO_PX=12 (~7cm) NO resolvio la
    # regresion -- el recinto gigante (~141/155 m2) siguio apareciendo
    # identico tras aplicar el rediseño por conectividad (ver roadmap P1,
    # verif_combinado_pag2-1/2.png). Hipotesis con evidencia indirecta: los
    # huecos reales entre tramos de muro en las uniones/esquinas de este PDF
    # son mas grandes que 12px, asi que esos tramos no se encadenaban entre
    # si y quedaban sin proteger igual que antes. Se sube el margen bastante
    # (12->35px, ~7cm->20cm) porque el riesgo es asimetrico: proteger de mas
    # como muro cuesta poco (un simbolo real no se borra), proteger de menos
    # repite la regresion catastrofica de fusionar exterior+interior.
    TOL_MURO_PX = 35
    def _tocan(s1, s2):
        return (_distancia(s1['p1'], s2['p1']) <= TOL_MURO_PX or
                _distancia(s1['p1'], s2['p2']) <= TOL_MURO_PX or
                _distancia(s1['p2'], s2['p1']) <= TOL_MURO_PX or
                _distancia(s1['p2'], s2['p2']) <= TOL_MURO_PX)

    grupos_conectividad = _agrupar_segmentos(segmentos_l, TOL_MURO_PX, _tocan) if segmentos_l else []
    protegido = [False] * len(segmentos_l)
    n_muro_protegido = 0
    for grupo in grupos_conectividad:
        if _span_grupo(segmentos_l, grupo) >= UMBRAL_MURO_PX:
            for i in grupo:
                protegido[i] = True
                n_muro_protegido += 1

    # ── Paso 2.5 (NUEVO 2026-07-27): desproteger ACHURADO -- relleno de
    #    rampas/escaleras dibujado como muchos trazos cortos PARALELOS entre
    #    si (no colineales -- eso ya lo cubre el Paso 3 de guiones). Cada
    #    trazo individual de un achurado, o una cadena corta de 2-3 que por
    #    casualidad comparten un extremo, puede superar el span de 1.5m del
    #    Paso 2 sin ser parte de un muro real -- eso fragmentaba el interior
    #    de la rampa/escalera en muchas piezas chicas, dejando como
    #    'recinto_geo' solo el fragmento mas grande sobreviviente (visto en
    #    el run real del 2026-07-26: "Rampa Acceso Universal" midio 0.22m de
    #    ancho segun OpenCV cuando el plano indica 1.3m -- bbox de solo
    #    39x797px, una tira, no el area completa de la rampa).
    #    Señal distintiva de achurado vs. muro real: MUCHOS segmentos (5+)
    #    con angulo similar entre si, cercanos en el espacio (no necesitan
    #    tocarse por los extremos como un muro, un achurado se dibuja como
    #    trazos sueltos y paralelos). Un muro real rara vez tiene 5+ tramos
    #    paralelos sin ortogonales cerca (las esquinas rompen el patron).
    #
    #    RIESGO IDENTIFICADO Y MITIGADO: este mismo plano tiene achurado
    #    diagonal real sobre TRAMOS DE MURO para indicar "Se retira"
    #    (amarillo) / "Se construye" (rojo) -- ver simbologia del plano. Un
    #    achurado asi corre PEGADO a lo largo del muro (banda angosta, ancho
    #    ~= espesor de muro, 10-20cm) mientras que el achurado de RELLENO de
    #    una rampa/escalera cubre un AREA 2D completa (ambas dimensiones
    #    grandes, ancho de rampa ~1-1.5m). Se agrega un chequeo de
    #    "extension perpendicular" al angulo dominante del grupo: si los
    #    segmentos estan comprimidos en una banda angosta (<80px perpendicular)
    #    se asume achurado DE MURO (banda) y NO se desprotege -- solo se
    #    desprotege si el grupo cubre una extension perpendicular amplia
    #    (relleno 2D real). 80px equivale a ~47cm en el plano de prueba (MPX
    #    de este PDF, calculado desde 'largo_max_m'/bbox_h_px de la rampa) --
    #    el equivalente real en cm varia con la escala/DPI de cada plano, no
    #    es un valor fijo; queda con margen razonable sobre un espesor de
    #    muro tipico (10-20cm) para este caso, pero conviene revisar si se
    #    usa con planos a una escala muy distinta. Sin esto, el fix podria
    #    borrar muros reales marcados con achurado de intervencion y repetir
    #    la regresion catastrofica de fusion de recintos ya vista antes esta
    #    sesion.
    TOL_ACHURADO_ANGULO_DEG = 8
    RADIO_ACHURADO_PX = 60
    MIN_SEGMENTOS_ACHURADO = 5
    MIN_EXTENSION_PERPENDICULAR_PX = 80

    def _cerca_y_paralelo(s1, s2):
        dif_ang = abs(_angulo_segmento(s1) - _angulo_segmento(s2))
        dif_ang = min(dif_ang, 180 - dif_ang)
        if dif_ang > TOL_ACHURADO_ANGULO_DEG:
            return False
        m1 = ((s1['p1'][0] + s1['p2'][0]) / 2, (s1['p1'][1] + s1['p2'][1]) / 2)
        m2 = ((s2['p1'][0] + s2['p2'][0]) / 2, (s2['p1'][1] + s2['p2'][1]) / 2)
        return _distancia(m1, m2) <= RADIO_ACHURADO_PX

    def _angulo_promedio_180(angs):
        # FIX 2026-07-27 (encontrado en re-revision, antes de correr en Colab):
        # promediar angulos con suma directa (sum(angs)/len(angs)) esta MAL para
        # una magnitud 180-periodica como esta (orientacion de linea sin
        # direccion, ver _angulo_segmento). Si el grupo mezcla, por ejemplo,
        # ~2 grados y ~178 grados -- que son casi la MISMA orientacion, apenas
        # 4 grados de diferencia real -- la suma directa promedia a 90 grados,
        # perpendicular a ambas, un resultado completamente equivocado. Se usa
        # la media circular estandar para datos axiales: duplicar el angulo
        # (180-periodico -> 360-periodico), promediar como vector (seno/coseno),
        # volver a la mitad.
        suma_sin = sum(math.sin(math.radians(2 * a)) for a in angs)
        suma_cos = sum(math.cos(math.radians(2 * a)) for a in angs)
        return (math.degrees(math.atan2(suma_sin, suma_cos)) / 2) % 180

    def _extension_perpendicular(grupo):
        angs = [_angulo_segmento(segmentos_l[i]) for i in grupo]
        ang_prom = _angulo_promedio_180(angs)
        rad_perp = math.radians(ang_prom + 90)
        ux, uy = math.cos(rad_perp), math.sin(rad_perp)
        proys = []
        for i in grupo:
            s = segmentos_l[i]
            mx = (s['p1'][0] + s['p2'][0]) / 2
            my = (s['p1'][1] + s['p2'][1]) / 2
            proys.append(mx * ux + my * uy)
        return max(proys) - min(proys)

    # REVERTIDO 2026-07-27 -- confirmado en Colab que este fix causa una
    # regresion grave: en la corrida real (archicheck_geometrico_pdv_26jul_2232)
    # desprotegio 569 de 1521 segmentos (37%) en una pagina y 579 en la otra --
    # muy por encima de lo que cualquier achurado real de rampa/escalera podria
    # explicar. Volvio a aparecer la fusion catastrofica de ~140m2 que ya se
    # habia peleado antes esta sesion (el filtro de 'recintos_excluidos_por_
    # fusion' la atrapo esta vez y no corrompio el resultado final, pero el
    # hecho de que reaparezca confirma que se estan rompiendo muros reales en
    # algun lado, no solo achurado). Causa raiz identificada: la salvaguarda de
    # "extension perpendicular" (pensada para exigir que el achurado cubra un
    # area 2D LOCAL y acotada) no protege contra el encadenamiento TRANSITIVO
    # de Union-Find -- si hay una cadena de segmentos de angulo parecido
    # conectando puntos distantes entre si (muy probable en un plano
    # rectilineo, donde la mayoria de los muros estan a 0/90 grados), el grupo
    # completo puede terminar abarcando gran parte de la pagina, y un grupo asi,
    # disperso, tambien "aprueba" el chequeo de extension perpendicular amplia
    # -- no porque haya relleno 2D real en ningun punto local, sino porque el
    # grupo mismo es enorme y disperso. Es un error de diseño (el supuesto de
    # "cluster local acotado" no se sostiene con agrupamiento transitivo), no
    # un problema de calibrar mejor los umbrales -- se desactiva la
    # desproteccion en vez de intentar otro ajuste sin poder probarlo. Queda
    # ACTIVO el conteo diagnostico (n_achurado_desprotegido) para ver cuantos
    # segmentos habria tocado, sin tocarlos, por si sirve para un rediseño
    # futuro (ej. exigir que el cluster ademas sea compacto en su propio
    # bounding box, no solo que el ultimo par de vecinos este cerca).
    ACHURADO_DESPROTEGER_ACTIVO = False
    grupos_achurado = _agrupar_segmentos(segmentos_l, RADIO_ACHURADO_PX, _cerca_y_paralelo) if segmentos_l else []
    n_achurado_desprotegido = 0
    for grupo in grupos_achurado:
        if len(grupo) < MIN_SEGMENTOS_ACHURADO:
            continue
        if _extension_perpendicular(grupo) < MIN_EXTENSION_PERPENDICULAR_PX:
            continue  # banda angosta -- probable achurado de muro, no se toca
        if not ACHURADO_DESPROTEGER_ACTIVO:
            n_achurado_desprotegido += len([i for i in grupo if protegido[i]])
            continue
        for i in grupo:
            if protegido[i]:
                protegido[i] = False
                n_muro_protegido -= 1
                n_achurado_desprotegido += 1

    # ── Paso 3: entre los NO protegidos, agrupar por colinealidad + gap
    #    regular (patron de guiones dibujado a mano, ya que path['dashes']
    #    no sirve en este PDF — ver diagnostico 2026-07-24 en el roadmap).
    TOL_DASH_GAP_PX = 40
    TOL_DASH_ANGULO_DEG = 5
    UMBRAL_DASH_M = 1.0
    UMBRAL_DASH_PX = UMBRAL_DASH_M / mpx if mpx else float('inf')
    MIN_SEGMENTOS_CADENA = 4

    idx_no_protegidos = [i for i in range(len(segmentos_l)) if not protegido[i]]
    segmentos_candidatos = [segmentos_l[i] for i in idx_no_protegidos]

    def _colineal_y_cerca(s1, s2):
        dif_ang = abs(_angulo_segmento(s1) - _angulo_segmento(s2))
        dif_ang = min(dif_ang, 180 - dif_ang)
        if dif_ang > TOL_DASH_ANGULO_DEG:
            return False
        return (_distancia(s1['p1'], s2['p1']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p1'], s2['p2']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p2'], s2['p1']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p2'], s2['p2']) <= TOL_DASH_GAP_PX)

    grupos_dash = _agrupar_segmentos(segmentos_candidatos, TOL_DASH_GAP_PX, _colineal_y_cerca) if segmentos_candidatos else []

    es_dash_local = [False] * len(segmentos_candidatos)
    muestras_cadenas = []
    for grupo in grupos_dash:
        if len(grupo) < MIN_SEGMENTOS_CADENA:
            continue
        span = _span_grupo(segmentos_candidatos, grupo)
        if span < UMBRAL_DASH_PX:
            continue
        largos = [_distancia(segmentos_candidatos[i]['p1'], segmentos_candidatos[i]['p2']) for i in grupo]
        promedio = sum(largos) / len(largos)
        variacion = (max(largos) - min(largos)) / promedio if promedio else 999
        if variacion > 0.9:  # muy irregular, no parece un patron de guiones real
            continue
        for i in grupo:
            es_dash_local[i] = True
        if len(muestras_cadenas) < 5:
            muestras_cadenas.append({'n_segmentos': len(grupo), 'span_m': round(span * mpx, 2)})

    # ── Paso 4: armar las 3 listas de salida ────────────────────
    trazos = []
    lineas_discontinuas = []

    for local_i, s in enumerate(segmentos_candidatos):
        p1a = ajustar(*s['p1']); p2a = ajustar(*s['p2'])
        item = {
            'puntos': [(round(p1a[0]), round(p1a[1])), (round(p2a[0]), round(p2a[1]))],
            'ancho_linea': round(s['ancho_linea'], 2),
        }
        if es_dash_local[local_i]:
            lineas_discontinuas.append(item)
        else:
            trazos.append({'tipo': 'l', **item})

    # AJUSTE 2026-07-25: 're'/'qu' (rectangulo/quad) nunca participan de la
    # cadena de conectividad de 'l' -- antes solo se protegian si su propio
    # bbox ya era grande, lo que deja a cualquier 'qu'/'re' chico sin
    # proteccion pase lo que pase, aunque sea parte de un muro real (solo
    # hay 41 'qu' en este PDF, ninguno 're' -- ver diagnostico 2026-07-24).
    # Se decide NO borrarlos nunca: son pocos, el riesgo de que alguno sea
    # muro real no vale el ahorro de limpieza de simbolos. Las curvas ('c')
    # si se siguen borrando siempre -- un muro nunca se dibuja como curva.
    for op, pts, ancho_linea in otros_items:
        if op != 'c':
            continue  # 're'/'qu' protegidos siempre, ver nota arriba
        pts_ajustados = [ajustar(x, y) for x, y in pts]
        trazos.append({
            'tipo': op,
            'puntos': [(round(x), round(y)) for x, y in pts_ajustados],
            'ancho_linea': round(ancho_linea, 2),
        })

    return {
        'cotas_texto': cotas_texto,
        'trazos': trazos,
        'lineas_discontinuas': lineas_discontinuas,
        'n_texto': len(cotas_texto),
        'n_trazos': len(trazos),
        'n_muro_protegido': n_muro_protegido,
        'n_achurado_desprotegido': n_achurado_desprotegido,
        'n_lineas_discontinuas': len(lineas_discontinuas),
        'n_cadenas_discontinuas': len(muestras_cadenas),
        'diagnostico_muestra_cadenas_discontinuas': muestras_cadenas,
    }

# ══════════════════════════════════════════════════════════
# NUEVO 2026-07-27 — Deteccion automatica de figuras por lamina
#   Reduce el crop/escala manual: analiza la lamina COMPLETA (sin recortar)
#   y sugiere que poner en PAGINAS_Y_ESCALAS, en vez de que el usuario abra
#   el PDF y adivine fracciones de crop a ojo.
# ══════════════════════════════════════════════════════════
def detectar_figuras_lamina(imagen_rgb, numero_pagina=None, worker_url=WORKER_URL, max_dim=1600):
    """
    OPCIONAL, no se llama automaticamente desde el loop principal todavia.

    Por que existe: hoy el crop pasa ANTES que Claude Vision vea la imagen
    (ver 'plano_full' -> 'plano' mas abajo) -- Claude nunca mira la lamina
    completa, solo el recorte de planta que el usuario ya eligio a mano. Por
    eso 'escalas_detectadas' del prompt principal casi siempre trae una sola
    escala: no es que Claude haya confirmado que la lamina completa tiene una
    sola escala, es que solo le mostramos un pedazo que ya sabemos que la
    tiene.

    Que hace: manda la lamina COMPLETA (imagen_rgb, sin recortar) a Claude
    Vision y le pide identificar cada dibujo/figura presente -- planta,
    corte, elevacion, emplazamiento, cuadro, detalle -- con su tipo, bbox
    relativo (0-1) y escala asociada. Con eso arma e imprime una sugerencia
    de tuplas para pegar en PAGINAS_Y_ESCALAS (celda anterior).

    NO reemplaza el crop manual todavia, y NO se aplica solo -- requiere
    revision humana antes de usarse, mismo criterio que el resto del
    pipeline (nada de Claude Vision se usa sin validar). Casos como
    emplazamiento/corte/elevacion/cuadro NO necesitan escala de este tipo
    (no alimentan el motor de reglas geometrico) -- se listan igual, para
    que el usuario sepa que hay en la lamina, pero no generan sugerencia de
    PAGINAS_Y_ESCALAS (esa lista es solo para figuras tipo 'planta').

    Uso (antes de definir PAGINAS_Y_ESCALAS, con 'paginas' ya cargado):
        detectar_figuras_lamina(paginas[1], numero_pagina=2)   # pagina 2 (indice 1)
    'numero_pagina' es solo para que la sugerencia impresa quede lista para
    copiar y pegar (con el numero real en vez de un placeholder) -- si se
    omite, la sugerencia usa 'PAGINA_PLANTA' como texto a completar a mano.

    Devuelve la lista cruda de figuras detectadas (sin procesar), por si se
    quiere inspeccionar directamente en vez de leer los prints.
    """
    print('  → Detectando figuras en la lámina completa (sin recortar)...')
    h_full, w_full = imagen_rgb.shape[:2]
    factor_resize = min(1.0, max_dim / max(h_full, w_full))
    img_deteccion = (cv2.resize(imagen_rgb, (int(w_full * factor_resize), int(h_full * factor_resize)))
                      if factor_resize < 1.0 else imagen_rgb)

    _, buf = cv2.imencode('.png', cv2.cvtColor(img_deteccion, cv2.COLOR_RGB2BGR))
    img_b64 = base64.standard_b64encode(buf.tobytes()).decode()

    PROMPT_FIGURAS = (
        'Eres un asistente que indexa laminas de planos arquitectonicos chilenos. '
        'Esta imagen es una lamina COMPLETA de un expediente de planos -- normalmente '
        'contiene varios dibujos distintos en la misma hoja (ej. una o mas plantas de '
        'arquitectura de distintos niveles, un plano de emplazamiento, cortes, '
        'elevaciones, cuadros de superficie o normativos, detalles constructivos), cada '
        'uno posiblemente a una escala grafica distinta.\n'
        'Devuelve SOLO JSON puro sin markdown ni texto extra:\n'
        '{"figuras":[{"tipo":"planta|corte|elevacion|emplazamiento|cuadro|detalle|otro",'
        '"descripcion":"ej. Situacion Propuesta Nivel 1, Corte A-A, Cuadro de Superficies",'
        '"escala":"ej. 1:50, o null si no aplica (cuadros/detalles sin escala grafica propia)",'
        '"bbox_relativo":{"x1":0.0,"y1":0.0,"x2":1.0,"y2":1.0},'
        '"confianza":"alta|media|baja"}]}\n'
        'bbox_relativo: recuadro que encierra SOLO ese dibujo (no toda la lamina), como '
        'fraccion del ancho/alto total de la imagen (0.0=borde superior/izquierdo, '
        '1.0=borde inferior/derecho), con margen suficiente para no cortar cotas o textos '
        'que pertenezcan a ese dibujo. Si una lamina tiene mas de un nivel de planta '
        'dibujado por separado (ej. Nivel 1 y Nivel 2), son figuras DISTINTAS, cada una '
        'con su propio bbox_relativo -- no las mezcles en una sola. Si dos dibujos se '
        'superponen o es dificil separar donde termina uno y empieza otro, usa '
        'confianza "baja" en vez de inventar un limite.'
    )

    try:
        resp = requests.post(
            worker_url,
            json={'messages': [{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': img_b64}},
                {'type': 'text', 'text': PROMPT_FIGURAS}
            ]}]},
            timeout=120, stream=True
        )
        resp.raise_for_status()
        raw_text = ''
        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode('utf-8') if isinstance(line, bytes) else line
            if not line.startswith('data: '):
                continue
            payload = line[6:].strip()
            if not payload or payload == '[DONE]':
                continue
            try:
                evt = json.loads(payload)
                if (evt.get('type') == 'content_block_delta' and
                        evt.get('delta', {}).get('type') == 'text_delta'):
                    raw_text += evt['delta']['text']
            except Exception:
                pass
        m = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not m:
            print('  ⚠ Deteccion de figuras: sin JSON en la respuesta')
            return []
        figuras = json.loads(m.group()).get('figuras', [])
    except Exception as e:
        print(f'  ⚠ Error detectando figuras: {e}')
        return []

    print(f'  ✓ {len(figuras)} figura(s) detectada(s):')
    sugerencias_planta = []
    for f in figuras:
        tipo = f.get('tipo', '?')
        desc = f.get('descripcion', '')
        esc  = f.get('escala') or '—'
        conf = f.get('confianza', '?')
        bbox = f.get('bbox_relativo') or {}
        print(f'     [{tipo:<11}] {desc}  |  escala {esc}  |  confianza {conf}  |  '
              f'bbox ({bbox.get("x1")}, {bbox.get("y1")}, {bbox.get("x2")}, {bbox.get("y2")})')
        if tipo == 'planta' and esc != '—' and all(k in bbox for k in ('x1', 'y1', 'x2', 'y2')):
            sugerencias_planta.append((desc, esc, (bbox['x1'], bbox['y1'], bbox['x2'], bbox['y2']), conf))

    if sugerencias_planta:
        pagina_txt = str(numero_pagina) if numero_pagina is not None else 'PAGINA_PLANTA'
        print('\n  📋 Sugerencia para PAGINAS_Y_ESCALAS — REVISAR antes de usar, no se aplica solo:')
        for desc, esc, crop_sug, conf in sugerencias_planta:
            nota = '' if conf == 'alta' else f'  # confianza {conf}, revisar a ojo antes de confiar'
            print(f"     ({pagina_txt}, '{esc}', {crop_sug}),{nota}  # {desc}")
    else:
        print('  (sin figuras tipo "planta" con escala detectada — nada que sugerir para PAGINAS_Y_ESCALAS)')

    return figuras

resultados_paginas = []
viz_pages          = []

entries = [(e[0], e[1], e[2] if len(e) > 2 else None) for e in PAGINAS_Y_ESCALAS]

# Precalcular cuántas veces aparece cada página (para nombres de archivo únicos)
page_count = {}
for pag, _, _ in entries:
    page_count[pag] = page_count.get(pag, 0) + 1
page_idx_so_far = {}

for (PAGINA_PLANTA, ESCALA_MANUAL, crop) in entries:
    print(f'\n{"="*56}')
    print(f'  Página {PAGINA_PLANTA}  —  escala {ESCALA_MANUAL}')
    if crop:
        print(f'  Recorte: ({crop[0]:.0%},{crop[1]:.0%}) → ({crop[2]:.0%},{crop[3]:.0%})')
    print(f'{"="*56}')

    if PAGINA_PLANTA < 1 or PAGINA_PLANTA > len(paginas):
        print(f'  ⚠ Página {PAGINA_PLANTA} fuera de rango (PDF tiene {len(paginas)} páginas). Saltando.')
        continue

    # Índice único por entrada (resuelve el caso de 2 crops de la misma página)
    entry_idx = len(resultados_paginas)
    page_idx_so_far[PAGINA_PLANTA] = page_idx_so_far.get(PAGINA_PLANTA, 0) + 1
    sub_idx = page_idx_so_far[PAGINA_PLANTA]
    fname_tag = (f'pag{PAGINA_PLANTA}-{sub_idx}'
                 if page_count[PAGINA_PLANTA] > 1
                 else f'pag{PAGINA_PLANTA}')

    plano_full = paginas[PAGINA_PLANTA - 1]
    h_f, w_f   = plano_full.shape[:2]

    # Aplicar recorte si está definido
    if crop:
        x1f, y1f, x2f, y2f = crop
        x1 = int(x1f * w_f); y1 = int(y1f * h_f)
        x2 = int(x2f * w_f); y2 = int(y2f * h_f)
        plano = plano_full[y1:y2, x1:x2].copy()
    else:
        plano = plano_full

    h, w  = plano.shape[:2]
    scale_ratio = int(ESCALA_MANUAL.split(':')[1])
    MPX   = 0.0254 * scale_ratio / DPI
    M2_PX = MPX ** 2
    print(f'  {w}x{h} px analizados  |  {MPX:.5f} m/px  |  1m = {int(1/MPX):,} px')

    # ── 1. Claude Vision ────────────────────────────────────
    print('  → Claude Vision...')
    _, buf_orig = cv2.imencode('.png', cv2.cvtColor(plano, cv2.COLOR_RGB2BGR))
    img_b64_orig = base64.standard_b64encode(buf_orig.tobytes()).decode()

    # Segunda imagen: version con contraste/nitidez mejorada, como referencia
    # adicional para que Claude vuelva a mirar puertas/ventanas dificiles de ver.
    plano_mejorado = mejorar_contraste_nitidez(plano)
    _, buf_mejor = cv2.imencode('.png', cv2.cvtColor(plano_mejorado, cv2.COLOR_RGB2BGR))
    img_b64_mejor = base64.standard_b64encode(buf_mejor.tobytes()).decode()

    # FIX 2026-07-26: campos agregados tras comparar contra el analisis real de
    # Revi sobre este mismo plano ("Revision planos Revi completo.txt", ver
    # roadmap seccion "Benchmark directo Revi vs ArchiCheck"). Revi demostro
    # leer: sentido de apertura de puertas, circulo de giro en banos accesibles,
    # el cuadro de superficies oficial de la lamina, y detectar cuando una
    # lamina trae mas de una escala. Estos 4 campos son SOLO de lectura/extraccion
    # (igual que Revi) — la diferenciacion real esta en que, mas abajo, cruzamos
    # 'cuadro_superficies_oficial' contra el area medida por OpenCV (geometria
    # independiente), y 'circulo_giro_m' contra una regla de accesibilidad, en
    # vez de solo transcribir lo que dice el plano.
    PROMPT = (
        f'Eres revisor DOM experto en OGUC, LGUC y DDU (Chile). '
        f'Analiza este plano arquitectonico a escala {ESCALA_MANUAL}.\n'
        'Te doy DOS imagenes del mismo plano: la primera es la imagen original a color, '
        'la segunda es una version con contraste y nitidez realzados (en blanco y negro) — '
        'usa la segunda especificamente para buscar puertas y ventanas que sean dificiles '
        'de distinguir en la primera por el relleno de color de los recintos.\n'
        'Devuelve SOLO JSON puro sin markdown ni texto extra:\n'
        '{"tipo_plano":"planta|corte|elevacion|detalle|otro",'
        '"uso_del_proyecto":"restaurante|vivienda|oficina|comercio|equipamiento|otro",'
        '"nivel":"descripcion o null",'
        '"escalas_detectadas":["1:50"],'
        '"recintos":[{"nombre":"...","tipo":"sala|cocina|bano|bodega|pasillo|terraza|bar|oficina|rampa|escalera|otro",'
        '"etiqueta_en_plano":"texto exacto o null","area_estimada_m2":null,"ancho_estimado_m":null,'
        '"cx_relativo":0.5,"cy_relativo":0.5,"cumple_oguc":true,"observacion":"o null",'
        '"es_accesible_universal":false,"circulo_giro_1_50_detectado":null}],'
        '"elementos_detectados":{"puertas":0,"ventanas":0,"escaleras":0,"rampas":0,"salidas_emergencia":0},'
        '"puertas_detalle":[{"ubicacion_o_recinto":"...","ancho_estimado_m":null,'
        '"sentido_apertura":"interior|exterior|no_determinado"}],'
        '"cuadro_superficies_oficial":[{"recinto":"texto exacto del cuadro","area_m2_declarada":null}],'
        '"incumplimientos_oguc":[{"articulo":"","descripcion":"","gravedad":"ALTA|MEDIA|BAJA",'
        '"recinto_afectado":"","medida_requerida":"","medida_detectada":""}],'
        '"documentos_que_faltan":[],"resumen_ejecutivo":""}\n'
        'cx_relativo/cy_relativo: centroide del recinto como fraccion del ancho/alto '
        '(0.0=izquierda/arriba, 1.0=derecha/abajo). '
        'escalas_detectadas: TODAS las escalas graficas o numericas presentes en la lamina '
        '(una lamina puede traer varias escalas para distintos dibujos). '
        'cuadro_superficies_oficial: SOLO si el plano trae una tabla/cuadro impreso de '
        'superficies por recinto — dejar lista vacia si no existe tal cuadro (no inventar). '
        'circulo_giro_1_50_detectado: true/false solo si es_accesible_universal es true '
        '(bano/recinto rotulado como universal, accesible o para PMR); null en caso contrario.'
    )

    analisis = {
        'tipo_plano': '?', 'uso_del_proyecto': '?', 'nivel': '?',
        'escalas_detectadas': [], 'recintos': [], 'elementos_detectados': {},
        'puertas_detalle': [], 'cuadro_superficies_oficial': [],
        'incumplimientos_oguc': [], 'documentos_que_faltan': [],
        'resumen_ejecutivo': 'Sin analisis semantico'
    }
    try:
        resp = requests.post(
            WORKER_URL,
            json={'messages': [{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': img_b64_orig}},
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': img_b64_mejor}},
                {'type': 'text', 'text': PROMPT}
            ]}]},
            timeout=180, stream=True
        )
        resp.raise_for_status()
        raw_text = ''
        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode('utf-8') if isinstance(line, bytes) else line
            if not line.startswith('data: '):
                continue
            payload = line[6:].strip()
            if not payload or payload == '[DONE]':
                continue
            try:
                evt = json.loads(payload)
                if (evt.get('type') == 'content_block_delta' and
                        evt.get('delta', {}).get('type') == 'text_delta'):
                    raw_text += evt['delta']['text']
            except:
                pass
        raw_text = raw_text.replace('```json', '').replace('```', '').strip()
        m = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if m:
            analisis  = json.loads(m.group())
            r_count   = len(analisis.get('recintos', []))
            inc_count = len(analisis.get('incumplimientos_oguc', []))
            print(f'  ✓ Claude: {r_count} recintos, {inc_count} incumplimientos')
        else:
            print('  ⚠ Claude: sin JSON en respuesta')
    except Exception as e:
        print(f'  ⚠ Error Claude: {e}')

    # ── 2. Extracción de datos vectoriales del PDF ──────────
    # NOTA 2026-07-23: se movio ANTES de OpenCV (antes iba despues) porque
    # OpenCV ahora necesita cotas_texto y lineas_discontinuas para limpiar
    # el raster antes de binarizar. Requiere que la Celda 2 haya confirmado
    # PDF vectorizado. `doc` sigue vivo en el kernel desde la Celda 2.
    print('  → Extracción vectorial...')
    pdf_page_actual = doc[PAGINA_PLANTA - 1]
    crop_px = (x1, y1, x2, y2) if crop else None
    datos_vectoriales = extraer_datos_vectoriales(pdf_page_actual, ZOOM, MPX, crop_px)
    print(f'  ✓ Vectorial: {datos_vectoriales["n_texto"]} textos (cotas/nombres), '
          f'{datos_vectoriales["n_trazos"]} trazos candidatos a símbolo, '
          f'{datos_vectoriales["n_muro_protegido"]} tramos protegidos como muro (por conectividad, no por largo), '
          f'{datos_vectoriales["n_achurado_desprotegido"]} tramos desprotegidos por parecer achurado (rampa/escalera), '
          f'{datos_vectoriales["n_lineas_discontinuas"]} en {datos_vectoriales["n_cadenas_discontinuas"]} cadena(s) de línea discontinua')
    if datos_vectoriales['diagnostico_muestra_cadenas_discontinuas']:
        print(f'     muestra de cadenas discontinuas detectadas: {datos_vectoriales["diagnostico_muestra_cadenas_discontinuas"]}')

    # ── 3. OpenCV — extracción geométrica ───────────────────
    print('  → OpenCV...')
    gray = cv2.cvtColor(plano, cv2.COLOR_RGB2GRAY)

    # FIX 2026-07-23 (a): borrar texto (cotas, nombres de recintos) usando
    # las posiciones exactas del vector — el texto NO debe limitar el area
    # de un recinto. Antes "0.8" o "Cocina" se trataban como si fueran parte
    # del muro porque adaptiveThreshold no distingue texto de linea.
    PADDING_TEXTO_PX = 3
    n_texto_borrado = 0
    for t in datos_vectoriales['cotas_texto']:
        tx0 = max(0, t['x'] - PADDING_TEXTO_PX)
        ty0 = max(0, t['y'] - PADDING_TEXTO_PX)
        tx1 = min(w, t['x'] + t['w'] + PADDING_TEXTO_PX)
        ty1 = min(h, t['y'] + t['h'] + PADDING_TEXTO_PX)
        if tx1 > tx0 and ty1 > ty0:
            gray[ty0:ty1, tx0:tx1] = 255
            n_texto_borrado += 1

    # FIX 2026-07-24 (b v2): borrar líneas discontinuas (deslinde, línea de
    # edificación, ejes). El intento original (v1, 2026-07-23) buscaba
    # path['dashes'] pero el diagnóstico confirmó que este PDF siempre lo
    # da sólido ('[] 0') — el punteado se dibuja a mano con muchos tramos
    # cortos separados, no con el atributo nativo de PDF. Ahora se detectan
    # por geometría (colinealidad + gap regular, ver extraer_datos_vectoriales).
    n_lineas_borradas = 0
    for ld in datos_vectoriales['lineas_discontinuas']:
        grosor_borrado = max(6, int(ld['ancho_linea'] * ZOOM) + 6)  # margen anti-aliasing
        pts = ld['puntos']
        for i in range(len(pts) - 1):
            cv2.line(gray, pts[i], pts[i + 1], 255, thickness=grosor_borrado)
        n_lineas_borradas += 1

    # FIX 2026-07-24 (c v2): borrar trazos cortos (artefactos, arcos de
    # puerta) del raster. El intento original (v1, 2026-07-23) filtraba por
    # LARGO individual (<3m) y causó una regresión grave: tramos reales de
    # muro perimetral en esquinas/quiebres también miden <3m y se borraban,
    # fusionando exterior+interior en un recinto falso de ~140-155 m² (ver
    # roadmap P1, capturas 2026-07-24). Ahora 'trazos' ya viene filtrado por
    # extraer_datos_vectoriales usando CONECTIVIDAD: un segmento corto que
    # está conectado a una cadena larga de muro real queda protegido y no
    # llega a esta lista — lo que sí llega es seguro de borrar.
    n_trazos_borrados = 0
    for tr in datos_vectoriales['trazos']:
        grosor_borrado = max(6, int(tr['ancho_linea'] * ZOOM) + 6)
        pts = tr['puntos']
        for i in range(len(pts) - 1):
            cv2.line(gray, pts[i], pts[i + 1], 255, thickness=grosor_borrado)
        if len(pts) >= 3:
            cv2.line(gray, pts[-1], pts[0], 255, thickness=grosor_borrado)
        n_trazos_borrados += 1

    print(f'  ✓ Limpieza pre-umbral: {n_texto_borrado} textos, {n_lineas_borradas} líneas discontinuas, '
          f'{n_trazos_borrados} trazos cortos (artefactos/arcos, ya excluye tramos de muro protegidos) borrados')

    binary_inv = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=21, C=4)
    k_close    = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    muros      = cv2.dilate(binary_inv, k_close, iterations=2)
    k_open     = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
    limpios    = cv2.morphologyEx(cv2.bitwise_not(muros), cv2.MORPH_OPEN, k_open)

    n_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        limpios, connectivity=8)

    # AJUSTE 2026-07-26: el "recinto" de ~65-141 m2 que veniamos persiguiendo
    # NO era causado por ninguno de los fixes de borrado vectorial -- ya
    # existia en la corrida ORIGINAL sin ningun cambio (65.92 m2 "Baño
    # Universal" en N1, 91.6 m2 "Pasillo" en N2, ver roadmap P1). Causa real:
    # una apertura real del plano (ej. la puerta de acceso principal) conecta
    # topologicamente el area de contexto/terreno (fuera del edificio, dentro
    # del deslinde) con el interior -- ahi no hay ningun trazo que borrar,
    # es un hueco real en el dibujo (una puerta ES una abertura). Ninguna
    # limpieza de texto/simbolos/lineas discontinuas puede arreglar esto,
    # porque el problema no es pixel de mas borrado, es la naturaleza de la
    # segmentacion por conectividad de OpenCV (una puerta abierta conecta
    # dos espacios "distintos" para nosotros pero son un solo blob de pixeles
    # para el algoritmo).
    # Fix: excluir cualquier componente que TOQUE el borde de la imagen Y
    # tenga un area implausible para un recinto individual real (>60 m2 --
    # el recinto real mas grande en el dataset de prueba es ~50 m2). Tocar
    # el borde solo no alcanza como criterio (Bodega=22m2 y Terraza=9m2 son
    # recintos reales y tambien tocan el borde en este recorte), por eso se
    # combinan ambas condiciones.
    UMBRAL_AREA_SOSPECHOSA_M2 = 60
    MARGEN_BORDE_PX = 2

    MIN_PX2 = int(0.5 / M2_PX)
    recintos_geo = []
    recintos_excluidos_por_fusion = []
    for idx in range(1, n_labels):
        area_px = int(stats[idx, cv2.CC_STAT_AREA])
        if area_px < MIN_PX2:
            continue
        area_m2 = round(area_px * M2_PX, 2)
        cx_abs  = int(centroids[idx][0])
        cy_abs  = int(centroids[idx][1])
        mask    = (labels == idx).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        ancho_m = largo_m = None
        bbox = None
        if cnts:
            cnt  = max(cnts, key=cv2.contourArea)
            rect = cv2.minAreaRect(cnt)
            dims = sorted(rect[1])
            ancho_m = round(dims[0] * MPX, 2)
            largo_m = round(dims[1] * MPX, 2)
            bx, by, bw, bh = cv2.boundingRect(cnt)
            bbox = {'x': int(bx), 'y': int(by), 'w': int(bw), 'h': int(bh)}

        toca_borde = bbox is not None and (
            bbox['x'] <= MARGEN_BORDE_PX or bbox['y'] <= MARGEN_BORDE_PX or
            bbox['x'] + bbox['w'] >= w - MARGEN_BORDE_PX or
            bbox['y'] + bbox['h'] >= h - MARGEN_BORDE_PX
        )
        if toca_borde and area_m2 > UMBRAL_AREA_SOSPECHOSA_M2:
            recintos_excluidos_por_fusion.append({'area_m2': area_m2, 'bbox': bbox})
            continue

        recintos_geo.append({
            'id'         : f'E{len(recintos_geo)+1:02d}',
            'label'      : idx,
            'area_px'    : area_px,
            'area_m2'    : area_m2,
            'ancho_min_m': ancho_m,
            'largo_max_m': largo_m,
            'cx'         : cx_abs,
            'cy'         : cy_abs,
            'cx_rel'     : round(cx_abs / w, 3),
            'cy_rel'     : round(cy_abs / h, 3),
            'bbox'       : bbox,
        })
    recintos_geo.sort(key=lambda r: r['area_m2'], reverse=True)
    print(f'  ✓ OpenCV: {len(recintos_geo)} espacios >= 0.5 m²')
    if recintos_excluidos_por_fusion:
        areas_excluidas = ', '.join(f"{r['area_m2']}m²" for r in recintos_excluidos_por_fusion)
        print(f'  ⚠ {len(recintos_excluidos_por_fusion)} región(es) excluida(s) por parecer fusión exterior+interior '
              f'(toca el borde + área > {UMBRAL_AREA_SOSPECHOSA_M2}m²): {areas_excluidas}')

    # ── 4. Cruce semántica + geometría ──────────────────────
    recintos_claude = analisis.get('recintos', [])
    usados = set()

    def dist_rel(rg, rc):
        return math.sqrt((rg['cx_rel'] - rc.get('cx_relativo', 0.5))**2 +
                         (rg['cy_rel'] - rc.get('cy_relativo', 0.5))**2)

    def mejor_match(rg):
        cands = [(dist_rel(rg, rc), j, rc)
                 for j, rc in enumerate(recintos_claude) if j not in usados]
        if not cands:
            return None
        cands.sort(key=lambda x: x[0])
        d, j, rc = cands[0]
        if d < 0.25:
            usados.add(j)
            return rc
        return None

    tabla = []
    incumplimientos_geo = []

    for rg in recintos_geo:
        rc     = mejor_match(rg)
        # FIX 2026-07-23 (c): un recinto sin match de Claude Vision ya NO se
        # nombra en silencio ("Espacio E##") — se marca explicitamente para
        # que el arquitecto lo confirme (via la interfaz de validacion grafica
        # cuando exista; por ahora, print de advertencia + campo dedicado).
        sin_nombre = rc is None
        nombre = rc['nombre'] if rc else f'Espacio {rg["id"]} (SIN NOMBRE - confirmar con arquitecto)'
        tipo   = (rc['tipo'] if rc else 'otro').lower().split('/')[0].strip()
        area   = rg['area_m2']
        ancho  = rg['ancho_min_m']

        area_min, ancho_min, ref = OGUC_REGLAS.get(tipo, (None, None, None))
        area_ok = ancho_ok = None

        if area_min and area < area_min:
            area_ok = False
            incumplimientos_geo.append({
                'tipo': 'area', 'pagina': PAGINA_PLANTA,
                'recinto': nombre, 'id': rg['id'],
                'medido': area, 'minimo': area_min,
                'deficit': round(area_min - area, 2), 'ref': ref
            })
        if ancho_min and ancho is not None and ancho < ancho_min:
            ancho_ok = False
            incumplimientos_geo.append({
                'tipo': 'ancho', 'pagina': PAGINA_PLANTA,
                'recinto': nombre, 'id': rg['id'],
                'medido': ancho, 'minimo': ancho_min,
                'deficit': round(ancho_min - ancho, 2), 'ref': ref
            })

        # FIX 2026-07-26 (b, luego corregido en (c) mas abajo): regla real de
        # pendiente de rampa — Art. 4.1.7 N°2 OGUC. La version (b) de este fix se
        # baso en oguc_articulos.json (fuente curada, resumen incompleto) y asumio
        # una regla BINARIA (<=3m -> 12%, >3m -> 8%) -- ESO ESTABA MAL, corregido en
        # (c): el texto real (verificado contra oguc_pdf.json, extraccion completa
        # del PDF oficial) es una formula lineal continua, ver el comentario dentro
        # del bloque "if tipo == 'rampa':" para el detalle y la correccion.
        # 'largo_max_m' del recinto geometrico se usa como proxy del "desarrollo"
        # de la rampa (dimension mayor del rectangulo minimo que la contiene).
        if tipo == 'rampa':
            # FIX 2026-07-26 (revision exhaustiva post-implementacion): el patron
            # original '\d{1,2}[.,]\d{1,3}\s*%' exigia decimales -- una rampa
            # rotulada como "Pendiente 8%" (entero, sin coma) no matcheaba nunca y
            # el chequeo quedaba en silencio sin avisar. Ahora el decimal es
            # opcional. Ademas, para reducir falsos positivos (cualquier % cercano
            # a la rampa se tomaba como pendiente, aunque fuera de otra cosa), se
            # prioriza el texto que efectivamente dice "pendient..." junto al %;
            # solo si no aparece ese texto se usa un % suelto como respaldo.
            patron_pendiente = re.compile(r'(\d{1,2}(?:[.,]\d{1,3})?)\s*%')
            bbox_rg = rg.get('bbox')
            if bbox_rg:
                margen_px = int(0.6 / MPX) if MPX else 40
                bx0, by0 = bbox_rg['x'] - margen_px, bbox_rg['y'] - margen_px
                bx1, by1 = bbox_rg['x'] + bbox_rg['w'] + margen_px, bbox_rg['y'] + bbox_rg['h'] + margen_px
                pendientes_con_etiqueta = []
                pendientes_sueltas = []
                for t in datos_vectoriales['cotas_texto']:
                    m = patron_pendiente.search(t['texto'])
                    if not m:
                        continue
                    if bx0 <= t['x'] <= bx1 and by0 <= t['y'] <= by1:
                        valor = float(m.group(1).replace(',', '.'))
                        if 'pendient' in t['texto'].lower():
                            pendientes_con_etiqueta.append(valor)
                        else:
                            pendientes_sueltas.append(valor)
                pendientes_detectadas = pendientes_con_etiqueta or pendientes_sueltas
                if pendientes_detectadas:
                    pendiente_declarada = max(pendientes_detectadas)
                    desarrollo = rg.get('largo_max_m')
                    # FIX 2026-07-26 (c) -- CORRECCION IMPORTANTE: la regla binaria
                    # (<=3m->12%, >3m->8%) que se implemento antes estaba MAL. Se
                    # baso en el resumen de oguc_articulos.json (fuente curada,
                    # incompleta) que parafraseaba el articulo real de forma
                    # incorrecta. Al auditar contra oguc_pdf.json (770 articulos,
                    # extraccion completa del PDF oficial) aparecio el texto real y
                    # COMPLETO del Art. 4.1.7 N°2: "La pendiente de la rampa sera de
                    # un 8%, pudiendo llegar con esta a 9 m de largo. Para un largo
                    # de 1,5 m, la pendiente ira aumentando hasta alcanzar un 12%,
                    # como maximo... Para verificar la pendiente proyectada se usara
                    # la siguiente formula: i% = 12,8 - 0,5333*L" (L en metros,
                    # formula valida entre 1,5 y 9 m -- es la interpolacion lineal
                    # exacta entre los puntos (1,5m, 12%) y (9m, 8%) mencionados en
                    # el mismo parrafo, no un valor inventado). Es decir: la
                    # "formula progresiva" que cito el chatbot de Revi (y que esta
                    # sesion habia calificado de "fabricada") SI es real -- lo que
                    # estaba fabricado, en todo caso, eran los NUMEROS especificos
                    # que Revi calculo con ella (9,5%/9,60% en vez de los ~10,53%/
                    # ~10,40% que da la formula real para 4,25/4,50 m). Se corrige
                    # aqui a la formula real.
                    if desarrollo is None:
                        max_pendiente = 8.0
                    elif desarrollo <= 1.5:
                        max_pendiente = 12.0
                    elif desarrollo >= 9.0:
                        max_pendiente = 8.0
                    else:
                        max_pendiente = round(12.8 - 0.5333 * desarrollo, 2)
                    if pendiente_declarada > max_pendiente:
                        incumplimientos_geo.append({
                            'tipo': 'pendiente_rampa', 'pagina': PAGINA_PLANTA,
                            'recinto': nombre, 'id': rg['id'],
                            'medido': pendiente_declarada, 'minimo': None, 'maximo': max_pendiente,
                            'desarrollo_m': desarrollo,
                            'deficit': round(pendiente_declarada - max_pendiente, 2),
                            'ref': 'Art. 4.1.7 N°2 OGUC — pendiente max. 8% (desarrollo >=9m) a 12% (desarrollo <=1,5m), formula i%=12,8-0,5333*L entre esos valores'
                        })

        # FIX 2026-07-26: bano/recinto accesible sin circulo de giro -- Revi
        # demostro leer el circulo de giro en su analisis, pero solo lo
        # transcribe. Aqui ademas se convierte en una regla real (DDU 351 /
        # Art. 4.1.7 OGUC exige 1,50 m de diametro libre en recintos accesibles).
        if rc and rc.get('es_accesible_universal') and rc.get('circulo_giro_1_50_detectado') is False:
            incumplimientos_geo.append({
                'tipo': 'circulo_giro', 'pagina': PAGINA_PLANTA,
                'recinto': nombre, 'id': rg['id'],
                'medido': None, 'minimo': 1.50, 'deficit': None,
                'ref': 'DDU 351 / Art. 4.1.7 OGUC — circulo de giro 1,50 m en recintos accesibles'
            })

        # FIX 2026-07-26: cruce del cuadro de superficies oficial del plano (si
        # existe) contra el area MEDIDA por geometria independiente (OpenCV).
        # Esta validacion es la diferencia real frente a Revi: Revi transcribe
        # el cuadro de superficies pero no lo contrasta contra una medicion
        # propia del dibujo — aqui si, porque OpenCV mide el recinto sin
        # depender de lo que declare el cuadro.
        if rc:
            for fila_cuadro in analisis.get('cuadro_superficies_oficial', []):
                nombre_cuadro = (fila_cuadro.get('recinto') or '').strip().lower()
                if not nombre_cuadro:
                    continue
                nombre_rc = (rc.get('nombre') or '').strip().lower()
                if nombre_cuadro == nombre_rc or nombre_cuadro in nombre_rc or nombre_rc in nombre_cuadro:
                    area_declarada = fila_cuadro.get('area_m2_declarada')
                    if area_declarada and area > 0:
                        diff_pct = abs(area_declarada - area) / area * 100
                        if diff_pct > 15:
                            incumplimientos_geo.append({
                                'tipo': 'discrepancia_area_declarada', 'pagina': PAGINA_PLANTA,
                                'recinto': nombre, 'id': rg['id'],
                                'medido': area, 'declarado': area_declarada,
                                'diff_pct': round(diff_pct, 1),
                                'ref': 'Cuadro de superficies del plano vs. area medida por geometria (OpenCV)'
                            })
                    break

        tabla.append({
            'id'                   : rg['id'],
            'nombre'               : nombre,
            'tipo'                 : tipo,
            'pagina'               : PAGINA_PLANTA,
            'area_m2'              : area,
            'ancho_min_m'          : ancho,
            'largo_max_m'          : rg.get('largo_max_m'),
            'cumple_geo'           : (area_ok is not False) and (ancho_ok is not False),
            'cx_rel'               : rg['cx_rel'],
            'cy_rel'               : rg['cy_rel'],
            'bbox'                 : rg.get('bbox'),
            'sin_nombre_confirmar' : sin_nombre,
        })

    total   = round(sum(f['area_m2'] for f in tabla), 1)
    matched = sum(1 for f in tabla if not f['sin_nombre_confirmar'])
    print(f'  ✓ Cruce: {matched}/{len(tabla)} con nombre | {len(incumplimientos_geo)} incumpl. geo')

    sin_nombre_ids = [f['id'] for f in tabla if f['sin_nombre_confirmar']]
    if sin_nombre_ids:
        print(f'  ⚠ {len(sin_nombre_ids)} espacio(s) SIN NOMBRE — requieren que el arquitecto confirme qué son: {", ".join(sin_nombre_ids)}')

    resultados_paginas.append({
        'entry_idx'             : entry_idx,
        'fname_tag'             : fname_tag,
        'pagina'                : PAGINA_PLANTA,
        'escala'                : ESCALA_MANUAL,
        'crop'                  : list(crop) if crop else None,
        'analisis_semantico'    : analisis,
        'mediciones_geometricas': tabla,
        'incumplimientos_geo'   : incumplimientos_geo,
        'datos_vectoriales'     : datos_vectoriales,
        'recintos_excluidos_por_fusion': recintos_excluidos_por_fusion,
        'total_area_m2'         : total,
        'imagen_w_px'           : w,
        'imagen_h_px'           : h,
        'mpp'                   : MPX,
    })
    viz_pages.append({
        'entry_idx'   : entry_idx,
        'fname_tag'   : fname_tag,
        'pagina'      : PAGINA_PLANTA,
        'escala'      : ESCALA_MANUAL,
        'plano'       : plano,
        'labels'      : labels,
        'recintos_geo': recintos_geo,
        'w': w, 'h': h,
    })

print(f'\n{"="*56}')
total_inc = sum(len(p['incumplimientos_geo']) for p in resultados_paginas)
print(f'✓ Procesadas {len(resultados_paginas)} / {len(PAGINAS_Y_ESCALAS)} páginas')
print(f'  Incumplimientos geométricos totales: {total_inc}')
