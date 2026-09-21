# -*- coding: utf-8 -*-
"""
extraer_imagenes_normativa.py

Extrae TODAS las imagenes de contenido de los PDF normativos y arma un
manifiesto con su procedencia, para que su contenido (texto, numeros,
formulas) pueda transcribirse y llegar al analisis.

POR QUE EXISTE (2026-09-21, ACH-DATA-010):
en los PDF de Ley Chile hay contenido normativo que NO esta en la capa de
texto porque esta embebido como imagen. El caso testigo es la tabla del
Art. 4.5.5 (% de vanos por region para recintos docentes): el texto extraido
dice literalmente "el porcentaje ... que se indica en la siguiente tabla: %
SUPERFICIE DEL RECINTO.." y ahi se corta. Un modelo que recibe eso queda
invitado a inventar el numero -- que es exactamente como nacio el "1/6" falso
(ACH-DATA-007).

QUE HACE:
  1. recorre cada PDF de normativa/
  2. descarta la decoracion (membrete/logo que se repite en muchas paginas)
  3. exporta cada imagen de contenido a PNG
  4. le asigna el articulo al que pertenece, buscando hacia atras el ultimo
     encabezado de articulo que la precede en orden de lectura
  5. escribe un manifiesto JSON con procedencia verificable
     (pdf + pagina 1-based + xref + bbox)

Ademas reporta si alguna pagina tiene figuras dibujadas como VECTORES (lineas
y texto suelto en vez de un raster), que no apareceran como imagen embebida.

Uso:  python normativa/extraer_imagenes_normativa.py
"""

import io, json, os, re, collections, warnings
warnings.filterwarnings('ignore')
import pymupdf

RAIZ   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NORM   = os.path.join(RAIZ, 'normativa')
SALIDA = os.path.join(NORM, 'anexos_graficos')
MANIF  = os.path.join(NORM, 'anexos_graficos.json')

# Una imagen que aparece en mas de este numero de paginas es decoracion
# (membrete de la Biblioteca del Congreso, logo institucional), no contenido.
MAX_PAGINAS_CONTENIDO = 3
# CORREGIDO 2026-09-21: la primera version exigia MIN_LADO_PX = 120 en AMBOS
# lados, y eso descartaba justo las FORMULAS -- que son imagenes anchas y bajas
# (600x96, 460x74, 371x52 en la OGUC). Se perdian 5 imagenes de contenido real
# solo en OGUC. Ahora el criterio es de AREA, que no discrimina por forma.
MIN_AREA_PX = 15000

# Encabezados de articulo de cada cuerpo legal. OGUC usa numeracion decimal;
# LGUC y las circulares/ordenanzas usan entero. Se acepta bis/ter/quater.
# CORREGIDO 2026-09-21: la primera version matcheaba "Articulo X.Y.Z" en
# cualquier parte del texto, asi que se quedaba con REFERENCIAS CRUZADAS
# ("...segun lo dispuesto en el articulo 2.1.25...") en vez del encabezado del
# articulo que realmente contiene la imagen. Resultado: las tablas de las
# paginas 195-215, que pertenecen al Art. 4.1.10 (acondicionamiento termico),
# quedaban atribuidas al 2.1.25 y al 2.1.33. Adjuntar una tabla al articulo
# equivocado es exactamente el tipo de error que esta auditoria persigue.
#
# Ahora se exige que el encabezado abra la linea Y que la A sea mayuscula, que
# es como el PDF imprime los encabezados y NO como se escriben las referencias
# cruzadas (en minuscula, en medio de la oracion).
RE_ART_DEC = re.compile(r'^\s*Artículo\s+(\d+\.\d+\.\d+)\.\s*([bB]is|[tT]er)?\b', re.M)
RE_ART_INT = re.compile(r'^\s*Artículo\s+(\d+)\s*[°º]?\s*([bB]is|[tT]er|[qQ]u[aá]ter)?\b\s*[A-I]?\s*[\.\-]', re.M)


def corpus_de(ruta):
    n = os.path.basename(ruta).lower()
    if n.startswith('oguc'):
        return 'OGUC', RE_ART_DEC
    if n.startswith('lguc'):
        return 'LGUC', RE_ART_INT
    if n.startswith('ddu'):
        return 'DDU', RE_ART_INT
    if n.startswith('indice-circulares-ddu'):
        return 'DDU', RE_ART_INT
    if n.startswith('ley-19300') or n.startswith('ley19300'):
        return 'LEY_19300', RE_ART_INT
    # El corpus se toma de la CARPETA, no del nombre del archivo. Aprendido a la
    # mala: "resumen_ejecutivo_prcp_2007_Santiago.pdf" es en realidad de
    # PROVIDENCIA (su portada dice "Plan Regulador de Providencia 2007"). Un
    # nombre de archivo no acredita de que comuna es una norma.
    ruta_norm = ruta.replace('\\', '/').lower()
    for carpeta, etiqueta in (('/providencia/', 'PRC_PROVIDENCIA'),
                              ('/nunoa/', 'PRC_NUNOA'),
                              ('/santiago/', 'PRC_SANTIAGO'),
                              ('/isla_de_pascua/', 'PRC_ISLA_DE_PASCUA')):
        if carpeta in ruta_norm:
            return etiqueta, RE_ART_INT
    return 'OTRO', RE_ART_INT


