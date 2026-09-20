# -*- coding: utf-8 -*-
"""
Paso de "Revisión Ing SW" (ver Proyecto/Diseno_Funcional_ArchiCheck.md,
seccion de metodologia de revision): detecta valores/listas normativas que
ya viven en Fase 2/reglas_normativas.py pero vuelven a aparecer sueltos, a
mano, en otro archivo .py del proyecto -- el patron exacto que ya paso 2
veces el mismo dia (2026-09-20, ver Fase 2/Convenciones_BIM.md seccion E):
un umbral de OGUC_REGLAS hardcodeado en Fase 2/BIM/analizar_todos.py
(`ancho >= 0.80`), y una lista de tipos de recinto duplicada a mano
(`_TIPOS_RECINTO_OGUC`) que casi deja pasar en silencio un tipo de recinto
nuevo si alguna vez se agrega a OGUC_REGLAS sin tocar esa copia.

NO es un chequeo perfecto ni pretende serlo -- es un grep dirigido con 2
heuristicas concretas (ver CHEQUE_A / CHEQUE_B abajo), no un analisis
semantico real. Puede dar falsos positivos (un numero que coincide por
casualidad, sin relacion normativa real) y falsos negativos (un valor
calculado en vez de escrito literal, ej. `8 * 0.1`). Sirve para atrapar
exactamente el patron ya visto, no para garantizar ausencia total de
hardcodeo -- eso sigue siendo trabajo de la revision humana + DeepSeek/Codex
al final de "Revisión Ing SW".

Uso: python verificar_hardcodeo_normativo.py
Sale con exit 1 si encuentra algun candidato -- cada hallazgo se revisa a
mano (confirmar como bug real, o agregar el archivo/linea a la lista de
excepciones documentada abajo si es un falso positivo genuino).
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(DIR))
import reglas_normativas as rn

# Archivos donde ES correcto (o inevitable) que el valor aparezca literal,
# con el motivo documentado -- nunca un "silenciar y listo" sin razon.
ARCHIVOS_EXENTOS = {
    'reglas_normativas.py':
        'es la fuente canonica -- los valores VIVEN aca, no es una copia.',
    '_celda4_actual.py':
        'espejo local de la celda de Colab -- Colab no tiene acceso al '
        'filesystem del repo (sin git clone ni drive.mount, verificado), '
        'la celda real no puede hacer import. Limite de infraestructura '
        'real, no un hardcodeo evitable -- ver Fase 2/reglas_normativas.py.',
    'catalogo_tipologias.py':
        'es documentacion narrativa de decisiones (campos "fuente" con '
        'historial en prosa) -- no logica de comparacion ejecutable, habla '
        'DE umbrales y numeros constantemente por diseno. Falso positivo '
        'seguro con el chequeo A (encontrado 2026-09-20 al probar este '
        'script por primera vez): sus parrafos de historia mencionan '
        '"ancho"/"0.03"/etc. en prosa, no como codigo.',
    'taxonomia_articulos.json':
        'es documentacion de clasificacion (campos "nota" con historial en '
        'prosa, igual que catalogo_tipologias.py) -- no logica de '
        'comparacion ejecutable, habla DE articulos y sus umbrales a '
        'proposito para que un humano entienda la clasificacion, nunca los '
        'compara contra nada en tiempo de ejecucion.',
    'reglas_verificacion.json':
        'checklist documental (campos "referencia"/"verificacion" en '
        'prosa, con las citas ya corregidas 2026-09-21) -- mismo motivo que '
        'taxonomia_articulos.json, describe umbrales para un humano, no los '
        'compara en codigo.',
}

_PALABRAS_NORMATIVAS = re.compile(
    r'\b(ancho|area|superficie|width|min|max|pendiente|fire|rating)\w*\b', re.IGNORECASE)
# Exige espacio a cada lado del operador -- una comparacion real de Python
# se escribe "variable >= valor" (con espacios); un format-spec de f-string
# como "{'Muros':>6}" tiene el mismo caracter ">" pero SIN espacio antes.
# Falso positivo real encontrado 2026-09-20 al probar este script por
# primera vez (analizar_todos.py:488, una linea de print con formato de
# columnas) -- sin este ajuste, cualquier f-string con alineacion dispara
# el chequeo A sin tener nada que ver con una comparacion real.
_OPERADOR_COMPARACION = re.compile(r'\s(>=|<=|==|>|<)\s')

_CLAVES_OGUC = tuple(rn.OGUC_REGLAS.keys())


def _valores_normativos():
    """Todos los numeros usados como umbral en cualquier norma ya cargada
    (OGUC hoy, LGUC/PRC cuando tengan contenido real) -- extraidos en vivo
    del propio modulo, nunca una lista aparte a mano (mismo principio que
    TIPOS_RECINTO_OGUC en reglas_normativas.py)."""
    valores = set()
    for reglas in rn.REGLAS_NORMATIVAS.values():
        for v in reglas.values():
            fuente = v if isinstance(v, tuple) else v.values() if isinstance(v, dict) else ()
            for x in fuente:
                if isinstance(x, (int, float)):
                    valores.add(x)
    return valores


def _archivos_python_del_proyecto():
    for base in (DIR, DIR / 'BIM', DIR / 'Herramientas_CubiCasa5k'):
        if base.is_dir():
            yield from base.glob('*.py')


# EXTENDIDO 2026-09-21 (Revision Ing SW pedida sobre el trabajo de normativa/
# indexacion -- hallazgo real: este script solo escaneaba *.py, dejando
# afuera indexar_normativa.mjs/clasificar_normativa.mjs/backfill_metadata.mjs/
# migracion_taxonomia_metadata.sql/taxonomia_articulos.json y los JSON de
# normativa/nacional. El caso concreto que motivo la extension (reglas_
# verificacion.json vs. nacional/schema.sql desincronizados) fue lo que hizo
# notar el gap de cobertura de archivos, PERO -- correccion 2026-09-21,
# Revision Ing SW Paso 2 (DeepSeek): esta extension NO habria detectado ese
# caso especifico. Dos motivos: (1) reglas_verificacion.json esta en
# ARCHIVOS_EXENTOS (es prosa narrativa, dispara falsos positivos con
# chequeo_a igual que catalogo_tipologias.py); (2) aunque no lo estuviera,
# chequeo_a/chequeo_b detectan un valor/lista normativa hardcodeada DENTRO
# de un archivo, no una comparacion cruzada entre 2 archivos que describen
# el mismo hecho en prosa -- ese tipo de deriva documental necesitaria un
# chequeo C dedicado (comparar reglas_verificacion.json contra schema.sql
# clave por clave), que no existe todavia. Lo que SI hace esta extension:
# ampliar el chequeo_a/chequeo_b ya existente (duplicacion de un umbral/
# lista real de OGUC_REGLAS escrita a mano) a los archivos .mjs/.sql/.json
# nuevos de normativa/, con la misma logica de deteccion, reconociendo
# tambien comentarios de JS/SQL ademas de Python.
def _archivos_normativa_del_proyecto():
    normativa_dir = DIR.parent / 'normativa'
    if not normativa_dir.is_dir():
        return
    for patron in ('*.mjs', '*.sql', '*.json'):
        yield from normativa_dir.rglob(patron)


def _es_comentario_o_docstring(linea):
    l = linea.strip()
    return (l.startswith('#') or l.startswith('"""') or l.startswith("'''")
            # JS (.mjs): comentario de linea o de bloque
            or l.startswith('//') or l.startswith('/*') or l.startswith('*')
            # SQL: comentario de linea
            or l.startswith('--'))


