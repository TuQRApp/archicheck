# -*- coding: utf-8 -*-
"""
Tests basados en propiedades (hypothesis) para cuerpo_cerrado.py --
complementa test_cuerpo_cerrado.py (casos fijos, uno por bug real
encontrado) con invariantes generales que deben cumplirse para
CUALQUIER geometria de entrada, no solo los casos ya vistos.

Motivacion (2026-09-05/06, ver Proyecto/Roadmap_Revision_Dossier_
ArchiCheck.md): 4 intentos de fix distintos sobre esta misma zona del
codigo parecian correctos por inspeccion y hasta fueron validados por
consulta externa (DeepSeek+Codex) en su LOGICA, pero rompieron Beauchef
en la practica -- casos reales que nadie penso a mano de antemano. Un
test de propiedades no reemplaza medir contra los 3 proyectos reales
(ver test_cuerpo_cerrado_golden.py), pero atrapa violaciones de
contrato mucho mas rapido y con mucha mas cobertura de casos limite que
cualquier lista de ejemplos fijos que se nos ocurra escribir a mano.

IMPORTANTE: estas propiedades codifican el comportamiento ACTUAL
decidido como correcto (post-reversion del 2026-09-05/06) -- a
proposito NO incluyen invariantes de los intentos revertidos (ej.
"d <= largo_s"), porque esos quedaron descartados por regresion real,
no serian una propiedad valida a proteger.

Uso: pytest test_cuerpo_cerrado_properties.py -v
(o simplemente "pytest" desde este directorio, corre junto al resto)
"""
import math

from hypothesis import given, settings, strategies as st

from cuerpo_cerrado import (
    ancho_por_emparejamiento,
    construir_contexto_con_pares,
    cuerpo_cerrado_fusiona,
    _dividir_en_muros_por_union,
)

# Rango de coordenadas acotado (simula un plano de tamano razonable en
# px) -- valores muy grandes o muy chicos no aportan cobertura extra y
# solo hacen mas lento el shrinking de hypothesis.
_COORD = st.integers(min_value=-500, max_value=500)
_MPX = st.floats(min_value=0.002, max_value=0.05, allow_nan=False, allow_infinity=False)


@st.composite
def _segmento(draw):
    p1 = (draw(_COORD), draw(_COORD))
    p2 = (draw(_COORD), draw(_COORD))
    # descarta segmentos degenerados (largo 0) -- _angulo() y el resto
    # del modulo asumen un segmento con direccion real, no un punto
    if p1 == p2:
        p2 = (p2[0] + 1, p2[1])
    return {'p1': p1, 'p2': p2}


_LISTA_SEGMENTOS = st.lists(_segmento(), min_size=1, max_size=10)


# ─────────────────────────────────────────────────────────────────────
# 1. _dividir_en_muros_por_union: particion exacta -- cada indice de
#    entrada debe aparecer en EXACTAMENTE una cadena de salida. Este es
#    el mecanismo que DeepSeek y Codex (consulta 2026-09-06) senalaron
#    como el lugar correcto para atacar el bug de "cuerpo cerrado" --
#    si algo ahi empieza a perder o duplicar segmentos, cualquier fix
#    posterior en cuerpo_cerrado_fusiona queda construido sobre una
#    base rota sin que se note en una corrida normal.
# ─────────────────────────────────────────────────────────────────────
@given(segmentos=_LISTA_SEGMENTOS,
       tol_cluster_px=st.floats(min_value=0.5, max_value=20, allow_nan=False),
       tol_diametro_px=st.floats(min_value=1, max_value=100, allow_nan=False))
