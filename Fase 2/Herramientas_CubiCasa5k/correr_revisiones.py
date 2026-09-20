# -*- coding: utf-8 -*-
"""
"Revisión Ing SW" -- nombre formal (usuario, 2026-09-20) del paquete de
revisiones automaticas que corre ANTES de DeepSeek/Codex en cualquier
cambio a esta zona del proyecto. 3 etapas propias + la consulta externa al
final:

0. HARDCODEO (~1 seg, siempre): verificar_hardcodeo_normativo.py
   (Fase 2/) -- ¿algun valor o lista normativa que ya vive en
   Fase 2/reglas_normativas.py volvio a escribirse a mano en otro
   archivo? Agregado 2026-09-20 tras encontrar 2 casos reales de esto en
   una sola revision (ver Fase 2/Convenciones_BIM.md seccion E).
1. RAPIDA (~3 seg, siempre): pytest normal -- propiedades con hypothesis
   (test_cuerpo_cerrado_properties.py) + regresion de 24 casos fijos
   (test_cuerpo_cerrado.py, corre aparte, no via pytest).
2. LENTA (~5-7 min, condicional): pytest -m golden -- pipeline real
   completo (Celda 2/4/5/6 sin Vision) contra los 3 proyectos de prueba
   (PdV/Beauchef/Campo Lindo), comparado contra baselines conocidos (ver
   test_cuerpo_cerrado_golden.py). Solo corre si algun archivo "riesgoso"
   (el motor de fusion en si) cambio, o si se fuerza con --golden -- es
   cara en tiempo, no tiene sentido pagarla por un cambio que no toca
   esta logica.

Pensado para usarse como pre-commit hook (ver .githooks/pre-commit, que
le pasa la lista de archivos staged) y tambien a mano antes de proponer o
aceptar un fix en esta zona.

IMPORTANTE -- este script NUNCA llama a DeepSeek/Codex por su cuenta. Esa
consulta tiene costo de API real y se decide caso a caso, siempre
preguntando primero -- ver Proyecto/Roadmap_Revision_Dossier_
ArchiCheck.md y el historial de consultar_bug_*.mjs. "Revisión Ing SW"
termina donde empieza esa consulta, nunca la dispara sola.

Uso:
    python correr_revisiones.py                  # etapas 0+1, y 2 solo si detecta riesgo
    python correr_revisiones.py --solo-rapido     # nunca corre la etapa 2 (iterar rapido)
    python correr_revisiones.py --golden          # fuerza la etapa 2 aunque no detecte riesgo
    python correr_revisiones.py --archivos-cambiados a.py b.py  # lo usa el hook de git
"""
import argparse
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DIR = Path(__file__).resolve().parent
FASE2_DIR = DIR.parent
PYTHON = sys.executable

# archivos donde un cambio amerita pagar el costo de la etapa golden --
# el motor de fusion en si, no los tests ni scripts auxiliares.
ARCHIVOS_RIESGOSOS = ('cuerpo_cerrado.py', 'catalogo_tipologias.py')


def _correr(cmd, cwd, etapa):
    print(f"\n{'=' * 70}\n{etapa}\n{'=' * 70}")
    r = subprocess.run(cmd, cwd=str(cwd))
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--golden', action='store_true', help='forzar la etapa lenta aunque no se detecten archivos riesgosos')
    ap.add_argument('--solo-rapido', action='store_true', help='nunca correr la etapa lenta (para iterar rapido a mano)')
    ap.add_argument('--archivos-cambiados', nargs='*', default=None,
                     help='lista de archivos (staged/cambiados) -- la pasa el hook de pre-commit para decidir si hace falta la etapa golden')
    args = ap.parse_args()

    ok_hardcodeo = _correr([PYTHON, str(FASE2_DIR / 'verificar_hardcodeo_normativo.py')], FASE2_DIR,
                            "ETAPA 0/2 -- hardcodeo normativo (verificar_hardcodeo_normativo.py)")
    ok_24 = _correr([PYTHON, str(DIR / 'test_cuerpo_cerrado.py')], DIR,
                     "regresion de 24 casos fijos (test_cuerpo_cerrado.py)")
    ok_rapido = _correr([PYTHON, '-m', 'pytest', '-v'], DIR,
                         "ETAPA 1/2 -- rapida: propiedades (hypothesis)")
    if not (ok_hardcodeo and ok_24 and ok_rapido):
        print("\n✗ ETAPA 0/1 FALLO -- no se corre la etapa golden, arreglar esto primero.")
        return 1

    necesita_golden = args.golden
    if args.archivos_cambiados is not None:
        necesita_golden = necesita_golden or any(
            any(riesgoso in f for riesgoso in ARCHIVOS_RIESGOSOS) for f in args.archivos_cambiados
        )

    if args.solo_rapido:
        print("\n✓ ETAPAS 0/1 OK. --solo-rapido: se salta la etapa golden a proposito.")
        return 0

    if not necesita_golden:
        print("\n✓ ETAPAS 0/1 OK. Ningun archivo riesgoso cambio -- se salta la etapa golden "
              "(usar --golden para forzarla igual).")
        return 0

    ok_golden = _correr([PYTHON, '-m', 'pytest', '-v', '-m', 'golden'], DIR,
                         "ETAPA 2/2 -- lenta: pipeline real completo (PdV/Beauchef/Campo Lindo)")
    if not ok_golden:
        print("\n✗ ETAPA 2 (golden) FALLO -- ver el diff contra el baseline conocido arriba.")
        return 1

    print("\n✓✓✓ Las 3 etapas de 'Revisión Ing SW' OK. Falta DeepSeek/Codex si corresponde (preguntar antes de correrlo).")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
