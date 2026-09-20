# Primer ejercicio real de "análisis normativo desde IFC": arma el JSON
# canonico (mismo espiritu que archicheck_geometrico_*.json del pipeline PDF:
# muros_geo/puertas_geo/ventanas_geo/recintos_geo/incumplimientos_geo) para
# cada IFC de ejemplo, y corre contra el las reglas OGUC que ya estan
# verificadas en el propio codigo de ArchiCheck -- no se inventa ningun
# umbral nuevo para este ejercicio.
#
# Reglas aplicadas (ids y umbrales ya existentes en el proyecto, no nuevos):
#   - puerta_ancho_libre: OGUC Art. 4.1.7 N6, ancho >= 0.80 m -- CONSOLIDADO
#     2026-09-19 en OGUC_REGLAS['puerta_ancho_libre']
#     (Fase 2/Herramientas_CubiCasa5k/_celda4_actual.py). Antes de esa fecha
#     este umbral se habia verificado de forma independiente (piloto IDS) sin
#     agregarse de vuelta a la fuente compartida -- ver auditoria completa en
#     Fase 2/Convenciones_BIM.md seccion E. Sin import directo posible (ese
#     archivo no es un modulo limpio); el valor de abajo es copia manual,
#     debe corregirse en ambos lados si cambia.
#   - muro_fire_rating: OGUC Art. 4.3.3, exige Pset_WallCommon.FireRating
#     declarado (chequeo de dato faltante, no de valor) -- CONSOLIDADO
#     2026-09-19 en OGUC_REGLAS['muro_fire_rating'], mismo archivo, mismo
#     motivo y misma limitacion de sincronizacion que la regla de arriba.
#   - ventilacion_iluminacion: normativa/nacional/reglas_verificacion.json,
#     ventana >= 10% de la superficie del recinto (regla generica registrada
#     en el proyecto, sin auditar articulo por articulo -- se usa tal cual
#     esta documentada, no se sube el rigor mas alla de lo que ArchiCheck ya
#     tiene hoy) -- esta SI era compartida desde antes, mismo id y umbral.
#
# Robustez aprendida HOY mismo, aplicada aca:
#   - IfcWall (no solo IfcWallStandardCase) -- HouseZ usa la clase generica
#   - ifcopenshell.util.element.get_psets() en vez de nombres de Pset
#     hardcodeados -- cubre BaseQuantities/Qto_*/nombres en otros idiomas
#   - IfcSpace via decomposicion Y via contencion (ver generar_plano_pdf.py)
#   - todo campo ausente se reporta como tal, nunca se asume un valor

import datetime
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element as elutil
import ifcopenshell.util.unit

import generar_plano_pdf as g

ARCHIVOS = [
    ("Administrativo (ES)", "Archivos ejemplo/04N02-36_GVA_NNN-NNN_AR_M3D_NN_02_Administrativo.ifc"),
    ("BasicHouse", "Archivos ejemplo/Basic House/BasicHouse.ifc"),
    ("FZK-Haus", "Archivos ejemplo/FZK/AC20-FZK-Haus.ifc"),
    ("HouseZ", "Archivos ejemplo/HouseZ/ISSUE_034_HouseZ.ifc"),
    # DuplexHouse.ifc: el 2026-09-18 se confirmo MD5 identico a BasicHouse.ifc
    # (mismo archivo duplicado). Mas tarde, el mismo dia, el archivo en disco
    # cambio (tamano 52.7MB -> 2.4MB, MD5 distinto) sin que nadie lo anunciara
    # -- es un archivo real y distinto ahora (4 niveles: T/FDN, Level 1,
    # Level 2, Roof -- la "Duplex House" publica de Autodesk). Reverificado
    # antes de asumir que seguia siendo el duplicado.
    ("DuplexHouse", "Archivos ejemplo/Duplex house/DuplexHouse.ifc"),
    # Dataset LTU (proyecto sueco multi-disciplina): solo K-modell y redesign
    # tienen muros/puertas/ventanas -- los otros 7 archivos del dataset son
    # instalaciones puras (MEP), sin nada que aporte a estas 3 reglas
    # (puerta/muro/ventilacion son todas de arquitectura), se omiten aca a
    # proposito (si se agregaran, `muros`/`puertas`/`ventanas` darian 0 en
    # los 7 sin ningun valor informativo nuevo).
    ("LTU K-modell", "Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_K-modell.ifc"),
    ("LTU redesign", "Archivos ejemplo/Dataset LTU/extraidos/LTU_A-House_redesign.ifc"),
    ("Schependomlaan", "Archivos ejemplo/Schependomlaan/IFC_Schependomlaan.ifc"),
]

