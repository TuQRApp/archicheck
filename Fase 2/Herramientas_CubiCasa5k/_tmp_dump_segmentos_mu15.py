"""Dump de los segmentos reales de MU15 (Isla de Pascua) para ver la firma
geometrica de las jardineras/plantas antes de disenar un filtro -- mismo
criterio del proyecto: medir antes de adivinar."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import fitz, numpy as np, cv2

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NOTEBOOK_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'ArchiCheck_Base 05sep_1910.ipynb')
PDF_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Isla de Pascua', 'SPE Isla de Pascua (09 05 14).pdf')

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
idx = src.index('for (PAGINA_PLANTA, ESCALA_MANUAL, crop) in entries:')
src_funciones = src[:idx]

ns = {'fitz': fitz, 'doc': doc, 'paginas': paginas, 'ZOOM': ZOOM, 'DPI': DPI,
      'NOMBRE_PROYECTO': 'pascua', 'PAGINA_CUADRO_SUPERFICIES': None,
      'MAPEO_CAPAS': {}, 'AUTO_DESCARGAR_DIAGNOSTICOS': False, 'PAGINAS_Y_ESCALAS': []}
exec(compile(src_funciones, 'Celda4_funciones', 'exec'), ns)

PAGINA_PLANTA = 2
crop = (0.08, 0.02, 0.71, 0.70)
plano_full = paginas[PAGINA_PLANTA - 1]
h_f, w_f = plano_full.shape[:2]
x1f, y1f, x2f, y2f = crop
x1, y1 = int(x1f * w_f), int(y1f * h_f)
x2, y2 = int(x2f * w_f), int(y2f * h_f)
crop_px = (x1, y1, x2, y2)
MPX = 0.0254 * 50 / DPI

pdf_page = doc[PAGINA_PLANTA - 1]
datos = ns['extraer_datos_vectoriales'](pdf_page, ZOOM, MPX, crop_px, mapeo_capas={}, mapa_estado_por_color={})
muros_geo = datos['muros_geo']
mu15 = next(m for m in muros_geo if m['id'] == 'MU15')
segs = mu15['segmentos']
print(f'MU15: {len(segs)} segmentos totales')

# Clustering simple por proximidad (grid de 150px) para separar "islas"
# dentro de la misma entidad fusionada -- cada isla = un simbolo/tramo real
# distinto que termino uniendose a los demas.
from collections import defaultdict
CELL = 150
buckets = defaultdict(list)
for i, s in enumerate(segs):
    mx = (s['p1'][0] + s['p2'][0]) / 2
    my = (s['p1'][1] + s['p2'][1]) / 2
    buckets[(int(mx // CELL), int(my // CELL))].append(i)

# Union-find simple entre buckets vecinos (8-conectividad) para agrupar en islas
keys = list(buckets.keys())
parent = {k: k for k in keys}
def find(k):
    while parent[k] != k:
        parent[k] = parent[parent[k]]
        k = parent[k]
    return k
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb
for (kx, ky) in keys:
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            vecino = (kx + dx, ky + dy)
            if vecino in buckets:
                union((kx, ky), vecino)

islas = defaultdict(list)
for k in keys:
    islas[find(k)].extend(buckets[k])

islas_lista = sorted(islas.values(), key=len, reverse=True)
print(f'{len(islas_lista)} isla(s) espacial(es) distinta(s) dentro de MU15 (separadas por >150px sin vecino)')
for rank, indices in enumerate(islas_lista[:12], start=1):
    xs = [segs[i]['p1'][0] for i in indices] + [segs[i]['p2'][0] for i in indices]
    ys = [segs[i]['p1'][1] for i in indices] + [segs[i]['p2'][1] for i in indices]
    largos = [math.hypot(segs[i]['p2'][0]-segs[i]['p1'][0], segs[i]['p2'][1]-segs[i]['p1'][1]) for i in indices]
    angs = [math.degrees(math.atan2(segs[i]['p2'][1]-segs[i]['p1'][1], segs[i]['p2'][0]-segs[i]['p1'][0])) % 180 for i in indices]
    ang_range = max(angs) - min(angs) if len(angs) > 1 else 0
    print(f'  isla #{rank}: {len(indices)} segs, bbox_px=({min(xs):.0f},{min(ys):.0f})-({max(xs):.0f},{max(ys):.0f}) '
          f'= {(max(xs)-min(xs))*MPX:.2f}x{(max(ys)-min(ys))*MPX:.2f}m, '
          f'largo(min/med/max)={min(largos)*MPX:.3f}/{sorted(largos)[len(largos)//2]*MPX:.3f}/{max(largos)*MPX:.3f}m, '
          f'rango_angular={ang_range:.0f}deg')
