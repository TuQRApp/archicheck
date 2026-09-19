# -*- coding: utf-8 -*-
"""
Golden-file / regresion de proyecto completo para cuerpo_cerrado.py --
corre el pipeline real (Celda 2/4/5/6 via _tmp_generar_json_final.py,
sin Vision) contra los 3 proyectos de prueba reales (PdV, Beauchef,
Campo Lindo) y compara el resumen "entradas -> muros" de cada pagina/
zona contra baselines conocidos.

POR QUE ESTO EXISTE (lección real, 2026-09-05/06, ver Proyecto/
Roadmap_Revision_Dossier_ArchiCheck.md): test_cuerpo_cerrado_properties.py
(propiedades locales por funcion) y test_cuerpo_cerrado.py (casos fijos)
NO alcanzan para detectar el tipo de regresion real que rompio Beauchef
ese dia -- un efecto NO LOCAL (un cambio en una funcion "de conector"
termina afectando que tan bien fusiona el pipeline COMPLETO en una zona
densa de un proyecto real que nadie escribio a mano como caso de
prueba). La unica forma que funciono para atrapar esas regresiones fue
correr los 3 proyectos reales completos y comparar el numero final --
este archivo automatiza exactamente eso, en vez de tener que acordarse
de hacerlo a mano cada vez (que es como se paso por alto la regresion
la primera vez).

BASELINES: recapturados 2026-09-19 contra el commit 65493b2 ("Cierra
el port de ventanas/puertas a Celda 4 y agrega prioridad de contacto
directo + soporte de muros curvos al motor de cuerpo cerrado") -- ese
commit retomo y completo la sesion del 2026-09-05/06 (nunca commiteada
en su momento), implementando exactamente la direccion que habian
recomendado DeepSeek/Codex (priorizar el contacto geometrico directo
sobre el calculo de ancho) mas soporte de muros curvos, validado con la
misma metodologia (aislado, 3 proyectos reales, antes/despues). Los
baselines de 2026-09-06 (PdV 59/40, Campo Lindo 64/36, Beauchef
112/22/41) quedaron obsoletos por ese commit -- NO son una regresion,
es codigo que avanzo legitimamente. Beauchef sigue usando la
configuracion CORRECTA de 3 zonas (ver Fase 2/Desarrollos/Test/
Coordenadas planos pdv.txt).

Uso:
    pytest test_cuerpo_cerrado_golden.py -m golden -v
(no corre con un "pytest" simple sin -m golden -- ver pytest.ini)

Si un cambio real y deseado mueve estos numeros (ej. el fix de
_dividir_en_muros_por_union que recomendaron DeepSeek/Codex, si
efectivamente mejora los 3 proyectos a la vez), actualizar los
diccionarios BASELINE_* de abajo a mano, con la corrida real que lo
confirma -- nunca "porque parece que deberia dar esto".
"""
import os
import re
import subprocess
import sys

import pytest

_DIR = os.path.dirname(os.path.abspath(__file__))
_RUNNER = os.path.join(_DIR, '_tmp_generar_json_final.py')
_PYTHON = sys.executable

# cada valor es la lista de "muros finales" en el orden en que aparecen
# los bloques de fusion en el log (1 por pagina/zona, en el orden de
# PAGINAS_Y_ESCALAS del proyecto).
BASELINE_PDV = [38, 37]
BASELINE_CLINDO = [51, 27]
BASELINE_BEAUCHEF = [46, 22, 34]  # 3 zonas reales, ver Coordenadas planos pdv.txt

_PATRON_FUSION = re.compile(r'(\d+) entradas -> (\d+) muros')


def _correr_proyecto(nombre):
    resultado = subprocess.run(
        [_PYTHON, _RUNNER, nombre],
        capture_output=True, text=True, encoding='utf-8', errors='replace',
        cwd=_DIR, timeout=900,
    )
    assert 'Traceback' not in resultado.stdout, (
        f"{nombre}: el runner tiro una excepcion, ver salida completa:\n{resultado.stdout[-4000:]}"
    )
    assert f'listo -- basename' in resultado.stdout, (
        f"{nombre}: el runner no llego a terminar (no imprimio 'listo -- basename'), "
        f"posible cuelgue o corte silencioso. Ultimas lineas:\n{resultado.stdout[-2000:]}"
    )
    return [int(m.group(2)) for m in _PATRON_FUSION.finditer(resultado.stdout)]


def _comparar(nombre, obtenido, esperado):
    assert obtenido == esperado, (
        f"\n{nombre}: el resultado de fusion cambio respecto del baseline conocido.\n"
        f"  esperado: {esperado}\n"
        f"  obtenido: {obtenido}\n"
        f"Si este cambio es un fix real y deseado (confirmado con evidencia, no solo "
        f"'parece mejor'), actualizar BASELINE_{nombre.upper()} en este archivo. Si no, "
        f"hay una regresion real -- ver Proyecto/Roadmap_Revision_Dossier_ArchiCheck.md "
        f"para el historial completo de intentos que rompieron Beauchef en silencio."
    )


@pytest.mark.golden
def test_golden_pdv():
    _comparar('pdv', _correr_proyecto('pdv'), BASELINE_PDV)


@pytest.mark.golden
def test_golden_campo_lindo():
    _comparar('clindo', _correr_proyecto('clindo'), BASELINE_CLINDO)


@pytest.mark.golden
def test_golden_beauchef():
    _comparar('beauchef', _correr_proyecto('beauchef'), BASELINE_BEAUCHEF)


if __name__ == '__main__':
    import pytest as _pytest
    raise SystemExit(_pytest.main([__file__, '-v', '-m', 'golden']))
