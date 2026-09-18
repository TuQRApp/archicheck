# Descarga los datasets IFC de terceros usados como insumo de prueba del
# pipeline BIM. No se comitean al repo (ver .gitignore, 2026-09-18) porque
# son binarios grandes y reproducibles -- este script es la fuente de verdad
# de donde salieron y como volver a bajarlos.
#
# Uso: python "descargar_datasets.py" (desde cualquier directorio; las rutas
# de destino son relativas a esta carpeta).

import urllib.request
from pathlib import Path

BASE = Path(__file__).parent

DATASETS = [
    {
        "destino": BASE / "Clinic" / "Clinic_Architectural.ifc",
        "url": "https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Medical-Dental%20Clinic/Clinic_Architectural.ifc",
        "info": "Clinica medico-dental (2 pisos, salud) - Autodesk Revit Architecture 2011",
    },
    {
        "destino": BASE / "Clinic" / "Clinic_Structural.ifc",
        "url": "https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Medical-Dental%20Clinic/Clinic_Structural.ifc",
        "info": "Misma clinica, disciplina estructural (vigas/columnas/fundaciones) - Autodesk Revit",
    },
    {
        "destino": BASE / "Schependomlaan" / "IFC_Schependomlaan.ifc",
        "url": "https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan/Design%20model%20IFC/IFC%20Schependomlaan.ifc",
        "info": "Vivienda real construida en Holanda, con datos as-built - Graphisoft ArchiCAD",
    },
    {
        "destino": BASE / "Esplanades" / "1807_EP_AR_v18.ifc",
        "url": "https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Esplanades/1807_EP_AR_v18.ifc",
        "info": "Proyecto real en Estonia (edificio Maleva 18) - Graphisoft ArchiCAD-64 22",
    },
]


def main():
    for d in DATASETS:
        destino = d["destino"]
        if destino.exists():
            print(f"ya existe, salto: {destino.relative_to(BASE)}")
            continue
        destino.parent.mkdir(parents=True, exist_ok=True)
        print(f"bajando {d['info']} -> {destino.relative_to(BASE)}")
        urllib.request.urlretrieve(d["url"], destino)


if __name__ == "__main__":
    main()
