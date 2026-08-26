# -*- coding: utf-8 -*-
"""
Test de regresion para cuerpo_cerrado.py -- mismos 4 casos (con sub-casos)
que ya se corrieron contra el prototipo _tmp_cuerpo_cerrado.mjs (Node.js),
portados 1:1 desde _tmp_test_cuerpo_cerrado.mjs. Requiere cv2/numpy
(correr en Colab o en cualquier entorno con opencv-python instalado --
no se pudo correr localmente en esta sesion, sin Python disponible en el
equipo).

Uso: python test_cuerpo_cerrado.py
"""
from cuerpo_cerrado import cuerpo_cerrado_fusiona, identificar_hojas_de_puerta, ancho_por_emparejamiento, clasificar_no_muro

MPX = 0.00588  # metros/px, misma corrida real (log Celda 4 pdv.txt)


def seg(p1, p2):
    return {'p1': p1, 'p2': p2}


def _check(nombre, esperado_fusiona, resultado):
    ok = resultado['fusiona'] == esperado_fusiona
    estado = 'OK' if ok else 'FALLO'
    print(f"[{estado}] {nombre}: fusiona={resultado['fusiona']} (esperado {esperado_fusiona}) -- {resultado['motivo']}")
    return ok


def _check_bool(nombre, esperado, valor):
    ok = valor == esperado
    estado = 'OK' if ok else 'FALLO'
    print(f"[{estado}] {nombre}: valor={valor} (esperado {esperado})")
    return ok


