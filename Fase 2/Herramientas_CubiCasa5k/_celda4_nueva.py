# ══════════════════════════════════════════════════════════
# CELDA 4 — PROCESAR TODAS LAS PÁGINAS
#   Por cada página: Claude Vision + extracción vectorial + OpenCV + cruce
# ══════════════════════════════════════════════════════════
import base64, json, requests, re, math
import cv2, numpy as np
from datetime import datetime

WORKER_URL = 'https://archicheck-worker.nestragues.workers.dev'

OGUC_REGLAS = {
    'dormitorio': (8.0,  None, 'Art. 4.1.7 OGUC'),
    'sala'      : (10.0, None, 'Art. 4.1.7 OGUC'),
    'living'    : (10.0, None, 'Art. 4.1.7 OGUC'),
    'comedor'   : (8.0,  None, 'Art. 4.1.7 OGUC'),
    'cocina'    : (3.0,  None, 'Art. 4.1.7 OGUC'),
    'bano'      : (1.5,  None, 'Art. 4.1.7 OGUC'),
    'pasillo'   : (None, 1.20, 'Art. 4.2.2 OGUC — ancho min 1.20 m'),
    'escalera'  : (None, 1.20, 'Art. 4.2.4 OGUC — ancho min 1.20 m'),
    'rampa'     : (None, 1.20, 'Art. 4.1.7 OGUC + DS 50/2015'),
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

def _es_trazo_discontinuo(path):
    """
    NUEVO 2026-07-23. Un trazo es 'discontinuo' (linea de referencia: deslinde,
    linea de edificacion, eje) si el PDF lo define con un patron de guiones
    real (path['dashes'], formato PDF tipo '[3 2] 0'). Formato solido es '[] 0'
    o vacio. Esto es una señal exacta del vector, no una heuristica de pixeles
    sobre grosor o densidad.
    """
    dashes = (path.get('dashes') or '').strip()
    if not dashes:
        return False
    contenido = dashes.split(']')[0].replace('[', '').strip()
    return len(contenido) > 0

def extraer_datos_vectoriales(pdf_page, zoom, mpx, crop_px=None, max_largo_trazo_m=3.0):
    """
    Extrae texto y trazos vectoriales directamente del PDF (objeto fitz.Page),
    en vez de adivinarlos desde pixeles. Convierte las coordenadas al mismo
    espacio de pixeles que usa el resto del pipeline (aplicando ZOOM), y
    recorta a crop_px = (x1,y1,x2,y2) en pixeles si se especifica.

    Filtra trazos largos (muros/limites de recinto — ya los cubre OpenCV) y
    se queda con los cortos (candidatos a simbolo: arco de puerta, lineas de
    ventana, etc.), usando max_largo_trazo_m como umbral en metros reales.

    NUEVO 2026-07-23: ademas de 'trazos' (cortos, candidatos a simbolo),
    devuelve 'lineas_discontinuas' — trazos con patron de guiones real,
    SIN filtro de largo (nos interesan aunque sean muy largos, como un
    deslinde que cruza toda la pagina), para poder borrarlos del raster
    antes de detectar recintos y que no los corten en dos.

    Retorna:
      'cotas_texto'         : [{'texto','x','y','w','h'}, ...] — reemplaza el OCR
      'trazos'               : [{'tipo':'l'|'c'|'re'|'qu','puntos':[(x,y),...],'ancho_linea'}, ...]
      'lineas_discontinuas'  : [{'puntos':[(x,y),...],'ancho_linea'}, ...]
      'n_texto', 'n_trazos', 'n_trazos_descartados_largos', 'n_lineas_discontinuas'
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

    # ── Trazos vectoriales cortos: muros ya cubiertos por OpenCV, nos
    #    interesan los candidatos a simbolo (arco de puerta, linea de ventana)
    trazos = []
    n_descartados_largos = 0
    max_largo_px = (max_largo_trazo_m / mpx) if mpx else float('inf')

    # ── Lineas discontinuas: sin filtro de largo, para borrarlas del raster
    lineas_discontinuas = []

    for path in pdf_page.get_drawings():
        ancho_linea = path.get('width') or 0
        es_discontinuo = _es_trazo_discontinuo(path)

        if es_discontinuo:
            pts_path = []
            for item in path.get('items', []):
                op = item[0]
                if op == 'l':
                    pts_path.extend([item[1], item[2]])
                elif op == 'c':
                    pts_path.extend(item[1:5])
                elif op == 're':
                    r = item[1]
                    pts_path.extend([r.tl, r.tr, r.br, r.bl])
                elif op == 'qu':
                    q = item[1]
                    pts_path.extend([q.ul, q.ur, q.lr, q.ll])
            if len(pts_path) >= 2:
                pts_px = [to_px(p) for p in pts_path]
                if any(dentro_crop(x, y) for x, y in pts_px):
                    pts_ajustados = [ajustar(x, y) for x, y in pts_px]
                    lineas_discontinuas.append({
                        'puntos': [(round(x), round(y)) for x, y in pts_ajustados],
                        'ancho_linea': round(ancho_linea, 2),
                    })
            # una linea discontinua no es candidata a simbolo — no sigue al
            # bloque de 'trazos' cortos de abajo
            continue

        for item in path.get('items', []):
            op = item[0]
            puntos_px = []
            if op == 'l':      # linea: 2 puntos
                puntos_px = [to_px(item[1]), to_px(item[2])]
            elif op == 'c':    # curva bezier (tipico en arcos de puerta)
                puntos_px = [to_px(p) for p in item[1:5]]
            elif op == 're':   # rectangulo
                r = item[1]
                puntos_px = [to_px(r.tl), to_px(r.tr), to_px(r.br), to_px(r.bl)]
            elif op == 'qu':   # quad
                q = item[1]
                puntos_px = [to_px(q.ul), to_px(q.ur), to_px(q.lr), to_px(q.ll)]
            else:
                continue

            cx = sum(p[0] for p in puntos_px) / len(puntos_px)
            cy = sum(p[1] for p in puntos_px) / len(puntos_px)
            if not dentro_crop(cx, cy):
                continue

            # Descartar trazos largos: son muros/limites, ya cubiertos por
            # OpenCV. Nos interesan los cortos: candidatos a simbolo puntual.
            xs = [p[0] for p in puntos_px]; ys = [p[1] for p in puntos_px]
            largo_aprox = max(max(xs) - min(xs), max(ys) - min(ys))
            if largo_aprox > max_largo_px:
                n_descartados_largos += 1
                continue

            puntos_ajustados = [ajustar(x, y) for x, y in puntos_px]
            trazos.append({
                'tipo': op,
                'puntos': [(round(x), round(y)) for x, y in puntos_ajustados],
                'ancho_linea': round(ancho_linea, 2),
            })

    return {
        'cotas_texto': cotas_texto,
        'trazos': trazos,
        'lineas_discontinuas': lineas_discontinuas,
        'n_texto': len(cotas_texto),
        'n_trazos': len(trazos),
        'n_trazos_descartados_largos': n_descartados_largos,
        'n_lineas_discontinuas': len(lineas_discontinuas),
    }

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
        '"recintos":[{"nombre":"...","tipo":"sala|cocina|bano|bodega|pasillo|terraza|bar|oficina|rampa|escalera|otro",'
        '"etiqueta_en_plano":"texto exacto o null","area_estimada_m2":null,"ancho_estimado_m":null,'
        '"cx_relativo":0.5,"cy_relativo":0.5,"cumple_oguc":true,"observacion":"o null"}],'
        '"elementos_detectados":{"puertas":0,"ventanas":0,"escaleras":0,"rampas":0,"salidas_emergencia":0},'
        '"incumplimientos_oguc":[{"articulo":"","descripcion":"","gravedad":"ALTA|MEDIA|BAJA",'
        '"recinto_afectado":"","medida_requerida":"","medida_detectada":""}],'
        '"documentos_que_faltan":[],"resumen_ejecutivo":""}\n'
        'cx_relativo/cy_relativo: centroide del recinto como fraccion del ancho/alto '
        '(0.0=izquierda/arriba, 1.0=derecha/abajo).'
    )

    analisis = {
        'tipo_plano': '?', 'uso_del_proyecto': '?', 'nivel': '?',
        'recintos': [], 'elementos_detectados': {},
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
          f'{datos_vectoriales["n_trazos"]} trazos candidatos a símbolo '
          f'({datos_vectoriales["n_trazos_descartados_largos"]} descartados por largos — son muros), '
          f'{datos_vectoriales["n_lineas_discontinuas"]} líneas discontinuas (deslinde/eje/línea de edificación)')

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

    # FIX 2026-07-23 (b): borrar líneas discontinuas (deslinde, línea de
    # edificación, ejes) — son referencias, no muros, y no deben separar
    # recintos en dos. Se identifican por el patrón de guiones real del PDF
    # (path['dashes']), no por una heurística de grosor de píxeles.
    n_lineas_borradas = 0
    for ld in datos_vectoriales['lineas_discontinuas']:
        grosor_borrado = max(6, int(ld['ancho_linea'] * ZOOM) + 6)  # margen anti-aliasing
        pts = ld['puntos']
        for i in range(len(pts) - 1):
            cv2.line(gray, pts[i], pts[i + 1], 255, thickness=grosor_borrado)
        n_lineas_borradas += 1
    print(f'  ✓ Limpieza pre-umbral: {n_texto_borrado} textos borrados, {n_lineas_borradas} líneas discontinuas borradas')

    binary_inv = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=21, C=4)
    k_close    = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    muros      = cv2.dilate(binary_inv, k_close, iterations=2)
    k_open     = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
    limpios    = cv2.morphologyEx(cv2.bitwise_not(muros), cv2.MORPH_OPEN, k_open)

    n_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        limpios, connectivity=8)

    MIN_PX2 = int(0.5 / M2_PX)
    recintos_geo = []
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