# "GSA BIM Area" agregado 2026-09-18: encontrado en DuplexHouse.ifc (convencion
# de EE.UU. -- GSA = General Services Administration), en un Pset propio
# ("GSA Space Areas") que ninguna clave anterior cubria -- otra convención
# mas de nombrar lo mismo, confirmando el patron de toda la sesion.
CLAVES_AREA_RECINTO = ["NetFloorArea", "GrossFloorArea", "Area", "Fläche", "Flache", "NetArea", "GSA BIM Area"]


def buscar_area(qtos: dict):
    # Orden de busqueda por CLAVE primero, no por Pset primero (bug real
    # encontrado por revision cruzada con DeepSeek 2026-09-18): iterar Psets
    # en el orden en que get_psets() los devuelve (no garantizado, depende del
    # IFC) podia devolver GrossFloorArea antes que NetFloorArea si el area
    # bruta vivia en un Pset que ifcopenshell listaba primero -- el umbral de
    # ventilacion (10% de superficie UTIL) exige NetFloorArea con prioridad
    # real, no accidental.
    for clave in CLAVES_AREA_RECINTO:
        for pset in qtos.values():
            if isinstance(pset, dict) and clave in pset and isinstance(pset[clave], (int, float)):
                return pset[clave], clave
    return None, None


def num_o_none(v):
    return v if isinstance(v, (int, float)) else None


def num_o_none_escalado(v, escala_m):
    """Como num_o_none, pero convierte a metros -- OverallWidth/OverallHeight
    son atributos de LONGITUD (siempre en la unidad cruda que declara el
    archivo, sin excepcion posible via AREAUNIT/VOLUMEUNIT propio, a
    diferencia del area de un recinto -- ver g.escala_area()). Bug real
    corregido 2026-09-19 (revision cruzada DeepSeek): antes se comparaba el
    valor CRUDO contra el umbral de 0.80 m -- en archivos con LENGTHUNIT en
    milimetros (BasicHouse, HouseZ, Schependomlaan: 3 de los 6 archivos con
    arquitectura real de esta sesion), cualquier ancho crudo (ej. 680) es
    siempre >= 0.80, asi que el chequeo NUNCA podia fallar sin importar el
    ancho real. Verificado con datos: Schependomlaan tiene 12 puertas reales
    bajo 0.80 m real (0.63-0.68 m) que quedaban sin reportar por este bug."""
    v = num_o_none(v)
    return v * escala_m if v is not None else None


