"""Dibuja TODOS los muros_geo detectados (color llamativo, unico) sobre el
PNG real de cada pagina, para los 3 proyectos ya validados hoy (PdV,
Beauchef, Campo Lindo) -- mismo espiritu que visualizar_muros.mjs ya
existente, pero corriendo la funcion real de Celda 4 (extraer_datos_
vectoriales) via el runner local, sin reimplementar nada de la logica."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import fitz, numpy as np, cv2

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NOTEBOOK_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'ArchiCheck_Base 05sep_1910.ipynb')
TEST_DIR = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test')

COLOR_MURO_BGR = (255, 255, 0)   # cyan llamativo -- rojo se confunde con "se construye" en remodelaciones
GROSOR_PX = 4

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)
src = ''.join(nb['cells'][4]['source'])
idx = src.index('for (PAGINA_PLANTA, ESCALA_MANUAL, crop) in entries:')
src_funciones = src[:idx]

PROYECTOS = [
    dict(nombre='pdv', pdf=os.path.join(TEST_DIR, 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf'),
         entries=[(2, '1:50', (0.0, 0.0, 0.40, 1.0)), (2, '1:50', (0.40, 0.0, 0.79, 1.0))],
         mapeo={'muro': ['Muros'], 'ignorar': ['Muros Proy', 'Proyecciones', 'Formato', '0'],
                'eje': ['Ejes'], 'cota': ['Cotas'], 'puerta': ['Ptas Ventanas'], 'ventana': ['Ptas Ventanas'],
                'mobiliario': ['Muebles', 'ARTEFACTOS']},
         out=os.path.join(TEST_DIR, 'pdv', '_run_local_05sep')),
    dict(nombre='beauchef', pdf=os.path.join(TEST_DIR, 'Beauchef', 'CC-BEAUCHEFF_DOM Planos.pdf'),
         entries=[(3, '1:50', None)],
         mapeo={'muro': ['MUROS'], 'ignorar': ['Muros Proy', 'PROYECCION', 'PROYECCIONES', 'FORMATO', '0'],
                'cota': ['COTAS', 'BM-COTAS-0.13'], 'puerta': ['Puertas'], 'ventana': ['Ventanas'],
                'mobiliario': ['MUEBLES', 'ARTEFACTOS', 'MOBILIARIO'], 'accesibilidad': ['Accesibilidad'],
                'achurado': ['HATCH'], 'corte_elevacion': ['MARCADOR CORTES-ELEVACIONES'],
                'deslinde_terreno': ['LINEA TERRENO ORIGINAL']},
         out=os.path.join(TEST_DIR, 'Beauchef', '_run_local_05sep')),
    dict(nombre='clindo', pdf=os.path.join(TEST_DIR, 'Campo lindo', 'Casa CampoLindo (14 08 23) con layers.pdf'),
         entries=[(2, '1:50', (0.03, 0.02, 0.83, 0.68)), (3, '1:50', (0.04, 0.05, 0.84, 0.69))],
         mapeo={'muro': ['Muros'], 'ignorar': ['MUROS_PROY', 'proyecciones', 'FORMATO'],
                'cota': ['cotas'], 'puerta': ['puertas'], 'ventana': ['Ventanas'], 'mobiliario': ['mobiliario'],
                'deslinde_terreno': ['cierre', 'calle', 'calle tierra']},
         out=os.path.join(TEST_DIR, 'Campo lindo', '_run_local_05sep')),
]

ZOOM = 3
DPI = 72 * ZOOM

for proy in PROYECTOS:
    print(f'\n=== {proy["nombre"]} ===')
    os.makedirs(proy['out'], exist_ok=True)
    with open(proy['pdf'], 'rb') as f:
        pdf_bytes = f.read()
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    paginas = []
    for page in doc:
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        buf = np.frombuffer(pix.tobytes('png'), np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        paginas.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

    ns = {'fitz': fitz, 'doc': doc, 'paginas': paginas, 'ZOOM': ZOOM, 'DPI': DPI,
          'NOMBRE_PROYECTO': proy['nombre'], 'PAGINA_CUADRO_SUPERFICIES': None,
          'MAPEO_CAPAS': proy['mapeo'], 'AUTO_DESCARGAR_DIAGNOSTICOS': False, 'PAGINAS_Y_ESCALAS': []}
    exec(compile(src_funciones, 'Celda4_funciones', 'exec'), ns)

    page_count = {}
    for pag, _, _ in proy['entries']:
        page_count[pag] = page_count.get(pag, 0) + 1
    page_idx_so_far = {}

    for (PAGINA_PLANTA, ESCALA_MANUAL, crop) in proy['entries']:
        page_idx_so_far[PAGINA_PLANTA] = page_idx_so_far.get(PAGINA_PLANTA, 0) + 1
        sub_idx = page_idx_so_far[PAGINA_PLANTA]
        fname_tag = f'pag{PAGINA_PLANTA}-{sub_idx}' if page_count[PAGINA_PLANTA] > 1 else f'pag{PAGINA_PLANTA}'

        plano_full = paginas[PAGINA_PLANTA - 1]
        h_f, w_f = plano_full.shape[:2]
        if crop:
            x1f, y1f, x2f, y2f = crop
            x1, y1 = int(x1f * w_f), int(y1f * h_f)
            x2, y2 = int(x2f * w_f), int(y2f * h_f)
            plano = plano_full[y1:y2, x1:x2].copy()
            crop_px = (x1, y1, x2, y2)
        else:
            plano = plano_full
            crop_px = None
        scale_ratio = int(ESCALA_MANUAL.split(':')[1])
        MPX = 0.0254 * scale_ratio / DPI

        pdf_page = doc[PAGINA_PLANTA - 1]
        datos = ns['extraer_datos_vectoriales'](pdf_page, ZOOM, MPX, crop_px, mapeo_capas=proy['mapeo'], mapa_estado_por_color={})
        muros_geo = datos['muros_geo']
        print(f'  {fname_tag}: {len(muros_geo)} muros detectados')

        overlay = cv2.cvtColor(plano, cv2.COLOR_RGB2BGR)
        for m in muros_geo:
            for s in m['segmentos']:
                p1 = (int(s['p1'][0]), int(s['p1'][1]))
                p2 = (int(s['p2'][0]), int(s['p2'][1]))
                cv2.line(overlay, p1, p2, COLOR_MURO_BGR, GROSOR_PX)

        out_path = os.path.join(proy['out'], f'_muros_detectados_{proy["nombre"]}_{fname_tag}.png')
        cv2.imwrite(out_path, overlay)
        print(f'  -> guardado: {out_path}')
