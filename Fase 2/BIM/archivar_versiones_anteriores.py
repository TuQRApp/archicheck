# Mueve a old/ los outputs con timestamp mas viejo que el ultimo del mismo
# origen. El mas nuevo de cada grupo queda arriba (se comitea); los demas
# quedan en disco dentro de old/, que esta en .gitignore -- se conservan
# localmente por si hace falta comparar corridas, pero nunca se comitea mas
# de uno por archivo fuente.
#
# El agrupamiento es por (carpeta, extension, nombre sin el timestamp final)
# -- cubre cualquier script generador, no solo generar_plano_pdf.py, siempre
# que el timestamp este al final del nombre en alguno de estos formatos:
# _20260919_003431 (con segundos), _20260919_1404 (sin segundos), o
# "2026-09-19 1404" (fecha con guiones + hora, como usa el flujo de revisado).
#
# Uso: python "archivar_versiones_anteriores.py" [--apply]
# Sin --apply solo muestra que haria (dry run). Con --apply mueve los
# archivos y actualiza el index de git (git rm --cached + git add).

import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CARPETA = Path(__file__).parent / "Archivos ejemplo"

EXT_EXCLUIDAS = {"ifc", "zip", "crdownload"}

TS_PATTERNS = [
    re.compile(r"\d{8}_\d{6}$"),
    re.compile(r"\d{8}_\d{4}$"),
    re.compile(r"\d{4}-\d{2}-\d{2}[ _]\d{4}$"),
]


def git(*args):
    subprocess.run(["git", *args], cwd=REPO_ROOT, check=False)


def extraer_prefijo(stem):
    for patron in TS_PATTERNS:
        m = patron.search(stem)
        if m:
            return stem[: m.start()].rstrip(" _-—"), m.group(0)
    return None, None


def main():
    aplicar = "--apply" in sys.argv

    grupos = defaultdict(list)
    for f in CARPETA.rglob("*"):
        if not f.is_file() or "old" in f.relative_to(CARPETA).parts[:-1]:
            continue
        ext = f.suffix.lstrip(".").lower()
        if ext in EXT_EXCLUIDAS:
            continue
        prefijo, ts = extraer_prefijo(f.stem)
        if prefijo is None:
            continue
        clave = (f.parent, ext, prefijo)
        grupos[clave].append((ts, f))

    total_grupos = 0
    total_archivados = 0
    for (carpeta, ext, prefijo), archivos in grupos.items():
        if len(archivos) < 2:
            continue
        archivos.sort(key=lambda x: x[0], reverse=True)
        ultimo = archivos[0][1]
        viejos = archivos[1:]
        total_grupos += 1
        total_archivados += len(viejos)
        rel = ultimo.parent.relative_to(CARPETA)
        print(f"[{rel}] {prefijo}.{ext}: queda {ultimo.name}, se archivan {len(viejos)}")
        if not aplicar:
            continue
        destino_dir = carpeta / "old"
        destino_dir.mkdir(exist_ok=True)
        for _, viejo in viejos:
            git("rm", "--cached", "--ignore-unmatch", "-q", "--", str(viejo))
            viejo.rename(destino_dir / viejo.name)
        git("add", "--", str(ultimo))

    modo = "aplicado" if aplicar else "dry run -- correr con --apply para ejecutar"
    print(f"\n{total_grupos} grupos con duplicados, {total_archivados} archivos a archivar ({modo})")


if __name__ == "__main__":
    main()