def chequeo_a_valores_sueltos(archivos):
    """Numero que coincide con un umbral normativo real, en una linea que
    ademas tiene un operador de comparacion Y una palabra de pinta
    normativa (ancho/area/min/max/...) cerca -- exigir las 3 condiciones
    juntas evita marcar cualquier '3' o '10' generico de un loop/zoom/dpi
    que no tiene nada que ver con una regla normativa."""
    valores = _valores_normativos()
    patrones = {v: re.compile(r'(?<![\w.])' + re.escape(str(float(v))).replace(r'\.0', r'(\.0)?') + r'(?![\w.])')
                for v in valores}
    hallazgos = []
    for archivo in archivos:
        texto = archivo.read_text(encoding='utf-8', errors='replace')
        for i, linea in enumerate(texto.splitlines(), 1):
            if _es_comentario_o_docstring(linea):
                continue
            if not _OPERADOR_COMPARACION.search(linea) or not _PALABRAS_NORMATIVAS.search(linea):
                continue
            for valor, patron in patrones.items():
                if patron.search(linea):
                    hallazgos.append((archivo, i, f'valor={valor}', linea.strip()))
    return hallazgos


def chequeo_b_listas_de_tipos_duplicadas(archivos):
    """3 o mas claves de OGUC_REGLAS citadas como string literal en la
    MISMA linea, fuera de reglas_normativas.py -- patron especifico del
    bug real de hoy (_TIPOS_RECINTO_OGUC): alguien arma a mano una
    coleccion de "los tipos de recinto" en vez de importarla ya derivada."""
    hallazgos = []
    for archivo in archivos:
        texto = archivo.read_text(encoding='utf-8', errors='replace')
        for i, linea in enumerate(texto.splitlines(), 1):
            if _es_comentario_o_docstring(linea):
                continue
            n_claves = sum(1 for clave in _CLAVES_OGUC if f"'{clave}'" in linea or f'"{clave}"' in linea)
            if n_claves >= 3:
                hallazgos.append((archivo, i, f'{n_claves} claves de OGUC_REGLAS citadas juntas', linea.strip()))
    return hallazgos


def main():
    todos = list(_archivos_python_del_proyecto()) + list(_archivos_normativa_del_proyecto())
    archivos = [a for a in todos if a.name not in ARCHIVOS_EXENTOS]
    hallazgos = chequeo_a_valores_sueltos(archivos) + chequeo_b_listas_de_tipos_duplicadas(archivos)

    print("Archivos exentos (motivo documentado, no revisados):")
    for nombre, motivo in ARCHIVOS_EXENTOS.items():
        print(f"  - {nombre}: {motivo}")
    print()

    if not hallazgos:
        print("✓ Sin candidatos a valor/lista normativa hardcodeada fuera de reglas_normativas.py")
        return 0

    print(f"⚠ {len(hallazgos)} candidato(s) a hardcodeo -- revisar a mano, puede ser falso positivo:")
    for archivo, linea_n, detalle, linea in hallazgos:
        # DIR.parent (raiz del repo), no DIR -- normativa/ vive al lado de
        # Fase 2/, no debajo, desde que se extendio el chequeo a .mjs/.sql/.json.
        print(f"  {archivo.relative_to(DIR.parent)}:{linea_n}  ({detalle})\n      {linea}")
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
