"""Genera el JSON + PNG finales (Celda 4 -> 5 -> 6 reales, sin reimplementar
nada) para PdV, Beauchef y Campo Lindo con el notebook parcheado hoy
(05sep_1910), listos para subir al portal. Salta Claude Vision (mismo
motivo de siempre: no aporta a esta verificacion y evita gastar API)."""
import sys, os, re, json
from datetime import datetime
sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import matplotlib
matplotlib.use('Agg')  # headless -- sin esto plt.show()/subplots puede fallar sin display

import fitz, numpy as np, cv2

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NOTEBOOK_PATH = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'ArchiCheck_Base 05sep_2151.ipynb')
TEST_DIR = os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test')

with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
    nb = json.load(f)


def celda(i):
    return ''.join(nb['cells'][i]['source'])


SRC_C4 = celda(4).replace(
    "WORKER_URL = 'https://archicheck-worker.nestragues.workers.dev'",
    "WORKER_URL = 'http://127.0.0.1:1/no-vision-local-test'  # NEUTRALIZADO por el runner local"
)
SRC_C5 = celda(5)
SRC_C6 = celda(6)

ZOOM = 3
DPI = 72 * ZOOM
MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

PROYECTOS = [
    dict(nombre='pdv', pdf=os.path.join(TEST_DIR, 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf'),
         entries=[(2, '1:50', (0.0, 0.0, 0.40, 1.0)), (2, '1:50', (0.40, 0.0, 0.79, 1.0))],
         mapeo={'muro': ['Muros'], 'ignorar': ['Muros Proy', 'Proyecciones', 'Formato', '0'],
                'eje': ['Ejes'], 'cota': ['Cotas'], 'puerta': ['Ptas Ventanas'], 'ventana': ['Ptas Ventanas'],
                'mobiliario': ['Muebles', 'ARTEFACTOS']},
         out=os.path.join(TEST_DIR, 'pdv', '_run_local_05sep')),
    dict(nombre='beauchef', pdf=os.path.join(TEST_DIR, 'Beauchef', 'CC-BEAUCHEFF_DOM Planos.pdf'),
         entries=[(3, '1:50', (0.046, 0.022, 0.454, 0.48)),
                  (3, '1:50', (0.481, 0.025, 0.827, 0.402)),
                  (3, '1:50', (0.043, 0.485, 0.692, 0.98))],
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

cual = sys.argv[1] if len(sys.argv) > 1 else 'todos'

for proy in PROYECTOS:
    if cual != 'todos' and proy['nombre'] != cual:
        continue
    print(f'\n{"#"*70}\n# {proy["nombre"]}\n{"#"*70}')
    os.makedirs(proy['out'], exist_ok=True)
    cwd0 = os.getcwd()
    os.chdir(proy['out'])
    try:
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

        _now = datetime.now()
        _slug = re.sub(r'[^a-z0-9]+', '_', proy['nombre'].strip().lower()).strip('_') or 'proyecto'
        _timestamp = f'{_now.day:02d}{MESES_ES[_now.month-1]}_{_now.strftime("%H%M")}'
        basename = f'archicheck_geometrico_{_slug}_{_timestamp}'

        ns = {
            'fitz': fitz, 'doc': doc, 'paginas': paginas, 'ZOOM': ZOOM, 'DPI': DPI,
            'NOMBRE_PROYECTO': proy['nombre'], 'PAGINA_CUADRO_SUPERFICIES': None,
            'MAPEO_CAPAS': proy['mapeo'], 'AUTO_DESCARGAR_DIAGNOSTICOS': False,
            'PAGINAS_Y_ESCALAS': proy['entries'],
            'pdf_name': os.path.basename(proy['pdf']),
            'BASENAME': basename,
        }
        print(f'Corriendo Celda 4 (extraccion + geometria)...')
        exec(compile(SRC_C4, 'Celda4', 'exec'), ns)
        print(f'Corriendo Celda 5 (PNGs)...')
        exec(compile(SRC_C5, 'Celda5', 'exec'), ns)
        print(f'Corriendo Celda 6 (JSON)...')
        exec(compile(SRC_C6, 'Celda6', 'exec'), ns)
        print(f'✓ {proy["nombre"]} listo -- basename: {basename}')
    except Exception:
        import traceback
        traceback.print_exc()
    finally:
        os.chdir(cwd0)
