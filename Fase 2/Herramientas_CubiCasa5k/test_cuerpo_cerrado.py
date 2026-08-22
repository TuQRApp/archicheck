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
from cuerpo_cerrado import cuerpo_cerrado_fusiona

MPX = 0.00588  # metros/px, misma corrida real (log Celda 4 pdv.txt)


def seg(p1, p2):
    return {'p1': p1, 'p2': p2}


def _check(nombre, esperado_fusiona, resultado):
    ok = resultado['fusiona'] == esperado_fusiona
    estado = 'OK' if ok else 'FALLO'
    print(f"[{estado}] {nombre}: fusiona={resultado['fusiona']} (esperado {esperado_fusiona}) -- {resultado['motivo']}")
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

    n_ok = sum(resultados)
    print(f"\n{n_ok}/{len(resultados)} casos OK")
    if n_ok != len(resultados):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
