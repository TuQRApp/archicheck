# ══════════════════════════════════════════════════════════
# CELDA 4 — PROCESAR TODAS LAS PÁGINAS
#   Por cada página: Claude Vision + extracción vectorial + OpenCV + cruce
# ══════════════════════════════════════════════════════════
import base64, json, requests, re, math
import cv2, numpy as np
from datetime import datetime
import sys as _sys_log

# NUEVO (2026-08-26, pedido del usuario): timestamp de corrida reusado en
# los nombres de archivo de diagnostico (diag_muros/diag_completo/
# diag_contexto), MISMO formato que ya se usa para nombrar versiones del
# notebook (DDmmm_HHMM, ej. '26aug_1445') -- evita que corridas sucesivas
# en la misma sesion de Colab se pisen entre si.
_RUN_TS = datetime.now().strftime('%d%b_%H%M').lower()

# NUEVO (2026-08-26, pedido del usuario): todo el output impreso de esta
# celda se espeja a un .txt ademas de la consola de Colab -- reemplaza
# tener que copiar el output a mano. Restaura stdout siempre al final
# (bloque final de la celda) -- si una corrida anterior quedo con stdout
# redirigido por un crash a mitad de camino, este chequeo lo repara antes
# de arrancar de nuevo, en vez de anidar redirecciones.
class _TeeLog:
    _es_tee_log = True
    def __init__(self, *streams):
        self._streams = streams
    def write(self, data):
        for s in self._streams:
            s.write(data)
    def flush(self):
        for s in self._streams:
            s.flush()

if getattr(_sys_log.stdout, '_es_tee_log', False):
    _sys_log.stdout = _sys_log.stdout._streams[0]  # repara redireccion de una corrida anterior sin cerrar

_LOG_TXT_NOMBRE = f'Celda4_log_{_RUN_TS}.txt'
_log_txt_archivo = open(_LOG_TXT_NOMBRE, 'w', encoding='utf-8')
_stdout_real = _sys_log.stdout
_sys_log.stdout = _TeeLog(_stdout_real, _log_txt_archivo)

# NUEVO (2026-08-22): modulo cuerpo_cerrado.py (puerto Python de
# _tmp_cuerpo_cerrado.mjs, prototipo Node.js ya validado 11/11 -- el puerto
# se valido aparte, 5/5, ver Roadmap_Revision_Dossier_ArchiCheck.md). Usado
# por _fusionar_muros_por_proximidad (mas abajo) como VERIFICACION
# geometrica sobre los pares que la fusion por proximidad ya propuso -- no
# reemplaza esa propuesta por distancia, la confirma o la rechaza antes de
# fusionar de verdad. No viene con el notebook por defecto (vive en el repo,
# Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py) -- si este runtime de
# Colab no lo tiene todavia, se pide subirlo una vez por sesion (mismo
# patron que la subida del PDF en la Celda 2).
try:
    from cuerpo_cerrado import cuerpo_cerrado_fusiona, diagnosticar_candidatos, clasificar_no_muro, relleno_solido_de_contexto
except ImportError:
    print('cuerpo_cerrado.py y/o catalogo_tipologias.py no estan en este runtime -- selecciona AMBOS archivos juntos (Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py y catalogo_tipologias.py):')
    from google.colab import files
    files.upload()
    from cuerpo_cerrado import cuerpo_cerrado_fusiona, diagnosticar_candidatos, clasificar_no_muro, relleno_solido_de_contexto

# NUEVO (2026-08-25, pedido del usuario -- 'se queda pegado bajando
# archivos'): Colab/el navegador bloquea o pausa cuando el codigo dispara
# muchas descargas automaticas seguidas (hasta 8 en una corrida completa
# de 2 paginas: 2 diag_muros + 2 diag_completo + hasta 4 diag_contexto) --
# el navegador pide permiso para 'varios archivos' y la celda se queda
# esperando esa confirmacion sin avisar que es eso lo que pasa. Los PNG
# SIEMPRE se guardan en el disco de la sesion de Colab (panel de Archivos,
# icono de carpeta a la izquierda) sin importar este flag -- se baja cada
# uno a mano desde ahi (clic derecho > Descargar), sin disparar el
# bloqueo del navegador. Poner en True solo si se quiere volver al
# comportamiento anterior (descarga automatica de todo).
AUTO_DESCARGAR_DIAGNOSTICOS = False

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

