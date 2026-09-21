# -*- coding: utf-8 -*-
"""
_render_pagina.py -- renderiza una pagina (o una region) de un PDF normativo.

POR QUE EXISTE (2026-09-21):
extraer la imagen embebida no alcanza en 2 casos, y los dos son frecuentes en
la normativa municipal:

  1. FIGURAS VECTORIALES: diagramas y formulas dibujados con lineas y texto
     suelto, que no existen como raster y por lo tanto no aparecen en
     get_images(). Son 306 paginas en el corpus actual.
  2. IMAGENES QUE SON SOLO UN FONDO: el PDF del PRC de Santiago embebe
     rectangulos blancos y dibuja la formula ENCIMA como texto. Extraer el
     raster devuelve una imagen en blanco; hay que renderizar la pagina.

Uso:
  python normativa/_render_pagina.py <pdf> <pagina_1based> [--dpi N]
  python normativa/_render_pagina.py <pdf> <pagina> --bbox x0 y0 x1 y1 [--margen M]

La salida va a normativa/anexos_graficos/_render/.
"""
import os
import sys
import warnings

warnings.filterwarnings('ignore')
import pymupdf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'normativa', 'anexos_graficos', '_render')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    pdf, pagina = args[0], int(args[1])

    dpi = 200
    if '--dpi' in sys.argv:
        dpi = int(sys.argv[sys.argv.index('--dpi') + 1])

    clip = None
    if '--bbox' in sys.argv:
        i = sys.argv.index('--bbox')
        x0, y0, x1, y1 = (float(v) for v in sys.argv[i + 1:i + 5])
        m = 12.0
        if '--margen' in sys.argv:
            m = float(sys.argv[sys.argv.index('--margen') + 1])
        clip = pymupdf.Rect(x0 - m, y0 - m, x1 + m, y1 + m)

    doc = pymupdf.open(pdf if os.path.isabs(pdf) else os.path.join(RAIZ, pdf))
    pg = doc[pagina - 1]
    pix = pg.get_pixmap(dpi=dpi, clip=clip)

    os.makedirs(SALIDA, exist_ok=True)
    nombre = '%s_p%04d%s.png' % (os.path.splitext(os.path.basename(pdf))[0][:40],
                                 pagina, '_crop' if clip else '')
    ruta = os.path.join(SALIDA, nombre)
    pix.save(ruta)
    print('pagina %d de %s  ->  %dx%d px @ %d dpi' % (pagina, os.path.basename(pdf), pix.width, pix.height, dpi))
    print(ruta)
    doc.close()


if __name__ == '__main__':
    main()