def analizar(nombre_corto, ifc_path):
    modelo = ifcopenshell.open(ifc_path)
    escala_m = ifcopenshell.util.unit.calculate_unit_scale(modelo)
    escala_a = g.escala_area(modelo)

    muros = modelo.by_type("IfcWall")  # incluye IfcWallStandardCase (subtipo)
    # Descarta vanos que no son aberturas reales (marcos de obra en hormigon
    # sin terminar, hardware de ascensor) -- hallazgo real 2026-09-19, ver
    # filtrar_vanos_reales() en generar_plano_pdf.py.
    puertas = g.filtrar_vanos_reales(modelo.by_type("IfcDoor"))
    ventanas = g.filtrar_vanos_reales(modelo.by_type("IfcWindow"))
    recintos = modelo.by_type("IfcSpace")
    # Rampas (2026-09-20, auditoria de cobertura -- ver seccion 30 del diario
    # BIM): conteo a nivel de edificio, MISMO mecanismo de deduplicacion que
    # generar_json_colab.py (tramo real si existe decomposicion, contenedor
    # como fallback si no) -- construido explicito como lista, no como formula,
    # para no repetir el bug de doble conteo ya encontrado con escaleras.
    # Ningun archivo de esta sesion tiene una IfcRamp real -- ver ESTILOS en
    # generar_plano_pdf.py.
    rampas_todas_ifc = modelo.by_type("IfcRamp")
    flights_por_ramp_todo = {rp.GlobalId: [h for h in ifcopenshell.util.element.get_decomposition(rp, is_recursive=False)
                                            if h.is_a("IfcRampFlight")]
                              for rp in rampas_todas_ifc}
    rampas_dedup = []
    ids_rampa_dedup = set()
    for rp in rampas_todas_ifc:
        hijos = flights_por_ramp_todo[rp.GlobalId]
        if hijos:
            for h in hijos:
                if h.GlobalId not in ids_rampa_dedup:
                    ids_rampa_dedup.add(h.GlobalId)
                    rampas_dedup.append(h)
        elif rp.GlobalId not in ids_rampa_dedup:
            ids_rampa_dedup.add(rp.GlobalId)
            rampas_dedup.append(rp)
    total_rampas = len(rampas_dedup)
    # Salidas de emergencia (2026-09-20) -- ver g.mapa_salida_emergencia()
    # para el alcance real (solo cuenta el dato IFC de etiquetado que existe,
    # no reemplaza calculo de carga de ocupacion/rutas de evacuacion).
    mapa_salida = g.mapa_salida_emergencia(modelo)
    puertas_salida_emergencia = sum(1 for d in puertas if mapa_salida.get(d.GlobalId) is True)

    # Encontrado al corregir el bug None/0.0 de ventilacion (2026-09-18): sin
    # este limite, un edificio sin NINGUNA IfcWindow (ej. el administrativo
    # espanol, 100% muro cortina -- ver seccion 7) reporta el 100% de sus
    # recintos como "incumplimiento de ventilacion", incluidos estacionamientos
    # subterraneos que normativamente ni requieren ventilacion natural. Eso no
    # es un hallazgo real, es un artefacto de que "ventana" aca solo cuenta
    # IfcWindow -- CurtainWall/Plate no esta contemplado. Se desactiva el
    # chequeo de ventilacion por edificio completo cuando no hay ninguna
    # IfcWindow, en vez de mostrar una avalancha de falsos positivos.
    ventilacion_aplicable = len(ventanas) > 0

    muros_geo = []
    for w in muros:
        psets = elutil.get_psets(w, qtos_only=False)
        wallcommon = psets.get("Pset_WallCommon", {})
        fire = wallcommon.get("FireRating")
        muros_geo.append({
            "id": w.GlobalId,
            "nombre": w.Name,
            "clase": w.is_a(),
            "fire_rating": fire,
            "fire_rating_declarado": fire is not None,
        })

    puertas_geo = []
    for d in puertas:
        ancho = num_o_none_escalado(d.OverallWidth, escala_m)
        # OJO: None es "sin dato", no "no cumple" -- HouseZ no declara OverallWidth
        # en ninguna puerta, y confundir ambos casos es exactamente el error que
        # este proyecto existe para evitar (ver DF-01/DF-02 del pipeline PDF).
        cumple = None if ancho is None else (ancho >= 0.80)
        puertas_geo.append({
            "id": d.GlobalId,
            "nombre": d.Name,
            "ancho_m": ancho,
            "cumple_ancho_min_0_80m": cumple,  # True / False / None=sin dato
            "referencia": "OGUC Art. 4.1.7 N6",
        })

    # Bug real encontrado por revision cruzada con Codex + DeepSeek 2026-09-18,
    # confirmado por ambos de forma independiente: usar `if (ancho and alto)`
    # trata 0.0 como "sin dato" (Python trata 0 como falsy) -- exactamente la
    # misma confusion "ausente" vs "invalido/cero" que ya se habia corregido
    # para puertas, reintroducida aca sin querer. Ahora se compara contra None
    # explicitamente en todos lados de este bloque.
    ventanas_geo = []
    for v in ventanas:
        ancho = num_o_none_escalado(v.OverallWidth, escala_m)
        alto = num_o_none_escalado(v.OverallHeight, escala_m)
        ventanas_geo.append({
            "id": v.GlobalId, "nombre": v.Name, "ancho_m": ancho, "alto_m": alto,
            "area_m2": (ancho * alto) if (ancho is not None and alto is not None) else None,
        })
    ventanas_por_id = {v["id"]: v for v in ventanas_geo}

    recintos_geo = []
    for sp in recintos:
        qtos = elutil.get_psets(sp, qtos_only=True)
        area, campo_area = buscar_area(qtos)
        area = area * escala_a if area is not None else None
        # OJO (DeepSeek, 2026-09-18): IfcRelSpaceBoundary "nivel 1" (el mas
        # comun) suele apuntar al MURO que delimita el recinto, no a la
        # ventana -- la ventana solo aparece aca si el exportador genera
        # boundaries "nivel 2" (ArchiCAD, como este archivo, si lo hace; no
        # es garantia general). Verificado con datos reales que SI funciona
        # para FZK-Haus -- no asumir que funciona igual en otro exportador
        # sin volver a verificar.
        # Fix 2026-09-19 (revision cruzada DeepSeek): antes se contaba
        # CUALQUIER IfcWindow vinculado, incluidos los ya descartados por
        # filtrar_vanos_reales (vanos de obra sin terminar) -- inflaba
        # num_ventanas_vinculadas con vanos falsos, lo que podia cambiar de
        # forma incorrecta el mensaje diagnostico de mas abajo (aunque el
        # gate real de ventilacion, basado en ventanas_con_area_valida, ya
        # estaba filtrado bien). Ahora solo cuenta ventanas REALES.
        ventanas_del_recinto = []
        for b in sp.BoundedBy:
            el = b.RelatedBuildingElement
            if el is not None and el.is_a("IfcWindow") and el.GlobalId in ventanas_por_id:
                ventanas_del_recinto.append(el.GlobalId)
        # Fix 2026-09-19 (revision cruzada DeepSeek): distingue "este recinto
        # no tiene NINGUN IfcRelSpaceBoundary" (el exportador no intento
        # vincularlo -- dato ausente para ESTE recinto puntual) de "tiene
        # boundaries pero ninguno es ventana" (señal mas fuerte de que
        # genuinamente no tiene ventanas). El resguardo de mas abajo
        # (enlace_funciona) es a nivel EDIFICIO -- sirve para saber si el
        # MECANISMO de vinculo funciona en este archivo en absoluto, pero no
        # protege a un recinto puntual sin boundaries de que le apliquen un
        # 0% que en realidad es "no se intento vincular este recinto".
        tiene_boundary = len(sp.BoundedBy) > 0
        area_ventanas = 0.0
        ventanas_con_area_valida = 0
        for vid in ventanas_del_recinto:
            vg = ventanas_por_id.get(vid)
            if vg and vg["area_m2"] is not None:
                area_ventanas += vg["area_m2"]
                ventanas_con_area_valida += 1
        # area_ventanas SIEMPRE es un numero valido (arranca en 0.0 y suma) --
        # un recinto sin ventanas vinculadas da 0.0 legitimo, no "sin dato".
        # Lo que SI puede faltar es el area del recinto (area is None).
        # pct_ventilacion/cumple se completan DESPUES de este loop (ver abajo)
        # -- recien ahi se sabe si el vinculo IfcRelSpaceBoundary funciono en
        # ALGUN recinto del edificio.
        recintos_geo.append({
            "nombre": (sp.LongName or sp.Name or "").strip(),
            "area_m2": area,
            "area_campo_origen": campo_area,
            "num_ventanas_vinculadas": len(ventanas_del_recinto),
            "ventanas_con_area_valida": ventanas_con_area_valida,
            "area_ventanas_m2": round(area_ventanas, 3),
            "tiene_boundary": tiene_boundary,
        })

    # Segundo hallazgo del mismo tipo (2026-09-18), esta vez en HouseZ: tiene
    # 22 IfcWindow reales, pero `IfcSpace.BoundedBy` viene vacio para todos
    # los recintos (confirmado antes) -- sin este segundo resguardo, los 5
    # recintos habrian dado 0% de ventilacion "real" cuando en verdad el
    # vinculo espacial simplemente no existe en este exportador. Se exige que
    # AL MENOS un recinto del edificio haya logrado vincular una ventana antes
    # de confiar en el 0% de cualquier otro recinto del mismo edificio.
    #
    # Tercer hallazgo del mismo tipo (2026-09-19), en Schependomlaan: el
    # vinculo SI existe para 2 de 100 recintos (num_ventanas_vinculadas > 0),
    # pero esas ventanas vinculadas no tienen OverallWidth/OverallHeight --
    # ventanas_con_area_valida da 0 igual, y las 100 salas (incluidos
    # dormitorios y living con ventanas reales de sobra en la casa) daban 0%
    # "real". El resguardo anterior solo miraba si habia VINCULO, no si ese
    # vinculo traia un AREA calculable -- exactamente el mismo tipo de falla
    # a la que hay que estar atento en esta seccion completa: no basta con
    # que el dato exista, tiene que servir para lo que se le pide.
    enlace_funciona = any(r["ventanas_con_area_valida"] > 0 for r in recintos_geo)
    ventilacion_aplicable = ventilacion_aplicable and enlace_funciona
    for r in recintos_geo:
        area = r["area_m2"]
        # Fix 2026-09-19 (revision cruzada DeepSeek): el resguardo
        # `ventilacion_aplicable` es a nivel EDIFICIO (confirma que el
        # MECANISMO de vinculo funciona en este archivo) -- pero un recinto
        # SIN ningun IfcRelSpaceBoundary propio (`tiene_boundary=False`) no
        # tiene ningun dato para evaluar, aunque el edificio en general si
        # tenga el mecanismo funcionando en otros recintos. Antes, ese
        # recinto recibia pct=0.0/cumple=False (incumplimiento espurio) en
        # vez de "sin dato" -- exactamente el patron "dato ausente vs no
        # cumple" que este proyecto existe para evitar, aplicado aca a nivel
        # de recinto individual, no solo de edificio completo.
        se_puede_evaluar = ventilacion_aplicable and r["tiene_boundary"] and area is not None and area > 0
        pct = (r["area_ventanas_m2"] / area * 100) if se_puede_evaluar else None
        r["pct_ventilacion"] = round(pct, 1) if pct is not None else None
        r["cumple_ventilacion_10pct"] = (pct >= 10.0) if pct is not None else None

    incumplimientos = []
    for p in puertas_geo:
        if p["cumple_ancho_min_0_80m"] is False:
            incumplimientos.append({"tipo": "puerta_ancho_insuficiente", "elemento": p["nombre"],
                                     "valor": p["ancho_m"], "referencia": p["referencia"]})
        elif p["cumple_ancho_min_0_80m"] is None:
            incumplimientos.append({"tipo": "puerta_ancho_sin_dato", "elemento": p["nombre"],
                                     "referencia": p["referencia"], "severidad": "dato_faltante"})
    for w in muros_geo:
        if not w["fire_rating_declarado"]:
            incumplimientos.append({"tipo": "muro_fire_rating_no_declarado", "elemento": w["nombre"],
                                     "referencia": "OGUC Art. 4.3.3", "severidad": "dato_faltante"})
    for r in recintos_geo:
        if r["cumple_ventilacion_10pct"] is False:
            incumplimientos.append({"tipo": "ventilacion_insuficiente", "elemento": r["nombre"],
                                     "pct_ventilacion": r["pct_ventilacion"],
                                     "referencia": "reglas_verificacion.json: ventilacion_iluminacion (>=10%)"})

    resultado = {
        "archivo_origen": Path(ifc_path).name,
        "generado": datetime.datetime.now().isoformat(timespec="seconds"),
        "resumen_global": {
            "muros": len(muros_geo),
            "muros_con_fire_rating": sum(1 for w in muros_geo if w["fire_rating_declarado"]),
            "puertas": len(puertas_geo),
            "puertas_ok_0_80m": sum(1 for p in puertas_geo if p["cumple_ancho_min_0_80m"] is True),
            "puertas_sin_dato_ancho": sum(1 for p in puertas_geo if p["cumple_ancho_min_0_80m"] is None),
            "ventanas": len(ventanas_geo),
            "rampas": total_rampas,
            # Salidas de emergencia (2026-09-20) -- ver g.mapa_salida_emergencia():
            # solo cuenta el dato de etiquetado IFC real (Pset_DoorCommon.FireExit/
            # IsFireExit), NO reemplaza un calculo de carga de ocupacion/rutas.
            "puertas_marcadas_salida_emergencia": puertas_salida_emergencia,
            "puertas_con_dato_salida_emergencia": len(mapa_salida),
            "recintos": len(recintos_geo),
            "recintos_con_area": sum(1 for r in recintos_geo if r["area_m2"] is not None),
            "recintos_con_chequeo_ventilacion_posible": sum(1 for r in recintos_geo if r["pct_ventilacion"] is not None),
            "ventilacion_aplicable_al_edificio": ventilacion_aplicable,
            "ventilacion_nota": (
                None if ventilacion_aplicable else
                "Chequeo de ventilacion desactivado: 0 IfcWindow en todo el edificio "
                "(aperturas probablemente modeladas como CurtainWall/Plate, no evaluado aca)."
                if len(ventanas_geo) == 0 else
                "Chequeo de ventilacion desactivado: hay IfcWindow pero ningun IfcSpace.BoundedBy "
                "las vincula a un recinto en todo el edificio -- el exportador no genera boundaries "
                "de nivel 2 (o no los genera en absoluto), no es que los recintos no tengan ventanas."
                if not any(r["num_ventanas_vinculadas"] > 0 for r in recintos_geo) else
                "Chequeo de ventilacion desactivado: hay vinculo recinto-ventana en al menos un caso, "
                "pero ninguna ventana vinculada tiene OverallWidth/OverallHeight declarado (area "
                "calculable) -- el dato de dimension de ventana falta, no el vinculo espacial."
            ),
        },
        "muros_geo": muros_geo,
        "puertas_geo": puertas_geo,
        "ventanas_geo": ventanas_geo,
        "recintos_geo": recintos_geo,
        "incumplimientos_geo": incumplimientos,
    }
    return resultado


