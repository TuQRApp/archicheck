# Piloto IfcTester (ifctester, parte del ecosistema ifcopenshell 0.8.5) contra
# el IFC real de prueba, usando 3 reglas OGUC ya verificadas en el propio
# codigo de ArchiCheck (Fase 2/reglas_normativas.py, diccionario OGUC_REGLAS),
# no valores inventados para este piloto.
#
# Objetivo: comprobar si IfcTester/IDS sirve como motor declarativo para el
# subconjunto de OGUC_REGLAS que son umbrales numericos simples, sin escribir
# Python a mano por cada regla.
#
# CONSOLIDACION 2026-09-19 (ver Fase 2/Convenciones_BIM.md seccion E): antes
# de esta fecha, "puerta ancho libre 0.80m" y "muro FireRating" NO estaban
# realmente en OGUC_REGLAS pese a lo que decia este comentario -- se habian
# verificado de forma independiente contra el texto OGUC (BCN/LeyChile) pero
# nunca se agregaron de vuelta a la fuente compartida.
#
# UNIFICACION 2026-09-20 (Proyecto/Diseno_Funcional_ArchiCheck.md S3.15):
# los 3 valores de abajo ahora se importan directo de Fase 2/reglas_
# normativas.py -- ya no son copia manual (la entrada 'escalera' de
# OGUC_REGLAS ya existia desde el pipeline CAD, solo faltaba reutilizarla
# aca en vez de tener el mismo 1.10 hardcodeado por separado).

import sys
from pathlib import Path

import ifcopenshell
from ifctester import ids, reporter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # Fase 2/, para reglas_normativas.py
from reglas_normativas import OGUC_REGLAS

_ANCHO_MIN_PUERTA_M = OGUC_REGLAS['puerta_ancho_libre'][1]
_PSET_FIRE_RATING, _PROP_FIRE_RATING = OGUC_REGLAS['muro_fire_rating']['campo_requerido'].split('.', maxsplit=1)
_ANCHO_MIN_ESCALERA_M = OGUC_REGLAS['escalera'][1]

IFC_PATH = r"Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc"

specs = ids.Ids(
    title="ArchiCheck — piloto OGUC via IDS",
    author="archicheck-pilot",
    purpose="Probar IfcTester como motor declarativo de OGUC_REGLAS sobre IFC real",
)

# --- Regla 1: Puertas -- ancho libre minimo 0.90 m -----------------------
# Valor y referencia: OGUC_REGLAS['puerta_ancho_libre'] en reglas_normativas.py.
# OGUC Art. 4.1.7 N°4 (accesibilidad universal): "Las puertas de ingreso al
# edificio, o a las unidades o a los recintos de la edificacion colectiva
# que consulten atencion de publico, deberan tener un ancho libre de paso
# de 0,90 m... Las puertas interiores de acceso a las unidades o recintos
# de la edificacion colectiva cuyo destino sea residencial, deberan tener
# un ancho libre de paso de 0,90 m." Chequeamos OverallWidth (atributo
# nativo IfcDoor) como aproximacion al ancho libre.
#
# CORREGIDO 2026-09-21: este comentario decia antes "vano 0,90 m / ancho
# libre 0,80 m" como si fuera una sola regla -- en realidad son 2 reglas
# DISTINTAS del mismo articulo: el caso general de arriba (0,90 m ancho
# libre, N°4, el que este chequeo evalua sobre TODA puerta) y un caso
# especifico de la puerta de un servicio higienico accesible (vano 0,90 m
# / ancho libre 0,80 m, N°6 letra b) que no se distingue geometricamente
# hoy -- ver OGUC_REGLAS['puerta_ancho_libre_bano_accesible'] en
# reglas_normativas.py, declarada pero sin consumidor todavia. Verificado
# contra el texto integro del articulo (normativa/nacional/oguc_pdf.json)
# y confirmado por fuente independiente (DDU 351, seccion 7.1/7.2).
s1 = ids.Specification(
    name="Puertas -- ancho libre minimo (OGUC Art. 4.1.7 N°4)",
    instructions="Toda puerta debe tener OverallWidth >= 0.90 m (ancho libre minimo de accesibilidad universal, caso general).",
)
s1.applicability.append(ids.Entity(name="IFCDOOR"))
s1.requirements.append(
    ids.Attribute(
        name="OverallWidth",
        value=ids.Restriction(options={"minInclusive": str(_ANCHO_MIN_PUERTA_M)}, base="decimal"),
        cardinality="required",
        instructions=f"OGUC Art. 4.1.7 N°4 -- ancho libre minimo {_ANCHO_MIN_PUERTA_M} m",
    )
)
specs.specifications.append(s1)

