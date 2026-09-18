# Piloto IfcTester (ifctester, parte del ecosistema ifcopenshell 0.8.5) contra
# el IFC real de prueba, usando 3 reglas OGUC ya verificadas en el propio
# codigo de ArchiCheck (Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py,
# diccionario OGUC_REGLAS), no valores inventados para este piloto.
#
# Objetivo: comprobar si IfcTester/IDS sirve como motor declarativo para el
# subconjunto de OGUC_REGLAS que son umbrales numericos simples, sin escribir
# Python a mano por cada regla.

import ifcopenshell
from ifctester import ids, reporter

IFC_PATH = r"Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc"

specs = ids.Ids(
    title="ArchiCheck — piloto OGUC via IDS",
    author="archicheck-pilot",
    purpose="Probar IfcTester como motor declarativo de OGUC_REGLAS sobre IFC real",
)

# --- Regla 1: Puertas -- ancho libre minimo 0.80 m -----------------------
# OGUC Art. 4.1.7 N6 (accesibilidad universal): "puerta con vano 0,90 m /
# ancho libre 0,80 m". Chequeamos OverallWidth (atributo nativo IfcDoor) como
# aproximacion al ancho libre.
s1 = ids.Specification(
    name="Puertas -- ancho libre minimo (OGUC Art. 4.1.7 N6)",
    instructions="Toda puerta debe tener OverallWidth >= 0.80 m (ancho libre minimo de accesibilidad universal).",
)
s1.applicability.append(ids.Entity(name="IFCDOOR"))
s1.requirements.append(
    ids.Attribute(
        name="OverallWidth",
        value=ids.Restriction(options={"minInclusive": "0.8"}, base="decimal"),
        cardinality="required",
        instructions="OGUC Art. 4.1.7 N6 -- ancho libre minimo 0.80 m",
    )
)
specs.specifications.append(s1)

# --- Regla 2: Muros -- FireRating declarado ------------------------------
# OGUC Art. 4.3.3: los elementos deben cumplir resistencia al fuego segun
# destino y altura. Pset_WallCommon.FireRating es el campo IFC estandar para
# declararlo. No filtramos por LoadBearing: la regla real de OGUC aplica
# segun destino/altura del edificio, no solo a muros estructurales, y el
# piloto manual ya encontro FireRating vacio incluso en un muro cualquiera.
s2 = ids.Specification(
    name="Muros -- FireRating declarado (OGUC Art. 4.3.3)",
    instructions="Todo muro debe declarar Pset_WallCommon.FireRating (resistencia al fuego segun destino/altura).",
)
s2.applicability.append(ids.Entity(name="IFCWALLSTANDARDCASE"))
s2.requirements.append(
    ids.Property(
        propertySet="Pset_WallCommon",
        baseName="FireRating",
        cardinality="required",
        instructions="OGUC Art. 4.3.3 -- resistencia al fuego debe estar declarada",
    )
)
specs.specifications.append(s2)

# --- Regla 3: Escaleras -- ancho de tramo minimo 1.10 m ------------------
# OGUC Art. 4.2.10: ancho minimo de escalera de evacuacion, piso 1.10 m
# (hasta 50 personas; puede exigir mas segun carga de ocupacion, no
# calculado en este piloto). Se busca en el quantity set estandar
# Qto_StairFlightBaseQuantities.Width -- a proposito, para ver si existe.
s3 = ids.Specification(
    name="Escaleras -- ancho de tramo minimo (OGUC Art. 4.2.10, piso 1.10 m)",
    instructions="Todo tramo de escalera debe tener Width >= 1.10 m (minimo OGUC segun carga de ocupacion, no diferenciado en este piloto).",
)
s3.applicability.append(ids.Entity(name="IFCSTAIRFLIGHT"))
s3.requirements.append(
    ids.Property(
        propertySet="Qto_StairFlightBaseQuantities",
        baseName="Width",
        value=ids.Restriction(options={"minInclusive": "1.1"}, base="decimal"),
        cardinality="required",
        instructions="OGUC Art. 4.2.10 -- ancho minimo 1.10 m (piso, hasta 50 personas)",
    )
)
specs.specifications.append(s3)

# --- Correr ---------------------------------------------------------------
model = ifcopenshell.open(IFC_PATH)
specs.validate(model)

reporter.Console(specs).report()

print("\n\n=== RESUMEN POR ESPECIFICACION ===")
for spec in specs.specifications:
    total = len(spec.applicable_entities)
    passed = len(spec.passed_entities)
    failed = len(spec.failed_entities)
    print(f"- {spec.name}: aplicable={total} / cumple={passed} / falla={failed}")