def main():
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    resumenes = []
    for nombre_corto, ifc_path in ARCHIVOS:
        print(f"\n=== {nombre_corto} ===")
        try:
            resultado = analizar(nombre_corto, ifc_path)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        origen = Path(ifc_path)
        out_json = origen.parent / f"{origen.stem}_analisis_{timestamp}.json"
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print(f"  guardado: {out_json}")
        r = resultado["resumen_global"]
        print(f"  muros={r['muros']} (fire_rating={r['muros_con_fire_rating']}) "
              f"puertas={r['puertas']} (ok_0.80m={r['puertas_ok_0_80m']}) "
              f"ventanas={r['ventanas']} rampas={r['rampas']} recintos={r['recintos']} "
              f"(con_area={r['recintos_con_area']}, chequeo_ventilacion_posible={r['recintos_con_chequeo_ventilacion_posible']}) "
              f"salida_emergencia_con_dato={r['puertas_con_dato_salida_emergencia']} "
              f"(marcadas={r['puertas_marcadas_salida_emergencia']})")
        resumenes.append((nombre_corto, resultado))

    print("\n\n=== TABLA CRUZADA ===")
    print(f"{'Archivo':22} {'Muros':>6} {'FireRat':>8} {'Puertas':>8} {'OK0.80m':>8} {'Ventanas':>9} {'Recintos':>9} {'ConVentil.':>11}")
    for nombre_corto, resultado in resumenes:
        r = resultado["resumen_global"]
        print(f"{nombre_corto:22} {r['muros']:6d} {r['muros_con_fire_rating']:8d} {r['puertas']:8d} "
              f"{r['puertas_ok_0_80m']:8d} {r['ventanas']:9d} {r['recintos']:9d} {r['recintos_con_chequeo_ventilacion_posible']:11d}")


if __name__ == "__main__":
    main()
