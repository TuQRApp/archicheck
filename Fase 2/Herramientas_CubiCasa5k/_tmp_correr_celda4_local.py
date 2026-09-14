"""
Runner local de Celda 2+3+4 (sin Colab, sin Claude Vision) -- diagnostico de
cuelgues en Beauchef ("Sala de Basura") e Isla de Pascua, 2026-09-05.

Por que existe: confirmar si los 3 fixes aplicados hoy a la Celda 4 del
notebook vigente (flush inmediato del log, tope+aviso en deteccion de lineas
periodicas, tope+aviso en reconstruccion de extremos de arco) evitan el
cuelgue de mas de una hora reportado por el usuario, sin gastar una hora de
Colab a ciegas ni credito de API (Claude Vision se salta a proposito -- ver
mas abajo, no aporta nada a esta pregunta de performance geometrica).

Reutiliza el codigo REAL de Celda 4 (parcheado hoy) via exec() en un
namespace preparado con lo que Celda 1/2/3 dejarian listo en Colab -- no se
transcribe ni reimplementa nada de la logica geometrica, para no arriesgar
introducir una diferencia respecto al notebook real.

Como se salta Claude Vision: WORKER_URL (linea ~76 de Celda 4) se reemplaza
por una URL localhost invalida -- la llamada real (`requests.post`, dentro de
un try/except que YA existe en el propio codigo de Celda 4 para tolerar
fallos de red) falla al instante con conexion rechazada, y el pipeline sigue
con el 'analisis' semantico vacio por defecto. Cero cambios al codigo
geometrico real que se esta diagnosticando.
"""
import sys, os, io, time, math, json
from datetime import datetime

# Windows/cp1252 no soporta los caracteres ✓/⚠/✗ que imprime la Celda 4 real
# (Colab es UTF-8 por defecto, la consola de Windows no) -- forzar UTF-8 aca
# evita un UnicodeEncodeError que no tiene nada que ver con lo que se esta
# diagnosticando.
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))  # cuerpo_cerrado.py, catalogo_tipologias.py

import fitz
import numpy as np
import cv2

NOTEBOOK_PATH = os.path.join(
    REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'ArchiCheck_Base 05sep_2151.ipynb'
)


def cargar_celda4_parcheada():
    with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    src = ''.join(nb['cells'][4]['source'])
    marcador = "WORKER_URL = 'https://archicheck-worker.nestragues.workers.dev'"
    if marcador not in src:
        raise RuntimeError('No se encontro la linea de WORKER_URL esperada -- revisar si Celda 4 cambio de forma.')
    src = src.replace(
        marcador,
        "WORKER_URL = 'http://127.0.0.1:1/no-vision-local-test'  # NEUTRALIZADO por el runner local -- ver docstring del script"
    )
    return src