# --- Regla 2: Muros -- FireRating declarado ------------------------------
# Campo y referencia: OGUC_REGLAS['muro_fire_rating'] en _celda4_actual.py.
# OGUC Art. 4.3.3: los elementos deben cumplir resistencia al fuego segun
# destino y altura. Pset_WallCommon.FireRating es el campo IFC estandar para
# declararlo. No filtramos por LoadBearing: la regla real de OGUC aplica
# segun destino/altura del edificio, no solo a muros estructurales, y el
# piloto manual ya encontro FireRating vacio incluso en un muro cualquiera.
# Fix 2026-09-19 (Codex, revision cruzada): ids.Entity hace match EXACTO de
# clase (inst.is_a().upper() == self.name, verificado leyendo el codigo
# fuente de ifctester.facet.Entity.__call__) -- NO incluye subtipos como si
# hace ifcopenshell.util.by_type("IfcWall"). Antes esta regla solo aplicaba a
# IFCWALLSTANDARDCASE, dejando afuera cualquier archivo que use IfcWall
# generico (HouseZ, 140/140 muros; parte de Schependomlaan/Administrativo ES)
# -- discrepancia real con analizar_todos.py, que si cubre ambas clases via
# modelo.by_type("IfcWall"). Se agrega una segunda Specification identica
# para IFCWALL en vez de asumir que 2 Entity en la misma applicability se
# combinan con OR (no verificado, mas seguro no arriesgarlo).
def _regla_fire_rating(nombre_entidad):
    s = ids.Specification(
        name=f"Muros ({nombre_entidad}) -- FireRating declarado (OGUC Art. 4.3.3)",
        instructions="Todo muro debe declarar Pset_WallCommon.FireRating (resistencia al fuego segun destino/altura).",
    )
    s.applicability.append(ids.Entity(name=nombre_entidad))
    s.requirements.append(
        ids.Property(
            propertySet=_PSET_FIRE_RATING,
            baseName=_PROP_FIRE_RATING,
            cardinality="required",
            instructions="OGUC Art. 4.3.3 -- resistencia al fuego debe estar declarada",
        )
    )
    return s


specs.specifications.append(_regla_fire_rating("IFCWALLSTANDARDCASE"))
specs.specifications.append(_regla_fire_rating("IFCWALL"))

# --- Regla 3: Escaleras -- ancho de tramo minimo 1.10 m ------------------
# OGUC Art. 4.2.10: ancho minimo de escalera de evacuacion, piso 1.10 m
# (hasta 50 personas; puede exigir mas segun carga de ocupacion, no
# calculado en este piloto). Se busca en el quantity set estandar
# Qto_StairFlightBaseQuantities.Width -- a proposito, para ver si existe.
#
# RESULTADO DE ESA PRUEBA (2026-09-20, punto 4 de S3.15, integracion al
# analizador principal, ver Fase 2/BIM/analizar_todos.py): NINGUNO de los
# 10 archivos de prueba del proyecto declara esa Qto (ni ninguna otra
# clave "Width" en cualquier Pset/Qto/atributo nativo de IfcStairFlight).
# Por eso analizar_todos.py NO reusa esta regla IDS -- calcula el ancho
# desde la geometria 3D real (ancho_escalera_footprint()) en vez de un
# dato declarado que no existe en la practica.
#
# COBERTURA DIVERGENTE, documentada (hallazgo real de DeepSeek, Revision
# Ing SW Paso 2): esta regla solo aplica a IFCSTAIRFLIGHT, mientras que
# analizar_todos.py tambien evalua el IfcStair contenedor cuando no tiene
# tramos hijos (fallback explicito, mismo patron que rampa) -- un archivo
# como FZK-Haus (1 IfcStair sin IfcStairFlight) aparece en el analizador
# principal pero NUNCA en este piloto. Decision explicita: no se amplia
# este piloto a IFCSTAIR -- ya cumplio su proposito (probar si ifctester/
# IDS sirve como motor declarativo, ver objetivo al inicio del archivo);
# la cobertura real y completa vive en analizar_todos.py. Se deja
# documentado para no confundir una comparacion futura "piloto vs
# analizador" con un hallazgo normativo cuando es solo esta divergencia
# de alcance ya conocida.
s3 = ids.Specification(
    name="Escaleras -- ancho de tramo minimo (OGUC Art. 4.2.10, piso 1.10 m)",
    instructions="Todo tramo de escalera debe tener Width >= 1.10 m (minimo OGUC segun carga de ocupacion, no diferenciado en este piloto).",
)
s3.applicability.append(ids.Entity(name="IFCSTAIRFLIGHT"))
s3.requirements.append(
    ids.Property(
        propertySet="Qto_StairFlightBaseQuantities",
        baseName="Width",
        value=ids.Restriction(options={"minInclusive": str(_ANCHO_MIN_ESCALERA_M)}, base="decimal"),
        cardinality="required",
        instructions=f"OGUC Art. 4.2.10 -- ancho minimo {_ANCHO_MIN_ESCALERA_M} m (piso, hasta 50 personas)",
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