def articulo_de(doc, pagina, y, re_art):
    """Ultimo encabezado de articulo en o antes de la posicion (pagina, y)."""
    # Se busca hacia atras SIN LIMITE de paginas. La primera version miraba
    # solo 6 y eso dejaba 18 imagenes de OGUC sin asignar: las tablas de las
    # paginas 199-215 pertenecen al Art. 4.1.10, cuyo encabezado esta en la
    # pagina 193 -- 22 paginas antes, porque es un articulo largo con muchas
    # tablas. Toda imagen pertenece a algun articulo; el limite solo escondia
    # los casos dificiles, que son justamente los que importan.
    for p in range(pagina, -1, -1):
        candidatos = []
        for b in doc[p].get_text('blocks'):  # (x0, y0, x1, y1, texto, ...)
            if p == pagina and b[1] > y:
                continue  # en la misma pagina, solo lo que esta mas arriba
            for m in re_art.finditer(b[4] or ''):
                num = m.group(1) + (' ' + m.group(2).lower() if m.group(2) else '')
                candidatos.append((b[1], num))
        if candidatos:
            return max(candidatos, key=lambda c: c[0])[1]
    return None


def main():
    os.makedirs(SALIDA, exist_ok=True)
    pdfs = []
    for base, _, files in os.walk(NORM):
        for f in files:
            if f.lower().endswith('.pdf'):
                pdfs.append(os.path.join(base, f))
    pdfs.sort()

    manifiesto = []
    vectoriales = []

    for ruta in pdfs:
        rel = os.path.relpath(ruta, RAIZ).replace('\\', '/')
        corpus, re_art = corpus_de(ruta)
        doc = pymupdf.open(ruta)

        # 1a pasada: en cuantas paginas aparece cada imagen (para la decoracion)
        paginas_de = collections.defaultdict(set)
        for i, pg in enumerate(doc):
            for im in pg.get_images(full=True):
                paginas_de[im[0]].add(i)

        vistos = set()
        n_conte = 0
        for i, pg in enumerate(doc):
            # figuras vectoriales: muchas trazas = probable diagrama dibujado
            trazos = pg.get_drawings()
            if len(trazos) > 40:
                vectoriales.append({'pdf': rel, 'pagina': i + 1, 'trazos': len(trazos)})

            for im in pg.get_images(full=True):
                xref, w, h = im[0], im[2], im[3]
                if xref in vistos:
                    continue
                if len(paginas_de[xref]) > MAX_PAGINAS_CONTENIDO:
                    continue  # membrete/logo
                if w * h < MIN_AREA_PX:
                    continue  # vineta o separador, no contenido
                vistos.add(xref)

                try:
                    pix = pymupdf.Pixmap(doc, xref)
                    if pix.n - pix.alpha >= 4:  # CMYK -> RGB
                        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                except Exception as e:
                    manifiesto.append({'corpus': corpus, 'pdf': rel, 'pagina': i + 1,
                                       'xref': xref, 'error': str(e)})
                    continue

                bbox = None
                try:
                    r = pg.get_image_rects(xref)
                    if r:
                        bbox = [round(v, 1) for v in (r[0].x0, r[0].y0, r[0].x1, r[0].y1)]
                except Exception:
                    pass

                art = articulo_de(doc, i, bbox[1] if bbox else 0, re_art)
                nombre = '%s_p%04d_x%d.png' % (corpus, i + 1, xref)
                pix.save(os.path.join(SALIDA, nombre))
                n_conte += 1

                manifiesto.append({
                    'id': nombre[:-4],
                    'corpus': corpus,
                    'pdf': rel,
                    'pagina': i + 1,  # 1-based, como la numera el PDF
                    'xref': xref,
                    'px': [w, h],
                    'bbox': bbox,
                    'articulo': art,
                    'archivo': 'anexos_graficos/' + nombre,
                    'transcripcion': None,  # lo llena la lectura con vision
                    'estado': 'PENDIENTE',
                })
        print('%-70s %4d pag  ->  %d imagen(es) de contenido' % (rel, len(doc), n_conte))
        doc.close()

    with io.open(MANIF, 'w', encoding='utf-8') as f:
        json.dump({
            '_que_es': 'Manifiesto de imagenes de contenido de los PDF normativos. '
                       'La transcripcion la hace una lectura con vision y queda en '
                       '"transcripcion"; "estado" pasa de PENDIENTE a TRANSCRITO.',
            '_procedencia': 'Cada entrada trae pdf + pagina (1-based) + xref, para '
                            'poder volver a la fuente y verificar.',
            'total': len(manifiesto),
            'paginas_con_figuras_vectoriales': vectoriales,
            'imagenes': manifiesto,
        }, f, ensure_ascii=False, indent=2)

    print('\nTotal imagenes de contenido: %d' % len(manifiesto))
    print('Paginas con posibles figuras VECTORIALES (no raster): %d' % len(vectoriales))
    for v in vectoriales[:15]:
        print('   %s pag %d (%d trazos)' % (v['pdf'], v['pagina'], v['trazos']))
    print('\nManifiesto: %s' % os.path.relpath(MANIF, RAIZ))


if __name__ == '__main__':
    main()
