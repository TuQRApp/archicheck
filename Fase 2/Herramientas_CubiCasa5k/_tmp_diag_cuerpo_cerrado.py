# -*- coding: utf-8 -*-
"""
Diagnostico puntual (2026-09-13) del bug de cuerpo cerrado sin resolver
(MU30/MU31 y otros casos reales en PdV/Campo Lindo/Beauchef -- ver
project_archicheck_cuerpo_cerrado_bug en memoria, 3 intentos previos
revertidos el 2026-09-05).

Reutiliza _tmp_correr_celda4_local.py tal cual (mismo patron de exec() sobre
el codigo REAL de Celda 4, sin transcribir logica) pero levanta el tope de
'_diag_muestras < 15' que limita el print de pares bloqueados por cuerpo
cerrado a los primeros 15 -- para este diagnostico necesitamos VER TODOS los
pares bloqueados, no una muestra, para poder aislar el caso puntual que se
esta investigando.

Uso: python _tmp_diag_cuerpo_cerrado.py <pdv|clindo|beauchef>
"""
import sys
import os
import re

sys.path.insert(0, os.path.dirname(__file__))
import _tmp_correr_celda4_local as runner

_ORIG_MARCADOR = "if _diag_muestras < 15:"
_NUEVO_MARCADOR = "if _diag_muestras < 999999:"
_cargar_celda4_parcheada_original = runner.cargar_celda4_parcheada


def cargar_celda4_parcheada_sin_tope():
    src = _cargar_celda4_parcheada_original()
    n = src.count(_ORIG_MARCADOR)
    if n != 1:
        raise RuntimeError(f"Se esperaba 1 ocurrencia de {_ORIG_MARCADOR!r}, se encontraron {n} -- revisar si el codigo cambio de forma.")
    return src.replace(_ORIG_MARCADOR, _NUEVO_MARCADOR)


runner.cargar_celda4_parcheada = cargar_celda4_parcheada_sin_tope

REPO_ROOT = runner.REPO_ROOT

CFG_PDV = dict(
    nombre_proyecto='pdv',
    pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'pdv', '05+06 Planos Rest Pza PdV (021 06 21).pdf'),
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
)

CFG_CAMPOLINDO = dict(
    nombre_proyecto='clindo',
    pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Campo lindo', 'Casa CampoLindo (14 08 23) con layers.pdf'),
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
)

CFG_BEAUCHEF = dict(
    nombre_proyecto='beauchef',
    pdf_path=os.path.join(REPO_ROOT, 'Fase 2', 'Desarrollos', 'Test', 'Beauchef', 'CC-BEAUCHEFF_DOM Planos.pdf'),
    paginas_y_escalas=[(3, '1:50')],
    mapeo_capas={
        'muro': ['MUROS'],
        'ignorar': ['Muros Proy', 'PROYECCION', 'PROYECCIONES', 'FORMATO', '0'],
        'eje': [],
        'cota': ['COTAS', 'BM-COTAS-0.13'],
        'puerta': ['Puertas'],
        'ventana': ['Ventanas'],
        'mobiliario': ['MUEBLES', 'ARTEFACTOS', 'MOBILIARIO'],
        'accesibilidad': [],
        'achurado': ['HATCH'],
        'corte_elevacion': ['MARCADOR CORTES-ELEVACIONES'],
        'deslinde_terreno': ['LINEA TERRENO ORIGINAL'],
    },
)

def correr_y_capturar_ultimo_muros_geo(nombre_proyecto, pdf_path, paginas_y_escalas, mapeo_capas=None,
                                        pagina_cuadro_superficies=None, out_dir='.'):
    """Copia de runner.correr() que ademas devuelve el namespace de exec() --
    exec(codigo, ns) deja todas las variables top-level de la Celda 4 real
    (muros_geo, puertas_geo, etc.) accesibles en ns despues de correr, sin
    tener que transcribir ni reimplementar nada."""
    import time
    os.makedirs(out_dir, exist_ok=True)
    cwd_original = os.getcwd()
    os.chdir(out_dir)
    try:
        doc, paginas, ZOOM, DPI = runner.celda2_local(pdf_path)
        ns = {
            'fitz': runner.fitz, 'doc': doc, 'paginas': paginas, 'ZOOM': ZOOM, 'DPI': DPI,
            'NOMBRE_PROYECTO': nombre_proyecto, 'PAGINAS_Y_ESCALAS': paginas_y_escalas,
            'PAGINA_CUADRO_SUPERFICIES': pagina_cuadro_superficies,
            'MAPEO_CAPAS': mapeo_capas or {}, 'AUTO_DESCARGAR_DIAGNOSTICOS': False,
        }
        src = cargar_celda4_parcheada_sin_tope()
        t0 = time.time()
        exec(compile(src, 'Celda4_diag', 'exec'), ns)
        print(f'\n✓ TERMINO SIN COLGARSE en {time.time()-t0:.1f}s', file=sys.stderr)
        return ns
    finally:
        os.chdir(cwd_original)


if __name__ == '__main__':
    cual = sys.argv[1] if len(sys.argv) > 1 else 'pdv'
    solo_pagina1 = '--pagina1' in sys.argv
    cfg = {'pdv': CFG_PDV, 'clindo': CFG_CAMPOLINDO, 'beauchef': CFG_BEAUCHEF}[cual]
    if solo_pagina1:
        cfg = {**cfg, 'paginas_y_escalas': cfg['paginas_y_escalas'][:1]}
    cfg = {**cfg, 'out_dir': os.path.join(REPO_ROOT, 'Fase 2', 'Herramientas_CubiCasa5k', '_tmp_diag_out')}
    if '--dump-json' in sys.argv:
        import json
        ns = correr_y_capturar_ultimo_muros_geo(**cfg)
        datos = ns['datos_vectoriales']
        mpx = ns.get('mpx') or ns.get('MPX') or datos.get('mpx')
        out_json = os.path.join(cfg['out_dir'], f'_muros_geo_{cual}.json')
        with open(out_json, 'w', encoding='utf-8') as f:
            json.dump({'muros_geo': datos['muros_geo'], 'puertas_geo': datos.get('puertas_geo', []), 'mpx': mpx}, f, ensure_ascii=False, indent=1)
        print(f'Guardado: {out_json} (mpx={mpx})', file=sys.stderr)
    else:
        runner.correr(**cfg)
