# -*- coding: utf-8 -*-
"""
_zoom_anexo.py -- utilidad de apoyo para transcribir los anexos graficos.

Recorta y amplia una region de un PNG del manifiesto para poder leer sin
error las zonas densas (grillas de letras, columnas de cifras). No agrega
informacion: solo hace legible la que ya esta.

Uso:
  python normativa/_zoom_anexo.py <id_o_ruta> [x0 y0 x1 y1] [--escala N]

  Coordenadas en FRACCION de la imagen (0-1). Sin coordenadas, amplia entera.

Ej: python normativa/_zoom_anexo.py OGUC_p0240_x514 0.70 0 1 0.55 --escala 4
"""
import os, sys
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(RAIZ, 'normativa', 'anexos_graficos')
TMP = os.path.join(RAIZ, 'normativa', 'anexos_graficos', '_zoom')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    escala = 3
    if '--escala' in sys.argv:
        escala = int(sys.argv[sys.argv.index('--escala') + 1])

    ref = args[0]
    ruta = ref if os.path.isfile(ref) else os.path.join(DIR, ref + '.png')
    im = Image.open(ruta).convert('RGB')
    W, H = im.size

    if len(args) >= 5:
        f = [float(v) for v in args[1:5]]
        caja = (int(f[0] * W), int(f[1] * H), int(f[2] * W), int(f[3] * H))
        im = im.crop(caja)
    else:
        caja = (0, 0, W, H)

    im = im.resize((im.width * escala, im.height * escala), Image.LANCZOS)
    os.makedirs(TMP, exist_ok=True)
    salida = os.path.join(TMP, os.path.basename(ruta).replace('.png', '_zoom.png'))
    im.save(salida)
    print('origen : %s  (%dx%d)' % (os.path.basename(ruta), W, H))
    print('recorte: %s  ->  %dx%d' % (caja, im.width, im.height))
    print(salida)


if __name__ == '__main__':
    main()