def _dividir_en_muros_por_union(segmentos, indices, tol_cluster_px, tol_diametro_cluster_px):
    """
    NUEVO (2026-08-08): reemplaza la exportacion directa de un grupo de
    conectividad completo como UN muro -- causaba el bug real 'Totalmente
    fusionado' descartado a mano por el arquitecto en PdV Nivel 1 (MU01: 638
    segmentos, 351m de 'largo total', cubriendo el 90% del plano). Los muros
    de un edificio SIEMPRE se tocan entre si en cada esquina y cruce en T, asi
    que con conectividad pura (Paso 2 de arriba) tarde o temprano toda la red
    de muros del piso cae en un solo componente -- confirmado que NO es un
    problema de calibrar TOL_MURO_PX (ver nota 2026-07-25 mas arriba: bajar a
    12px no evito la fusion tampoco).

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

def _detectar_lineas_referencia_periodicas(muros_geo, mpx):
    """
    NUEVO (2026-08-09): despues de _dividir_en_muros_por_union, una linea de
    referencia dibujada con linetype punteado/rayado (deslinde, rasante,
    linea de edificacion, linea oficial) queda fragmentada en decenas de
    muros individuales muy cortos -- el split corta en cada micro-cruce del
    rayado, porque geometricamente son puntas sueltas/cruces reales igual que
    una pared, aunque no sean arquitectura.

    Firma geometrica validada contra datos reales de PdV (visualizacion
    pixel a pixel, 3 iteraciones, ver roadmap 2026-08-09): muchos muros
    (>=8) casi colineales entre si (banda perpendicular angosta,
    TOL_PERP_PX), con huecos acotados entre miembros consecutivos a lo largo
    de la linea (TOL_GAP_PX) -- el mismo criterio de colinealidad+gap que
    Paso 1.5, no una ventana deslizante por coordenada: la primera version de
    este filtro uso una ventana deslizante 1D y encadeno muros de zonas
    totalmente distintas del plano (ej. una pared de Bano Universal con la
    escalera, con una pared de Oficina), el MISMO defecto de fondo que el
    bug original de "fusionado" que motivo _dividir_en_muros_por_union.
    Ademas: mediana de largo individual corta (<1.5m), span total largo
    (>=8m -- una linea de deslinde/rasante corre casi todo el plano; una
    pared real fragmentada, aunque densa, no llega a ese span) y alta
    densidad de miembros por metro (>=2/m -- una pared real no se corta asi
    de seguido).

    Proteccion final por ancho de linea (ANCHO_MIN_PROTEGIDO): paredes
    reales medidas en este PDF usan anchos 0.12-0.86; el rayado de
    referencia usa 0.54-1.44. Un muro dentro de un cluster sospechoso SOLO
    se excluye si su propio ancho es >=0.3 -- protege el caso real
    encontrado en la verificacion visual: una pared real de ancho 0.12 casi
    superpuesta en posicion con la linea de deslinde vecina (misma banda
    perpendicular), que sin esta proteccion se excluia por error junto con
    la linea de referencia real.

    Devuelve (muros_geo_finales, muros_excluidos) -- no borra en silencio,
    los excluidos se guardan aparte para trazabilidad (mismo criterio que
    'muros_descartados' del resto del pipeline).
    """
    TOL_PERP_M = 0.12
    TOL_PERP_PX = TOL_PERP_M / mpx if mpx else 20
    TOL_GAP_M = 0.41
    TOL_GAP_PX = TOL_GAP_M / mpx if mpx else 70
    MIN_MIEMBROS = 8
    MEDIANA_LARGO_MAX_M = 1.5
    SPAN_MIN_M = 8.0
    DENSIDAD_MIN_POR_M = 2.0
    ANCHO_MIN_PROTEGIDO = 0.3

    def _angulo_muro(m):
        s = m['segmentos'][0]
        dx = s['p2'][0] - s['p1'][0]
        dy = s['p2'][1] - s['p1'][1]
        return abs(math.degrees(math.atan2(dy, dx))) % 180

    def _es_horizontal(m):
        a = _angulo_muro(m)
        return a < 10 or a > 170

    def _es_vertical(m):
        a = _angulo_muro(m)
        return 80 < a < 100

    def _ymid(m):
        ys = [p[1] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return (min(ys) + max(ys)) / 2

    def _xmid(m):
        xs = [p[0] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return (min(xs) + max(xs)) / 2

    def _xrange(m):
        xs = [p[0] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return (min(xs), max(xs))

    def _yrange(m):
        ys = [p[1] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return (min(ys), max(ys))

    def _agrupar_con_tope(lista, es_horiz):
        n = len(lista)
        parent = list(range(n))
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        def union(i, k):
            ri, rk = find(i), find(k)
            if ri != rk:
                parent[ri] = rk
        def tocan(a, b):
            perp = abs(_ymid(a) - _ymid(b)) if es_horiz else abs(_xmid(a) - _xmid(b))
            if perp > TOL_PERP_PX:
                return False
            a_min, a_max = _xrange(a) if es_horiz else _yrange(a)
            b_min, b_max = _xrange(b) if es_horiz else _yrange(b)
            if a_max < b_min:
                gap = b_min - a_max
            elif b_max < a_min:
                gap = a_min - b_max
            else:
                gap = 0
            return gap <= TOL_GAP_PX
        for i in range(n):
            for k in range(i + 1, n):
                if find(i) == find(k):
                    continue
                if tocan(lista[i], lista[k]):
                    union(i, k)
        grupos = {}
        for i in range(n):
            r = find(i)
            grupos.setdefault(r, []).append(lista[i])
        return list(grupos.values())

    horizontales = [m for m in muros_geo if _es_horizontal(m)]
    verticales = [m for m in muros_geo if _es_vertical(m)]
    ids_excluidos = set()

    for lista, es_horiz in ((horizontales, True), (verticales, False)):
        for cluster in _agrupar_con_tope(lista, es_horiz):
            if len(cluster) < MIN_MIEMBROS:
                continue
            largos = sorted(m['largo_total_m'] for m in cluster)
            mediana_largo = largos[len(largos) // 2]
            coords = [(_xrange(m) if es_horiz else _yrange(m)) for m in cluster]
            span_m = (max(c[1] for c in coords) - min(c[0] for c in coords)) * mpx
            densidad = (len(cluster) / span_m) if span_m > 0 else float('inf')
            if mediana_largo < MEDIANA_LARGO_MAX_M and densidad >= DENSIDAD_MIN_POR_M and span_m >= SPAN_MIN_M:
                for m in cluster:
                    if (m.get('ancho_linea_prom') or 0) >= ANCHO_MIN_PROTEGIDO:
                        ids_excluidos.add(m['id'])

    muros_finales = [m for m in muros_geo if m['id'] not in ids_excluidos]
    muros_excluidos = [m for m in muros_geo if m['id'] in ids_excluidos]
    return muros_finales, muros_excluidos

def _angulo_segmento(s):
    dx = s['p2'][0] - s['p1'][0]
    dy = s['p2'][1] - s['p1'][1]
    return math.degrees(math.atan2(dy, dx)) % 180

def _es_contorno_cerrado_de_lineas(items, tol_cierre_pt=2):
    """True si la secuencia de items 'l' de un mismo path forma un
    contorno cerrado (el extremo final del ultimo segmento vuelve cerca
    del extremo inicial del primero) -- swatch de leyenda dibujado como
    rectangulo/poligono de lineas + achurado, sin relleno solido. Se
    exige que TODOS los items del path sean 'l' (si hay un 'c' u otro
    tipo mezclado, no es el contorno simple que se busca aca). Devuelve
    (True, bbox) o (False, None)."""
    if not items or any(it[0] != 'l' for it in items):
        return False, None
    if len(items) < 3:
        return False, None
    p_inicio, p_fin = items[0][1], items[-1][2]
    if abs(p_inicio.x - p_fin.x) > tol_cierre_pt or abs(p_inicio.y - p_fin.y) > tol_cierre_pt:
        return False, None
    xs = [it[1].x for it in items] + [items[-1][2].x]
    ys = [it[1].y for it in items] + [items[-1][2].y]
    return True, (min(xs), min(ys), max(xs), max(ys))


def _detectar_leyenda_simbologia(doc):
    """
    NUEVO (2026-08-21) -- reemplaza el criterio hardcodeado _es_amarillo
    (rojo=mantener/amarillo=excluir, especifico de PdV, ver docstring
    viejo mas abajo). Regla del arquitecto: el color de un achurado NUNCA
    decide por si solo si algo es geometria real -- eso lo decide la
    forma (cuerpo cerrado). El color solo sirve para ETIQUETAR el
    elemento como agregado/eliminado, leyendo la leyenda SIMBOLOGIA real
    de ESE documento -- nunca asumiendo una convencion fija entre planos.

    Busca la leyenda en CUALQUIER pagina del PDF (no solo la que se esta
    analizando -- la leyenda suele vivir en una lamina de portada/indice
    separada, o repetirse en varias, y este loop ya las recorre TODAS,
    fusionando resultados en un solo `mapa` sin perder ninguna). Dos
    formas de swatch reconocidas (CORREGIDO 2026-08-24, Tipologia C de
    la revision visual de N2 -- el bug real: los swatches de PdV NO
    tienen relleno solido, son contorno de lineas + achurado):
      (a) un item 're'/'qu' con relleno de color solido (forma original);
      (b) NUEVO: un contorno CERRADO de segmentos 'l' (rectangulo o
          poligono dibujado a mano, sin fill) + achurado -- se usa el
          color del TRAZO (stroke) como color_key, con limite de tamano
          (LIMITE_SWATCH_PT) para no confundir un contorno grande real
          (ej. un muro o un recinto) con un icono de leyenda.
    En ambos casos, se exige ademas un bloque de texto corto en la MISMA
    fila, a la derecha, a poca distancia -- se toma ese texto como la
    etiqueta de ese color exacto.

    Devuelve dict {(r,g,b) redondeado a 2 decimales: texto_leyenda_crudo}
    -- vacio si no se encontro nada. Nunca falla en silencio: quien
    llama a esta funcion es responsable de imprimir el resultado crudo
    antes de usarlo (ver diagnostico en el llamado, mas abajo).
    """
    TOL_CERCANIA_TEXTO_PT = 40  # puntos PDF (no px) -- swatch -> inicio del texto
    LIMITE_SWATCH_PT = 40  # tamano maximo (ancho y alto) de un icono de leyenda -- un muro/recinto real es mucho mas grande que esto
    mapa = {}
    for pagina_leyenda in doc:
        swatches = []
        for path in pagina_leyenda.get_drawings():
            fill = path.get('fill')
            items_path = path.get('items', [])
            if fill and len(fill) >= 3:
                for item in items_path:
                    op = item[0]
                    if op == 're':
                        r = item[1]
                        swatches.append({'fill': fill, 'rect': (r.x0, r.y0, r.x1, r.y1)})
                    elif op == 'qu':
                        q = item[1]
                        xs = [q.ul.x, q.ur.x, q.lr.x, q.ll.x]
                        ys = [q.ul.y, q.ur.y, q.lr.y, q.ll.y]
                        swatches.append({'fill': fill, 'rect': (min(xs), min(ys), max(xs), max(ys))})
            else:
                # NUEVO (2026-08-24): swatch sin relleno solido -- contorno
                # cerrado de lineas + achurado, usa el color del trazo.
                stroke = path.get('color')
                if not stroke or len(stroke) < 3:
                    continue
                cerrado, rect = _es_contorno_cerrado_de_lineas(items_path)
                if not cerrado:
                    continue
                ancho_sw, alto_sw = rect[2] - rect[0], rect[3] - rect[1]
                if ancho_sw <= LIMITE_SWATCH_PT and alto_sw <= LIMITE_SWATCH_PT:
                    swatches.append({'fill': stroke, 'rect': rect})
        if not swatches:
            continue
        lineas_texto = []
        for block in pagina_leyenda.get_text('dict').get('blocks', []):
            for line in block.get('lines', []):
                texto_linea = ''.join(sp.get('text', '') for sp in line.get('spans', [])).strip()
                if texto_linea:
                    lineas_texto.append({'texto': texto_linea, 'bbox': line['bbox']})
        for sw in swatches:
            x0, y0, x1, y1 = sw['rect']
            cy = (y0 + y1) / 2
            alto_sw = max(y1 - y0, 1)
            mejor = None
            for lt in lineas_texto:
                lx0, ly0, lx1, ly1 = lt['bbox']
                lcy = (ly0 + ly1) / 2
                if abs(lcy - cy) > alto_sw + 3:
                    continue  # no esta en la misma fila que el swatch
                if lx0 < x1 - 2:
                    continue  # el texto debe estar A LA DERECHA del swatch
                dist = lx0 - x1
                if dist > TOL_CERCANIA_TEXTO_PT:
                    continue
                if mejor is None or dist < mejor[0]:
                    mejor = (dist, lt['texto'])
            if mejor:
                color_key = tuple(round(c, 2) for c in sw['fill'][:3])
                if color_key not in mapa:
                    mapa[color_key] = mejor[1]
    return mapa

def _clasificar_estado_por_texto_leyenda(texto):
    """
    Clasifica el texto crudo de una leyenda como 'agregado'/'eliminado' por
    palabras clave -- NUNCA se asume el significado de un color sin texto
    real que lo respalde. Si el texto no matchea ninguna palabra conocida,
    devuelve None explicito (quien llama debe avisar, no debe tratar None
    como 'agregado' por defecto ni descartarlo en silencio).
    """
    t = texto.lower()
    PALABRAS_ELIMINADO = ('retira', 'elimina', 'demoler', 'demolicion', 'demolición', 'a retirar')
    PALABRAS_AGREGADO = ('construye', 'nuevo', 'propuesta', 'agregado', 'ampliacion', 'ampliación', 'a construir')
    if any(p in t for p in PALABRAS_ELIMINADO):
        return 'eliminado'
    if any(p in t for p in PALABRAS_AGREGADO):
        return 'agregado'
    return None

def _color_coincide(c1, c2, tol=0.05):
    if not c1 or not c2 or len(c1) < 3 or len(c2) < 3:
        return False
    return all(abs(c1[i] - c2[i]) <= tol for i in range(3))

def _estado_por_leyenda(seg, mapa_color_estado):
    """Busca el color/fill de un segmento crudo contra el mapa de colores
    ya clasificados (agregado/eliminado) por _detectar_leyenda_simbologia +
    _clasificar_estado_por_texto_leyenda. None si no coincide con ningun
    color conocido de la leyenda (no es un error -- la mayoria de los
    muros no tienen achurado de intervencion, son negro/sin color)."""
    for c in (seg.get('color'), seg.get('fill')):
        if not c or len(c) < 3:
            continue
        for color_leyenda, estado in mapa_color_estado.items():
            if _color_coincide(c, color_leyenda):
                return estado
    return None

def _distancia_punto_segmento(p, a, b):
    """Distancia perpendicular de p al segmento a-b (o al extremo mas
    cercano si la proyeccion cae fuera del tramo)."""
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _distancia(p, a)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return _distancia(p, (ax + t * dx, ay + t * dy))

def _punto_cerca_de_puerta(p, puertas_geo, tol_union_px):
    """True si p (el punto de contacto real entre 2 candidatos a fusion)
    cae cerca de CUALQUIER puntos_union de CUALQUIER puerta -- sin exigir
    que la puerta tenga registrados sus 2 lados.

    NUEVO (2026-08-20) -- reemplaza a _hay_puerta_entre, que exigia que
    una puerta tuviera sus 2 puntos_union, uno apoyado en cada muro
    candidato, para poder bloquear la fusion. Confirmado con datos
    reales de PdV (corrida 20-ago) que esto fallaba en la practica:
    varias puertas reales (PG04, PG06 de Nivel 2) solo tienen 1
    punto_union registrado -- el otro lado no se pudo asociar a ningun
    muro en el momento de detectar el arco (ver 'puntos_union' en
    extraer_datos_vectoriales, arriba: se guardan 0, 1 o 2, nunca se
    inventa el que falta). Con la version anterior, esas puertas NUNCA
    podian bloquear nada -- PG06 (asociada a MU01 por muro_asociado_id)
    no bloqueo ninguna fusion pese a ser una puerta real tocando ese
    muro (0 pares bloqueados por puerta en ambas paginas). Esta version
    chequea el PUNTO DE CONTACTO especifico entre los 2 candidatos (no
    el par de muros completo) contra cualquier punto de union conocido
    -- si el punto donde 2 muros casi se tocan coincide con donde se
    sabe que hay una puerta, es evidencia suficiente de separacion
    real, sin importar si se pudo registrar 1 o 2 lados de esa puerta."""
    for puerta in puertas_geo:
        for pu in puerta.get('puntos_union', []):
            if _distancia(p, pu) <= tol_union_px:
                return True
    return False

def _fusionar_muros_por_proximidad(muros_geo, puertas_geo, tol_fusion_px=10, tol_union_puerta_px=None, mpx=None):
    """
    NOTA: el default tol_fusion_px=10 nunca se usa en la practica -- quien
    llama a esta funcion siempre pasa TOL_FUSION_MUROS_PX ya calculado en
    metros/mpx (ver extraer_datos_vectoriales). Se deja como fallback
    documentado, no como valor real de produccion.
    NUEVO (2026-08-20) -- regla dada explicitamente por el arquitecto
    (Beauchef, 2026-08-19), cita textual: "un muro es toda estructura que
    considera segmentos de lineas paralelas, no separados entre ellos.
    Puede tener una L, seguida de una T, despues una I, una O. En la
    medida que no haya separacion explicita, se considera un solo muro."

    _dividir_en_muros_por_union (arriba) corta la cadena en un muro nuevo
    en CADA cruce real (3+ segmentos) -- necesario para evitar el bug de
    origen "todo el piso fusionado en un blob" (ver su propio docstring),
    pero tiene un costo secundario documentado en el roadmap del proyecto
    (PdV, hallazgo 17-ago): un muro largo real que varios tabiques
    interceptan en T queda partido en tantas entradas como cruces tenga,
    y las 2 caras paralelas de un muro de doble linea tampoco se
    fusionan entre si -- ninguna de las dos cosas es "un muro" en el
    sentido en que el arquitecto los cuenta.

    Esta funcion consolida esas entradas de vuelta, con Union-Find sobre
    las ENTRADAS de muros_geo (no sobre segmentos sueltos): dos entradas
    son CANDIDATAS a fusionarse si algun punto (extremo de segmento) de
    una esta a <= tol_fusion_px de algun SEGMENTO completo de la otra
    (distancia punto-a-segmento, no solo punto-a-punto) -- necesario para
    capturar un cruce en T, donde el extremo de un muro toca la mitad del
    tramo de otro, no su extremo. Formas resultantes validas: L, T, I, O
    (anillo cerrado).

    Una puerta interrumpiendo el tramo es separacion explicita (ver
    _punto_cerca_de_puerta) -- el par NO se fusiona aunque este dentro de la
    tolerancia geometrica. tol_union_puerta_px por defecto es mas laxo
    que tol_fusion_px porque el punto_union estimado de una puerta puede
    caer un poco mas lejos del extremo real del muro que dos caras de un
    mismo muro entre si.

    NUEVO (2026-08-22) -- tercer gate, cuerpo cerrado como CONFIRMADOR
    (ver Roadmap_Revision_Dossier_ArchiCheck.md, entrada 2026-08-21/22):
    la proximidad punto-a-segmento de arriba solo PROPONE candidatos, ya
    no fusiona por si sola. Cada candidato que sobrevive la proximidad y
    no esta bloqueado por puerta se verifica ademas con
    cuerpo_cerrado_fusiona (misma logica ya validada 5/5 en Colab, ver
    cuerpo_cerrado.py) -- exige que ambas entradas tengan ancho real
    emparejado (rechaza fusionar con una linea suelta tipo ventana/
    referencia) y que el relleno solido quede conectado tras cerrar
    micro-gaps. Esto es lo que evita, por ejemplo, que una ventana o un
    pilar que quedaron cerca por casualidad se fusionen con un muro real
    solo por estar dentro de tol_fusion_px. Si mpx es None (todavia no
    todos los llamadores lo pasan), este gate se salta y el
    comportamiento es identico al de antes de este cambio -- no rompe
    nada mientras se termina de propagar el parametro.

    contexto_local para cuerpo_cerrado_fusiona es una VECINDAD LOCAL
    alrededor del par evaluado (bbox de ambas entradas + RADIO_CONTEXTO_M
    de margen), no el pool completo de la pagina -- CORREGIDO 2026-08-22
    tras la primera corrida real en Colab: la version inicial pasaba
    TODOS los segmentos de muros_geo como contexto para CADA par, y eso
    disparaba identificar_lineas_centrales (deteccion de "linea central =
    ventana", ver cuerpo_cerrado.py) a escala de pagina completa -- con
    decenas de muros reales del mismo espesor tipico repartidos por todo
    el plano, cualquier par de caras paralelas NO relacionadas pero a una
    separacion parecida al espesor de muro (8-90cm) podia calificar como
    "linea central" o bloquear el emparejamiento de un muro real que nada
    tiene que ver con ellas -- mientras mas grande el contexto, mas
    coincidencias espurias de ese tipo. Confirmado con la corrida real de
    PdV: N1 127->67 muros (61 de 121 pares evaluados bloqueados), N2
    112->68 (67 bloqueados) -- muy por encima del target 28/33 y peor que
    el resultado de solo-proximidad ya bueno (25/31): exceso de rechazo,
    no de aceptacion. Acotar el contexto a una vecindad real (generosa
    para capturar la cara opuesta de un muro de doble linea y una
    esquina/vano cercano, chica para no cruzar con otra zona del plano)
    es la unica forma de que cuerpo cerrado razone sobre relaciones
    geometricas reales en vez de coincidencias de escala de pagina.

    Guarda 'muros_originales_ids' en cada entrada resultante -- nunca se
    fusiona en silencio, siempre trazable a las entradas de origen (mismo
    criterio que 'muros_excluidos_por_referencia').

    Validado a mano por el arquitecto en Beauchef/Acceso (19-ago, script
    externo ad-hoc, no en el pipeline) -- la regla de proximidad se porto
    el 20-ago; el gate de cuerpo cerrado se agrega el 22-ago, corregido el
    mismo dia tras la primera corrida real (ver nota de contexto_local
    arriba). Pendiente re-correr en Colab contra el ground truth ya
    confirmado de PdV (Nivel 1 = 28, Nivel 2 = 33) con el fix aplicado.
    """
    if tol_union_puerta_px is None:
        tol_union_puerta_px = tol_fusion_px * 2
    RADIO_CONTEXTO_M = 2.0
    RADIO_CONTEXTO_PX = RADIO_CONTEXTO_M / mpx if mpx else None
    n = len(muros_geo)
    if n == 0:
        return muros_geo, {}
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

    cell = max(1, tol_fusion_px)
    def _bbox(m):
        xs = [p[0] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        ys = [p[1] for s in m['segmentos'] for p in (s['p1'], s['p2'])]
        return min(xs), max(xs), min(ys), max(ys)
    bboxes = [_bbox(m) for m in muros_geo]
    buckets = {}
    def _claves(bb, margen):
        minx, maxx, miny, maxy = bb
        kx0, kx1 = int((minx - margen) // cell), int((maxx + margen) // cell)
        ky0, ky1 = int((miny - margen) // cell), int((maxy + margen) // cell)
        for kx in range(kx0, kx1 + 1):
            for ky in range(ky0, ky1 + 1):
                yield (kx, ky)
    for i, bb in enumerate(bboxes):
        for k in _claves(bb, tol_fusion_px):
            buckets.setdefault(k, []).append(i)

    evaluados = set()
    n_bloqueados_por_puerta = 0
    n_bloqueados_por_cuerpo_cerrado = 0
    # DIAGNOSTICO (2026-08-22): la primera corrida con el gate dio 61/67
    # bloqueados en N1/N2; acotar contexto_local a una vecindad de 2m NO
    # cambio ese numero ni un poco (identico antes/despues), lo que
    # descarta que el contexto global fuera la unica causa -- antes de
    # otro fix a ciegas, hace falta el motivo REAL de cada rechazo.
    _diag_motivos = {}
    _diag_muestras = 0
    _diag_pareja_muestras = 0
    for i in range(n):
        candidatos = set()
        for k in _claves(bboxes[i], tol_fusion_px):
            candidatos.update(buckets.get(k, ()))
        for j in candidatos:
            if j <= i or find(i) == find(j):
                continue
            par = (i, j)
            if par in evaluados:
                continue
            evaluados.add(par)
            cerca = False
            bloqueado_por_puerta = False
            for s_i in muros_geo[i]['segmentos']:
                for p in (s_i['p1'], s_i['p2']):
                    for s_j in muros_geo[j]['segmentos']:
                        if _distancia_punto_segmento(p, s_j['p1'], s_j['p2']) <= tol_fusion_px:
                            cerca = True
                            if _punto_cerca_de_puerta(p, puertas_geo, tol_union_puerta_px):
                                bloqueado_por_puerta = True
                            break
                    if cerca:
                        break
                if cerca:
                    break
            if not cerca:
                continue
            if bloqueado_por_puerta:
                n_bloqueados_por_puerta += 1
                continue
            # NUEVO (2026-08-22): cuerpo cerrado como confirmador final --
            # la proximidad y la ausencia de puerta ya propusieron este par,
            # pero eso solo dice "estan cerca", no "son el mismo cuerpo"
            # (ver docstring). Si mpx no esta disponible (llamador viejo sin
            # actualizar), se salta este gate y se preserva el comportamiento
            # anterior -- no bloquea nada nuevo.
            if mpx:
                # contexto LOCAL, no la pagina completa (ver docstring, fix
                # 2026-08-22): bbox del par + RADIO_CONTEXTO_M de margen,
                # cualquier entrada de muros_geo cuyo propio bbox intersecte
                # esa zona aporta sus segmentos como evidencia.
                bx0 = min(bboxes[i][0], bboxes[j][0]) - RADIO_CONTEXTO_PX
                bx1 = max(bboxes[i][1], bboxes[j][1]) + RADIO_CONTEXTO_PX
                by0 = min(bboxes[i][2], bboxes[j][2]) - RADIO_CONTEXTO_PX
                by1 = max(bboxes[i][3], bboxes[j][3]) + RADIO_CONTEXTO_PX
                contexto_par = [
                    s for k in range(n)
                    if bboxes[k][0] <= bx1 and bboxes[k][1] >= bx0 and bboxes[k][2] <= by1 and bboxes[k][3] >= by0
                    for s in muros_geo[k]['segmentos']
                ]
                resultado_cc = cuerpo_cerrado_fusiona(
                    muros_geo[i]['segmentos'], muros_geo[j]['segmentos'],
                    contexto_par, mpx,
                )
                if not resultado_cc['fusiona']:
                    n_bloqueados_por_cuerpo_cerrado += 1
                    _motivo_corto = resultado_cc['motivo'].split(' -- ')[0]
                    _diag_motivos[_motivo_corto] = _diag_motivos.get(_motivo_corto, 0) + 1
                    if _diag_muestras < 15:
                        _diag_muestras += 1
                        _am = resultado_cc['anchoA']['anchoM']
                        _bm = resultado_cc['anchoB']['anchoM']
                        print(f'    DIAG bloqueado {muros_geo[i]["id"]} vs {muros_geo[j]["id"]}: {resultado_cc["motivo"]} (anchoA={_am}, anchoB={_bm})')
                    # DIAGNOSTICO PROFUNDO (2026-08-22): para los primeros 2
                    # casos "sin par paralelo", mostrar que candidatos casi-
                    # validos existen de verdad cerca de cada segmento del
                    # lado que quedo en None -- el arquitecto confirmo que
                    # todo muro de este plano tiene 2 caras, asi que si esto
                    # sale None debe haber un candidato real fallando por muy
                    # poco (angulo, distancia o solape), no ausencia real.
                    if _am is None or _bm is None:
                        if _diag_pareja_muestras < 4:
                            _diag_pareja_muestras += 1
                            _grupo_vacio, _nombre_vacio = (muros_geo[i]['segmentos'], muros_geo[i]['id']) if _am is None else (muros_geo[j]['segmentos'], muros_geo[j]['id'])
                            print(f'    DIAG PAREJA -- {_nombre_vacio} (sin par, {len(_grupo_vacio)} segmento(s)) -- candidatos mas cercanos por segmento:')
                            for _s_vacio in _grupo_vacio:
                                _diag_c = diagnosticar_candidatos(_s_vacio, contexto_par, mpx, top_n=3)
                                print(f'      segmento {_diag_c["s_p1"]}-{_diag_c["s_p2"]} (largo={_diag_c["s_largo_m"]}m):')
                                print(f'        -- top 3 por distancia cruda (puede incluir coincidencias sin relacion real) --')
                                for _cand in _diag_c['top_candidatos']:
                                    print(f'        candidato {_cand["p1"]}-{_cand["p2"]} (largo={_cand["largo_m"]}m): dist={_cand["distancia_m"]}m, dif_angulo={_cand["dif_angulo_deg"]}deg, solapa={_cand["solapa_en_direccion"]}')
                                print(f'        -- top 3 CON solape real (lo que ancho_por_emparejamiento efectivamente evalua) --')
                                if _diag_c['top_candidatos_con_solape']:
                                    for _cand in _diag_c['top_candidatos_con_solape']:
                                        print(f'        candidato {_cand["p1"]}-{_cand["p2"]} (largo={_cand["largo_m"]}m): dist={_cand["distancia_m"]}m, dif_angulo={_cand["dif_angulo_deg"]}deg')
                                else:
                                    print(f'        (ninguno -- este segmento no solapa en proyeccion con NADA del contexto local)')
                    # DIAGNOSTICO (2026-08-23): "no conectados" es la causa
                    # dominante en N1 (38/61) y todavia sin investigar --
                    # ambos lados SI tienen ancho real aqui, el fallo esta en
                    # el relleno/dilatacion, no en el emparejamiento. Se
                    # imprime la tolerancia de dilatacion usada y el ancho
                    # minimo que la genera, para ver si tol_px esta quedando
                    # demasiado chico frente al hueco real entre los grupos.
                    elif _diag_pareja_muestras < 4:
                        _diag_pareja_muestras += 1
                        _tol = resultado_cc.get('tolPx')
                        print(f'    DIAG CONECTIVIDAD -- {muros_geo[i]["id"]} (anchoA={_am}m) vs {muros_geo[j]["id"]} (anchoB={_bm}m): tolPx={_tol} (~{round((_tol or 0) * mpx, 3)}m de dilatacion)')
                    continue
            union(i, j)

    if _diag_motivos:
        print(f'  DIAG resumen de motivos de bloqueo por cuerpo cerrado: {_diag_motivos}')

    grupos = {}
    for i in range(n):
        r = find(i)
        grupos.setdefault(r, []).append(i)

    muros_fusionados = []
    mapa_id_viejo_a_nuevo = {}
    for indices in grupos.values():
        ids_originales = [muros_geo[i]['id'] for i in indices]
        segmentos_todos = [s for i in indices for s in muros_geo[i]['segmentos']]
        largo_total = round(sum(muros_geo[i]['largo_total_m'] for i in indices), 2)
        anchos = [muros_geo[i]['ancho_linea_prom'] for i in indices if muros_geo[i]['ancho_linea_prom']]
        nuevo_id = f'MU{len(muros_fusionados) + 1:02d}'
        for id_viejo in ids_originales:
            mapa_id_viejo_a_nuevo[id_viejo] = nuevo_id
        muros_fusionados.append({
            'id': nuevo_id,
            'segmentos': segmentos_todos,
            'largo_total_m': largo_total,
            'ancho_linea_prom': round(sum(anchos) / len(anchos), 2) if anchos else 0,
            'muros_originales_ids': ids_originales,
        })

    print(f'  ✓ Fusion de muros por proximidad + cuerpo cerrado (regla arquitecto, tolerancia <= {tol_fusion_px:.1f}px punto-a-segmento -- ya convertida desde metros, ver TOL_FUSION_MUROS_M): {n} entradas -> {len(muros_fusionados)} muros ({n - len(muros_fusionados)} fusionadas, {n_bloqueados_por_puerta} pares bloqueados por puerta intermedia, {n_bloqueados_por_cuerpo_cerrado} pares bloqueados por cuerpo cerrado -- geometricamente cerca pero no son el mismo cuerpo)')
    return muros_fusionados, mapa_id_viejo_a_nuevo

def extraer_datos_vectoriales(pdf_page, zoom, mpx, crop_px=None, max_largo_trazo_m=3.0, mapeo_capas=None, mapa_estado_por_color=None):
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
    # NUEVO (2026-08-25, pedido del usuario -- 'la ejecucion anoche demoro
    # 30 minutos, revisa las opciones'): instrumentacion real por bloque
    # (sugerencia de la sesion paralela: time.time() alrededor de cada
    # bloque grande, en vez de adivinar sin medir) -- usa datetime, ya
    # importado, sin dependencia nueva.
    _t_func_inicio = datetime.now()
    def to_px(pt):
        # NUEVO (2026-08-03): esta pagina tiene rotation=270 (confirmado con diagnostico) --
        # get_drawings()/get_text() devuelven coordenadas SIN la rotacion de pagina aplicada,
        # mientras que get_pixmap() (Celda 2, el PNG de fondo) si la aplica -- sin este ajuste,
        # todo lo que sale de aca queda rotado ~90/270 grados respecto al PNG.
        p = pt * pdf_page.rotation_matrix
        return (p.x * zoom, p.y * zoom)

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
                bbox = span['bbox']  # (x0,y0,x1,y1) en puntos PDF, sin rotacion aplicada
                # mismo ajuste que to_px() -- rotar antes de escalar, y recalcular min/max
                # porque una rotacion de 90/270 puede invertir cual esquina es la minima.
                p0 = fitz.Point(bbox[0], bbox[1]) * pdf_page.rotation_matrix
                p1 = fitz.Point(bbox[2], bbox[3]) * pdf_page.rotation_matrix
                x0, y0 = min(p0.x, p1.x) * zoom, min(p0.y, p1.y) * zoom
                x1, y1 = max(p0.x, p1.x) * zoom, max(p0.y, p1.y) * zoom
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
                segmentos_l.append({'p1': p1, 'p2': p2, 'ancho_linea': ancho_linea, 'color': path.get('color'), 'fill': path.get('fill'), 'layer': path.get('layer'), 'dashes': path.get('dashes')})
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

    # DIAGNOSTICO (2026-08-23): el arquitecto reporto que la 2da entrada de
    # una pagina con 2 crops (pag2-2) termina con muros_geo en el rango de
    # coordenadas de la PRIMERA entrada (pag2-1), fuera de su propio
    # crop_px -- se imprime aqui, justo despues del filtro de recorte del
    # Paso 1 (antes de cualquier paso posterior), el bbox real de
    # segmentos_l para confirmar si el problema es este filtro mismo o
    # algo que pasa despues.
    if segmentos_l:
        _xs_p1 = [p[0] for s in segmentos_l for p in (s['p1'], s['p2'])]
        print(f'  DIAG PASO1 -- crop_px={crop_px}: {len(segmentos_l)} segmentos_l, bbox x=[{min(_xs_p1):.0f},{max(_xs_p1):.0f}]')

    # ── Paso 1.4 (NUEVO 2026-08-09, generalizado 2026-08-10): mapeo por CAPA
    #    (OCG) del PDF, si el usuario lo completo en MAPEO_CAPAS (Celda 3) --
    #    confirmado con datos reales que get_drawings() expone 'layer' por
    #    trazo. Los nombres de capa NO son estandar entre arquitectos
    #    (verificado contra 3 proyectos reales: PdV, Beauchef, Campo Lindo --
    #    mayusculas distintas, Puertas/Ventanas separadas o juntas, y ni
    #    Beauchef ni Campo Lindo tienen una capa de ejes/rasantes aunque PdV
    #    si) -- por eso el mapeo se completa a mano por proyecto, nunca se
    #    adivina aca.
    #
    #    2026-08-10: MAPEO_CAPAS dejo de estar limitado a 5 categorias fijas
    #    -- ahora acepta CUALQUIER categoria que el usuario defina en Celda 3
    #    (ej. 'accesibilidad', 'escalera', 'corte_elevacion',
    #    'deslinde_terreno', ademas de las ya conocidas). Esto es generico a
    #    proposito: cada proyecto puede traer categorias de capa distintas, y
    #    agregar una categoria nueva no deberia requerir tocar este codigo.
    #
    #    Filosofia (sin cambios): la capa es una señal ADICIONAL, no
    #    reemplaza la heuristica geometrica -- 'eje'/'cota' se agregan (OR)
    #    sobre lo que el Paso 1.5/1.6 ya detecta geometricamente. 'mobiliario'
    #    e 'ignorar' excluyen de proteccion como muro (Paso 2) -- 'ignorar'
    #    (NUEVO 2026-08-10, instruccion explicita del usuario) es para capas
    #    que hay que descartar por completo aunque no sean mobiliario (ej.
    #    'Muros Proy'/'Proyecciones' de OTRO piso, el cajetin 'Formato', o la
    #    capa '0' por defecto de AutoCAD) -- mismo tratamiento que
    #    'mobiliario', categoria separada porque el MOTIVO de exclusion es
    #    distinto (no es que sea mobiliario real, es que no corresponde a
    #    este nivel/pagina o no es geometria de construccion en absoluto).
    #    Cualquier OTRA categoria (incluidas 'muro', 'puerta', 'ventana',
    #    'accesibilidad', 'escalera', 'corte_elevacion', 'deslinde_terreno',
    #    o lo que sea que el usuario agregue) es SOLO DIAGNOSTICO por ahora
    #    -- se cuenta y se reporta, pero no cambia ningun resultado, porque
    #    todavia no existe una etapa del pipeline que sepa que HACER con esa
    #    señal (ej. no hay chequeo de accesibilidad ni deteccion de escalera
    #    basada en capa todavia). Se promueve a restrictiva/con logica
    #    propia solo cuando se diseñe esa etapa.
    #
    #    2026-08-10: 'puerta_ventana' se separo en 'puerta' y 'ventana' --
    #    instruccion explicita del usuario ("siempre debes procesar por
    #    separado, en la medida que se pueda, las capas de puertas y
    #    ventanas"). En Beauchef/Campo Lindo el PDF SI las separa en capas
    #    distintas -- ahi se puede mapear cada una a su categoria real. En
    #    PdV estan combinadas en una sola capa ('Ptas Ventanas') -- en ese
    #    caso esa capa se lista en AMBAS categorias (puerta Y ventana), lo
    #    cual simplemente marca esos segmentos como candidatos a las dos
    #    (sigue siendo diagnostico, no hay logica downstream todavia que
    #    dependa de la distincion).
    _capa_a_categoria = {}
    if mapeo_capas:
        for _categoria, _capas_lista in mapeo_capas.items():
            for _nombre_capa in (_capas_lista or []):
                _capa_a_categoria.setdefault(_nombre_capa, []).append(_categoria)

    _categorias_presentes = sorted(mapeo_capas.keys()) if mapeo_capas else []
    es_categoria_por_capa = {_cat: [False] * len(segmentos_l) for _cat in _categorias_presentes}
    n_sin_capa_mapeada = 0
    if _capa_a_categoria:
        for _i, _seg in enumerate(segmentos_l):
            _cats = _capa_a_categoria.get(_seg.get('layer'))
            if _cats:
                for _cat in _cats:
                    if _cat in es_categoria_por_capa:
                        es_categoria_por_capa[_cat][_i] = True
            else:
                n_sin_capa_mapeada += 1
        _resumen = ', '.join(f'{sum(es_categoria_por_capa[_c])} {_c}' for _c in _categorias_presentes)
        print(f"  ✓ MAPEO POR CAPA: {_resumen}, {n_sin_capa_mapeada} sin capa mapeada — de {len(segmentos_l)} segmentos totales (solo 'eje'/'cota' afectan Paso 1.5/1.6, solo 'mobiliario'/'ignorar' excluyen en Paso 2 -- el resto es diagnostico)")
        # NUEVO (2026-08-11, instruccion explicita del usuario: nunca dejar
        # pasar errores en silencio). Si el usuario mapeo capas reales para
        # una categoria pero termino con 0 coincidencias, es una señal fuerte
        # de que algo no calzo (typo no detectado en Celda 3, capa que no
        # existe en ESTA pagina en particular aunque exista en el documento,
        # etc.) -- se avisa explicito en vez de dejar que se pierda entre el
        # resto del resumen.
        for _cat in _categorias_presentes:
            if (mapeo_capas or {}).get(_cat) and sum(es_categoria_por_capa[_cat]) == 0:
                print(f"  ⚠ MAPEO_CAPAS['{_cat}'] = {mapeo_capas[_cat]} pero 0 segmentos de ESTA pagina coincidieron -- revisa si es un typo, o si esa capa simplemente no tiene contenido en esta pagina especifica.")

    # Alias de compatibilidad -- el Paso 1.5/1.6/2 mas abajo referencian estas
    # variables por nombre. Si el usuario no definio esa categoria en
    # MAPEO_CAPAS para este proyecto, queda un array de puro False (sin
    # efecto), no un error.
    es_eje_por_capa = es_categoria_por_capa.get('eje', [False] * len(segmentos_l))
    es_cota_por_capa = es_categoria_por_capa.get('cota', [False] * len(segmentos_l))
    es_mobiliario_por_capa = es_categoria_por_capa.get('mobiliario', [False] * len(segmentos_l))
    es_ignorar_por_capa = es_categoria_por_capa.get('ignorar', [False] * len(segmentos_l))

    # ── Paso 1.5 (NUEVO 2026-07-31): detectar EJES/lineas de referencia
    #    ANTES del Paso 2, sobre TODOS los segmentos (no solo los que
    #    sobrevivan sin proteger). Motivo: un eje dibujado con guiones
    #    cortos se encadena solo por cercania de extremos (Paso 2) y su
    #    span total (varios metros) supera UMBRAL_MURO_M con facilidad --
    #    quedaba protegido como "muro" ANTES de que el Paso 3 (mas abajo)
    #    llegara a evaluar si era un patron de guiones. Confirmado por el
    #    usuario (captura de plano, Isla de Pascua 2026-07-31): las lineas
    #    discontinuas son EJES de grilla estructural y las lineas delgadas
    #    con marcas de cota son COTAS -- ninguna de las dos es geometria
    #    real del edificio y NUNCA deben dividir/limitar un recinto.
    #    Reutiliza EXACTAMENTE los mismos parametros y la misma funcion
    #    _colineal_y_cerca que ya se usaba en el Paso 3 (ahora definidos
    #    aqui, antes, para poder correr esta pasada temprana) -- no se
    #    afina ni se relaja ningun umbral ya probado.
    TOL_DASH_GAP_M = 0.24
    TOL_DASH_GAP_PX = TOL_DASH_GAP_M / mpx if mpx else 40
    TOL_DASH_ANGULO_DEG = 5
    UMBRAL_DASH_M = 1.0
    UMBRAL_DASH_PX = UMBRAL_DASH_M / mpx if mpx else float('inf')
    MIN_SEGMENTOS_CADENA = 4

    def _colineal_y_cerca(s1, s2):
        dif_ang = abs(_angulo_segmento(s1) - _angulo_segmento(s2))
        dif_ang = min(dif_ang, 180 - dif_ang)
        if dif_ang > TOL_DASH_ANGULO_DEG:
            return False
        return (_distancia(s1['p1'], s2['p1']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p1'], s2['p2']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p2'], s2['p1']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p2'], s2['p2']) <= TOL_DASH_GAP_PX)

    grupos_dash_pre = _agrupar_segmentos(segmentos_l, TOL_DASH_GAP_PX, _colineal_y_cerca) if segmentos_l else []
    es_eje_pre = [False] * len(segmentos_l)
    n_eje_pre_detectado = 0
    for grupo in grupos_dash_pre:
        if len(grupo) < MIN_SEGMENTOS_CADENA:
            continue
        span_pre = _span_grupo(segmentos_l, grupo)
        if span_pre < UMBRAL_DASH_PX:
            continue
        largos_pre = [_distancia(segmentos_l[i]['p1'], segmentos_l[i]['p2']) for i in grupo]
        promedio_pre = sum(largos_pre) / len(largos_pre)
        variacion_pre = (max(largos_pre) - min(largos_pre)) / promedio_pre if promedio_pre else 999
        if variacion_pre > 0.9:
            continue
        for i in grupo:
            if not es_eje_pre[i]:
                es_eje_pre[i] = True
                n_eje_pre_detectado += 1

    # NUEVO (2026-08-09): OR con el mapeo por capa (arriba) -- si el usuario
    # mapeo una capa 'eje' en MAPEO_CAPAS, cualquier segmento de esa capa
    # cuenta como eje aunque la heuristica geometrica (arriba) no lo agarre
    # (ej. un guion demasiado corto o irregular para el patron de guiones).
    for i in range(len(segmentos_l)):
        if es_eje_por_capa[i] and not es_eje_pre[i]:
            es_eje_pre[i] = True
            n_eje_pre_detectado += 1

    # ── Paso 1.6 (NUEVO): detectar LINEAS DE COTA (linea solida, a diferencia
    #    del guion de Paso 1.5) por su firma visual mas especifica: (a) un
    #    segmento largo recto ("portador"), (b) 2+ segmentos cortos que lo
    #    cruzan en angulo (~30-60 grados respecto al portador -- la marca
    #    diagonal de cota, confirmada por el usuario con 2 imagenes de
    #    ejemplo: aparece en CADA punto de division de la cadena de cota,
    #    no solo en los extremos), y (c) al menos una marca cercana a un
    #    texto de cota ya extraido con 100% de precision (cotas_texto, PDF
    #    vectorial). Extiende el diagnostico de solo-proximidad ya iniciado
    #    el 31-jul (mas abajo, ahora reutiliza estas mismas funciones en vez
    #    de redefinirlas) sumando la señal de las marcas, que el diagnostico
    #    original no usaba. NO garantiza 100% -- el mismo tipo de trazo
    #    corto y diagonal ya causo falsos positivos/negativos en este
    #    notebook antes (arcos de puerta, achurado) -- verificar visualmente
    #    (recorte-zoom) contra planos reales antes de confiar, mismo criterio
    #    que ya rigio Paso 1.5 y el fix de achurado (revertido cuando fallo).
    UMBRAL_MARCA_M = 0.20
    UMBRAL_MARCA_PX = UMBRAL_MARCA_M / mpx if mpx else 0
    UMBRAL_PORTADOR_M = 0.5
    UMBRAL_PORTADOR_PX = UMBRAL_PORTADOR_M / mpx if mpx else float('inf')
    ANGULO_MARCA_MIN_DEG = 20
    ANGULO_MARCA_MAX_DEG = 70
    TOL_MARCA_CERCA_M = 0.09
    TOL_MARCA_CERCA_PX = TOL_MARCA_CERCA_M / mpx if mpx else 15
    TOL_MARCA_A_TEXTO_M = 0.35
    TOL_MARCA_A_TEXTO_PX = TOL_MARCA_A_TEXTO_M / mpx if mpx else 60
    MIN_MARCAS_POR_COTA = 2

    _centros_cotas_texto = [(t['x'] + t['w'] / 2, t['y'] + t['h'] / 2) for t in cotas_texto]

    def _dist_min_a_cota_texto(px, py):
        if not _centros_cotas_texto:
            return float('inf')
        return min(math.hypot(px - cx, py - cy) for cx, cy in _centros_cotas_texto)

    def _punto_medio(s):
        return ((s['p1'][0] + s['p2'][0]) / 2, (s['p1'][1] + s['p2'][1]) / 2)

    def _dist_punto_a_segmento(p, s):
        x0, y0 = p; x1, y1 = s['p1']; x2, y2 = s['p2']
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x0 - x1, y0 - y1)
        t = max(0, min(1, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
        px_, py_ = x1 + t * dx, y1 + t * dy
        return math.hypot(x0 - px_, y0 - py_)

    es_cota_pre = [False] * len(segmentos_l)
    n_cota_pre_detectado = 0
    _largos_seg = [_distancia(s['p1'], s['p2']) for s in segmentos_l]
    _candidatos_portador = [i for i, largo in enumerate(_largos_seg) if largo >= UMBRAL_PORTADOR_PX]
    _candidatos_marca = [i for i, largo in enumerate(_largos_seg) if 0 < largo <= UMBRAL_MARCA_PX]

    for ip in _candidatos_portador:
        s_portador = segmentos_l[ip]
        ang_portador = _angulo_segmento(s_portador)
        marcas_de_este = []
        for im in _candidatos_marca:
            if im == ip:
                continue
            s_marca = segmentos_l[im]
            dif_ang = abs(_angulo_segmento(s_marca) - ang_portador)
            dif_ang = min(dif_ang, 180 - dif_ang)
            if dif_ang < ANGULO_MARCA_MIN_DEG or dif_ang > ANGULO_MARCA_MAX_DEG:
                continue
            if _dist_punto_a_segmento(_punto_medio(s_marca), s_portador) > TOL_MARCA_CERCA_PX:
                continue
            marcas_de_este.append(im)
        if len(marcas_de_este) < MIN_MARCAS_POR_COTA:
            continue
        if not any(_dist_min_a_cota_texto(*_punto_medio(segmentos_l[im])) <= TOL_MARCA_A_TEXTO_PX for im in marcas_de_este):
            continue
        if not es_cota_pre[ip]:
            es_cota_pre[ip] = True
            n_cota_pre_detectado += 1
        for im in marcas_de_este:
            if not es_cota_pre[im]:
                es_cota_pre[im] = True
                n_cota_pre_detectado += 1

    # NUEVO (2026-08-09): OR con el mapeo por capa (arriba), mismo criterio
    # que el bloque equivalente de Paso 1.5 -- ver ese comentario.
    for i in range(len(segmentos_l)):
        if es_cota_por_capa[i] and not es_cota_pre[i]:
            es_cota_pre[i] = True
            n_cota_pre_detectado += 1

    print(f'  ✓ COTAS (linea): {n_cota_pre_detectado} segmentos identificados como linea/marca de cota (Paso 1.6)')

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
    # AJUSTE 2026-07-31: ahora, ademas, nunca se protege un segmento ya
    # identificado como eje/guion en el Paso 1.5 -- por mas que su cadena
    # de conectividad supere el span minimo de muro.
    TOL_MURO_M = 0.21
    TOL_MURO_PX = TOL_MURO_M / mpx if mpx else 35
    # NUEVO (2026-08-08): tope de diametro para el clustering de nodos de
    # _dividir_en_muros_por_union (ver docstring de esa funcion) -- generoso
    # para una esquina/cruce real con offset de grosor de muro, muy por
    # debajo de los 2.4-14.79m patologicos que produce un clustering
    # transitivo sin tope, medidos sobre datos reales de PdV.
    TOL_DIAMETRO_CLUSTER_M = 0.35
    TOL_DIAMETRO_CLUSTER_PX = TOL_DIAMETRO_CLUSTER_M / mpx if mpx else 60
    def _tocan(s1, s2):
        return (_distancia(s1['p1'], s2['p1']) <= TOL_MURO_PX or
                _distancia(s1['p1'], s2['p2']) <= TOL_MURO_PX or
                _distancia(s1['p2'], s2['p1']) <= TOL_MURO_PX or
                _distancia(s1['p2'], s2['p2']) <= TOL_MURO_PX)

    grupos_conectividad = _agrupar_segmentos(segmentos_l, TOL_MURO_PX, _tocan) if segmentos_l else []
    protegido = [False] * len(segmentos_l)
    n_muro_protegido = 0
    n_muro_evitado_por_eje = 0
    n_muro_evitado_por_cota = 0
    n_muro_evitado_por_mobiliario = 0
    n_muro_evitado_por_ignorar = 0
    # NUEVO (2026-08-11): desglose por capa REAL de lo excluido via 'ignorar'
    # -- investigacion pedida por el usuario tras ver que en PdV los muros
    # exportados cayeron de 517/312 a 122/94 al agregar 'ignorar'. Sin este
    # desglose no se puede saber si el impacto viene de 'Muros Proy' (otro
    # piso, esperado) o de 'Proyecciones' (podria incluir geometria real del
    # piso actual, ej. aleros/cubiertas sobre muros reales) -- necesario
    # para decidir si el resultado es correcto antes de confiar en el.
    _contador_ignorar_por_capa_real = {}
    _muestra_ignorar_por_capa_real = {}
    for grupo in grupos_conectividad:
        if _span_grupo(segmentos_l, grupo) >= UMBRAL_MURO_PX:
            for i in grupo:
                if es_eje_pre[i]:
                    n_muro_evitado_por_eje += 1
                    continue
                if es_cota_pre[i]:
                    n_muro_evitado_por_cota += 1
                    continue
                # NUEVO (2026-08-09): exclusion por capa 'mobiliario' (solo si
                # el usuario la mapeo en MAPEO_CAPAS) -- ataca el gap ya
                # documentado desde hace semanas de "artefactos/mobiliario
                # contaminando recintos", nunca resuelto por geometria pura.
                if es_mobiliario_por_capa[i]:
                    n_muro_evitado_por_mobiliario += 1
                    continue
                # NUEVO (2026-08-10, instruccion explicita del usuario):
                # exclusion por capa 'ignorar' -- capas que hay que descartar
                # por completo aunque no sean mobiliario (ej. 'Muros Proy' de
                # OTRO piso, 'Formato' del cajetin, la capa '0' por defecto).
                if es_ignorar_por_capa[i]:
                    n_muro_evitado_por_ignorar += 1
                    _capa_real_i = segmentos_l[i].get('layer') or '(sin capa)'
                    _contador_ignorar_por_capa_real[_capa_real_i] = _contador_ignorar_por_capa_real.get(_capa_real_i, 0) + 1
                    if len(_muestra_ignorar_por_capa_real.setdefault(_capa_real_i, [])) < 5:
                        _p1_aj_ign = ajustar(*segmentos_l[i]['p1'])
                        _p2_aj_ign = ajustar(*segmentos_l[i]['p2'])
                        _muestra_ignorar_por_capa_real[_capa_real_i].append(
                            (round(_distancia(segmentos_l[i]['p1'], segmentos_l[i]['p2']) * mpx, 2),
                             (round(_p1_aj_ign[0]), round(_p1_aj_ign[1])), (round(_p2_aj_ign[0]), round(_p2_aj_ign[1])))
                        )
                    continue
                protegido[i] = True
                n_muro_protegido += 1
    print(f'  ✓ EJES/RASANTES: {n_eje_pre_detectado} segmentos identificados como referencia (Paso 1.5), '
          f'{n_muro_evitado_por_eje} evitados de proteger como muro pese a superar el span minimo')
    print(f'  ✓ COTAS (linea): {n_muro_evitado_por_cota} segmentos adicionales evitados de proteger como muro (Paso 1.6)')
    if n_muro_evitado_por_mobiliario:
        print(f'  ✓ MOBILIARIO (por capa): {n_muro_evitado_por_mobiliario} segmentos evitados de proteger como muro')
    if n_muro_evitado_por_ignorar:
        print(f'  ✓ IGNORAR (por capa): {n_muro_evitado_por_ignorar} segmentos evitados de proteger como muro (otro piso/formato/capa por defecto)')
        print(f'    desglose por capa real (para verificar visualmente antes de confiar -- ver muestra_p1/p2 abajo, coordenadas ya ajustadas al recorte):')
        for _capa_real_d, _n_real_d in sorted(_contador_ignorar_por_capa_real.items(), key=lambda kv: -kv[1]):
            print(f'      {_capa_real_d!r}: {_n_real_d} segmentos evitados de proteger')
            for _largo_m_d, _p1_d, _p2_d in _muestra_ignorar_por_capa_real[_capa_real_d]:
                print(f'        largo_m={_largo_m_d} p1={_p1_d} p2={_p2_d}')

    # ── NUEVO (2026-08-03): exportar los muros reales, en vez de descartarlos ──
    # grupos_conectividad ya separo los tramos en componentes conexas (Paso 2) y
    # 'protegido' ya excluye lo reclasificado como eje/cota (Paso 1.5/1.6) -- esto
    # solo junta esa geometria ya calculada en un formato exportable, no repite
    # ningun calculo. Cada grupo que califico como muro (span >= 1.5m) se exporta
    # como una LISTA DE SEGMENTOS (no una polilinea ordenada) -- un muro real puede
    # ramificarse en una esquina en T o un cruce, y forzar un orden de camino unico
    # sobre un grafo que puede ramificar no tiene una respuesta correcta unica.
    muros_geo = []
    puertas_geo = []
    # NUEVO (2026-08-04, v2): clasificador geometrico de puertas -- reconoce el
    # arco de giro directamente en los datos vectoriales (los mismos segmentos_l
    # ya extraidos para muros_geo), en vez de depender del centroide que adivina
    # Claude Vision. Complementa al clasificador de Claude Vision (puertas_detalle),
    # no lo reemplaza -- ver roadmap.
    # v2 (instruccion explicita del usuario): 'las puertas solo son las que tienen
    # arco, continuo o discontinuo' -- se descartaron los umbrales de v1 (cantidad
    # minima de segmentos, ancho en un rango) porque un arco discontinuo (guiones)
    # puede tener pocos tramos y cualquier tamano; el UNICO criterio real es si la
    # forma es geometricamente un arco de circulo, sin importar tamano ni cuantos
    # tramos lo dibujan. Se ajusta un circulo (metodo algebraico/Kasa, via numpy,
    # ya importado en esta celda) a los puntos del grupo candidato y se mide que
    # tan bien encajan (residual relativo = desviacion estandar de la distancia al
    # centro, dividido por el radio) -- bajo = es un arco real, alto = no lo es.
    MIN_PUNTOS_ARCO = 6  # minimo para que el ajuste sea significativo (3 puntos
    # cualesquiera siempre arman un circulo perfecto sin decir nada sobre si es real)
    TOL_ARCO_RESIDUAL_REL = 0.15  # que tan circular debe ser el ajuste, sin verificar
    MIN_BARRIDO_ARCO_DEG = 20  # un arco real barre bastante mas que esto; una
    # recta mal ajustada a un circulo gigante barre casi nada
    def _ajustar_circulo(puntos):
        if len(puntos) < MIN_PUNTOS_ARCO:
            return None
        xs = np.array([p[0] for p in puntos], dtype=float)
        ys = np.array([p[1] for p in puntos], dtype=float)
        A = np.column_stack([2 * xs, 2 * ys, np.ones(len(xs))])
        b = xs ** 2 + ys ** 2
        try:
            sol, *_r = np.linalg.lstsq(A, b, rcond=None)
        except Exception:
            return None
        cx, cy, c = sol
        r2 = c + cx ** 2 + cy ** 2
        if r2 <= 0:
            return None
        r = math.sqrt(r2)
        dists = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
        residual_relativo = float(np.std(dists) / r) if r > 0 else 1.0
        # NUEVO (2026-08-04, fix falso positivo): una recta es matematicamente el
        # caso limite de un circulo de radio infinito -- puntos casi colineales
        # pueden dar un ajuste con residual bajo (parece 'buen circulo') aunque no
        # sea un arco real. Confirmado con datos reales: PG01/PG02/PG05 resultaron
        # ser lineas rectas (borde de muro, lineas de rampa) con radio gigante
        # (1.9-2.8m) que el residual solo no detecto. El barrido angular si lo
        # distingue: los puntos de una recta, vistos desde un centro lejano, caen
        # todos en un rango de angulo muy chico -- un arco real barre bastante mas.
        angulos = sorted(float(a) for a in (np.degrees(np.arctan2(ys - cy, xs - cx)) % 360))
        gaps = [angulos[i + 1] - angulos[i] for i in range(len(angulos) - 1)]
        gaps.append(360 - angulos[-1] + angulos[0])
        barrido_deg = 360 - max(gaps)
        return (float(cx), float(cy), float(r), residual_relativo, barrido_deg)
    # Tolerancia para re-agrupar candidatos a arco -- mas laxa que TOL_MURO_PX (35px)
    # porque un arco discontinuo tiene huecos entre guiones; reusa TOL_DASH_GAP_PX
    # (40px), la misma tolerancia ya usada para cadenas de linea discontinua.
    # NUEVO (2026-08-04, fix real de achurado): el ajuste de circulo no distingue
    # de forma confiable un arco real de un parche de achurado (confirmado con datos
    # reales: PG01/PG02 de una corrida resultaron ser las rayas del achurado 'Se
    # construye', con barrido 130-136 grados -- el fix anterior de barrido no las
    # agarraba). La señal que SI separa limpio (verificado con datos reales, 98-99%
    # vs 40-86% del resto): un achurado son decenas de trazos CASI TODOS PARALELOS
    # entre si (rayas repetidas a la misma inclinacion); un arco real, aunque tenga
    # algunos segmentos parecidos, nunca tiene esa uniformidad -- cada tramo de una
    # curva real gira progresivamente.
    TOL_PARALELO_DEG = 3
    UMBRAL_FRACCION_PARALELA = 0.90
    # NUEVO (2026-08-04): descarta simbolos tipo 'flecha de pendiente de rampa' --
    # 2 lineas rectas que convergen a un punto en angulo agudo, confirmado con
    # datos reales que se repite en varias rampas del plano. Se distingue de un
    # arco real por el SALTO de direccion: un arco gira progresivo (saltos chicos
    # y parejos entre segmentos consecutivos); una flecha en V tiene 2 direcciones
    # dominantes con un salto brusco entre ellas. Medido con datos reales: la
    # flecha de rampa da salto_max/barrido=2.30, las 12 puertas reales confirmadas
    # dan 0.11-0.51 -- separacion limpia.
    UMBRAL_SALTO_MAX_RELATIVO = 0.8
    def _salto_maximo_relativo(segmentos_grupo):
        angs = sorted(_angulo_segmento(s) % 180 for s in segmentos_grupo)
        n = len(angs)
        if n < 2:
            return 0.0
        gaps = [angs[i + 1] - angs[i] for i in range(n - 1)]
        gaps.append(180 - angs[-1] + angs[0])
        barrido = 180 - max(gaps)
        gaps_internos = gaps[:-1]
        salto_max = max(gaps_internos) if gaps_internos else 0.0
        return salto_max / barrido if barrido > 0 else 0.0
    def _fraccion_paralela(segmentos_grupo):
        angs = [_angulo_segmento(s) for s in segmentos_grupo]
        n = len(angs)
        if n < 2:
            return 0.0
        n_con_paralelo = 0
        for i in range(n):
            for k in range(n):
                if i == k:
                    continue
                d = abs(angs[i] - angs[k])
                d = min(d, 180 - d)
                if d <= TOL_PARALELO_DEG:
                    n_con_paralelo += 1
                    break
        return n_con_paralelo / n
    def _cerca_arco(s1, s2):
        return (_distancia(s1['p1'], s2['p1']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p1'], s2['p2']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p2'], s2['p1']) <= TOL_DASH_GAP_PX or
                _distancia(s1['p2'], s2['p2']) <= TOL_DASH_GAP_PX)
    TOL_EJE_MURO_DEG = 8  # tolerancia angular para considerar un segmento parte de un muro real
    _mapa_estado_por_color = mapa_estado_por_color or {}
    n_muro_con_estado = 0
    # SUPERADO (2026-08-21): antes se excluia por color el achurado "Se retira"
    # (amarillo, hardcodeado para PdV) -- ver _es_amarillo, eliminada. Regla del
    # arquitecto: el color NUNCA decide si algo es geometria real, eso lo decide
    # la forma (cuerpo cerrado / filtro angular de abajo, sin cambios). El color
    # solo se usa para ETIQUETAR el resultado como agregado/eliminado, leyendo
    # la leyenda SIMBOLOGIA real del documento (_detectar_leyenda_simbologia,
    # corrida una vez fuera de esta funcion) -- nunca hardcodeado por proyecto.
    n_muro_desalineado = 0
    for grupo in grupos_conectividad:
        if _span_grupo(segmentos_l, grupo) < UMBRAL_MURO_PX:
            continue
        segs_protegidos = [i for i in grupo if protegido[i]]
        if not segs_protegidos:
            continue
        # NUEVO (2026-08-04): de los ya protegidos, exportar solo los alineados a un
        # eje (0/90 grados, +-TOL_EJE_MURO_DEG) -- en ESTE plano (rectilineo) los
        # muros reales corren en 0/90; un arco de giro de puerta barre angulos
        # intermedios de forma continua y el achurado corre en diagonal constante --
        # ninguno de los dos pasa este filtro. NO toca 'protegido' (la mascara que
        # separa recintos via OpenCV sigue exactamente igual, sin riesgo de repetir
        # la regresion del 27-jul) -- solo filtra que segmentos se exportan como
        # parte del poligono de muro. Supuesto a revisar en planos NO rectilineos.
        # NOTA (2026-08-21): el color YA NO filtra aca -- todo segmento protegido
        # pasa por el filtro angular sin importar su color/relleno.
        segs_reales = []
        segs_no_muro = []  # candidatos a arco de puerta (excluidos por angulo, no por color)
        for i in segs_protegidos:
            ang = _angulo_segmento(segmentos_l[i]) % 90
            if min(ang, 90 - ang) <= TOL_EJE_MURO_DEG:
                segs_reales.append(i)
            else:
                segs_no_muro.append(i)
        n_muro_desalineado += len(segs_protegidos) - len(segs_reales)
        if not segs_reales:
            continue
        # NUEVO (2026-08-08): antes, todo 'segs_reales' del grupo (que puede
        # ser la red de muros de un piso entero conectada por sus esquinas y
        # cruces en T) se exportaba como UN solo muro -- ver docstring de
        # _dividir_en_muros_por_union para el diagnostico completo (caso real
        # MU01, PdV Nivel 1: 638 segmentos, 351m). Ahora se corta en cruces
        # reales (3+ segmentos) y puntas sueltas, siguiendo de largo en las
        # esquinas simples (grado 2) -- cada cadena resultante se exporta
        # como su propio muro.
        cadenas_muro = _dividir_en_muros_por_union(segmentos_l, segs_reales, TOL_MURO_PX, TOL_DIAMETRO_CLUSTER_PX)
        for _cadena in cadenas_muro:
            segmentos_muro = []
            for i in _cadena:
                p1 = ajustar(*segmentos_l[i]['p1'])
                p2 = ajustar(*segmentos_l[i]['p2'])
                segmentos_muro.append({'p1': [round(p1[0]), round(p1[1])], 'p2': [round(p2[0]), round(p2[1])]})
            anchos_muro = [segmentos_l[i]['ancho_linea'] for i in _cadena]
            # NUEVO (2026-08-21): 'estado' viene de la leyenda real del PDF, no
            # de un color hardcodeado -- ver _detectar_leyenda_simbologia. Voto
            # simple: el primer segmento de la cadena cuyo color/fill matchea
            # algun color de la leyenda define el estado de todo el muro (un
            # muro real no deberia mezclar 2 estados de intervencion distintos
            # en la misma cadena; si eso pasara, se toma el primero encontrado
            # y no se avisa aca -- queda para revisar si se ve un caso real).
            _estado_muro = None
            for i in _cadena:
                _estado_muro = _estado_por_leyenda(segmentos_l[i], _mapa_estado_por_color)
                if _estado_muro is not None:
                    break
            if _estado_muro is not None:
                n_muro_con_estado += 1
            muros_geo.append({
                'id': f'MU{len(muros_geo) + 1:02d}',
                'segmentos': segmentos_muro,
                'largo_total_m': round(sum(_distancia(segmentos_l[i]['p1'], segmentos_l[i]['p2']) for i in _cadena) * mpx, 2),
                'ancho_linea_prom': round(sum(anchos_muro) / len(anchos_muro), 2) if anchos_muro else 0,
                'estado': _estado_muro,
            })
        # Buscar arcos de puerta entre los segmentos que quedaron fuera del muro --
        # re-agrupa SOLO esos candidatos, con tolerancia laxa (TOL_DASH_GAP_PX) para
        # no perder arcos dibujados discontinuos, y confirma cada grupo ajustando un
        # circulo -- si el ajuste es bueno (residual bajo) es un arco real, sin
        # importar su tamano ni cuantos tramos lo forman.
        if segs_no_muro:
            _sub_segmentos = [segmentos_l[i] for i in segs_no_muro]
            _sub_grupos = _agrupar_segmentos(_sub_segmentos, TOL_DASH_GAP_PX, _cerca_arco)
            for _sub_grupo in _sub_grupos:
                _puntos_arco = []
                for j in _sub_grupo:
                    _puntos_arco.append(_sub_segmentos[j]['p1'])
                    _puntos_arco.append(_sub_segmentos[j]['p2'])
                _ajuste = _ajustar_circulo(_puntos_arco)
                if _ajuste is None:
                    continue
                _cx, _cy, _radio_px, _residual, _barrido_deg = _ajuste
                if _residual > TOL_ARCO_RESIDUAL_REL:
                    continue
                if _barrido_deg < MIN_BARRIDO_ARCO_DEG:
                    continue
                _sub_segmentos_grupo = [_sub_segmentos[j] for j in _sub_grupo]
                if _fraccion_paralela(_sub_segmentos_grupo) >= UMBRAL_FRACCION_PARALELA:
                    continue  # achurado: casi todos los tramos son paralelos entre si
                if _salto_maximo_relativo(_sub_segmentos_grupo) > UMBRAL_SALTO_MAX_RELATIVO:
                    continue  # flecha/cuna en V: 2 direcciones con un salto brusco, no un giro progresivo
                _indices_orig = [segs_no_muro[j] for j in _sub_grupo]
                _segmentos_puerta = []
                for i in _indices_orig:
                    p1 = ajustar(*segmentos_l[i]['p1'])
                    p2 = ajustar(*segmentos_l[i]['p2'])
                    _segmentos_puerta.append({'p1': [round(p1[0]), round(p1[1])], 'p2': [round(p2[0]), round(p2[1])]})
                # Puntos de union: hasta 2 (2026-08-04, v3, pedido explicito del
                # usuario) -- una puerta tipicamente esta ENTRE dos tramos de muro,
                # uno a cada lado del vano ('===========--------------========').
                # No se fuerza que existan 2 -- hay muros que no terminan en nada real
                # (ej. una salida sin puerta), asi que se guardan los que se encuentren
                # (0, 1 o 2), sin inventar un segundo lado que no este ahi.
                # AJUSTE (2026-08-04, v4): buscar desde los 2 EXTREMOS reales del arco
                # (el par de puntos mas separados entre si), no desde CUALQUIER punto
                # muestreado -- la version anterior podia enganchar el punto de muro
                # mas cercano a un tramo INTERMEDIO de la curva, mostrando el punto de
                # union sobre la mitad del arco en vez de en su punta (confirmado con
                # capturas reales del usuario, portal).
                _extremo_a, _extremo_b = _puntos_arco[0], _puntos_arco[0]
                _dist_max_arco = -1.0
                for _pa in _puntos_arco:
                    for _pb in _puntos_arco:
                        _d_ext = _distancia(_pa, _pb)
                        if _d_ext > _dist_max_arco:
                            _dist_max_arco = _d_ext
                            _extremo_a, _extremo_b = _pa, _pb
                _puntos_union_px = []
                for _extremo in (_extremo_a, _extremo_b):
                    _mejor_d, _mejor_pm = None, None
                    for i in segs_reales:
                        for pm in (segmentos_l[i]['p1'], segmentos_l[i]['p2']):
                            _d_local = _distancia(pm, _extremo)
                            if _mejor_d is None or _d_local < _mejor_d:
                                _mejor_d, _mejor_pm = _d_local, pm
                    if _mejor_pm is None:
                        continue
                    if any(_distancia(_mejor_pm, _pu) <= TOL_MURO_PX for _pu in _puntos_union_px):
                        continue  # mismo lado ya capturado por el otro extremo, no lo duplica
                    _puntos_union_px.append(_mejor_pm)
                _puntos_union = []
                for _pm in _puntos_union_px:
                    _pu_aj = ajustar(*_pm)
                    _puntos_union.append([round(_pu_aj[0]), round(_pu_aj[1])])
                puertas_geo.append({
                    'id': f'PG{len(puertas_geo) + 1:02d}',
                    'segmentos': _segmentos_puerta,
                    'ancho_estimado_m': round(_radio_px * mpx, 2),
                    'muro_asociado_id': muros_geo[-1]['id'],
                    'puntos_union': _puntos_union,
                })
    # NUEVO (2026-08-04): puertas dibujadas como curva Bezier real ('c'), no como
    # muchos tramos rectos -- el pipeline de arriba (segmentos_l) nunca las ve,
    # van a 'otros_items' y de ahi a 'trazos' (solo se usan para borrar simbolos
    # del raster, nunca se clasifican). Confirmado con un caso real (ver roadmap):
    # una puerta visible en el plano nunca generaba ningun candidato porque su arco
    # es una Bezier cubica de 4 puntos de control, no una cadena de lineas rectas.
    # Criterio (instruccion explicita del usuario, no un umbral de tamano): un arco
    # de giro de puerta es un cuarto de circulo (~90 grados) -- se muestrean puntos
    # a lo largo de la curva y se reusa _ajustar_circulo (misma funcion ya probada
    # arriba) para confirmar que el barrido cae cerca de 90 grados. Una curva de
    # mobiliario (ej. el ovalo de un WC) no tiene esa forma y se descarta aca.
    N_MUESTRAS_BEZIER = 9
    UMBRAL_BARRIDO_BEZIER_MIN = 75
    UMBRAL_BARRIDO_BEZIER_MAX = 105
    # Piso minimo de plausibilidad (2026-08-04, a pedido del usuario) -- NO es un
    # intento de 'confirmar que es puerta' (eso ya lo hace el barrido ~90 grados),
    # es para descartar ruido sub-centimetrico (tornillos, marcas de detalle,
    # circulos decorativos chicos) que puede tener barrido ~90 por pura casualidad
    # geometrica sin ser ningun simbolo arquitectonico real. Confirmado con datos
    # reales: sin este piso, 146/209 y 64/92 candidatos eran ruido de <5cm de radio.
    UMBRAL_RADIO_BEZIER_MIN_M = 0.5
    def _muestrear_bezier_cubica(p0, p1, p2, p3, n=N_MUESTRAS_BEZIER):
        puntos = []
        for i in range(n):
            t = i / (n - 1)
            mt = 1 - t
            x = mt**3*p0[0] + 3*mt**2*t*p1[0] + 3*mt*t**2*p2[0] + t**3*p3[0]
            y = mt**3*p0[1] + 3*mt**2*t*p1[1] + 3*mt*t**2*p2[1] + t**3*p3[1]
            puntos.append((x, y))
        return puntos
    # AJUSTE (2026-08-04, v4): buscar desde los 2 extremos reales de la curva
    # (muestras[0] y muestras[-1], los puntos P0/P3 de la Bezier -- ya son los
    # extremos exactos, no hace falta buscar el par mas separado como en el caso
    # de lineas rectas) -- mismo motivo que el ajuste de arriba: evitar enganchar
    # el punto de muro mas cercano a un tramo intermedio de la curva.
    def _puntos_union_y_muro(extremo_a_aj, extremo_b_aj):
        puntos_union, muro_id = [], None
        for extremo in (extremo_a_aj, extremo_b_aj):
            mejor_d, mejor_pm, mejor_muro_id = None, None, None
            for m in muros_geo:
                for s in m['segmentos']:
                    for pm in (s['p1'], s['p2']):
                        d = _distancia(pm, extremo)
                        if mejor_d is None or d < mejor_d:
                            mejor_d, mejor_pm, mejor_muro_id = d, pm, m['id']
            if mejor_pm is None:
                continue
            if any(_distancia(mejor_pm, pu) <= TOL_MURO_PX for pu in puntos_union):
                continue
            puntos_union.append(mejor_pm)
            if muro_id is None:
                muro_id = mejor_muro_id
        return puntos_union, muro_id
    n_puertas_bezier = 0
    for _op, _pts, _ancho_linea in otros_items:
        if _op != 'c' or len(_pts) != 4:
            continue
        _muestras = _muestrear_bezier_cubica(*_pts)
        _ajuste_bz = _ajustar_circulo(_muestras)
        if _ajuste_bz is None:
            continue
        _cx_bz, _cy_bz, _radio_bz_px, _residual_bz, _barrido_bz = _ajuste_bz
        if _residual_bz > TOL_ARCO_RESIDUAL_REL:
            continue
        if not (UMBRAL_BARRIDO_BEZIER_MIN <= _barrido_bz <= UMBRAL_BARRIDO_BEZIER_MAX):
            continue
        if _radio_bz_px * mpx < UMBRAL_RADIO_BEZIER_MIN_M:
            continue
        _muestras_aj = [ajustar(x, y) for x, y in _muestras]
        _segmentos_bz = []
        for _i in range(len(_muestras_aj) - 1):
            _p1bz = _muestras_aj[_i]
            _p2bz = _muestras_aj[_i + 1]
            _segmentos_bz.append({'p1': [round(_p1bz[0]), round(_p1bz[1])], 'p2': [round(_p2bz[0]), round(_p2bz[1])]})
        _puntos_union_bz, _muro_id_bz = _puntos_union_y_muro(_muestras_aj[0], _muestras_aj[-1])
        n_puertas_bezier += 1
        puertas_geo.append({
            'id': f'PG{len(puertas_geo) + 1:02d}',
            'segmentos': _segmentos_bz,
            'ancho_estimado_m': round(_radio_bz_px * mpx, 2),
            'muro_asociado_id': _muro_id_bz,
            'puntos_union': [[round(p[0]), round(p[1])] for p in _puntos_union_bz],
        })
    print(f'  ✓ Puertas exportadas desde curva Bezier (arco ~90 grados): {n_puertas_bezier}')
    print(f'  ✓ Muros exportados: {len(muros_geo)} (de {sum(1 for g in grupos_conectividad if _span_grupo(segmentos_l, g) >= UMBRAL_MURO_PX)} grupos protegidos, {n_muro_desalineado} segmentos descartados por angulo no-ortogonal, {n_muro_con_estado} muros con estado agregado/eliminado detectado via leyenda -- el color ya NO excluye geometria, ver _detectar_leyenda_simbologia)')

    # NUEVO (2026-08-09): tras el split por union (arriba), lineas de
    # referencia (deslinde, rasante, linea de edificacion, linea oficial --
    # dibujadas con linetype punteado/rayado) quedan fragmentadas en decenas
    # de muros individuales muy cortos, porque el split corta en cada
    # micro-cruce del rayado. Se detectan y separan aca, DESPUES de que
    # 'muros_geo' ya tiene todos los grupos acumulados -- una linea de
    # referencia cruza varios grupos de conectividad distintos del plano, asi
    # que no se puede filtrar grupo por grupo. Ver docstring de la funcion
    # para el diagnostico completo (validado con datos reales de PdV,
    # corrida 09ago, 3 iteraciones hasta eliminar 2 falsos positivos reales
    # encontrados por verificacion visual: la escalera y una pared real
    # casi superpuesta con la linea de deslinde vecina).
    muros_geo, muros_excluidos_por_referencia = _detectar_lineas_referencia_periodicas(muros_geo, mpx)
    if muros_excluidos_por_referencia:
        print(f'  ✓ Lineas de referencia periodicas (deslinde/rasante/linea oficial): {len(muros_excluidos_por_referencia)} muros movidos a muros_excluidos_por_referencia (no arquitectura real)')

    # NUEVO (2026-08-24) -- Tipologia C, revision visual de N2 (ver
    # Convenciones_CAD.md D.7 y D.1): "Se retira" (o cualquier sinonimo de
    # eliminado/demolido, ver _clasificar_estado_por_texto_leyenda) significa
    # que el elemento SE VA A DEMOLER -- para el analisis debe tratarse como
    # AUSENTE en el estado final del plano, no solo etiquetarse con 'estado'
    # y seguir participando como si fuera muro activo (lo que hacia hasta
    # ahora: el campo 'estado' se guardaba pero nada lo usaba para excluir).
    # Se saca de muros_geo ANTES de fusionar -- mismo criterio que las
    # lineas de referencia de arriba, para no fusionar un muro real con un
    # tramo que ya deberia estar descartado. Se guarda aparte (no se
    # descarta en silencio) para trazabilidad, mismo patron que
    # muros_excluidos_por_referencia.
    muros_excluidos_por_demolicion = [m for m in muros_geo if m.get('estado') == 'eliminado']
    if muros_excluidos_por_demolicion:
        muros_geo = [m for m in muros_geo if m.get('estado') != 'eliminado']
        print(f'  ✓ Estado "eliminado" (Se retira / se demuele / sinonimos): {len(muros_excluidos_por_demolicion)} muros movidos a muros_excluidos_por_demolicion (ausentes en el estado final, no participan de cuerpo cerrado/superficie)')

    # NUEVO (2026-08-20): consolida las cadenas cortadas en cada cruce T/X
    # (arriba) de vuelta a "un muro" en el sentido del arquitecto -- ver
    # docstring de _fusionar_muros_por_proximidad para la regla completa y
    # su origen (Beauchef, 19-ago). Corre DESPUES de excluir lineas de
    # referencia (arriba) para no intentar fusionar un muro real con un
    # fragmento de deslinde/rasante que ya deberia estar descartado.
    TOL_FUSION_MUROS_M = 0.06
    TOL_FUSION_MUROS_PX = TOL_FUSION_MUROS_M / mpx if mpx else 10
    _t_antes_fusion = datetime.now()
    print(f'  ⏱ Extracción + filtrado (Paso 1-4): {str(_t_antes_fusion - _t_func_inicio).split(".")[0]}')
    muros_geo, _mapa_fusion_muros = _fusionar_muros_por_proximidad(muros_geo, puertas_geo, TOL_FUSION_MUROS_PX, mpx=mpx)
    _t_despues_fusion = datetime.now()
    print(f'  ⏱ Fusión + cuerpo cerrado: {str(_t_despues_fusion - _t_antes_fusion).split(".")[0]}')

    # DIAGNOSTICO VISUAL COMPLETO (2026-08-23): renderiza TODOS los
    # muros_geo finales (post-fusion, con el fix de conectores + poligono
    # de cierre) sobre el plano real completo -- para verificacion visual
    # rapida del resultado, mismo patron que _CASOS_DIAG_VISUAL (crop) pero
    # para la pagina entera. Usa `plano_full` y `fname_tag` (globales de
    # esta iteracion del loop de paginas, ver mas abajo en la celda) --
    # se salta en silencio si no existen (version vieja del notebook).
    # DIAGNOSTICO (2026-08-23, sesion siguiente): el arquitecto reporto que
    # el render de la SEGUNDA entrada (pag2-2) muestra los muros de la
    # PRIMERA entrada (pag2-1) en vez de los propios -- antes de tocar el
    # codigo de dibujo, se imprime crop_px, PAGINA_PLANTA, fname_tag y el
    # bbox real (min/max x,y) de todos los segmentos de muros_geo en este
    # punto, para confirmar con datos si el problema es de DATOS (muros_geo
    # realmente contiene la entrada equivocada) o solo del dibujo.
    try:
        _xs_diag = [p[0] for _m in muros_geo for s in _m['segmentos'] for p in (s['p1'], s['p2'])]
        _ys_diag = [p[1] for _m in muros_geo for s in _m['segmentos'] for p in (s['p1'], s['p2'])]
        print(f'  DIAG BBOX -- PAGINA_PLANTA={PAGINA_PLANTA} crop_px={crop_px} fname_tag={fname_tag} muros_geo={len(muros_geo)}')
        if _xs_diag:
            # NOTA (2026-08-23): estas coordenadas son RELATIVAS al crop_px de
            # esta entrada (ver ajustar() en Paso 4) -- confirmado como causa
            # del bug de render entre pag2-1/pag2-2. Se imprime tambien el
            # bbox absoluto (sumando crop_px[0]/[1]) para comparar directo
            # contra plano_full.shape sin tener que hacer la cuenta a mano.
            _ox_diag, _oy_diag = (crop_px[0], crop_px[1]) if crop_px else (0, 0)
            print(f'    bbox RELATIVO al crop: x=[{min(_xs_diag):.0f},{max(_xs_diag):.0f}] y=[{min(_ys_diag):.0f},{max(_ys_diag):.0f}]')
            print(f'    bbox ABSOLUTO (pagina completa): x=[{min(_xs_diag)+_ox_diag:.0f},{max(_xs_diag)+_ox_diag:.0f}] y=[{min(_ys_diag)+_oy_diag:.0f},{max(_ys_diag)+_oy_diag:.0f}] (plano_full shape={plano_full.shape})')
    except Exception as _e_diag_bbox:
        print(f'  DIAG BBOX: omitido ({_e_diag_bbox})')

    # BUG ENCONTRADO Y CORREGIDO (2026-08-23): muros_geo guarda coordenadas
    # RELATIVAS al propio crop_px de esta entrada (ver 'ajustar()' en Paso 4,
    # linea ~1536-1538) -- NO son absolutas de pagina completa como se asumio
    # al escribir este diagnostico. Para pag2-1 (crop x1=0) esto no se nota
    # (restar 0 no cambia nada), pero para pag2-2 (crop x1=2860) el resultado
    # quedaba corrido ~2860px hacia la izquierda, cayendo sobre la zona de
    # pag2-1 -- exactamente el bug que reporto el arquitecto. Se suma de
    # vuelta el origen del crop (_ox,_oy) antes de dibujar sobre plano_full
    # (que SI esta en coordenadas absolutas de pagina completa).
    _ox, _oy = (crop_px[0], crop_px[1]) if crop_px else (0, 0)
    try:
        _img_full = cv2.cvtColor(plano_full.copy(), cv2.COLOR_RGB2BGR)
        for _m in muros_geo:
            for _s in _m['segmentos']:
                _p1 = (round(_s['p1'][0] + _ox), round(_s['p1'][1] + _oy))
                _p2 = (round(_s['p2'][0] + _ox), round(_s['p2'][1] + _oy))
                cv2.line(_img_full, _p1, _p2, (0, 0, 255), 4)
        _archivo_full = f'diag_muros_{fname_tag}_{_RUN_TS}.png'
        cv2.imwrite(_archivo_full, _img_full)
        print(f'  DIAG VISUAL COMPLETO: guardado {_archivo_full} ({len(muros_geo)} muros dibujados)')
        if AUTO_DESCARGAR_DIAGNOSTICOS:
            try:
                from google.colab import files as _files_diag_full
                _files_diag_full.download(_archivo_full)
            except Exception:
                pass
    except Exception as _e_diag_full:
        print(f'  DIAG VISUAL COMPLETO: omitido ({_e_diag_full})')
    _t_despues_diag_muros = datetime.now()
    print(f'  ⏱ Diagnóstico muros (línea): {str(_t_despues_diag_muros - _t_despues_fusion).split(".")[0]}')

    # DIAGNOSTICO VISUAL COMPLETO -- TODOS los tipos de elemento en su
    # propio color (2026-08-24, pedido del arquitecto), CORREGIDO 2026-08-25
    # tras la corrida real contra PdV -- 2 problemas encontrados y arreglados
    # en esta version:
    #
    # (1) El arquitecto reporto (visual, sobre diag_completo_pag2-1) que no
    #     se veia NINGUN muro con cuerpo cerrado, solo bordes marcados --
    #     2 causas reales, ambas corregidas: (a) el color 'existente' era
    #     gris casi negro (60,60,60), indistinguible de las lineas negras
    #     del plano base -- cambiado a un tono claramente distinto; (b) el
    #     render solo dibujaba las LINEAS de cada segmento (cv2.line),
    #     nunca el POLIGONO RELLENO que el algoritmo de cuerpo cerrado usa
    #     de verdad para decidir si algo cierra -- ahora se rellena el area
    #     real (relleno_solido_de_contexto, semi-transparente) y ADEMAS se
    #     dibuja el contorno encima, para que el cuerpo cerrado se vea como
    #     area, no solo como trazo.
    #
    # (2) La clasificacion de ventana/hoja-vano corria clasificar_no_muro()
    #     sobre TODO el pool de segmentos de la pagina de una sola vez --
    #     parecia el mismo error de 'contexto global' ya corregido el
    #     22-ago para la fusion real. Efecto visto: ventana=629 segs en N2
    #     (imposible), mayoria de muros reales pintados de celeste/magenta.
    #     🔴 CORRECCION 2026-08-26: el intento de arreglar esto con
    #     contexto LOCAL por segmento (bbox propio + RADIO_CONTEXTO_M) fue
    #     revertido -- corrida real mostro que escala mal (N2, ~834
    #     segmentos protegidos, no terminaba en mas de 1 hora) y ADEMAS no
    #     mejoraba la correccion (N1 dio ventana=83 identico local vs
    #     global). El problema real no es el alcance del contexto, es que
    #     identificar_hojas_de_puerta() marca hoja ante cualquier vecino
    #     mas ancho sin margen minimo -- pendiente arreglar eso (ver
    #     roadmap 26-ago 'Problema 2', casos MU54/MU55/MU72 de N2). Por
    #     ahora se usa 1 sola llamada global (rapida, ya validada).
    #
    # Cobertura real hoy: muros (relleno solido + contorno, color por
    # estado), puertas (arcos ya extraidos en puertas_geo), ventana y
    # hoja/vano de puerta (linea, clasificacion global -- sabido sobre-
    # inclusiva, ver nota arriba). Escaleras/rampas
    # NO se marcan -- sin detector geometrico implementado todavia
    # (Convenciones_CAD D.4/D.5, catalogo_tipologias.py estado='pendiente')
    # -- se avisa explicitamente en el print, no se omite en silencio.
    #
    # IMPORTANTE (coordenadas): 'segmentos_l' (fuente de _seg_pool_clasif)
    # es ABSOLUTO de pagina completa (to_px(), antes de ajustar()) -- no se
    # le suma _ox/_oy. 'muros_geo'/'puertas_geo'/'muros_excluidos_por_
    # demolicion' SI pasaron por ajustar() (relativas al crop) -- a esas si
    # se les suma _ox/_oy, igual que el bloque diag_muros_<pagina>.png.
    try:
        _seg_pool_clasif = [segmentos_l[_i] for _i in range(len(segmentos_l)) if protegido[_i]]

        # REVERTIDO (2026-08-26): la version 'contexto local por segmento'
        # de ayer (25-ago) resulto ser MUCHO mas lenta que esta -- corrida
        # real: N2 (~834 segmentos protegidos) llevaba mas de 1 hora SIN
        # terminar este bloque, contra los ~49s que tardo N1 (pool chico)
        # con el mismo enfoque -- escala mal porque cada segmento vuelve a
        # recorrer TODO el pool para armar su propio contexto local, o sea
        # sigue siendo O(n^2) pero ahora multiplicado por cada segmento.
        #
        # Ademas NO mejoraba la correccion: N1 dio ventana=83 identico con
        # contexto local que con contexto global -- confirma que el
        # problema real de fondo no es 'global vs local', es que
        # identificar_hojas_de_puerta() marca hoja ante CUALQUIER vecino
        # mas ancho, sin exigir un margen minimo (ver roadmap 26-ago,
        # 'Problema 2', pendiente -- casos MU54/MU55/MU72 de N2 sin
        # investigar todavia). Arreglar eso es lo que de verdad va a
        # mejorar el resultado visual, no el alcance del contexto -- por
        # ahora se vuelve a 1 sola llamada global (rapida, ya validada).
        _clasif_pagina = clasificar_no_muro(_seg_pool_clasif, mpx) if _seg_pool_clasif else {'sets_por_tipologia': {'ventana': set(), 'hoja_vano_puerta': set()}, 'conflictos': {}}
        _ventana_ids = _clasif_pagina['sets_por_tipologia']['ventana']
        _hoja_ids = _clasif_pagina['sets_por_tipologia']['hoja_vano_puerta']
        _hoja_duda_ids = _clasif_pagina['sets_por_tipologia'].get('hoja_vano_puerta_duda', set())
        _conflicto_ids = set(_clasif_pagina['conflictos'].keys())

        _img_completo = cv2.cvtColor(plano_full.copy(), cv2.COLOR_RGB2BGR)
        _H_completo, _W_completo = _img_completo.shape[:2]

        _COLOR_MURO_NUEVO = (0, 200, 0)          # verde -- estado nuevo/agregado
        _COLOR_MURO_EXISTENTE = (170, 140, 90)   # azul-gris (slate) -- antes casi negro e invisible sobre el plano
        _COLOR_MURO_ELIMINADO = (0, 0, 200)      # rojo -- referencia, ya ausente del estado final
        _COLOR_PUERTA = (0, 140, 255)            # naranja -- arco de puerta (puertas_geo)
        _COLOR_VENTANA = (255, 90, 0)            # azul -- firma de ventana (linea central)
        _COLOR_HOJA_VANO = (200, 0, 200)         # magenta -- hoja/vano de puerta CONFIRMADA (<=10cm, Tipologia B)
        _COLOR_HOJA_DUDA = (0, 165, 255)         # naranja-rosado -- hoja/vano DUDOSA (>10cm, no se excluye, ver Principio 3/D.9)
        _COLOR_CONFLICTO = (0, 255, 255)         # amarillo -- conflicto de tipologia (Principio 3)
        _ALPHA_RELLENO = 0.45

        def _pintar_relleno_solido(segmentos_grupo, color_bgr, muro_id=None):
            # Relleno REAL del cuerpo cerrado -- usa el propio grupo ya
            # fusionado como su propio contexto local (ya contiene ambas
            # caras + conectores que la fusion real ya valido, no hace
            # falta -- ni conviene, ver Problema 2 de esta misma sesion --
            # ampliar el contexto a otros muros de la pagina).
            #
            # NUNCA ERRORES EN SILENCIO (2026-08-27, bug real encontrado con
            # Beauchef -- Taller/Casino/Camarin salian en diag_muros (linea)
            # pero SIN relleno en diag_completo, sin ningun aviso): antes
            # 'except Exception: return' se tragaba cualquier falla, y un
            # resultado vacio (0 pixeles, sin excepcion -- ej. el propio
            # grupo como contexto no alcanza para emparejar caras) tampoco
            # se avisaba. Ahora ambos casos imprimen un aviso explicito con
            # el id del muro, en vez de desaparecer sin dejar rastro.
            _id_txt = muro_id or '(sin id)'
            if not segmentos_grupo:
                return
            try:
                _relleno = relleno_solido_de_contexto(segmentos_grupo, mpx, margen_m=0.15, objetivo=segmentos_grupo)
            except Exception as _e_relleno:
                print(f'    ⚠ relleno solido OMITIDO para {_id_txt}: excepcion {_e_relleno}')
                return
            _box_r, _bin_r = _relleno['box'], _relleno['bin']
            _h_r, _w_r = _bin_r.shape
            _x0_abs = round(_box_r['x0'] + _ox)
            _y0_abs = round(_box_r['y0'] + _oy)
            _sx0, _sy0 = max(0, _x0_abs), max(0, _y0_abs)
            _sx1, _sy1 = min(_W_completo, _x0_abs + _w_r), min(_H_completo, _y0_abs + _h_r)
            if _sx1 <= _sx0 or _sy1 <= _sy0:
                print(f'    ⚠ relleno solido OMITIDO para {_id_txt}: bbox fuera de rango de la imagen')
                return
            _bx0_r, _by0_r = _sx0 - _x0_abs, _sy0 - _y0_abs
            _mask_r = _bin_r[_by0_r:_by0_r + (_sy1 - _sy0), _bx0_r:_bx0_r + (_sx1 - _sx0)].astype(bool)
            if not _mask_r.any():
                print(f'    ⚠ relleno solido VACIO para {_id_txt} (0 pixeles) -- probable falta de emparejamiento usando solo el propio grupo como contexto')
                return
            _region = _img_completo[_sy0:_sy1, _sx0:_sx1]
            _color_arr = np.array(color_bgr, dtype=np.float32)
            _region[_mask_r] = (_region[_mask_r].astype(np.float32) * (1 - _ALPHA_RELLENO) + _color_arr * _ALPHA_RELLENO).astype(np.uint8)

        for _m in muros_geo:
            _color_m = {'nuevo': _COLOR_MURO_NUEVO, 'agregado': _COLOR_MURO_NUEVO,
                        'eliminado': _COLOR_MURO_ELIMINADO}.get(_m.get('estado'), _COLOR_MURO_EXISTENTE)
            _pintar_relleno_solido(_m['segmentos'], _color_m, muro_id=_m.get('id'))
            for _s in _m['segmentos']:
                _p1 = (round(_s['p1'][0] + _ox), round(_s['p1'][1] + _oy))
                _p2 = (round(_s['p2'][0] + _ox), round(_s['p2'][1] + _oy))
                cv2.line(_img_completo, _p1, _p2, _color_m, 2)

        for _me in muros_excluidos_por_demolicion:
            _pintar_relleno_solido(_me['segmentos'], _COLOR_MURO_ELIMINADO, muro_id=_me.get('id'))
            for _s in _me['segmentos']:
                _p1 = (round(_s['p1'][0] + _ox), round(_s['p1'][1] + _oy))
                _p2 = (round(_s['p2'][0] + _ox), round(_s['p2'][1] + _oy))
                cv2.line(_img_completo, _p1, _p2, _COLOR_MURO_ELIMINADO, 2)

        for _pg in puertas_geo:
            for _s in _pg['segmentos']:
                _p1 = (round(_s['p1'][0] + _ox), round(_s['p1'][1] + _oy))
                _p2 = (round(_s['p2'][0] + _ox), round(_s['p2'][1] + _oy))
                cv2.line(_img_completo, _p1, _p2, _COLOR_PUERTA, 3)

        for _s in _seg_pool_clasif:
            _sid = id(_s)
            if _sid in _conflicto_ids:
                _color_s = _COLOR_CONFLICTO
            elif _sid in _ventana_ids:
                _color_s = _COLOR_VENTANA
            elif _sid in _hoja_ids:
                _color_s = _COLOR_HOJA_VANO
            elif _sid in _hoja_duda_ids:
                _color_s = _COLOR_HOJA_DUDA
            else:
                continue
            _p1 = (round(_s['p1'][0]), round(_s['p1'][1]))
            _p2 = (round(_s['p2'][0]), round(_s['p2'][1]))
            cv2.line(_img_completo, _p1, _p2, _color_s, 3)

        _archivo_completo = f'diag_completo_{fname_tag}_{_RUN_TS}.png'
        cv2.imwrite(_archivo_completo, _img_completo)
        print(f'  DIAG VISUAL COMPLETO (todos los tipos, relleno solido + contexto local): guardado {_archivo_completo}')
        print(f'    muros={len(muros_geo)} (verde=nuevo, slate=existente, rojo=eliminado -- ahora RELLENO solido, no solo linea) | puertas(arcos)={len(puertas_geo)} (naranja) | ventana={len(_ventana_ids)} segs (azul) | hoja/vano CONFIRMADA (<=10cm)={len(_hoja_ids)} segs (magenta) | hoja/vano DUDA (>10cm, no excluida)={len(_hoja_duda_ids)} segs (naranja-rosado) | conflictos={len(_conflicto_ids)} (amarillo)')
        print(f'    escaleras/rampas: NO marcadas -- sin detector geometrico implementado todavia (Convenciones_CAD D.4/D.5, catalogo_tipologias.py estado=pendiente)')
        if AUTO_DESCARGAR_DIAGNOSTICOS:
            try:
                from google.colab import files as _files_diag_completo
                _files_diag_completo.download(_archivo_completo)
            except Exception:
                pass
    except Exception as _e_diag_completo:
        print(f'  DIAG VISUAL COMPLETO (todos los tipos): omitido ({_e_diag_completo})')
    _t_despues_diag_completo = datetime.now()
    print(f'  ⏱ Diagnóstico completo (relleno + clasificación local): {str(_t_despues_diag_completo - _t_despues_diag_muros).split(".")[0]}')


    # DIAGNOSTICO VISUAL (2026-08-23, temporal, para que el arquitecto vea
    # los casos ya identificados por DIAG PAREJA/DIAG CONECTIVIDAD sobre el
    # plano real, no un diagrama aislado sin contexto). Recorta `plano_full`
    # (global de esta iteracion del loop de paginas, ver mas abajo en la
    # celda) alrededor de coordenadas ya conocidas de la corrida anterior
    # (MU02/MU108 en N1 = entry_idx 0, MU03/MU04/MU06 en N2 = entry_idx 1) y
    # dibuja el segmento en rojo + candidatos considerados encima -- el
    # resto del plano ya esta en el crop, no hace falta redibujarlo. Se
    # salta en silencio (try/except) si `plano_full`/`entry_idx` no existen
    # (version vieja del notebook) o si el recorte cae fuera de rango.
    _GRIS_BGR = (156, 163, 175)
    _AZUL_BGR = (235, 99, 37)
    _CASOS_DIAG_VISUAL = [
        {'nombre': 'MU02', 'entry_idx': 0, 'propio': [(996, 1560), (996, 1528)], 'candidatos': [
            {'pts': [(996, 1560), (919, 1560)], 'color': _GRIS_BGR},
        ]},
        {'nombre': 'MU108', 'entry_idx': 0, 'propio': [(2705, 1611), (2679, 1611)], 'candidatos': [
            {'pts': [(2535, 1611), (2705, 1611)], 'color': _AZUL_BGR},
            {'pts': [(2679, 1611), (2679, 3694)], 'color': _GRIS_BGR},
        ]},
        {'nombre': 'MU03_MU04', 'entry_idx': 1, 'propio': [(1557, 1586), (945, 1586)], 'candidatos': [
            {'pts': [(596, 1594), (817, 1594)], 'color': _GRIS_BGR},
            {'pts': [(1685, 1560), (1557, 1560)], 'color': _GRIS_BGR},
        ]},
        {'nombre': 'MU06', 'entry_idx': 1, 'propio': [(562, 2530), (613, 2530)], 'candidatos': [
            {'pts': [(596, 2241), (596, 1612)], 'color': _GRIS_BGR},
            {'pts': [(562, 2241), (562, 2530)], 'color': _GRIS_BGR},
        ]},
    ]
    MARGEN_DIAG_PX = 220
    for _caso in _CASOS_DIAG_VISUAL:
        try:
            # Coordenadas hardcodeadas para PdV (ver _CASOS_DIAG_VISUAL arriba,
            # 'temporal') -- no aplican a otro proyecto. Se salta en silencio para
            # cualquier NOMBRE_PROYECTO distinto en vez de dibujar overlays sin sentido.
            if NOMBRE_PROYECTO.strip().lower() != 'pdv' or _caso['entry_idx'] != entry_idx:
                continue
            _img = plano_full
            # mismo bug/fix que el render completo de arriba -- las
            # coordenadas hardcodeadas abajo salieron del log de
            # muros_geo (relativas a crop_px de esta entrada), se suman
            # de vuelta _ox,_oy para ubicarlas en la pagina completa.
            _propio_abs = [(p[0] + _ox, p[1] + _oy) for p in _caso['propio']]
            _candidatos_abs = [{'pts': [(p[0] + _ox, p[1] + _oy) for p in _c['pts']], 'color': _c['color']} for _c in _caso['candidatos']]
            _caso = {**_caso, 'propio': _propio_abs, 'candidatos': _candidatos_abs}
            _todos_pts = list(_caso['propio']) + [p for _c in _caso['candidatos'] for p in _c['pts']]
            _xs = [p[0] for p in _todos_pts]
            _ys = [p[1] for p in _todos_pts]
            _x0 = max(0, int(min(_xs) - MARGEN_DIAG_PX)); _x1 = min(_img.shape[1], int(max(_xs) + MARGEN_DIAG_PX))
            _y0 = max(0, int(min(_ys) - MARGEN_DIAG_PX)); _y1 = min(_img.shape[0], int(max(_ys) + MARGEN_DIAG_PX))
            if _x1 - _x0 < 10 or _y1 - _y0 < 10:
                continue
            _crop = cv2.cvtColor(_img[_y0:_y1, _x0:_x1].copy(), cv2.COLOR_RGB2BGR)
            for _c in _caso['candidatos']:
                _p1 = (int(_c['pts'][0][0] - _x0), int(_c['pts'][0][1] - _y0))
                _p2 = (int(_c['pts'][1][0] - _x0), int(_c['pts'][1][1] - _y0))
                cv2.line(_crop, _p1, _p2, _c['color'], 3)
            _pp1 = (int(_caso['propio'][0][0] - _x0), int(_caso['propio'][0][1] - _y0))
            _pp2 = (int(_caso['propio'][1][0] - _x0), int(_caso['propio'][1][1] - _y0))
            cv2.line(_crop, _pp1, _pp2, (0, 0, 255), 5)
            cv2.circle(_crop, _pp1, 7, (0, 0, 255), -1)
            cv2.circle(_crop, _pp2, 7, (0, 0, 255), -1)
            _archivo_diag = f'diag_contexto_{_caso["nombre"]}_{_RUN_TS}.png'
            cv2.imwrite(_archivo_diag, _crop)
            print(f'  DIAG VISUAL: guardado {_archivo_diag} ({_x1 - _x0}x{_y1 - _y0}px)')
            if AUTO_DESCARGAR_DIAGNOSTICOS:
                try:
                    from google.colab import files as _files_diag_visual
                    _files_diag_visual.download(_archivo_diag)
                except Exception:
                    pass
        except Exception as _e_diag_visual:
            print(f'  DIAG VISUAL: omitido {_caso["nombre"]} ({_e_diag_visual})')
    for _pg in puertas_geo:
        _id_asoc = _pg.get('muro_asociado_id')
        if _id_asoc and _id_asoc in _mapa_fusion_muros:
            _pg['muro_asociado_id'] = _mapa_fusion_muros[_id_asoc]

    print(f'  ✓ Puertas exportadas (clasificador geometrico): {len(puertas_geo)}')
    _colores_vistos = {}
    for _s in segmentos_l:
        for _c in (_s.get('color'), _s.get('fill')):
            if _c:
                _k = tuple(round(_x, 2) for _x in _c)
                _colores_vistos[_k] = _colores_vistos.get(_k, 0) + 1
    _top_colores = sorted(_colores_vistos.items(), key=lambda kv: -kv[1])[:8]
    print(f'  DIAGNOSTICO COLOR (para verificar/ajustar el filtro de amarillo): {_top_colores}')

    # ── DIAGNOSTICO TEMPORAL 2026-07-31 (no cambia ningun resultado) ──
    # Mide span y grosor de cada grupo ya protegido como "muro" en el Paso 2,
    # para separar EJES/COTAS de muros reales con evidencia real antes de
    # diseñar un pre-filtro (ver roadmap P1, hallazgo Isla de Pascua 2026-07-31).
    # Hipotesis a verificar: ejes/cotas deberian aparecer como los grupos de
    # mayor span (varios metros, casi todo el ancho/alto de la pagina) y con
    # ancho_linea mas fino que un muro real. Solo imprime -- no toca 'protegido'
    # ni ningun valor que se guarda en el JSON de salida.
    import statistics as _diag_stats
    import random as _diag_random

    # ── DIAGNOSTICO COTAS 2026-07-31 (temporal, no cambia ningun resultado) ──
    # Hipotesis a verificar (a raiz del hallazgo de que EJES funciona pero
    # el resultado visible casi no cambio, ver roadmap P1): un segmento de
    # COTA (linea solida) deberia estar mucho mas cerca de un texto de cota
    # (numero de la cadena de acotacion, cotas_texto ya extraido con
    # precision del PDF) que un tramo de muro real -- un muro puede tener
    # una cota cerca en un punto puntual, pero una linea de cota corre
    # PEGADA a su propio numero en toda su extension. Mide, por grupo, que
    # fraccion de sus segmentos tiene un texto de cota cerca, a 3 umbrales
    # de distancia distintos -- sin comprometerse a uno solo todavia.
    # NOTA (Paso 1.6): _centros_cotas_texto y _dist_min_a_cota_texto ya se
    # definieron mas arriba (Paso 1.6, filtro real de linea de cota) -- no
    # se redefinen aqui, este bloque las reutiliza tal cual.
    UMBRALES_COTA_M = [0.18, 0.35, 0.59]
    UMBRALES_COTA_PX = [round(u / mpx) if mpx else d for u, d in zip(UMBRALES_COTA_M, [30, 60, 100])]
    MAX_MUESTRA_POR_GRUPO = 300  # muestrea grupos enormes para no tardar de mas

    _diag_grupos = []
    for grupo in grupos_conectividad:
        span_px = _span_grupo(segmentos_l, grupo)
        if span_px < UMBRAL_MURO_PX:
            continue
        xs, ys = [], []
        for i in grupo:
            xs += [segmentos_l[i]["p1"][0], segmentos_l[i]["p2"][0]]
            ys += [segmentos_l[i]["p1"][1], segmentos_l[i]["p2"][1]]
        anchos = [segmentos_l[i]["ancho_linea"] for i in grupo]

        muestra = grupo if len(grupo) <= MAX_MUESTRA_POR_GRUPO else _diag_random.sample(grupo, MAX_MUESTRA_POR_GRUPO)
        conteo_umbral = {u: 0 for u in UMBRALES_COTA_PX}
        for i in muestra:
            s = segmentos_l[i]
            mx = (s['p1'][0] + s['p2'][0]) / 2
            my = (s['p1'][1] + s['p2'][1]) / 2
            d = _dist_min_a_cota_texto(mx, my)
            for u in UMBRALES_COTA_PX:
                if d <= u:
                    conteo_umbral[u] += 1
        n_muestra = len(muestra)
        # FIX (2026-08-21): pct_umbral usaba antes las claves literales 30/60/100
        # (cuando UMBRALES_COTA_PX era ese literal fijo). Al convertir a metros
        # (ayer) el valor real en px pasa a depender de mpx de cada plano/corrida
        # -- ya no es necesariamente 30/60/100 exacto. El acceso de mas abajo
        # (pct_umbral[30]) quedo desactualizado y tira KeyError. Se accede por
        # POSICION (UMBRALES_COTA_PX[0/1/2]), nunca por el valor literal viejo.
        pct_umbral = {u: round(100 * conteo_umbral[u] / n_muestra, 1) if n_muestra else 0.0 for u in UMBRALES_COTA_PX}

        _diag_grupos.append({
            "n_segmentos": len(grupo),
            "span_m": round(span_px * mpx, 2),
            "bbox_ancho_m": round((max(xs) - min(xs)) * mpx, 2),
            "bbox_alto_m": round((max(ys) - min(ys)) * mpx, 2),
            "ancho_linea_min": round(min(anchos), 3),
            "ancho_linea_mediana": round(_diag_stats.median(anchos), 3),
            "ancho_linea_max": round(max(anchos), 3),
            "pct_cerca_cota_1": pct_umbral[UMBRALES_COTA_PX[0]],
            "pct_cerca_cota_2": pct_umbral[UMBRALES_COTA_PX[1]],
            "pct_cerca_cota_3": pct_umbral[UMBRALES_COTA_PX[2]],
            "n_muestra_cota": n_muestra,
        })
    _diag_grupos.sort(key=lambda g: -g["span_m"])
    print(f"  DIAGNOSTICO EJES/COTAS (temporal, no afecta el resultado): "
          f"{len(_diag_grupos)} grupos protegidos como muro, top 25 por span "
          f"({len(cotas_texto)} textos de cota disponibles para el chequeo de distancia):")
    _etiqueta_umbrales = "/".join(f"{u}m" for u in UMBRALES_COTA_M)
    for _g in _diag_grupos[:25]:
        print(f"     span={_g['span_m']}m  bbox={_g['bbox_ancho_m']}x{_g['bbox_alto_m']}m  "
              f"n_seg={_g['n_segmentos']}  ancho_linea(min/mediana/max)="
              f"{_g['ancho_linea_min']}/{_g['ancho_linea_mediana']}/{_g['ancho_linea_max']}  "
              f"%cerca_cota({_etiqueta_umbrales}, n={_g['n_muestra_cota']})="
              f"{_g['pct_cerca_cota_1']}/{_g['pct_cerca_cota_2']}/{_g['pct_cerca_cota_3']}")


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
    RADIO_ACHURADO_M = 0.35
    RADIO_ACHURADO_PX = RADIO_ACHURADO_M / mpx if mpx else 60
    MIN_SEGMENTOS_ACHURADO = 5
    MIN_EXTENSION_PERPENDICULAR_M = 0.47
    MIN_EXTENSION_PERPENDICULAR_PX = MIN_EXTENSION_PERPENDICULAR_M / mpx if mpx else 80

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
    #    NOTA 2026-07-31: las constantes y _colineal_y_cerca se movieron
    #    antes del Paso 2 (ver "Paso 1.5" mas arriba) para poder detectar
    #    EJES antes de que el Paso 2 los proteja por conectividad como si
    #    fueran muro. Aqui se reutilizan sin cambios.
    idx_no_protegidos = [i for i in range(len(segmentos_l)) if not protegido[i]]
    segmentos_candidatos = [segmentos_l[i] for i in idx_no_protegidos]

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

    # DIAGNOSTICO (2026-08-04, SOLO diagnostico -- no agrega ninguna puerta
    # nueva ni cambia ningun resultado): el usuario encontro puertas reales
    # dibujadas en un color MUY tenue que no generan ningun trazo vectorial via
    # get_drawings() (0 trazos 'l' o 'c' encontrados en esas zonas, confirmado
    # buscando en el JSON). Hipotesis sin confirmar: podrian ser imagenes
    # incrustadas (un icono raster) en vez de geometria vectorial. Esto solo
    # imprime que imagenes hay y donde caen en pixeles (mismo sistema de
    # coordenadas que muros_geo/puertas_geo) para poder comparar a mano contra
    # las ubicaciones reales -- NO se agrega nada a muros_geo/puertas_geo a
    # partir de esto todavia. Si hay duda sobre si algo encontrado es una
    # puerta real, debe quedar para que el arquitecto lo confirme, no asumirse.
    try:
        _imgs_pagina = pdf_page.get_images(full=True)
        print(f'  DIAGNOSTICO IMAGENES: {len(_imgs_pagina)} imagen(es) incrustada(s) en el PDF de esta pagina (sin filtrar por crop)')
        for _img_info in _imgs_pagina:
            _xref = _img_info[0]
            _rects = pdf_page.get_image_rects(_xref)
            for _r in _rects:
                _p0px = to_px(fitz.Point(_r.x0, _r.y0))
                _p1px = to_px(fitz.Point(_r.x1, _r.y1))
                _cx = (_p0px[0] + _p1px[0]) / 2
                _cy = (_p0px[1] + _p1px[1]) / 2
                if not dentro_crop(_cx, _cy):
                    continue
                _x0, _y0 = ajustar(*_p0px)
                _x1, _y1 = ajustar(*_p1px)
                _ancho_m = round(abs(_x1 - _x0) * mpx, 2)
                _alto_m = round(abs(_y1 - _y0) * mpx, 2)
                print(f'    xref={_xref} bbox_px=({round(min(_x0,_x1))},{round(min(_y0,_y1))})-({round(max(_x0,_x1))},{round(max(_y0,_y1))}) tamano_m={_ancho_m}x{_alto_m}')
    except Exception as _e_img:
        print(f'  DIAGNOSTICO IMAGENES: error al inspeccionar - {_e_img}')

    # DIAGNOSTICO (2026-08-04, ronda 2, SOLO diagnostico -- no agrega ninguna
    # puerta ni cambia ningun resultado): 0 imagenes incrustadas descarta la
    # hipotesis anterior. Nueva hipotesis sin confirmar: esos simbolos podrian
    # ser un bloque vectorial reutilizable (Form XObject) -- un simbolo de
    # puerta definido una sola vez e insertado/referenciado en cada ubicacion,
    # en vez de dibujado como trazos directos en el contenido de la pagina.
    # get_drawings() puede no descomponer el contenido de un XObject de esta
    # forma -- sin confirmar, no hay documentacion a mano para asegurarlo. Se
    # imprime el resultado crudo de get_xobjects() (sin asumir su estructura
    # exacta) para decidir el siguiente paso con el dato real, no a ciegas.
    try:
        _xobjs_pagina = pdf_page.get_xobjects()
        print(f'  DIAGNOSTICO XOBJECTS: {len(_xobjs_pagina)} objeto(s) tipo Form XObject en esta pagina')
        for _xo in _xobjs_pagina:
            print(f'    {_xo}')
    except Exception as _e_xo:
        print(f'  DIAGNOSTICO XOBJECTS: error al inspeccionar - {_e_xo}')

    # DIAGNOSTICO (2026-08-04, ronda 3, SOLO diagnostico -- no agrega ninguna
    # puerta ni cambia ningun resultado): 0 imagenes incrustadas Y 0 Form
    # XObjects descartan ambas hipotesis anteriores. Nueva hipotesis sin
    # confirmar: el simbolo podria ser una ANOTACION de PDF (ej. un sello/stamp)
    # -- las anotaciones no son parte del content stream de la pagina, por eso
    # ni get_drawings() ni get_images() las verian. Se imprime el resultado
    # crudo de pdf_page.annots() (tipo + rect en pixeles, mismo sistema de
    # coordenadas que muros_geo/puertas_geo) para comparar a mano contra las
    # 7 ubicaciones reales antes de decidir cualquier paso siguiente.
    try:
        _annots_pagina = list(pdf_page.annots())
        print(f'  DIAGNOSTICO ANOTACIONES: {len(_annots_pagina)} anotacion(es) en esta pagina')
        for _an in _annots_pagina:
            _r = _an.rect
            _p0px = to_px(fitz.Point(_r.x0, _r.y0))
            _p1px = to_px(fitz.Point(_r.x1, _r.y1))
            _x0, _y0 = ajustar(*_p0px)
            _x1, _y1 = ajustar(*_p1px)
            print(f'    tipo={_an.type} bbox_px=({round(min(_x0,_x1))},{round(min(_y0,_y1))})-({round(max(_x0,_x1))},{round(max(_y0,_y1))}) info={_an.info}')
    except Exception as _e_an:
        print(f'  DIAGNOSTICO ANOTACIONES: error al inspeccionar - {_e_an}')

    # DIAGNOSTICO (2026-08-05, ronda 4, SOLO diagnostico -- no agrega ninguna
    # puerta ni cambia ningun resultado): imagenes incrustadas, Form XObjects Y
    # anotaciones dieron 0 en las 3 rondas anteriores -- ninguna de las 3
    # explica los simbolos tenues. Nueva prueba: get_image_info() no lee el
    # diccionario de recursos (como get_images()) sino lo que el interprete de
    # MuPDF realmente dibuja al renderizar la pagina -- por eso SI deberia
    # detectar una imagen inline (operador BI...ID...EI embebido directo en el
    # content stream, sin ser un XObject con nombre), que get_images() no ve.
    try:
        _imginfo_pagina = pdf_page.get_image_info()
        print(f'  DIAGNOSTICO IMAGE_INFO: {len(_imginfo_pagina)} imagen(es) detectada(s) via get_image_info() (incluye inline, no solo XObject)')
        for _ii in _imginfo_pagina:
            _bbox = _ii.get('bbox')
            if _bbox:
                _p0px = to_px(fitz.Point(_bbox[0], _bbox[1]))
                _p1px = to_px(fitz.Point(_bbox[2], _bbox[3]))
                _x0, _y0 = ajustar(*_p0px)
                _x1, _y1 = ajustar(*_p1px)
                print(f'    bbox_px=({round(min(_x0,_x1))},{round(min(_y0,_y1))})-({round(max(_x0,_x1))},{round(max(_y0,_y1))}) xref={_ii.get("xref")} type={_ii.get("type")}')
            else:
                print(f'    (sin bbox) {_ii}')
    except Exception as _e_ii:
        print(f'  DIAGNOSTICO IMAGE_INFO: error al inspeccionar - {_e_ii}')

    # DIAGNOSTICO (2026-08-05, ronda 5, SOLO diagnostico -- no agrega ninguna
    # puerta ni cambia ningun resultado): imagenes incrustadas, Form XObjects,
    # anotaciones E imagenes via get_image_info() dieron 0 en las 4 rondas
    # anteriores -- no hay NADA de tipo imagen ni de tipo trazo vectorial en
    # esa zona, por ningun metodo probado. Nueva hipotesis, de naturaleza
    # distinta a las 4 anteriores: el simbolo podria estar dibujado como TEXTO
    # con una fuente Type 3 -- un truco comun en PDFs exportados desde CAD via
    # fuentes SHX, donde cada 'caracter' de una fuente especial es en realidad
    # un simbolo grafico completo (ej. el arco de una puerta), no una letra.
    # get_drawings() no descompone el programa de dibujo interno de un glifo de
    # fuente Type 3 -- apareceria como texto, no como trazo. Se imprime que
    # fuentes usa la pagina (nombre + tipo) para ver si hay alguna Type3 o
    # sospechosa -- no se filtra a esta zona todavia, es diagnostico de pagina
    # completa, mas simple, antes de acotar a coordenadas especificas.
    try:
        _fuentes_pagina = pdf_page.get_fonts(full=True)
        print(f'  DIAGNOSTICO FUENTES: {len(_fuentes_pagina)} fuente(s) en esta pagina')
        for _fn in _fuentes_pagina:
            print(f'    {_fn}')
    except Exception as _e_fn:
        print(f'  DIAGNOSTICO FUENTES: error al inspeccionar - {_e_fn}')

    # DIAGNOSTICO (2026-08-09, SOLO diagnostico -- no agrega ninguna capa ni
    # cambia ningun resultado): el PDF de PdV tiene capas (OCG) nativas con
    # nombres explicitos -- confirmado leyendo el PDF crudo (busqueda de
    # texto /OCProperties/OCG fuera de este notebook, sin PyMuPDF): 'Muros',
    # 'Ejes', 'Cotas', 'Ptas Ventanas', 'Muebles', 'ARTEFACTOS',
    # 'Proyecciones', 'Muros Proy', 'Formato', 'Superficies', '0'. Si
    # get_drawings() reporta a que capa pertenece cada trazo, filtrar por
    # capa seria MUCHO mas confiable que toda la heuristica geometrica de
    # ejes/cotas/deslinde ya construida -- la separacion semantica ya existe
    # en el PDF, no hay que reconstruirla adivinando patrones de linea.
    # Este bloque solo INVESTIGA si esa info esta disponible desde Python:
    # (a) doc.get_ocgs() -- lista de capas tal como las ve PyMuPDF, para
    #     cruzar contra los nombres ya confirmados por fuera;
    # (b) inspecciona las CLAVES completas de los primeros paths que
    #     devuelve get_drawings() -- por si ya trae info de capa en algun
    #     campo que hasta ahora no se leyo (solo se leen 'width'/'color'/
    #     'fill'/'items');
    # (c) si (b) no trae nada, prueba get_cdrawings() (API alternativa mas
    #     nueva de PyMuPDF, mas detallada) por si esa si expone la capa.
    # No cambia ningun resultado existente -- solo imprime que hay.
    try:
        _ocgs = doc.get_ocgs()
        print(f'  DIAGNOSTICO CAPAS: {len(_ocgs)} capa(s) (OCG) en el documento, via doc.get_ocgs()')
        for _xref, _info in _ocgs.items():
            print(f'    xref={_xref} {_info}')
    except Exception as _e_ocg:
        print(f'  DIAGNOSTICO CAPAS: error en doc.get_ocgs() - {_e_ocg}')

    try:
        _paths_muestra = pdf_page.get_drawings()[:3]
        print(f'  DIAGNOSTICO CAPAS: claves disponibles en get_drawings() (primeros 3 paths):')
        for _pth in _paths_muestra:
            print(f'    claves={sorted(_pth.keys())}')
            for _clave_sospechosa in ('layer', 'oc', 'ocg', 'seqno'):
                if _clave_sospechosa in _pth:
                    print(f'      {_clave_sospechosa} = {_pth[_clave_sospechosa]}')
    except Exception as _e_gd:
        print(f'  DIAGNOSTICO CAPAS: error inspeccionando get_drawings() - {_e_gd}')

    try:
        if hasattr(pdf_page, 'get_cdrawings'):
            _cpaths_muestra = pdf_page.get_cdrawings()[:3]
            print(f'  DIAGNOSTICO CAPAS: claves disponibles en get_cdrawings() (primeros 3 paths):')
            for _pth in _cpaths_muestra:
                print(f'    claves={sorted(_pth.keys())}')
                for _clave_sospechosa in ('layer', 'oc', 'ocg', 'seqno'):
                    if _clave_sospechosa in _pth:
                        print(f'      {_clave_sospechosa} = {_pth[_clave_sospechosa]}')
        else:
            print(f'  DIAGNOSTICO CAPAS: get_cdrawings() no existe en esta version de PyMuPDF')
    except Exception as _e_cd:
        print(f'  DIAGNOSTICO CAPAS: error inspeccionando get_cdrawings() - {_e_cd}')

    # DIAGNOSTICO DISTRIBUCION DE CAPAS (2026-08-11, SOLO diagnostico -- no
    # cambia ningun resultado): investiga el hallazgo real de Beauchef donde
    # MAPEO_CAPAS['muro'] = ['MUROS'] dio 0 coincidencias en las 4 paginas,
    # pese a que 'MUROS' existe como capa real en doc.get_ocgs(). Hipotesis:
    # el PDF podria anidar capas (grupo por piso, ej. '1º PLANO', con
    # sub-capas de elemento adentro) y get_drawings() solo reporta un nivel.
    # Este bloque cuenta TODOS los paths de la pagina por su valor de
    # 'layer' (no solo los primeros 3 de muestra) -- si 'MUROS' nunca
    # aparece en esta distribucion completa, confirma la hipotesis: los
    # muros reales estan tageados por piso, no por tipo de elemento, en
    # este documento especifico.
    try:
        _todos_paths_pagina = pdf_page.get_drawings()
        _contador_capas_pagina = {}
        for _p in _todos_paths_pagina:
            _l = _p.get('layer')
            _contador_capas_pagina[_l] = _contador_capas_pagina.get(_l, 0) + 1
        print(f'  DIAGNOSTICO DISTRIBUCION CAPAS: {len(_todos_paths_pagina)} paths totales en get_drawings(), distribucion completa por capa:')
        for _capa_d, _n_d in sorted(_contador_capas_pagina.items(), key=lambda kv: -kv[1]):
            print(f'    {_capa_d!r}: {_n_d}')
        for _cat_esperada, _capas_esperadas in (mapeo_capas or {}).items():
            for _ce in (_capas_esperadas or []):
                if _ce not in _contador_capas_pagina:
                    print(f"  ⚠ La capa {_ce!r} (mapeada a '{_cat_esperada}') NUNCA aparece como 'layer' en ningun path de get_drawings() de esta pagina -- si esperabas contenido de esta capa aqui, revisa si el PDF anida capas (grupo padre distinto al nombre que mapeaste).")
    except Exception as _e_dist:
        print(f'  DIAGNOSTICO DISTRIBUCION CAPAS: error al inspeccionar - {_e_dist}')

    # DIAGNOSTICO PROPIEDADES ADICIONALES (2026-08-10, SOLO diagnostico -- no
    # cambia ningun resultado existente). Investigacion pedida por el usuario
    # sobre que otras propiedades trae un PDF exportado desde CAD, ademas de
    # capas OCG:
    #
    # (a) 'dashes' -- get_drawings() ya trae el patron de guion NATIVO de cada
    #     trazo (ej. '[3 4] 0' = 3px trazo, 4px vacio), instruccion real de
    #     dibujo del software CAD, no una reconstruccion nuestra por huecos
    #     entre segmentos (que fue exactamente lo que fallo con 0% precision
    #     en el diagnostico EJES RELAJADO v2, ya eliminado). Se cuenta cuantos
    #     segmentos tienen dashes no vacios y se cruza contra la capa real
    #     (si MAPEO_CAPAS esta disponible) para ver si coincide con 'Ejes'.
    # (b) doc.metadata -- Producer/Creator revela el software de origen
    #     (AutoCAD, Revit, ArchiCAD, etc.), util para aplicar reglas
    #     especificas por software mas adelante.
    # (c) doc.get_toc() -- si el software de origen exporto marcadores
    #     (bookmarks) desde vistas nombradas o layouts, podria identificar
    #     automaticamente que representa cada lamina (ej. 'Nivel 1'), en vez
    #     de depender de PAGINAS_Y_ESCALAS manual o de que Claude adivine.
    try:
        _con_dash = [i for i, _s in enumerate(segmentos_l) if _s.get('dashes') and _s['dashes'] not in ('[] 0', '', None)]
        print(f'  DIAGNOSTICO DASHES: {len(_con_dash)} de {len(segmentos_l)} segmentos tienen patron de guion nativo (dashes) no vacio')
        if _con_dash:
            _capas_con_dash = {}
            for _i in _con_dash:
                _cap = segmentos_l[_i].get('layer') or '(sin capa)'
                _capas_con_dash[_cap] = _capas_con_dash.get(_cap, 0) + 1
            print(f'    distribucion por capa: {_capas_con_dash}')
            for _i in _con_dash[:15]:
                _s = segmentos_l[_i]
                _p1_aj = ajustar(*_s['p1'])
                _p2_aj = ajustar(*_s['p2'])
                print(f'    dashes={_s["dashes"]} capa={_s.get("layer")} p1={(round(_p1_aj[0]), round(_p1_aj[1]))} p2={(round(_p2_aj[0]), round(_p2_aj[1]))}')
    except Exception as _e_dash:
        print(f'  DIAGNOSTICO DASHES: error al inspeccionar - {_e_dash}')

    try:
        _meta = doc.metadata or {}
        print(f'  DIAGNOSTICO METADATA: producer={_meta.get("producer")!r} creator={_meta.get("creator")!r} title={_meta.get("title")!r}')
    except Exception as _e_meta:
        print(f'  DIAGNOSTICO METADATA: error al inspeccionar - {_e_meta}')

    try:
        _toc = doc.get_toc(simple=True)
        print(f'  DIAGNOSTICO TOC: {len(_toc)} marcador(es)/bookmark(s) en el documento')
        for _t in _toc[:20]:
            print(f'    {_t}')
    except Exception as _e_toc:
        print(f'  DIAGNOSTICO TOC: error al inspeccionar - {_e_toc}')

    # DIAGNOSTICO (2026-08-05, ronda 6, SOLO diagnostico -- no agrega ninguna
    # puerta ni cambia ningun resultado): las 5 hipotesis de tipo de contenido
    # PDF (imagen, xobject, anotacion, imagen inline, fuente Type3) dieron 0.
    # Pero se encontro un hueco real en la investigacion original: la busqueda
    # de 'cero trazos' solo reviso el campo trazos, que unicamente contiene
    # curvas 'c' -- NUNCA lineas 'l' (esas van a segmentos_l, que nunca se
    # imprimio crudo en ningun diagnostico hasta ahora). Este bloque dumpea
    # TODO lo que devuelve get_drawings() (sin ningun filtro: ni dentro_crop,
    # ni tipo de operacion, ni color, ni angulo) cerca de las etiquetas
    # Cocina/Pasillo/Oficina (via cotas_texto, ya en el mismo espacio de
    # coordenadas que muros_geo/puertas_geo) -- para confirmar si de verdad no
    # hay nada crudo ahi, o si el problema estaba en donde se buscaba antes.
    try:
        _radio_m = 1.47
        _radio_px = _radio_m / mpx if mpx else 250
        _zonas_buscar = [(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, c['texto']) for c in cotas_texto if re.search(r'cocina|pasillo|oficina', c.get('texto', ''), re.I)]
        print(f'  DIAGNOSTICO RAW_DRAWINGS: {len(_zonas_buscar)} zona(s) Cocina/Pasillo/Oficina, radio {_radio_px}px, sin filtros')
        _raw_paths = pdf_page.get_drawings()
        for _zx, _zy, _zt in _zonas_buscar:
            _items_cerca = []
            for _path in _raw_paths:
                _ancho = _path.get('width') or 0
                for _item in _path.get('items', []):
                    _op = _item[0]
                    if _op == 'l':
                        _p1 = ajustar(*to_px(_item[1]))
                        _p2 = ajustar(*to_px(_item[2]))
                        _cx, _cy = (_p1[0] + _p2[0]) / 2, (_p1[1] + _p2[1]) / 2
                    elif _op == 'c':
                        _pts_aj = [ajustar(*to_px(p)) for p in _item[1:5]]
                        _cx = sum(p[0] for p in _pts_aj) / len(_pts_aj)
                        _cy = sum(p[1] for p in _pts_aj) / len(_pts_aj)
                    elif _op == 're':
                        _r = _item[1]
                        _pts_aj = [ajustar(*to_px(pp)) for pp in (_r.tl, _r.tr, _r.br, _r.bl)]
                        _cx = sum(p[0] for p in _pts_aj) / len(_pts_aj)
                        _cy = sum(p[1] for p in _pts_aj) / len(_pts_aj)
                    elif _op == 'qu':
                        _q = _item[1]
                        _pts_aj = [ajustar(*to_px(pp)) for pp in (_q.ul, _q.ur, _q.lr, _q.ll)]
                        _cx = sum(p[0] for p in _pts_aj) / len(_pts_aj)
                        _cy = sum(p[1] for p in _pts_aj) / len(_pts_aj)
                    else:
                        continue
                    if ((_cx - _zx) ** 2 + (_cy - _zy) ** 2) ** 0.5 <= _radio_px:
                        _items_cerca.append((_op, round(_cx), round(_cy), _path.get('color'), _path.get('fill'), round(_ancho, 2)))
            print(f'    zona={_zt} centro=({round(_zx)},{round(_zy)}): {len(_items_cerca)} item(s) crudo(s) sin filtrar')
            for _it in _items_cerca[:20]:
                print(f'      {_it}')
    except Exception as _e_raw:
        print(f'  DIAGNOSTICO RAW_DRAWINGS: error al inspeccionar - {_e_raw}')

    # DIAGNOSTICO (2026-08-09, SOLO diagnostico -- no agrega ninguna ventana ni
    # cambia ningun resultado): investigacion de la geometria real de una
    # ventana, confirmada visualmente por el usuario en PdV Nivel 1 (pared
    # entre Terraza y Cocina-Barra, zona x=664-715 y=3103-3494 en pixeles de
    # ESTA pagina/corrida especifica -- si se reusa este bloque en otro
    # proyecto/corrida, estas coordenadas no van a aplicar, hay que
    # recalcularlas). Confirmado con datos ya exportados (muros_geo +
    # muros_excluidos_por_referencia): en esa franja solo aparece UNA linea
    # (MU53, x=690) donde el patron visual real muestra 3 lineas paralelas
    # (2 caras del muro + 1 linea central del paño de ventana) -- la(s)
    # linea(s) faltante(s) no llegaron a ninguno de los 2 campos exportados,
    # se filtraron en una etapa anterior. Este bloque dumpea TODO lo que
    # devuelve get_drawings() sin ningun filtro (ni angulo, ni color, ni
    # conectividad) en esa zona exacta, para ver que hay ahi de verdad antes
    # de diseñar cualquier clasificador de ventanas.
    try:
        _zona_ventana_centro = (690, 3300)  # x,y en px de ESTA corrida (PdV pag2-1)
        _radio_ventana_m = 1.47
        # zona hardcodeada para PdV -- radio 0 en otro proyecto para no buscar en un punto sin sentido
        _radio_ventana_px = (_radio_ventana_m / mpx if mpx else 250) if NOMBRE_PROYECTO.strip().lower() == 'pdv' else 0
        _zx, _zy = _zona_ventana_centro
        _items_ventana = []
        for _path in pdf_page.get_drawings():
            _ancho = _path.get('width') or 0
            for _item in _path.get('items', []):
                _op = _item[0]
                if _op == 'l':
                    _p1 = ajustar(*to_px(_item[1]))
                    _p2 = ajustar(*to_px(_item[2]))
                    _cx, _cy = (_p1[0] + _p2[0]) / 2, (_p1[1] + _p2[1]) / 2
                    _detalle = (round(_p1[0]), round(_p1[1]), round(_p2[0]), round(_p2[1]))
                elif _op == 'c':
                    _pts_aj = [ajustar(*to_px(p)) for p in _item[1:5]]
                    _cx = sum(p[0] for p in _pts_aj) / len(_pts_aj)
                    _cy = sum(p[1] for p in _pts_aj) / len(_pts_aj)
                    _detalle = tuple(round(v) for pt in _pts_aj for v in pt)
                elif _op == 're':
                    _r = _item[1]
                    _pts_aj = [ajustar(*to_px(pp)) for pp in (_r.tl, _r.tr, _r.br, _r.bl)]
                    _cx = sum(p[0] for p in _pts_aj) / len(_pts_aj)
                    _cy = sum(p[1] for p in _pts_aj) / len(_pts_aj)
                    _detalle = tuple(round(v) for pt in _pts_aj for v in pt)
                elif _op == 'qu':
                    _q = _item[1]
                    _pts_aj = [ajustar(*to_px(pp)) for pp in (_q.ul, _q.ur, _q.lr, _q.ll)]
                    _cx = sum(p[0] for p in _pts_aj) / len(_pts_aj)
                    _cy = sum(p[1] for p in _pts_aj) / len(_pts_aj)
                    _detalle = tuple(round(v) for pt in _pts_aj for v in pt)
                else:
                    continue
                if ((_cx - _zx) ** 2 + (_cy - _zy) ** 2) ** 0.5 <= _radio_ventana_px:
                    _items_ventana.append((_op, _detalle, _path.get('color'), _path.get('fill'), round(_ancho, 2)))
        print(f'  DIAGNOSTICO VENTANA (zona Terraza/Cocina-Barra, centro={_zona_ventana_centro}, radio={_radio_ventana_px}px): {len(_items_ventana)} item(s) crudo(s) sin filtrar')
        for _it in _items_ventana:
            print(f'    {_it}')
    except Exception as _e_vent:
        print(f'  DIAGNOSTICO VENTANA: error al inspeccionar - {_e_vent}')

    # DIAGNOSTICO EJES/COTAS RELAJADO v2 -- REINCORPORADO 2026-08-10 como
    # SUGERENCIA de solo lectura, SOLO cuando la categoria no tiene capa
    # mapeada para este proyecto. Historial: se probo contra el mapeo real
    # de capas de PdV y dio 0% de precision (de 45 candidatos de "cota
    # relajada" ninguno estaba en la capa real "Cotas"; ninguna cadena de
    # "eje relajado" estaba puramente en la capa "Ejes") -- confirma que la
    # deteccion geometrica pura no es confiable CUANDO YA HAY una capa real
    # para cruzar contra ella. Pero para proyectos SIN esa capa (ej. Beauchef
    # y Campo Lindo no tienen capa de ejes; Isla de Pascua no tiene ninguna
    # capa OCG) esta evidencia no aplica -- nunca se probo ahi, y sigue
    # siendo la unica señal disponible. Por eso se reactiva, pero acotado
    # estrictamente a "sin capa mapeada" y SIN aplicar nada nunca (preview,
    # el arquitecto lo confirma despues en la interfaz de revision grafica
    # cuando exista) -- decision explicita del usuario: "no conviene
    # mantener ambas formas de encontrarlos", con el criterio de no
    # reintroducir el ruido ya probado donde la capa SI existe.
    _eje_tiene_capa = bool((mapeo_capas or {}).get('eje'))
    _cota_tiene_capa = bool((mapeo_capas or {}).get('cota'))
    if _eje_tiene_capa:
        print("  DIAGNOSTICO EJES RELAJADO v2: omitido -- este proyecto ya tiene capa 'eje' mapeada (la señal de capa es mas confiable, ver historial de 0% precision geometrica contra capa real)")
    if _cota_tiene_capa:
        print("  DIAGNOSTICO COTAS RELAJADO v2: omitido -- este proyecto ya tiene capa 'cota' mapeada (la señal de capa es mas confiable, ver historial de 0% precision geometrica contra capa real)")

    if not _eje_tiene_capa:
        try:
            # --- Ejes/discontinuas relajado, v2: minimo 2 huecos + huecos
            # consistentes entre si (variacion <=0.9, mismo criterio que ya se
            # usa para el largo de los guiones).
            MIN_SEGMENTOS_CADENA_RELAJADO = 3  # 3 segmentos = 2 huecos minimo
            TOL_VARIACION_HUECOS = 0.9

            def _gaps_consistentes(_grupo):
                _ang0 = _angulo_segmento(segmentos_l[_grupo[0]])
                _es_horiz = _ang0 < 45 or _ang0 > 135
                def _proy(_i):
                    _s = segmentos_l[_i]
                    return (_s['p1'][0] + _s['p2'][0]) / 2 if _es_horiz else (_s['p1'][1] + _s['p2'][1]) / 2
                _ordenado = sorted(_grupo, key=_proy)
                _gaps = []
                for _k in range(len(_ordenado) - 1):
                    _a, _b = segmentos_l[_ordenado[_k]], segmentos_l[_ordenado[_k + 1]]
                    _gap = min(_distancia(_a['p1'], _b['p1']), _distancia(_a['p1'], _b['p2']),
                               _distancia(_a['p2'], _b['p1']), _distancia(_a['p2'], _b['p2']))
                    _gaps.append(_gap)
                if len(_gaps) < 2:
                    return False
                _prom = sum(_gaps) / len(_gaps)
                _var = (max(_gaps) - min(_gaps)) / _prom if _prom else 999
                return _var <= TOL_VARIACION_HUECOS

            _ejes_nuevos = []
            for _grupo in grupos_dash_pre:
                if len(_grupo) < MIN_SEGMENTOS_CADENA_RELAJADO:
                    continue
                _largos_g = [_distancia(segmentos_l[i]['p1'], segmentos_l[i]['p2']) for i in _grupo]
                _promedio_g = sum(_largos_g) / len(_largos_g)
                _variacion_g = (max(_largos_g) - min(_largos_g)) / _promedio_g if _promedio_g else 999
                if _variacion_g > 0.9:
                    continue
                if not _gaps_consistentes(_grupo):
                    continue
                if not any(not es_eje_pre[i] for i in _grupo):
                    continue  # la regla actual (estricta) ya agarraba TODO este grupo -- no es nuevo
                _span_g = _span_grupo(segmentos_l, _grupo) * mpx
                _m = segmentos_l[_grupo[0]]
                _p1_aj = ajustar(*_m['p1'])
                _p2_aj = ajustar(*_m['p2'])
                _capas_g = sorted(set(segmentos_l[i].get('layer') or '(sin capa)' for i in _grupo))
                _ejes_nuevos.append((len(_grupo), round(_span_g, 2), (round(_p1_aj[0]), round(_p1_aj[1])), (round(_p2_aj[0]), round(_p2_aj[1])), _capas_g))
            print(f"  DIAGNOSTICO EJES RELAJADO v2 (SUGERENCIA sin aplicar -- proyecto sin capa 'eje' mapeada): {len(_ejes_nuevos)} cadena(s) que la regla actual (Paso 1.5) no agarra, para que el arquitecto confirme")
            for _en in _ejes_nuevos[:60]:
                print(f'    n_segmentos={_en[0]} span_m={_en[1]} muestra_p1={_en[2]} muestra_p2={_en[3]} capas={_en[4]}')
        except Exception as _e_ejerel:
            print(f'  DIAGNOSTICO EJES RELAJADO v2: error al inspeccionar - {_e_ejerel}')

    if not _cota_tiene_capa:
        try:
            # --- Cotas relajado, v2: regla de la 'cruz' de verdad -- la marca
            # perpendicular y la diagonal deben encontrarse casi en el mismo
            # punto, no solo estar sueltas cerca del extremo del portador.
            TOL_CRUZ_EXTREMO_M = 0.15       # que tan cerca del extremo del portador debe caer la cruz
            TOL_CRUZ_EXTREMO_PX = TOL_CRUZ_EXTREMO_M / mpx if mpx else 25
            TOL_CRUZ_ENTRE_MARCAS_M = 0.07  # que tan cerca deben estar la marca perp. y la diagonal ENTRE SI
            TOL_CRUZ_ENTRE_MARCAS_PX = TOL_CRUZ_ENTRE_MARCAS_M / mpx if mpx else 12
            ANGULO_PERP_TOL_DEG = 12
            TOL_MIN_LARGO_LINEA_M = 0.01     # descarta puntos degenerados (largo ~0), no son lineas reales
            TOL_MIN_LARGO_LINEA_PX = TOL_MIN_LARGO_LINEA_M / mpx if mpx else 2

            def _es_perp_o_diag(_s_marca, _ang_portador):
                _dif_ang = abs(_angulo_segmento(_s_marca) - _ang_portador)
                _dif_ang = min(_dif_ang, 180 - _dif_ang)
                if abs(_dif_ang - 90) <= ANGULO_PERP_TOL_DEG:
                    return 'perp'
                if ANGULO_MARCA_MIN_DEG <= _dif_ang <= ANGULO_MARCA_MAX_DEG:
                    return 'diag'
                return None

            _cotas_relajado_nuevas = []
            for _ip, _s_portador in enumerate(segmentos_l):
                if es_cota_pre[_ip]:
                    continue  # la regla actual ya la agarraba -- no es nueva
                if _distancia(_s_portador['p1'], _s_portador['p2']) < TOL_MIN_LARGO_LINEA_PX:
                    continue  # portador degenerado (practicamente un punto)
                _ang_portador = _angulo_segmento(_s_portador)
                _encontro = False
                for _extremo in (_s_portador['p1'], _s_portador['p2']):
                    _marcas_cerca = []
                    for _im in _candidatos_marca:
                        if _im == _ip:
                            continue
                        _s_marca = segmentos_l[_im]
                        if _distancia(_s_marca['p1'], _s_marca['p2']) < TOL_MIN_LARGO_LINEA_PX:
                            continue  # marca degenerada
                        _dmin = min(_distancia(_s_marca['p1'], _extremo), _distancia(_s_marca['p2'], _extremo))
                        if _dmin > TOL_CRUZ_EXTREMO_PX:
                            continue
                        _tipo = _es_perp_o_diag(_s_marca, _ang_portador)
                        if _tipo:
                            _marcas_cerca.append((_im, _tipo))
                    for _ia, _ta in _marcas_cerca:
                        if _ta != 'perp':
                            continue
                        _sa = segmentos_l[_ia]
                        for _ib, _tb in _marcas_cerca:
                            if _tb != 'diag' or _ib == _ia:
                                continue
                            _sb = segmentos_l[_ib]
                            _d_ab = min(_distancia(_sa['p1'], _sb['p1']), _distancia(_sa['p1'], _sb['p2']),
                                        _distancia(_sa['p2'], _sb['p1']), _distancia(_sa['p2'], _sb['p2']))
                            if _d_ab <= TOL_CRUZ_ENTRE_MARCAS_PX:
                                _encontro = True
                                break
                        if _encontro:
                            break
                    if _encontro:
                        break
                if _encontro:
                    _cotas_relajado_nuevas.append(_ip)
            print(f"  DIAGNOSTICO COTAS RELAJADO v2 (SUGERENCIA sin aplicar -- proyecto sin capa 'cota' mapeada): {len(_cotas_relajado_nuevas)} segmento(s) portador que la regla actual (Paso 1.6) no agarra, para que el arquitecto confirme")
            for _ip in _cotas_relajado_nuevas[:60]:
                _s = segmentos_l[_ip]
                _p1_aj = ajustar(*_s['p1'])
                _p2_aj = ajustar(*_s['p2'])
                _capa_s = _s.get('layer') or '(sin capa)'
                print(f'    largo_m={round(_distancia(_s["p1"], _s["p2"]) * mpx, 2)} p1={(round(_p1_aj[0]), round(_p1_aj[1]))} p2={(round(_p2_aj[0]), round(_p2_aj[1]))} capa={_capa_s}')
        except Exception as _e_cotarel:
            print(f'  DIAGNOSTICO COTAS RELAJADO v2: error al inspeccionar - {_e_cotarel}')

    # NUEVO (2026-08-21) -- diagnostico de zona: investiga por que muros
    # reales de una zona con achurado denso (ej. Bano Universal en PdV,
    # zona "Se construye" con achurado rojo) no llegan a muros_geo.
    # ACHURADO_DESPROTEGER_ACTIVO=False (desactivado desde el 27-jul por
    # regresion grave, ver comentario en Paso 2) -- confirmado que el
    # achurado NO puede ser la causa hoy, asi que este diagnostico dumpea
    # el estado real de cada segmento crudo en la zona (capa, color,
    # angulo, protegido, si termino en algun muro final) para encontrar
    # la causa real en vez de seguir adivinando. Zonas hardcodeadas para
    # ESTA corrida (PdV pag2-1) -- ajustar coordenadas para otro plano.
    try:
        ZONAS_DIAGNOSTICO_MURO_PERDIDO = {
            # feedback del arquitecto 2026-08-21, capturas marcadas a mano
            # (Cap1-6) -- zonas aproximadas por referencia visual (sala,
            # cota), no por coordenada exacta de captura (offset desconocido).
            'Cap1 - Bano Personal, ventana+parteluz': (1950, 750, 2100, 1600),
            'Cap2 - Pergola/arco cerca de 1.5': (750, 1300, 1950, 2000),
            'Cap3 - Bano Universal': (1900, 1550, 2500, 2200),
            'Cap4 - Terraza/Pasillo/Cocina, muro con ventana+parteluz': (600, 1600, 750, 3700),
            'Cap5 - Oficina, pilar en muro izquierdo': (1650, 2100, 2300, 3700),
            'Cap6 - Limite Propiedad derecho, muro exterior largo': (2600, 369, 2750, 3700),
        }
        for _nombre_zona, (_zx0, _zy0, _zx1, _zy1) in ZONAS_DIAGNOSTICO_MURO_PERDIDO.items():
            if NOMBRE_PROYECTO.strip().lower() != 'pdv':
                continue  # zonas hardcodeadas para PdV pag2-1 -- no aplican a otro proyecto
            print(f'  DIAGNOSTICO ZONA "{_nombre_zona}": segmentos crudos en la zona y su estado final')
            _n_en_zona = 0
            for _i, _s in enumerate(segmentos_l):
                _p1_adj = ajustar(*_s['p1'])
                _p2_adj = ajustar(*_s['p2'])
                _mx = (_p1_adj[0] + _p2_adj[0]) / 2
                _my = (_p1_adj[1] + _p2_adj[1]) / 2
                if not (_zx0 <= _mx <= _zx1 and _zy0 <= _my <= _zy1):
                    continue
                _n_en_zona += 1
                _largo_m = round(_distancia(_s['p1'], _s['p2']) * mpx, 2)
                _ang = round(_angulo_segmento(_s), 1)
                _capa = _s.get('layer') or '(sin capa)'
                _color = _s.get('color')
                _fill = _s.get('fill')
                _prot = bool(protegido[_i])
                _en_muro_final = None
                for _m in muros_geo:
                    for _seg_m in _m['segmentos']:
                        if (_distancia(_p1_adj, _seg_m['p1']) < 5 or _distancia(_p1_adj, _seg_m['p2']) < 5 or
                                _distancia(_p2_adj, _seg_m['p1']) < 5 or _distancia(_p2_adj, _seg_m['p2']) < 5):
                            _en_muro_final = _m['id']
                            break
                    if _en_muro_final:
                        break
                _razon = []
                if es_eje_por_capa[_i]: _razon.append('capa=eje')
                if es_cota_por_capa[_i]: _razon.append('capa=cota')
                if es_mobiliario_por_capa[_i]: _razon.append('capa=mobiliario')
                if es_ignorar_por_capa[_i]: _razon.append('capa=ignorar')
                _razon_txt = ','.join(_razon) if _razon else '(ninguna capa de exclusion)'
                print(f'    idx={_i} p1={(round(_p1_adj[0]), round(_p1_adj[1]))} p2={(round(_p2_adj[0]), round(_p2_adj[1]))} largo_m={_largo_m} angulo={_ang} capa={_capa!r} color={_color} fill={_fill} protegido={_prot} en_muro_final={_en_muro_final} razon_capa={_razon_txt}')
            print(f'    ({_n_en_zona} segmentos crudos totales en la zona)')
    except Exception as _e_zonadiag:
        print(f'  DIAGNOSTICO ZONA MURO PERDIDO: error al inspeccionar - {_e_zonadiag}')

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
        'muros_geo': muros_geo,
        'muros_excluidos_por_referencia': muros_excluidos_por_referencia,
        'muros_excluidos_por_demolicion': muros_excluidos_por_demolicion,
        'puertas_geo': puertas_geo,
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

# ── Leyenda SIMBOLOGIA (2026-08-21) — se busca UNA vez, en todo el PDF,
#    fuera del loop de paginas (misma logica que el cuadro de superficies
#    de abajo: no depende de en que pagina se este analizando, la leyenda
#    puede vivir en una lamina separada). Nunca se asume el significado de
#    un color -- se lee la leyenda real de ESTE documento.
_LEYENDA_CRUDA = _detectar_leyenda_simbologia(doc)
MAPA_ESTADO_POR_COLOR = {}
if _LEYENDA_CRUDA:
    print(f'  ✓ LEYENDA SIMBOLOGIA: {len(_LEYENDA_CRUDA)} color(es) con texto asociado encontrados en el PDF completo:')
    for _color_ley, _texto_ley in _LEYENDA_CRUDA.items():
        _estado_ley = _clasificar_estado_por_texto_leyenda(_texto_ley)
        MAPA_ESTADO_POR_COLOR[_color_ley] = _estado_ley
        if _estado_ley is None:
            print(f'      color={_color_ley} texto={_texto_ley!r} -> ⚠ NO reconocido como agregado/eliminado (revisar palabras clave)')
        else:
            print(f'      color={_color_ley} texto={_texto_ley!r} -> {_estado_ley}')
else:
    print('  ⚠ LEYENDA SIMBOLOGIA: no se encontro ninguna leyenda color+texto en el PDF -- ningun muro tendra campo "estado"')

# ── Cuadro de superficies (2026-07-31) — extraccion de texto una sola vez,
#    fuera del loop de paginas, via PyMuPDF (mismo metodo confiable que ya
#    usa cotas_texto). No depende de que Claude Vision lea la imagen para
#    los numeros -- el texto real del cuadro se le entrega ya extraido.
TEXTO_CUADRO_SUPERFICIES = ''
if PAGINA_CUADRO_SUPERFICIES:
    if 1 <= PAGINA_CUADRO_SUPERFICIES <= len(doc):
        TEXTO_CUADRO_SUPERFICIES = doc[PAGINA_CUADRO_SUPERFICIES - 1].get_text().strip()
        if TEXTO_CUADRO_SUPERFICIES:
            print(f'  ✓ Cuadro de superficies: {len(TEXTO_CUADRO_SUPERFICIES)} caracteres extraidos de la pagina {PAGINA_CUADRO_SUPERFICIES}')
        else:
            print(f'  ⚠ Cuadro de superficies: la pagina {PAGINA_CUADRO_SUPERFICIES} no devolvio texto extraible (¿es una imagen escaneada?)')
    else:
        print(f'  ⚠ PAGINA_CUADRO_SUPERFICIES={PAGINA_CUADRO_SUPERFICIES} fuera de rango (PDF tiene {len(doc)} paginas) — se ignora')

# Precalcular cuántas veces aparece cada página (para nombres de archivo únicos)
page_count = {}
for pag, _, _ in entries:
    page_count[pag] = page_count.get(pag, 0) + 1
page_idx_so_far = {}

# NUEVO (2026-08-25, pedido del arquitecto -- 'anoche se ejecuto en 30
# minutos'): marcas de tiempo para ver cuanto demora la corrida real, sin
# tener que adivinar mirando el reloj del sistema.
_t_inicio_celda4 = datetime.now()
print(f'\n⏱ Celda 4 iniciada: {_t_inicio_celda4.strftime("%Y-%m-%d %H:%M:%S")}')

for (PAGINA_PLANTA, ESCALA_MANUAL, crop) in entries:
    print(f'\n{"="*56}')
    print(f'  Página {PAGINA_PLANTA}  —  escala {ESCALA_MANUAL}')
    if crop:
        print(f'  Recorte: ({crop[0]:.0%},{crop[1]:.0%}) → ({crop[2]:.0%},{crop[3]:.0%})')
    print(f'{"="*56}')
    _t_inicio_pagina = datetime.now()
    print(f'  ⏱ Inicio página: {_t_inicio_pagina.strftime("%H:%M:%S")}')

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
        '"puertas_detalle":[{"id":"P01","ubicacion_o_recinto":"...","ancho_estimado_m":null,'
        '"sentido_apertura":"interior|exterior|no_determinado","cx_relativo":0.5,"cy_relativo":0.5,'
        '"p1_relativo":{"x":0.5,"y":0.5},"p2_relativo":{"x":0.5,"y":0.5}'
        '}],'
        '"ventanas_detalle":[{"id":"V01","ubicacion_o_recinto":"...","ancho_estimado_m":null,'
        '"cx_relativo":0.5,"cy_relativo":0.5,'
        '"p1_relativo":{"x":0.5,"y":0.5},"p2_relativo":{"x":0.5,"y":0.5}'
        '}],'
        '"escaleras_detalle":[{"id":"ES01","ubicacion_o_recinto":"...","ancho_estimado_m":null,'
        '"cx_relativo":0.5,"cy_relativo":0.5,'
        '"p1_relativo":{"x":0.5,"y":0.5},"p2_relativo":{"x":0.5,"y":0.5}'
        '}],'
        '"rampas_detalle":[{"id":"R01","ubicacion_o_recinto":"...","ancho_estimado_m":null,'
        '"cx_relativo":0.5,"cy_relativo":0.5,'
        '"p1_relativo":{"x":0.5,"y":0.5},"p2_relativo":{"x":0.5,"y":0.5}'
        '}],'
        '"cuadro_superficies_oficial":[{"recinto":"texto exacto del cuadro","area_m2_declarada":null}],'
        '"incumplimientos_oguc":[{"articulo":"","descripcion":"","gravedad":"ALTA|MEDIA|BAJA",'
        '"recinto_afectado":"","medida_requerida":"","medida_detectada":""}],'
        '"documentos_que_faltan":[],"resumen_ejecutivo":""}\n'
        'cx_relativo/cy_relativo: centroide del recinto como fraccion del ancho/alto '
        '(0.0=izquierda/arriba, 1.0=derecha/abajo). Aplica igual a cada item de '
        'puertas_detalle/ventanas_detalle/escaleras_detalle/rampas_detalle -- marca el '
        'centroide de CADA puerta/ventana/escalera/rampa individual que identifiques, '
        'no solo del recinto que la contiene. El campo "id" de cada item de estas 4 listas '
        'es un identificador corto propio (ej. P01, P02 para puertas; V01 para ventanas; '
        'ES01 para escaleras; R01 para rampas), unico dentro de esa lista en esta pagina. '
        'p1_relativo/p2_relativo: en puertas_detalle y ventanas_detalle, dos puntos que trazan '
        'el segmento real de la puerta/ventana en el plano (el ancho del vano/hoja tal como se '
        've dibujado en la lamina), no solo su centro -- si no puedes determinar el trazo exacto, '
        'usa tu mejor aproximacion visual del vano, nunca inventes una orientacion arbitraria. '
        'En escaleras_detalle y rampas_detalle, p1_relativo/p2_relativo son dos esquinas opuestas '
        'del rectangulo que delimita el elemento en el plano (no un trazo de linea). '
        'escalas_detectadas: TODAS las escalas graficas o numericas presentes en la lamina '
        '(una lamina puede traer varias escalas para distintos dibujos). '
        'cuadro_superficies_oficial: SOLO si el plano trae una tabla/cuadro impreso de '
        'superficies por recinto — dejar lista vacia si no existe tal cuadro (no inventar). '
        'circulo_giro_1_50_detectado: true/false solo si es_accesible_universal es true '
        '(bano/recinto rotulado como universal, accesible o para PMR); null en caso contrario.\n'
        'IMPORTANTE — texto que NUNCA es nombre de recinto: el texto de "rasante" (cotas de '
        'nivel de terreno/pendiente en cortes o emplazamiento, ej. "RASANTE +2.50", "NT +0.15") '
        'no representa un espacio habitable — no lo uses como "nombre" ni "etiqueta_en_plano" '
        'de ningun recinto, e ignoralo igual que ignorarias una cota de nivel suelta.'
        + (f'\n\nTEXTO EXTRAIDO DEL CUADRO DE SUPERFICIES IMPRESO (extraccion exacta via PDF, '
           f'no una lectura de imagen) — usa estos valores TAL CUAL para poblar '
           f'cuadro_superficies_oficial (recinto + area_m2_declarada), sin adivinar ni inventar '
           f'valores que no aparezcan en este texto. Si el recinto de esta planta no aparece '
           f'nombrado igual en el texto, no fuerces una coincidencia — deja el campo vacio para '
           f'ese recinto. Si este mismo texto ademas incluye un Estudio de Carga de Ocupacion '
           f'(personas por recinto/poligono, factor m2/persona), usa esos valores REALES para '
           f'calcular la carga de ocupacion en vez de estimarla — por ejemplo para determinar el '
           f'ancho minimo de escalera segun la tabla de OGUC Art. 4.2.10 (instruccion 3c mas '
           f'arriba), en vez de asumir el piso de la tabla por no poder calcular el aforo real:\n'
           f'{TEXTO_CUADRO_SUPERFICIES}\n' if TEXTO_CUADRO_SUPERFICIES else '')
    )

    analisis = {
        'tipo_plano': '?', 'uso_del_proyecto': '?', 'nivel': '?',
        'escalas_detectadas': [], 'recintos': [], 'elementos_detectados': {},
        'puertas_detalle': [], 'ventanas_detalle': [], 'escaleras_detalle': [], 'rampas_detalle': [],
        'cuadro_superficies_oficial': [],
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
    print(f'DIAGNOSTICO ROTACION: rotation={pdf_page_actual.rotation}  rect={pdf_page_actual.rect}  mediabox={pdf_page_actual.mediabox}')
    crop_px = (x1, y1, x2, y2) if crop else None
    datos_vectoriales = extraer_datos_vectoriales(pdf_page_actual, ZOOM, MPX, crop_px, mapeo_capas=globals().get('MAPEO_CAPAS'), mapa_estado_por_color=MAPA_ESTADO_POR_COLOR)
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

    _t_fin_pagina = datetime.now()
    print(f'  ⏱ Fin página: {_t_fin_pagina.strftime("%H:%M:%S")} (duración: {str(_t_fin_pagina - _t_inicio_pagina).split(".")[0]})')

    resultados_paginas.append({
        'entry_idx'             : entry_idx,
        'fname_tag'             : fname_tag,
        'pagina'                : PAGINA_PLANTA,
        'escala'                : ESCALA_MANUAL,
        'crop'                  : list(crop) if crop else None,
        'analisis_semantico'    : analisis,
        'mediciones_geometricas': tabla,
        'muros_geo'             : datos_vectoriales.get('muros_geo', []),
        'muros_excluidos_por_referencia': datos_vectoriales.get('muros_excluidos_por_referencia', []),
        'muros_excluidos_por_demolicion': datos_vectoriales.get('muros_excluidos_por_demolicion', []),
        'puertas_geo'           : datos_vectoriales.get('puertas_geo', []),
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

_t_fin_celda4 = datetime.now()
print(f'⏱ Celda 4 finalizada: {_t_fin_celda4.strftime("%Y-%m-%d %H:%M:%S")} (duración total: {str(_t_fin_celda4 - _t_inicio_celda4).split(".")[0]})')
print(f'\n{"="*56}')
total_inc = sum(len(p['incumplimientos_geo']) for p in resultados_paginas)
print(f'✓ Procesadas {len(resultados_paginas)} / {len(PAGINAS_Y_ESCALAS)} páginas')
print(f'  Incumplimientos geométricos totales: {total_inc}')

# Restaura stdout real y cierra el log -- SIEMPRE al final, para que la
# consola de Colab siga funcionando normal en celdas siguientes.
_sys_log.stdout = _stdout_real
_log_txt_archivo.close()
print(f'\n✓ Log completo de esta corrida guardado en {_LOG_TXT_NOMBRE} -- bajalo del panel de Archivos (clic derecho > Descargar), o activa AUTO_DESCARGAR_DIAGNOSTICOS para que se descargue solo.')
if AUTO_DESCARGAR_DIAGNOSTICOS:
    try:
        from google.colab import files as _files_log_c4
        _files_log_c4.download(_LOG_TXT_NOMBRE)
    except Exception:
        pass