def main():
    resultados = []

    # === CASO 1 (debe RECHAZAR) — pilar MU18 vs centro de ventana idx484 ===
    contexto_cap1 = [
        seg((2047, 803), (1940, 803)),   # idx396
        seg((2004, 752), (1940, 752)),   # idx401
        seg((2004, 930), (2004, 939)),   # idx402 (pilar)
        seg((2004, 1066), (2004, 1075)),  # idx403
        seg((2004, 1211), (2004, 1219)),  # idx404
        seg((2004, 1347), (2004, 1355)),  # idx405
        seg((2004, 1483), (2004, 1560)),  # idx406
        seg((2047, 930), (2047, 939)),    # idx407 (pilar)
        seg((2047, 1066), (2047, 1075)),  # idx408
        seg((2047, 1211), (2047, 1219)),  # idx409
        seg((2047, 1347), (2047, 1355)),  # idx410
        seg((2047, 1483), (2047, 1560)),  # idx411
        seg((2047, 1483), (2004, 1483)),  # idx472
        seg((2047, 1355), (2004, 1355)),  # idx473
        seg((2047, 1219), (2004, 1219)),  # idx474
        seg((2047, 1211), (2004, 1211)),  # idx475
        seg((2047, 1347), (2004, 1347)),  # idx476
        seg((2047, 1066), (2004, 1066)),  # idx477
        seg((2047, 1075), (2004, 1075)),  # idx478
        seg((2047, 939), (2004, 939)),    # idx479 (pilar)
        seg((2047, 930), (2004, 930)),    # idx480 (pilar)
        seg((2026, 1355), (2026, 1483)),  # idx481 (ventana)
        seg((2026, 1347), (2026, 1219)),  # idx482 (ventana)
        seg((2026, 1066), (2026, 939)),   # idx483 (ventana)
        seg((2026, 803), (2026, 930)),    # idx484 (ventana) <- grupo B
    ]
    grupo_a_pilar = [
        seg((2004, 930), (2004, 939)),
        seg((2047, 930), (2047, 939)),
        seg((2047, 939), (2004, 939)),
        seg((2047, 930), (2004, 930)),
    ]
    grupo_b_ventana = [seg((2026, 803), (2026, 930))]
    r1 = cuerpo_cerrado_fusiona(grupo_a_pilar, grupo_b_ventana, contexto_cap1, MPX)
    resultados.append(_check('CASO 1 (pilar vs ventana)', False, r1))

    # === CASO 2 (debe ACEPTAR) — MU13 (capa Muros) + fragmento recuperado (capa Proyecciones) ===
    grupo_a_mu13 = [
        seg((2263, 2036), (2263, 2129)),  # idx95
        seg((2297, 2002), (2297, 2129)),  # idx97
        seg((2203, 2036), (2263, 2036)),  # idx94
        seg((2203, 2002), (2297, 2002)),  # idx96
        seg((2297, 2129), (2263, 2129)),  # idx1324
    ]
    grupo_b_proyecciones = [
        seg((2263, 2129), (2263, 2155)),  # idx1344
        seg((2263, 2176), (2263, 2219)),  # idx1345
        seg((2297, 2129), (2297, 2155)),  # idx1349
        seg((2297, 2176), (2297, 2219)),  # idx1350
    ]
    contexto2 = grupo_a_mu13 + grupo_b_proyecciones
    r2 = cuerpo_cerrado_fusiona(grupo_a_mu13, grupo_b_proyecciones, contexto2, MPX)
    resultados.append(_check('CASO 2 (MU13 + fragmento Proyecciones)', True, r2))

    # === CASO 2b (NUEVO 2026-08-24, regresion de Tipologia B) — idx1324
    # (el "cap" de MU13) empareja de forma ingenua con idx96 a d=127px
    # (ancho > su propio largo de 34px -- emparejamiento espurio ya
    # conocido, ver bug #1 del roadmap). Sin la guarda de plausibilidad
    # en identificar_hojas_de_puerta, ese ancho falso de 127px "mas ancho
    # que idx1344" marcaria idx1344/idx1349 como hoja de puerta por
    # error, rompiendo CASO 2. Verifica directamente que NO se marquen. ===
    hoja_ids_2b = identificar_hojas_de_puerta(contexto2, MPX)['hoja_ids']
    resultados.append(_check_bool('CASO 2b (idx1344/Proyecciones NO marcado como hoja pese al mispairing de idx1324)', False, id(grupo_b_proyecciones[0]) in hoja_ids_2b))
    resultados.append(_check_bool('CASO 2b-control (idx1349/Proyecciones tampoco marcado)', False, id(grupo_b_proyecciones[2]) in hoja_ids_2b))

    # === CASO 3 (control, debe RECHAZAR) — MU13 vs ventana lejana idx484 (sin relacion real) ===
    grupo_a_mu13_corto = [
        seg((2263, 2036), (2263, 2129)),
        seg((2297, 2002), (2297, 2129)),
    ]
    contexto3 = grupo_a_mu13_corto + grupo_b_ventana
    r3 = cuerpo_cerrado_fusiona(grupo_a_mu13_corto, grupo_b_ventana, contexto3, MPX)
    resultados.append(_check('CASO 3 (control: MU13 vs ventana lejana)', False, r3))

    # === CASO 4 (debe RECHAZAR) — MU06 vs MU07 (Cocina), separados por ventana real de 2.3m ===
    grupo_a_mu06 = [
        seg((664, 2240), (664, 2461)),   # idx1
        seg((715, 2274), (715, 2461)),   # idx11
        seg((715, 2461), (664, 2461)),   # idx891 (cap)
    ]
    grupo_b_mu07 = [
        seg((664, 2852), (664, 3103)),   # idx2
        seg((715, 2852), (715, 3103)),   # idx12
        seg((715, 2852), (664, 2852)),   # idx890 (cap)
        seg((715, 3103), (664, 3103)),   # idx866 (cap)
    ]
    ventana_idx892 = seg((690, 2461), (690, 2852))
    contexto4 = grupo_a_mu06 + grupo_b_mu07 + [ventana_idx892]
    r4 = cuerpo_cerrado_fusiona(grupo_a_mu06, grupo_b_mu07, contexto4, MPX)
    resultados.append(_check('CASO 4 (MU06 vs MU07, separados por ventana real)', False, r4))

    r4b = cuerpo_cerrado_fusiona(grupo_a_mu06, [ventana_idx892], contexto4, MPX)
    resultados.append(_check('CASO 4b (control: MU06 vs la propia ventana, sin par)', False, r4b))

    # === CASO 5 (debe ACEPTAR, NUEVO 2026-08-23) — conector de esquina/jog
    # sin cara propia, hereda ancho del vecino por vertice compartido.
    # Sintetico pero mpx elegido para que el ancho (30px) equivalga a 0.3m,
    # espesor de muro plausible -- modela el caso real MU02/MU108 de PdV
    # (confirmado por el arquitecto: un conector nunca tiene cara propia,
    # eso no lo vuelve linea suelta si esta pegado a un muro real). ===
    MPX5 = 0.01  # 1cm/px
    face1 = seg((0, 0), (0, 100))
    face2 = seg((30, 0), (30, 100))
    conector = seg((0, 100), (0, 115))  # continua desde el vertice de face1, sin cara propia
    grupo_a_muro = [face1, face2]
    grupo_b_conector = [conector]
    contexto5 = [face1, face2, conector]
    r5 = cuerpo_cerrado_fusiona(grupo_a_muro, grupo_b_conector, contexto5, MPX5)
    resultados.append(_check('CASO 5 (conector de esquina hereda ancho del vecino)', True, r5))

    # === CASO 5b (control -- debe RECHAZAR) — misma situacion pero el
    # "conector" esta lejos, sin compartir vertice con ningun muro real:
    # debe seguir siendo linea suelta genuina. ===
    conector_aislado = seg((200, 500), (200, 515))
    contexto5b = [face1, face2, conector_aislado]
    r5b = cuerpo_cerrado_fusiona(grupo_a_muro, [conector_aislado], contexto5b, MPX5)
    resultados.append(_check('CASO 5b (control: linea aislada sin vertice compartido, sigue rechazando)', False, r5b))

    # === CASO 6 (debe ACEPTAR, NUEVO 2026-08-23) — conector en angulo NO
    # recto (45 grados) contra un brazo real -- ejercita el remate de
    # esquinas generalizado (_extender_conector_sin_par) en vez del caso
    # colineal de CASO 5 (angulo 0, donde el remate se salta por completo).
    # Pedido explicito del arquitecto: el angulo entre segmentos que llegan
    # a un conector no necesariamente es recto. ===
    conector_diagonal = seg((0, 100), (50, 150))  # 45 grados desde el vertice de face1
    contexto6 = [face1, face2, conector_diagonal]
    r6 = cuerpo_cerrado_fusiona(grupo_a_muro, [conector_diagonal], contexto6, MPX5)
    resultados.append(_check('CASO 6 (conector en angulo de 45 grados, no recto)', True, r6))

    # === CASO 7 (NUEVO 2026-08-24) — Tipologia B: hoja/vano de puerta se
    # excluye de candidato a muro. Confirmado por el arquitecto: un vano/
    # hoja es un par de bordes MAS FINO (menor separacion) que el muro
    # real en sus extremos -- firma relativa, distinta de la de ventana.
    # Reusa face1/face2 (muro real, ancho 30px) del CASO 5. La hoja
    # continua desde el vertice de face1 (0,100), mas angosta (10px). ===
    hoja1 = seg((0, 100), (0, 150))
    hoja2 = seg((10, 100), (10, 150))
    # muro B real perpendicular, mismo ancho que face1/face2 (30px) --
    # control negativo: no debe confundirse con hoja (ancho igual, no
    # menor, al del vecino en su propio extremo).
    faceB1 = seg((0, 100), (50, 100))
    faceB2 = seg((0, 130), (50, 130))
    contexto7 = [face1, face2, hoja1, hoja2, faceB1, faceB2]

    hoja_ids_7 = identificar_hojas_de_puerta(contexto7, MPX5)['hoja_ids']
    resultados.append(_check_bool('CASO 7a (hoja1 identificada como hoja de puerta)', True, id(hoja1) in hoja_ids_7))
    resultados.append(_check_bool('CASO 7b (hoja2 identificada como hoja de puerta)', True, id(hoja2) in hoja_ids_7))
    resultados.append(_check_bool('CASO 7c (control: face1 del muro real NO marcada como hoja)', False, id(face1) in hoja_ids_7))
    resultados.append(_check_bool('CASO 7d (control: faceB1 del muro B real NO marcada como hoja, mismo ancho que su vecino)', False, id(faceB1) in hoja_ids_7))

    r7 = ancho_por_emparejamiento([hoja1], contexto7, MPX5, hoja_ids=hoja_ids_7)
    resultados.append(_check_bool('CASO 7e (hoja1 sin ancho real una vez excluida -- no cuenta como muro)', True, r7['anchoPx'] is None))

    # === CASO 8 (NUEVO 2026-08-24) — clasificar_no_muro: mecanismo de
    # deteccion de conflictos entre tipologias (Principio 3, ver roadmap
    # "auditoria de premisas 24-ago"). Ventana y hoja/vano de puerta son
    # HOY estructuralmente disjuntos por diseno (ver docstring de
    # clasificar_no_muro: ancho_por_emparejamiento ya excluye
    # centrales_ids tanto de "s" como de "c" en cada llamada interna de
    # identificar_hojas_de_puerta), asi que no se puede forzar un
    # conflicto real solo con las 2 firmas nativas -- se prueba el
    # MECANISMO con sets_externos ficticios, y se confirma por separado
    # que un caso real (ventana de CASO 1) no genera conflicto espurio. ===
    seg_conflicto = seg((0, 0), (100, 0))
    r8a = clasificar_no_muro([seg_conflicto], MPX, sets_externos={
        'firma_ficticia_1': {id(seg_conflicto)},
        'firma_ficticia_2': {id(seg_conflicto)},
    })
    resultados.append(_check_bool('CASO 8a (2 firmas sobre el mismo segmento SI se detectan como conflicto)',
                                   True, id(seg_conflicto) in r8a['conflictos']))
    resultados.append(_check_bool('CASO 8b (el conflicto lista ambas tipologias, no elige una)',
                                   {'firma_ficticia_1', 'firma_ficticia_2'}, set(r8a['conflictos'][id(seg_conflicto)])))

    r8c = clasificar_no_muro([seg_conflicto], MPX, sets_externos={'firma_ficticia_1': {id(seg_conflicto)}})
    resultados.append(_check_bool('CASO 8c (control: 1 sola firma NO genera conflicto)',
                                   False, id(seg_conflicto) in r8c['conflictos']))

    r8d = clasificar_no_muro(contexto_cap1, MPX)
    resultados.append(_check_bool('CASO 8d (control real: ventana de CASO 1 no genera conflicto ventana<->hoja, disjuntos por diseno)',
                                   0, len(r8d['conflictos'])))

    # === CASO 9 (NUEVO 2026-08-26) — hoja "gruesa" (>10cm) NO se excluye
    # como muro, queda marcada como DUDA para confirmar con el arquitecto
    # -- caso real MU54/MU55 de PdV N2 (muro real de 0.20m junto a un
    # vecino real de 0.30m, se excluia mal como hoja de puerta antes de
    # este umbral). Aclaracion del arquitecto: los vertices de una hoja
    # real no necesariamente coinciden con los del muro/pilar adyacente
    # (limitacion conocida, sin resolver todavia) -- mientras tanto, en
    # vez de inventar un margen/ratio sin dato real, todo candidato mas
    # ancho que ancho_max_hoja_confirmada_m (0.10m) se separa como duda
    # en vez de decidirse en silencio. Reusa face1/face2 (muro real
    # 30px=0.30m) del CASO 5. ===
    hoja_gruesa1 = seg((0, 100), (0, 150))   # ancho 20px = 0.20m a MPX5 -- > 10cm, no es hoja fina
    hoja_gruesa2 = seg((20, 100), (20, 150))
    contexto9 = [face1, face2, hoja_gruesa1, hoja_gruesa2]

    resultado9 = identificar_hojas_de_puerta(contexto9, MPX5)
    resultados.append(_check_bool('CASO 9a (hoja gruesa de 0.20m NO se excluye como hoja confirmada)',
                                   False, id(hoja_gruesa1) in resultado9['hoja_ids']))
    resultados.append(_check_bool('CASO 9b (hoja gruesa de 0.20m SI queda marcada como duda)',
                                   True, id(hoja_gruesa1) in resultado9['hoja_dudosa_ids']))
    resultados.append(_check_bool('CASO 9c (control: hoja1 fina de CASO 7, 0.10m exacto, sigue confirmada -- limite inclusive)',
                                   True, id(hoja1) in identificar_hojas_de_puerta(contexto7, MPX5)['hoja_ids']))

    r9 = ancho_por_emparejamiento([hoja_gruesa1], contexto9, MPX5, hoja_ids=resultado9['hoja_ids'])
    resultados.append(_check_bool('CASO 9d (hoja gruesa SIGUE teniendo ancho real -- no se descarta como muro pese a la duda)',
                                   True, r9['anchoPx'] is not None))

    clasif9 = clasificar_no_muro(contexto9, MPX5)
    resultados.append(_check_bool('CASO 9e (clasificar_no_muro tambien expone hoja_vano_puerta_duda)',
                                   True, id(hoja_gruesa1) in clasif9['sets_por_tipologia']['hoja_vano_puerta_duda']))

    n_ok = sum(resultados)
    print(f"\n{n_ok}/{len(resultados)} casos OK")
    if n_ok != len(resultados):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
