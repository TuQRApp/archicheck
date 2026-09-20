# Descarga los datasets IFC de terceros usados como insumo de prueba del
# pipeline BIM. No se comitean al repo (ver .gitignore, 2026-09-18) porque
# son binarios grandes y reproducibles -- este script es la fuente de verdad
# de donde salieron y como volver a bajarlos.
#
# Uso: python "descargar_datasets.py" (desde cualquier directorio; las rutas
# de destino son relativas a esta carpeta).

import urllib.request
import zipfile
from pathlib import Path
from tempfile import NamedTemporaryFile

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
    {
        "destino": BASE / "SGD_BODO" / "SGD_BODO_Arch-3.ifc",
        "zip_url": "https://tib.eu/data/duraark/BuildingData/01_IFC/SGD_BODO_ifc.zip",
        "zip_member": "SGD_BODO/SGD_BODO_Arch-3.ifc",
        "info": "Edificio institucional en Bodo, Noruega (5 pisos, 123 recintos) - revision Arch-3, la mas reciente",
    },
    {
        "destino": BASE / "FOJAB_Landsarkivet" / "FOJAB_Landsarkivet.ifc",
        "zip_url": "https://tib.eu/data/duraark/BuildingData/03_IFC_E57/FOJAB_Landsarkivet_IFC.zip",
        "zip_member": "FOJAB_Landsarkivet.ifc",
        "info": "Archivo regional en Suecia (45 pisos -- muchos entrepisos de deposito compacto, 778 recintos) - Revit via Naviate",
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
        if "url" in d:
            urllib.request.urlretrieve(d["url"], destino)
        else:
            with NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                urllib.request.urlretrieve(d["zip_url"], tmp.name)
                with zipfile.ZipFile(tmp.name) as z, z.open(d["zip_member"]) as src:
                    destino.write_bytes(src.read())
            Path(tmp.name).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