def celda2_local(pdf_path):
    """Equivalente local de Celda 2: valida vectorizado + rasteriza paginas."""
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    ZOOM = 3
    DPI = 72 * ZOOM
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    print(f'PDF: "{os.path.basename(pdf_path)}" — {len(doc)} pagina(s)')

    total_text_len = 0
    total_drawings = 0
    for _pg in doc:
        total_text_len += len(_pg.get_text('text').strip())
        total_drawings += len(_pg.get_drawings())
    print(f'  Texto extraido: {total_text_len} caracteres | Trazos vectoriales: {total_drawings}')
    if total_text_len < 50 or total_drawings < 20:
        raise ValueError('PDF no parece vectorizado (mismo chequeo que Celda 2 real).')

    paginas = []
    for i, page in enumerate(doc):
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        buf = np.frombuffer(pix.tobytes('png'), np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        paginas.append(img_rgb)
    print(f'  {len(paginas)} pagina(s) rasterizadas')
    return doc, paginas, ZOOM, DPI


def correr(nombre_proyecto, pdf_path, paginas_y_escalas, mapeo_capas=None,
           pagina_cuadro_superficies=None, out_dir='.'):
    os.makedirs(out_dir, exist_ok=True)
    cwd_original = os.getcwd()
    os.chdir(out_dir)
    try:
        print(f'\n{"#"*70}\n# PROYECTO: {nombre_proyecto}\n{"#"*70}')
        doc, paginas, ZOOM, DPI = celda2_local(pdf_path)

        ns = {
            'fitz': fitz,  # Celda 4 no lo importa (lo hereda del kernel de Colab via Celda 2)
            'doc': doc,
            'paginas': paginas,
            'ZOOM': ZOOM,
            'DPI': DPI,
            'NOMBRE_PROYECTO': nombre_proyecto,
            'PAGINAS_Y_ESCALAS': paginas_y_escalas,
            'PAGINA_CUADRO_SUPERFICIES': pagina_cuadro_superficies,
            'MAPEO_CAPAS': mapeo_capas or {},
            'AUTO_DESCARGAR_DIAGNOSTICOS': False,
        }

        src = cargar_celda4_parcheada()
        t0 = time.time()
        try:
            exec(compile(src, 'Celda4_parcheada_05sep_1706', 'exec'), ns)
            print(f'\n✓ TERMINO SIN COLGARSE en {time.time()-t0:.1f}s')
        except Exception:
            import traceback
            print(f'\n✗ EXCEPCION tras {time.time()-t0:.1f}s:')
            traceback.print_exc()
    finally:
        os.chdir(cwd_original)


if __name__ == '__main__':
    cual = sys.argv[1] if len(sys.argv) > 1 else 'todos'

    CFG_BEAUCHEF = dict(
        nombre_proyecto='beauchef',
        pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Beauchef', 'CC-BEAUCHEFF_DOM Planos.pdf'),
        # A proposito SIN recorte -- pagina 3 completa incluye la "Sala de
        # Basura" que causo el cuelgue original (excluida en la config real
        # via crop desde el 30-ago). Esto es un stress test deliberado del
        # tope nuevo, mas duro que simplemente re-confirmar la exclusion.
        paginas_y_escalas=[(3, '1:50')],
        mapeo_capas={
            'muro': ['MUROS'],
            'ignorar': ['Muros Proy', 'PROYECCION', 'PROYECCIONES', 'FORMATO', '0'],
            'eje': [],
            'cota': ['COTAS', 'BM-COTAS-0.13'],
            'puerta': ['Puertas'],
            'ventana': ['Ventanas'],
            'mobiliario': ['MUEBLES', 'ARTEFACTOS', 'MOBILIARIO'],
            'accesibilidad': ['Accesibilidad'],
            'achurado': ['HATCH'],
            'corte_elevacion': ['MARCADOR CORTES-ELEVACIONES'],
            'deslinde_terreno': ['LINEA TERRENO ORIGINAL'],
        },
        out_dir=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Beauchef', '_run_local_05sep'),
    )

    CFG_PASCUA = dict(
        nombre_proyecto='pascua',
        pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Isla de Pascua', 'SPE Isla de Pascua (09 05 14).pdf'),
        paginas_y_escalas=[(2, '1:50', (0.08, 0.02, 0.71, 0.70))],
        mapeo_capas={},  # confirmado sin capas OCG nativas (roadmap)
        out_dir=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Isla de Pascua', '_run_local_05sep'),
    )

    CFG_PDV = dict(
        nombre_proyecto='pdv',
        pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf'),
        # Config real, recuperada de Celda4_log_31aug_1309.txt (ultima corrida completa)
        paginas_y_escalas=[(2, '1:50', (0.0, 0.0, 0.40, 1.0)), (2, '1:50', (0.40, 0.0, 0.79, 1.0))],
        mapeo_capas={
            'muro': ['Muros'],
            'ignorar': ['Muros Proy', 'Proyecciones', 'Formato', '0'],
            'eje': ['Ejes'],
            'cota': ['Cotas'],
            'puerta': ['Ptas Ventanas'],
            'ventana': ['Ptas Ventanas'],
            'mobiliario': ['Muebles', 'ARTEFACTOS'],
            'accesibilidad': [], 'ascensor': [], 'rampa': [], 'escalera': [],
            'columna': [], 'achurado': [], 'corte_elevacion': [], 'deslinde_terreno': [],
        },
        out_dir=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'pdv', '_run_local_05sep'),
    )

    CFG_CAMPOLINDO = dict(
        nombre_proyecto='clindo',
        pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Campo lindo', 'Casa CampoLindo (14 08 23) con layers.pdf'),
        # Config real, recuperada de "Celda 4 CLindo.txt" (ultima corrida completa)
        paginas_y_escalas=[(2, '1:50', (0.03, 0.02, 0.83, 0.68)), (3, '1:50', (0.04, 0.05, 0.84, 0.69))],
        mapeo_capas={
            'muro': ['Muros'],
            'ignorar': ['MUROS_PROY', 'proyecciones', 'FORMATO'],
            'eje': [],
            'cota': ['cotas'],
            'puerta': ['puertas'],
            'ventana': ['Ventanas'],
            'mobiliario': ['mobiliario'],
            'accesibilidad': [], 'ascensor': [], 'rampa': [], 'escalera': [], 'columna': [], 'achurado': [],
            'corte_elevacion': [],
            'deslinde_terreno': ['cierre', 'calle', 'calle tierra'],
        },
        out_dir=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Campo lindo', '_run_local_05sep'),
    )

    if cual in ('beauchef', 'todos'):
        correr(**CFG_BEAUCHEF)
    if cual in ('pascua', 'todos'):
        correr(**CFG_PASCUA)
    if cual in ('pdv', 'todos'):
        correr(**CFG_PDV)
    if cual in ('clindo', 'todos'):
        correr(**CFG_CAMPOLINDO)