@settings(max_examples=200)
def test_dividir_en_muros_es_una_particion(segmentos, tol_cluster_px, tol_diametro_px):
    indices = list(range(len(segmentos)))
    cadenas = _dividir_en_muros_por_union(segmentos, indices, tol_cluster_px, tol_diametro_px)

    todos_los_indices_de_salida = [i for cadena in cadenas for i in cadena]
    assert sorted(todos_los_indices_de_salida) == indices, (
        f"la particion no preserva exactamente los indices de entrada -- "
        f"entrada={indices}, salida (aplanada)={sorted(todos_los_indices_de_salida)}"
    )
    assert len(set(todos_los_indices_de_salida)) == len(todos_los_indices_de_salida), (
        "un mismo indice aparece en mas de una cadena -- viola la particion"
    )


# ─────────────────────────────────────────────────────────────────────
# 2. ancho_por_emparejamiento: si devuelve un ancho no-None (por
#    segmento o el representativo del grupo), ese valor SIEMPRE debe
#    caer dentro de [tol_min_px, tol_max_px] -- es el contrato explicito
#    de la funcion (docstring: "un segmento aprox. paralelo a distancia
#    perpendicular entre tol_min_m y tol_max_m"). Un valor fuera de
#    rango indicaria que algun candidato se coló sin pasar el filtro.
# ─────────────────────────────────────────────────────────────────────
@given(grupo_y_contexto=st.data(),
       tol_min_m=st.floats(min_value=0.01, max_value=0.05, allow_nan=False),
       tol_max_m=st.floats(min_value=0.3, max_value=1.2, allow_nan=False),
       mpx=_MPX)
@settings(max_examples=150)
def test_ancho_por_emparejamiento_respeta_rango_de_tolerancia(grupo_y_contexto, tol_min_m, tol_max_m, mpx):
    contexto = grupo_y_contexto.draw(_LISTA_SEGMENTOS)
    grupo = grupo_y_contexto.draw(st.lists(st.sampled_from(contexto), min_size=1, max_size=len(contexto), unique_by=id))

    resultado = ancho_por_emparejamiento(grupo, contexto, mpx, tol_min_m=tol_min_m, tol_max_m=tol_max_m)

    tol_min_px = tol_min_m / mpx
    tol_max_px = tol_max_m / mpx
    for item in resultado['detalle']:
        if item['anchoPx'] is not None:
            assert tol_min_px - 1e-6 <= item['anchoPx'] <= tol_max_px + 1e-6, (
                f"anchoPx={item['anchoPx']} fuera de [{tol_min_px}, {tol_max_px}] "
                f"(tol_min_m={tol_min_m}, tol_max_m={tol_max_m}, mpx={mpx})"
            )
    if resultado['anchoPx'] is not None:
        assert tol_min_px - 1e-6 <= resultado['anchoPx'] <= tol_max_px + 1e-6


# ─────────────────────────────────────────────────────────────────────
# 3. _ancho_heredado_de_segmento (via construir_contexto_con_pares +
#    cuerpo_cerrado_fusiona): un conector nunca puede "inventar" un
#    ancho -- si hereda uno, ese valor tiene que coincidir exactamente
#    con el anchoPx de algun segmento REAL de con_pares que ademas
#    comparte vertice con el segmento evaluado (dentro de tolerancia).
#    Esta es la propiedad de "sin fabricacion" que estuvo en el centro
#    de los 4 intentos fallidos del 2026-09-05 -- cualquier variante
#    futura de herencia en cadena DEBE seguir cumpliendo esto.
# ─────────────────────────────────────────────────────────────────────
@given(mpx=_MPX)
@settings(max_examples=50)
def test_ancho_heredado_no_fabrica_valores(mpx):
    # muro real con ancho conocido (30px de separacion entre caras)
    face1 = {'p1': (0, 0), 'p2': (0, 100)}
    face2 = {'p1': (30, 0), 'p2': (30, 100)}
    # conector sin cara propia, pegado en el vertice de face1
    conector = {'p1': (0, 100), 'p2': (0, 115)}
    contexto = [face1, face2, conector]

    con_pares = construir_contexto_con_pares(contexto, mpx)
    anchos_reales_disponibles = {item['anchoPx'] for item in con_pares if item['anchoPx'] is not None}

    resultado = cuerpo_cerrado_fusiona([face1, face2], [conector], contexto, mpx)
    # 'contacto geometrico directo' es un atajo legitimo que fusiona sin
    # calcular anchos (anchoA/anchoB quedan en None a proposito, ver
    # cuerpo_cerrado_fusiona) -- la propiedad de "sin fabricacion" solo
    # aplica cuando SI se calculo un ancho heredado.
    if resultado['fusiona'] and resultado['anchoB'] and resultado['anchoB'].get('esConectorEsquina'):
        heredado = resultado['anchoB']['anchoPx']
        assert any(abs(heredado - real) < 1e-6 for real in anchos_reales_disponibles), (
            f"el ancho heredado {heredado} no coincide con ningun ancho real "
            f"disponible en con_pares ({anchos_reales_disponibles}) -- se esta "
            f"fabricando un valor que no viene de ningun segmento real"
        )


