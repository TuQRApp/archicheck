"""
Diagnostico puntual (2026-09-05): Isla de Pascua exporto 1.133-14.199 "muros"
en la pagina 2 -- cifra irreal para cualquier edificio real. El diagnostico
EJES/COTAS (temporal) de Celda 4 ya mostro un grupo de conectividad con
41.819 segmentos y span 39.89m -- sospecha fuerte de que es un achurado/
patron (pavimento, terreno, etc.), no muros reales, mismo patron que el
shaft de basura de Beauchef.

Este script llama extraer_datos_vectoriales() (la funcion REAL de Celda 4,
sin reimplementarla) una sola vez, sin correr el loop pesado de paginas
completo, y recorta + guarda como PNG los 3 "muros" con mas segmentos para
inspeccion visual directa contra el plano real.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import fitz, numpy as np, cv2

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NOTEBOOK_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'ArchiCheck_Base 05sep_1910.ipynb')
PDF_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Isla de Pascua', 'SPE Isla de Pascua (09 05 14).pdf')
OUT_DIR = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Isla de Pascua', '_run_local_05sep')
os.makedirs(OUT_DIR, exist_ok=True)

with open(PDF_PATH, 'rb') as f:
    pdf_bytes = f.read()
ZOOM = 3
DPI = 72 * ZOOM
doc = fitz.open(stream=pdf_bytes, filetype='pdf')
paginas = []
for page in doc:
    mat = fitz.Matrix(ZOOM, ZOOM)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    buf = np.frombuffer(pix.tobytes('png'), np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    paginas.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)
src = ''.join(nb['cells'][4]['source'])
marcador_loop = 'for (PAGINA_PLANTA, ESCALA_MANUAL, crop) in entries:'
idx = src.index(marcador_loop)
src_funciones = src[:idx]  # solo definiciones, sin correr el loop pesado

ns = {
    'fitz': fitz, 'doc': doc, 'paginas': paginas, 'ZOOM': ZOOM, 'DPI': DPI,
    'NOMBRE_PROYECTO': 'pascua', 'PAGINA_CUADRO_SUPERFICIES': None,
    'MAPEO_CAPAS': {}, 'AUTO_DESCARGAR_DIAGNOSTICOS': False,
    # PAGINAS_Y_ESCALAS solo se usa para armar 'entries' (que no ejecutamos) --
    # dummy vacio para que ese tramo del codigo (fuera del loop) no falle.
    'PAGINAS_Y_ESCALAS': [],
}
exec(compile(src_funciones, 'Celda4_funciones', 'exec'), ns)
print('Funciones cargadas OK')

PAGINA_PLANTA = 2
ESCALA_MANUAL = '1:50'
crop = (0.08, 0.02, 0.71, 0.70)

plano_full = paginas[PAGINA_PLANTA - 1]
h_f, w_f = plano_full.shape[:2]
x1f, y1f, x2f, y2f = crop
x1, y1 = int(x1f * w_f), int(y1f * h_f)
x2, y2 = int(x2f * w_f), int(y2f * h_f)
plano = plano_full[y1:y2, x1:x2].copy()
crop_px = (x1, y1, x2, y2)
scale_ratio = int(ESCALA_MANUAL.split(':')[1])
MPX = 0.0254 * scale_ratio / DPI

pdf_page = doc[PAGINA_PLANTA - 1]
datos = ns['extraer_datos_vectoriales'](pdf_page, ZOOM, MPX, crop_px, mapeo_capas={}, mapa_estado_por_color={})
muros_geo = datos['muros_geo']
print(f'Total muros_geo: {len(muros_geo)}')

muros_geo.sort(key=lambda m: len(m['segmentos']), reverse=True)
for rank, m in enumerate(muros_geo[:3], start=1):
    segs = m['segmentos']
    xs = [p[0] for s in segs for p in (s['p1'], s['p2'])]
    ys = [p[1] for s in segs for p in (s['p1'], s['p2'])]
    x0, x1b, y0, y1b = min(xs), max(xs), min(ys), max(ys)
    print(f'#{rank} {m["id"]}: {len(segs)} segmentos, bbox_px=({x0},{y0})-({x1b},{y1b}), '
          f'{round((x1b-x0)*MPX,1)}x{round((y1b-y0)*MPX,1)}m')

    margen = 60
    cx0, cy0 = max(0, x0 - margen), max(0, y0 - margen)
    cx1, cy1 = min(plano.shape[1], x1b + margen), min(plano.shape[0], y1b + margen)
    recorte = plano[cy0:cy1, cx0:cx1].copy()

    # Dibuja los segmentos de ESTE muro en rojo grueso sobre el recorte, para
    # ver exactamente que trazo esta clasificando como "muro" sin adivinar.
    recorte_bgr = cv2.cvtColor(recorte, cv2.COLOR_RGB2BGR)
    for s in segs:
        p1 = (int(s['p1'][0] - cx0), int(s['p1'][1] - cy0))
        p2 = (int(s['p2'][0] - cx0), int(s['p2'][1] - cy0))
        cv2.line(recorte_bgr, p1, p2, (0, 0, 255), 2)

    # Downscale si el recorte es enorme, para que el PNG sea manejable.
    max_dim = 1800
    h_r, w_r = recorte_bgr.shape[:2]
    if max(h_r, w_r) > max_dim:
        factor = max_dim / max(h_r, w_r)
        recorte_bgr = cv2.resize(recorte_bgr, (int(w_r * factor), int(h_r * factor)))

    out_path = os.path.join(OUT_DIR, f'_inspeccion_muro_gigante_{rank}_{m["id"]}.png')
    cv2.imwrite(out_path, recorte_bgr)
    print(f'   -> guardado: {out_path}')