# ─────────────────────────────────────────────────────────────────────
# 4. cuerpo_cerrado_fusiona: contrato basico del resultado -- si
#    fusiona=True, los 2 anchos usados para decidirlo tienen que existir
#    (si no, no habria como haber calculado tol_px/dilatacion); si
#    fusiona=False, siempre viene con un motivo explicado (nunca falla
#    en silencio, principio permanente del proyecto).
# ─────────────────────────────────────────────────────────────────────
@given(segmentos=st.lists(_segmento(), min_size=2, max_size=8), mpx=_MPX)
@settings(max_examples=150)
def test_cuerpo_cerrado_fusiona_respeta_su_propio_contrato(segmentos, mpx):
    mitad = max(1, len(segmentos) // 2)
    grupo_a, grupo_b = segmentos[:mitad], segmentos[mitad:]
    if not grupo_b:
        return
    contexto = segmentos

    resultado = cuerpo_cerrado_fusiona(grupo_a, grupo_b, contexto, mpx)

    if resultado['fusiona']:
        # 2 caminos validos: (a) contacto geometrico directo -- anchoA/
        # anchoB quedan ambos en None a proposito, no hizo falta calcular
        # ancho para decidir la fusion; (b) via ancho por emparejamiento/
        # herencia -- ahi si ambos anchos tienen que existir.
        if resultado['anchoA'] is None or resultado['anchoB'] is None:
            assert resultado['anchoA'] is None and resultado['anchoB'] is None, (
                "anchoA y anchoB deberian ser ambos None (contacto directo) "
                "o ambos no-None (via ancho por emparejamiento) -- no una mezcla"
            )
            assert 'contacto geometrico directo' in resultado['motivo']
        else:
            assert resultado['anchoA']['anchoPx'] is not None
            assert resultado['anchoB']['anchoPx'] is not None
    else:
        assert resultado.get('motivo'), "fusiona=False sin 'motivo' -- viola 'nunca en silencio'"


# ─────────────────────────────────────────────────────────────────────
# 5. Robustez pura: ninguna de las 3 funciones principales debe levantar
#    una excepcion ante geometria arbitraria (siempre y cuando los
#    segmentos no sean degenerados) -- equivalente ligero a fuzzing.
# ─────────────────────────────────────────────────────────────────────
@given(segmentos=st.lists(_segmento(), min_size=1, max_size=12), mpx=_MPX)
@settings(max_examples=200)
def test_no_crashea_con_geometria_arbitraria(segmentos, mpx):
    ancho_por_emparejamiento(segmentos, segmentos, mpx)
    _dividir_en_muros_por_union(segmentos, list(range(len(segmentos))), 10, 50)
    if len(segmentos) >= 2:
        cuerpo_cerrado_fusiona(segmentos[:1], segmentos[1:], segmentos, mpx)


if __name__ == '__main__':
    import pytest
    raise SystemExit(pytest.main([__file__, '-v']))
