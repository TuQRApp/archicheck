# Adaptador: reempaqueta los datos reales extraidos de un IFC (mismo metodo
# que analizar_todos.py, pero desglosado por NIVEL en vez de agregado por
# edificio) en el esquema exacto que espera el portal de ArchiCheck para el
# JSON de "Resultados Colab" -- verificado leyendo src/App.jsx directamente
# (handleColabJson exige `paginas` o `tabla_cruzada`; buildColabTexto en
# adelante consume pagina/escala/analisis_semantico/mediciones_geometricas/
# incumplimientos_geo/resumen_global).
#
# Fix 2026-09-19 (bug real reportado por el usuario tras la corrida anterior
# en el portal: "detectó las puertas y ventanas pero no las ubica en el
# plano"): muros_geo/puertas_geo/ventanas_* quedaban vacios porque el portal
# espera segmentos en coordenadas de PIXEL sobre el PNG (formato OpenCV) y
# antes solo generabamos geometria 3D real, sin proyectarla al espacio de
# imagen. Como el PNG lo dibuja este mismo script con matplotlib, se conoce
# la transformacion exacta datos->pixel (ax.transData) en el momento de
# guardar cada plano -- se capturan ahi los poligonos reales de muro/puerta/
# ventana (mismo footprint_2d que ya usa generar_plano_pdf.py) y se
# proyectan a pixeles, quedando en el MISMO lugar donde se ven dibujados.
#
# Fix 2026-09-19 (pedido explicito del usuario, sentido de apertura de
# puertas): ademas del contorno (footprint) real de la hoja, ahora se agrega
# el simbolo estandar de apertura (arco de 90 grados + linea de la hoja
# abierta) como segmentos extra en puertas_geo, sintetizado a partir de
# IfcDoorStyle.OperationType (SINGLE_SWING_LEFT/RIGHT) y el ObjectPlacement
# de cada puerta -- ver arco_apertura_puerta() en generar_plano_pdf.py para
# la convencion geometrica (verificada contra la especificacion oficial de
# buildingSMART y contra geometria real de Schependomlaan). Puertas sin
# OperationType util (NOTDEFINED, o sin IfcDoorStyle vinculado) o de tipo
# doble hoja quedan solo con el contorno, sin arco -- limite honesto que
# sigue vigente, no se fuerza un sentido que no esta declarado.
#
# Limites honestos que siguen vigentes:
# - FireRating de muros no tiene ningun campo natural en este esquema (esta
#   pensado para hallazgos de recinto/puerta, no de muro individual) -- se
#   omite, no se fuerza a un campo que no le corresponde.
# - "escala" es nominal (el dibujo ya esta en metros reales, no impreso a
#   escala de papel) -- declarada como texto para que el prompt tenga algo
#   que mostrar, no para recalibrar nada.
# - Ventilacion (%) no se fuerza en incumplimientos_geo (esa lista asume
#   unidades de metro/m2, un porcentaje ahi seria enganoso) -- va como
#   cumple_oguc + observacion por recinto en analisis_semantico, que es
#   exactamente el campo que el prompt real del portal ya lee para eso.

import datetime
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element as elutil
import ifcopenshell.util.unit
import matplotlib.pyplot as plt
import numpy as np
from shapely.affinity import translate

import generar_plano_pdf as g
import analizar_todos as a

# Regla del proyecto (2026-09-19): generalizado para recibir cualquier IFC
# (antes tenia "DuplexHouse" harcodeado en varios lugares: titulo del PNG,
# nombre de archivo, campo "proyecto" del JSON) -- pedido explicito del
# usuario al pasar de un solo archivo de prueba a varios (DuplexHouse,
# Schependomlaan). IFC_PATH sigue existiendo como default para `python
# generar_json_colab.py` sin argumentos.
IFC_PATH = r"Archivos ejemplo/Duplex house/DuplexHouse.ifc"

# Clase IFC -> categoria del portal, solo para los tipos que el portal sabe
# ubicar graficamente -- el resto (pilar, baranda, mobiliario) se sigue
# dibujando en el PNG pero no tiene una lista "_geo"/"_detalle" propia en el
# esquema de Colab.
# IfcStairFlight agregado (fix 2026-09-19, bug real: portal mostraba
# "Sistema detecto 2 escalera(s), 2 sin ubicar en el plano" pese a que
# analizar_todos.py SI cuenta las escaleras reales -- faltaba exportar su
# posicion). A diferencia de muro/puerta/ventana (que tienen su propia lista
# "_geo" con segmentos en App.jsx), escalera/rampa solo tienen la rama
# semantica (CATEGORIAS_ELEMENTO: campo="escaleras_detalle", forma=
# "rectangulo") -- se le da geometria real armando p1_relativo/p2_relativo
# (bounding box en fraccion de imagen) en vez de segmentos, ver
# resolverPuntosElemento en App.jsx.
CATEGORIA_POR_CLASE = {
    "IfcWall": "muro", "IfcWallStandardCase": "muro",
    "IfcDoor": "puerta",
    "IfcWindow": "ventana",
    "IfcStairFlight": "escalera",
    # IfcStair agregado (2026-09-19, hallazgo real en Schependomlaan): 3 de
    # sus escaleras no tienen NINGUN IfcStairFlight hijo, pero el propio
    # IfcStair si tiene geometria 3D usable -- ver ESTILOS["IfcStair"] en
    # generar_plano_pdf.py. Sin esto, esas 3 escaleras se contaban bien pero
    # jamas se posicionaban (0/3 en el portal). El main() de aca abajo saca
    # TODO IfcStair de `elementos` crudo sin excepcion (tenga o no tramos) --
    # `escaleras` ya trae la representacion correcta de cada una (tramo real
    # o contenedor como fallback, nunca ambos); dejar el contenedor tambien
    # en `elementos` duplicaba la escalera (bug real de la primera version de
    # este fix, ver comentario junto a `elementos = [... not e.is_a("IfcStair")]`).
    "IfcStair": "escalera",
    # Rampas (2026-09-20, ver g.ESTILOS/mapa_salida_emergencia en
    # generar_plano_pdf.py para el detalle -- mismo patron que escalera, sin
    # caso real todavia en ningun IFC de esta sesion).
    "IfcRamp": "rampa", "IfcRampFlight": "rampa",
}
# Categorias que exportan segmentos (muro/puerta/ventana, mismo shape) vs.
# bounding box relativo (escalera/rampa, forma "rectangulo" en CATEGORIAS_ELEMENTO).
CATEGORIAS_SEGMENTOS = {"muro", "puerta", "ventana"}


def render_nivel_png(modelo, nivel, elementos, ox, oy, ruta_png, escala_m, mapa_ops, nombre_corto, es_cubierta=False):
    por_tipo = {}
    for el in elementos:
        t = el.is_a()
        if t in g.ESTILOS:
            por_tipo.setdefault(t, []).append(el)

    fig, ax = plt.subplots(figsize=(11.69, 8.27))  # A4 apaisado, mas parecido a un plano subido real
    # (categoria, id, poligono en coordenadas de DATOS ya trasladadas) -- se
    # guarda aca y se proyecta a pixeles recien despues de fijar el dpi y
    # forzar el layout final (autoscale/tight_layout), para que la
    # transformacion coincida exactamente con lo que terminara en el PNG.
    geoms_por_categoria = {"muro": [], "puerta": [], "ventana": [], "escalera": [], "rampa": []}
    # Sentido de apertura de puertas (2026-09-19) -- puntos del arco YA
    # trasladados (-ox,-oy), uno por GlobalId de puerta, para proyectar a
    # pixeles junto con el resto (mismo criterio que geoms_por_categoria, ver
    # arco_apertura_puerta/mapa_operacion_puertas en generar_plano_pdf.py).
    arcos_puerta = {}
    # fuente de cada arco sintetizado (2026-09-19) -- "declarado" (dato de
    # IfcDoorStyle.OperationType) o "geometria" (ultimo recurso, ver
    # bisagra_por_geometria en generar_plano_pdf.py) -- se propaga al JSON
    # del portal para que quede visible cual sentido de apertura es un dato
    # cierto y cual una inferencia a confirmar con el arquitecto.
    fuentes_puerta = {}
    # Pisos/cubiertas SOLO en el nivel de cubierta -- mismo criterio y misma
    # razon que generar_plano_pdf.py (ver ORDEN_DIBUJO_CUBIERTA ahi): estas 3
    # clases existen en cantidades mucho mayores en el resto de los niveles y
    # ahi se siguen ignorando a proposito.
    orden_nivel = g.ORDEN_DIBUJO_CUBIERTA if es_cubierta else g.ORDEN_DIBUJO
    for tipo in orden_nivel:
        for el in por_tipo.get(tipo, []):
            geom = g.footprint_2d(el)
            if geom is None:
                continue
            geom = translate(geom, xoff=-ox, yoff=-oy)
            g.dibujar_geom(ax, geom, {k: v for k, v in g.ESTILOS[tipo].items() if k != "label"})
            if tipo == "IfcColumn":
                g.marcar_centroide(ax, geom, color="black", zorder=6)
            if tipo == "IfcDoor":
                arcos, fuente = g.arco_apertura_puerta(el, mapa_ops.get(el.GlobalId), escala_m)
                if arcos:
                    color = g.ESTILOS["IfcDoor"]["edgecolor"] if fuente == "declarado" else g.COLOR_ARCO_GEOMETRIA
                    estilo_linea = "-" if fuente == "declarado" else "--"
                    arcos_t = []
                    for puntos in arcos:
                        puntos_t = [(px - ox, py - oy) for px, py in puntos]
                        xs, ys = zip(*puntos_t)
                        ax.plot(xs, ys, color=color, linestyle=estilo_linea,
                                 linewidth=0.5 if fuente == "declarado" else 0.7, zorder=4)
                        arcos_t.append(puntos_t)
                    arcos_puerta[el.GlobalId] = arcos_t
                    fuentes_puerta[el.GlobalId] = fuente
                else:
                    # Regla del proyecto (2026-09-19): el sentido de apertura
                    # debe quedar SIEMPRE señalado en el PNG -- mismo criterio
                    # que generar_plano_pdf.py.
                    g.marcar_apertura_sin_dato(ax, geom)
            categoria = CATEGORIA_POR_CLASE.get(tipo)
            if categoria is not None:
                geoms_por_categoria[categoria].append((el.GlobalId, geom))

    # Regla del proyecto (2026-09-19): siempre etiquetar los nombres de
    # recinto en letra pequena -- el PDF de comparacion (generar_plano_pdf.py)
    # ya lo hacia; este generador (el que sube al portal) se habia quedado
    # atras porque su bucle de dibujo solo itera tipos en g.ESTILOS, y
    # IfcSpace no esta ahi (a proposito: no se rellena su poligono).
    g.etiquetar_recintos(ax, elementos, ox, oy)

    ax.set_aspect("equal")
    ax.autoscale()
    ax.axis("off")  # sin ejes/ticks -- se parece mas a un plano real subido por un arquitecto
    elev_txt = f"{nivel.Elevation:.2f} m" if nivel.Elevation is not None else "sin cota"
    ax.set_title(f"{nivel.Name} · cota {elev_txt} · generado desde IFC ({nombre_corto})", fontsize=9)
    fig.tight_layout()

    dpi = 150
    fig.set_dpi(dpi)
    fig.canvas.draw()  # fija el layout/autoscale final -- transData ya es el real
    w_px = int(fig.get_size_inches()[0] * dpi)
    h_px = int(fig.get_size_inches()[1] * dpi)

    geo_pixeles = {"muro": [], "puerta": [], "ventana": [], "escalera": [], "rampa": []}
    for categoria, items in geoms_por_categoria.items():
        for global_id, geom in items:
            coords_datos = np.array(geom.exterior.coords)  # anillo cerrado, en metros
            coords_px = ax.transData.transform(coords_datos)  # origen abajo-izquierda
            # PNG tiene origen arriba-izquierda -> se invierte Y
            coords_px_img = [(float(x), float(h_px - y)) for x, y in coords_px]

            if categoria in CATEGORIAS_SEGMENTOS:
                segmentos = [{"p1": list(coords_px_img[i]), "p2": list(coords_px_img[i + 1])}
                             for i in range(len(coords_px_img) - 1)]
                geo_pixeles[categoria].append({
                    "id": global_id, "segmentos": segmentos,
                    "largo_total_m": round(geom.length, 2),
                })
            else:
                # Escalera (forma "rectangulo" en CATEGORIAS_ELEMENTO, App.jsx) --
                # p1_relativo/p2_relativo son las 2 esquinas del bounding box,
                # como fraccion de la imagen (0-1), ver resolverPuntosElemento.
                #
                # cx_relativo/cy_relativo agregados (fix 2026-09-19, bug real
                # encontrado subiendo Schependomlaan al portal: el dibujo en el
                # canvas SI funcionaba con solo p1/p2 -- resolverPuntosElemento
                # los usa directo -- pero getElementosPuntualesConPosicion (la
                # funcion que cuenta "marcadas" para el badge y decide que
                # entra en la lista de "dudas") filtra por
                # typeof cx_relativo === "number", que esta categoria nunca
                # traia. Resultado: "Escalera (0/3)" en el portal pese a que
                # las 3 SI estaban dibujadas en el lugar correcto -- mismo
                # patron de "el dato esta pero no en el campo que se necesita"
                # que ya se vio con otros elementos esta sesion.
                xs = [x for x, _ in coords_px_img]
                ys = [y for _, y in coords_px_img]
                x1, x2 = min(xs) / w_px, max(xs) / w_px
                y1, y2 = min(ys) / h_px, max(ys) / h_px
                geo_pixeles[categoria].append({
                    "id": global_id,
                    "p1_relativo": {"x": x1, "y": y1},
                    "p2_relativo": {"x": x2, "y": y2},
                    "cx_relativo": (x1 + x2) / 2, "cy_relativo": (y1 + y2) / 2,
                })

    # Arco de apertura (2026-09-19) -- se proyecta con la MISMA transformacion
    # que el resto (transData ya fijo) y se agrega como segmentos EXTRA al
    # registro de esa puerta en puertas_geo, para que quede seleccionable/
    # visible en el portal igual que el contorno de la hoja.
    puertas_por_id = {p["id"]: p for p in geo_pixeles["puerta"]}
    for global_id, arcos_datos in arcos_puerta.items():
        p = puertas_por_id.get(global_id)
        if p is None:
            continue
        # Deja trazable en el JSON si el sentido de apertura es un dato
        # declarado en el IFC o una inferencia por geometria (ultimo recurso,
        # a confirmar con el arquitecto) -- ver nota de cabecera arriba.
        p["arco_apertura_fuente"] = fuentes_puerta[global_id]
        # Un arco por hoja (2 en DOUBLE_DOOR_SINGLE_SWING) -- se proyecta y
        # segmenta CADA arco por separado para no unir con una linea espuria
        # el punto final de una hoja con el punto inicial de la otra.
        for puntos_datos in arcos_datos:
            coords_px = ax.transData.transform(np.array(puntos_datos))
            coords_px_img = [(float(x), float(h_px - y)) for x, y in coords_px]
            p["segmentos"].extend({"p1": list(coords_px_img[i]), "p2": list(coords_px_img[i + 1])}
                                   for i in range(len(coords_px_img) - 1))

    fig.savefig(ruta_png, dpi=dpi, facecolor="white")
    plt.close(fig)
    return w_px, h_px, dpi, geo_pixeles


def main(ifc_path=IFC_PATH, nombre_corto=None):
    if nombre_corto is None:
        nombre_corto = Path(ifc_path).stem
    modelo = ifcopenshell.open(ifc_path)
    niveles = sorted(modelo.by_type("IfcBuildingStorey"),
                      key=lambda s: s.Elevation if s.Elevation is not None else 0.0)

    todos_muros = modelo.by_type("IfcWall")
    ox, oy = 0.0, 0.0
    for w in todos_muros[:1]:
        try:
            shp = ifcopenshell.geom.create_shape(g.settings, w)
            ox, oy = shp.geometry.verts[0], shp.geometry.verts[1]
        except Exception:
            pass
        break

    # Sentido de apertura de puertas (2026-09-19) -- ver nota de cabecera junto
    # a g.arco_apertura_puerta(). Se calcula UNA vez para todo el edificio.
    escala_m = ifcopenshell.util.unit.calculate_unit_scale(modelo)
    escala_a = g.escala_area(modelo)
    mapa_ops = g.mapa_operacion_puertas(modelo)
    # Salidas de emergencia (2026-09-20) -- ver g.mapa_salida_emergencia() para
    # el detalle de que campo IFC se usa y por que se descarta el valor no
    # booleano de DuplexHouse. Calculado UNA vez para todo el edificio, mismo
    # criterio que mapa_ops.
    mapa_salida = g.mapa_salida_emergencia(modelo)
    puertas_con_dato_salida = len(mapa_salida)

    # Ids de puertas/ventanas que SI son aberturas reales -- calculado UNA vez
    # para todo el edificio (ver g.filtrar_vanos_reales), no por nivel: la
    # señal es una propiedad del archivo/exportador, no de un nivel puntual.
    ids_puertas_reales = {e.GlobalId for e in g.filtrar_vanos_reales(modelo.by_type("IfcDoor"))}
    ids_ventanas_reales = {e.GlobalId for e in g.filtrar_vanos_reales(modelo.by_type("IfcWindow"))}

    # Resguardo de ventilacion a nivel EDIFICIO -- fix 2026-09-19, hallazgo real
    # de la revision cruzada Codex+DeepSeek: este adaptador calculaba pct/cumple
    # por recinto sin ningun resguardo, expuesto al mismo patron de falso
    # positivo masivo que ya se encontro y corrigio 3 veces en analizar_todos.py
    # (0% de ventilacion en TODOS los recintos si el edificio no tiene ningun
    # IfcWindow real, o si existe IfcRelSpaceBoundary pero ninguna ventana
    # vinculada trae OverallWidth/OverallHeight calculable) -- el fix nunca se
    # habia propagado a este archivo. Se calcula UNA vez para todo el edificio
    # (no por nivel/pagina), mismo criterio que analizar_todos.py, para que
    # ambos scripts sean comparables sobre el mismo IFC.
    # Filtradas a ventanas reales (ver ids_ventanas_reales arriba) -- si no,
    # un edificio con solo vanos de obra sin terminar (ej. Schependomlaan
    # antes del fix 2026-09-19) podia dar "ventilacion_aplicable=True" por
    # tener IfcWindow > 0, aunque ninguna fuera una ventana real.
    todas_ventanas_edificio = [v for v in modelo.by_type("IfcWindow") if v.GlobalId in ids_ventanas_reales]
    ventilacion_aplicable = len(todas_ventanas_edificio) > 0
    if ventilacion_aplicable:
        anchos_altos_edificio = {v.GlobalId: (a.num_o_none(v.OverallWidth), a.num_o_none(v.OverallHeight))
                                  for v in todas_ventanas_edificio}
        enlace_funciona = False
        for sp in modelo.by_type("IfcSpace"):
            for b in sp.BoundedBy:
                el = b.RelatedBuildingElement
                if el is not None and el.is_a("IfcWindow"):
                    ancho, alto = anchos_altos_edificio.get(el.GlobalId, (None, None))
                    if ancho is not None and alto is not None:
                        enlace_funciona = True
                        break
            if enlace_funciona:
                break
        ventilacion_aplicable = ventilacion_aplicable and enlace_funciona

    origen = Path(ifc_path)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    carpeta_png = origen.parent
    paginas = []
    total_puertas = total_ventanas = total_escaleras = total_rampas = total_salidas_emergencia = 0

    # Ids cortos por elemento (fix 2026-09-19, pedido explicito del usuario:
    # el GlobalId del IFC se usaba tal cual como id, y ese MISMO id es lo que
    # App.jsx dibuja como etiqueta sobre el plano ("const label = e.id || ...",
    # linea ~1246) -- ilegible ("2O2Fr$t4X7Zf8NOew3FNtn"). Se reemplaza por el
    # mismo esquema PREFIJO-NN que ya usa el portal para el pipeline de PDF
    # (CATEGORIAS_ELEMENTO.prefijo en App.jsx: P/V/ES/R/MU). Contador GLOBAL
    # (no se reinicia por pagina): las correcciones del arquitecto
    # (eliminar/editar un elemento) se guardan en un array/diccionario plano
    # por id en todo el documento (elementosPuntualesEliminados/Editados en
    # App.jsx no llevan entry_idx) -- si "MU-01" se repitiera en 2 niveles
    # distintos, borrar uno borraria tambien el otro.
    PREFIJO_CORTO = {"muro": "MU", "puerta": "P", "ventana": "V", "escalera": "ES", "rampa": "R"}
    contador_id_corto = {"muro": 0, "puerta": 0, "ventana": 0, "escalera": 0, "rampa": 0}

    def id_corto(categoria):
        contador_id_corto[categoria] += 1
        return f"{PREFIJO_CORTO[categoria]}-{contador_id_corto[categoria]:02d}"

    for idx, nivel in enumerate(niveles):
        rels = [r for r in modelo.by_type("IfcRelContainedInSpatialStructure")
                if r.RelatingStructure == nivel]
        elementos = []
        for r in rels:
            elementos.extend(r.RelatedElements)

        # Descarta vanos que no son aberturas reales -- hallazgo real
        # 2026-09-19: el usuario desconfio con razon de "80 puertas, 84
        # ventanas" en una sola planta de Schependomlaan. Eran marcos de obra
        # en hormigon sin terminar y paneles de mecanismo de ascensor,
        # clasificados como IfcDoor/IfcWindow por el exportador pero sin
        # ninguna dimension declarada -- ver g.filtrar_vanos_reales (señal
        # geometrica, no por nombre/idioma: el usuario tambien senalo con
        # razon que un filtro por nombre en holandes no serviria para un IFC
        # chileno). ids_puertas_reales/ids_ventanas_reales ya se calcularon
        # una vez para todo el edificio, arriba.
        elementos = [e for e in elementos
                     if (not e.is_a("IfcDoor") or e.GlobalId in ids_puertas_reales)
                     and (not e.is_a("IfcWindow") or e.GlobalId in ids_ventanas_reales)]

        espacios_nivel = [e for e in ifcopenshell.util.element.get_decomposition(nivel, is_recursive=False)
                          if e.is_a("IfcSpace")]
        # Mismo patron de bug ya conocido con IfcSpace (ver comentario en
        # generar_plano_pdf.py): en este archivo, IfcStair SI llega por
        # IfcRelContainedInSpatialStructure (por eso el conteo de escaleras ya
        # daba bien), pero el IfcStairFlight real -- el que tiene geometria
        # dibujable -- esta anidado DENTRO de el via IfcRelAggregates, no
        # contenido directo en el nivel. Sin este paso, "elementos" nunca
        # contiene IfcStairFlight y la escalera queda contada pero invisible
        # (ni dibujada en el plano ni exportada en escaleras_detalle) --
        # bug real reportado por el usuario 2026-09-19 en el portal ("2
        # escaleras, 2 sin ubicar").
        #
        # Escaleras deduplicadas por GlobalId (fix 2026-09-19, hallazgo real de
        # la revision cruzada Codex+DeepSeek sobre este mismo cambio): contar
        # "is_a(IfcStairFlight) or is_a(IfcStair)" directo sobre `elementos`
        # duplicaria el conteo si algun exportador deja el IfcStairFlight
        # contenido directo en el nivel A LA VEZ que su IfcStair padre tambien
        # esta contenido (redundante pero real en algunos exportadores) -- no
        # pasa en DuplexHouse (verificado: 0 IfcStairFlight en `elementos`
        # crudo), pero el conteo y la posicion exportada deben salir SIEMPRE
        # de la misma fuente para no poder desalinearse entre si.
        stairs_contenidos = [e for e in elementos if e.is_a("IfcStair")]
        flights_directos = [e for e in elementos if e.is_a("IfcStairFlight")]
        flights_por_stair = {st.GlobalId: [h for h in ifcopenshell.util.element.get_decomposition(st, is_recursive=False)
                                            if h.is_a("IfcStairFlight")]
                              for st in stairs_contenidos}

        escaleras = []
        ids_escalera_contados = set()
        for h in flights_directos + [h for hijos in flights_por_stair.values() for h in hijos]:
            if h.GlobalId not in ids_escalera_contados:
                ids_escalera_contados.add(h.GlobalId)
                escaleras.append(h)
        # IfcStair sin ningun IfcStairFlight hijo resuelto -- lejos de ser
        # "raro" (comentario anterior), es EXACTAMENTE el caso de 3 de las 6
        # escaleras de Schependomlaan (hallazgo real 2026-09-19: decomposicion
        # vacia, pero el propio IfcStair SI tiene geometria 3D usable --
        # footprint_2d funciona directo sobre el, 2.2-3.9 m2). Antes se
        # contaban pero jamas se dibujaban ("IfcStair no esta en g.ESTILOS a
        # proposito" -- ya no es cierto, se agrego). Se cuenta el contenedor
        # para no perder la escalera por completo.
        for st in stairs_contenidos:
            if not flights_por_stair[st.GlobalId] and st.GlobalId not in ids_escalera_contados:
                ids_escalera_contados.add(st.GlobalId)
                escaleras.append(st)

        # TODO IfcStair contenido queda en `elementos` crudo (por contencion),
        # con o sin tramos -- ahora que IfcStair tambien esta en g.ESTILOS,
        # dejarlo adentro duplicaria la escalera: 1 vez via `elementos` (el
        # contenedor) y otra vez via `escaleras` arriba (el tramo real O el
        # mismo contenedor como fallback). Bug real encontrado en la primera
        # version de este fix (2026-09-19): al sacar de `elementos` SOLO los
        # que tenian tramo, las escaleras SIN tramo quedaban duplicadas (2x)
        # en vez de arregladas -- confirmado en Schependomlaan (3 escaleras
        # reales, escaleras_detalle daba 6). `escaleras` ya es la
        # representacion completa y correcta (tramo o contenedor, nunca
        # ambos), asi que TODO IfcStair sale de `elementos` sin excepcion.
        elementos = [e for e in elementos if not e.is_a("IfcStair")]

        # Rampas (2026-09-20) -- MISMO patron de dedup que escalera arriba,
        # sin caso real en esta sesion (ver nota de cabecera de
        # CATEGORIA_POR_CLASE y g.ESTILOS en generar_plano_pdf.py).
        ramps_contenidos = [e for e in elementos if e.is_a("IfcRamp")]
        flights_rampa_directos = [e for e in elementos if e.is_a("IfcRampFlight")]
        flights_por_ramp = {rp.GlobalId: [h for h in ifcopenshell.util.element.get_decomposition(rp, is_recursive=False)
                                           if h.is_a("IfcRampFlight")]
                             for rp in ramps_contenidos}
        rampas = []
        ids_rampa_contados = set()
        for h in flights_rampa_directos + [h for hijos in flights_por_ramp.values() for h in hijos]:
            if h.GlobalId not in ids_rampa_contados:
                ids_rampa_contados.add(h.GlobalId)
                rampas.append(h)
        for rp in ramps_contenidos:
            if not flights_por_ramp[rp.GlobalId] and rp.GlobalId not in ids_rampa_contados:
                ids_rampa_contados.add(rp.GlobalId)
                rampas.append(rp)
        elementos = [e for e in elementos if not e.is_a("IfcRamp")]

        elementos_con_espacios = elementos + espacios_nivel + escaleras + rampas

        # PNG del nivel, junto al IFC (misma convencion de nombres: origen + timestamp)
        # nivel.Name puede venir None en un IFC valido (mismo caso ya blindado
        # para Elevation en generar_plano_pdf.py) -- fix 2026-09-19, hallazgo
        # real de la revision cruzada (Codex): sin el fallback, un nivel sin
        # nombre rompe toda la corrida con TypeError en el join().
        nombre_nivel_seguro = "".join(c if c.isalnum() else "_" for c in (nivel.Name or "SinNombre"))
        ruta_png = carpeta_png / f"{nombre_corto}_pagina{idx + 1}_{nombre_nivel_seguro}_{timestamp}.png"
        w_px, h_px, dpi, geo_pixeles = render_nivel_png(modelo, nivel, elementos_con_espacios, ox, oy, ruta_png,
                                                          escala_m, mapa_ops, nombre_corto,
                                                          es_cubierta=g.es_nivel_cubierta(nivel, niveles))

        # Reemplaza el GlobalId (usado internamente para deduplicar/proyectar)
        # por el id corto MU-01/P-01/V-01/ES-01 -- ver comentario junto a
        # id_corto() arriba. En orden de pagina (idx) y de aparicion dentro de
        # cada pagina, no hay un criterio geografico/alfabetico mas "natural"
        # que ese sin agregar complejidad que nadie pidio.
        for categoria in ("muro", "puerta", "ventana", "escalera", "rampa"):
            for item in geo_pixeles[categoria]:
                item["id"] = id_corto(categoria)

        # --- datos reales por nivel (mismo metodo que analizar_todos.py) ---
        puertas = [e for e in elementos if e.is_a("IfcDoor")]
        ventanas = [e for e in elementos if e.is_a("IfcWindow")]
        muros = [e for e in elementos if e.is_a("IfcWall")]
        # escaleras/rampas ya resueltas arriba (deduplicadas, misma fuente que geo_pixeles["escalera"/"rampa"])

        # Salidas de emergencia (2026-09-20) -- cuenta SOLO puertas con
        # Pset_DoorCommon.FireExit/IsFireExit booleano True (ver
        # g.mapa_salida_emergencia). Reemplaza el hardcode "salidas_emergencia":
        # 0 que antes no distinguia "0 encontradas" de "nunca se evaluo".
        salidas_nivel = sum(1 for d in puertas if mapa_salida.get(d.GlobalId) is True)

        ventanas_geo_nivel = []
        for v in ventanas:
            # escala_m aplicada (fix 2026-09-19, mismo bug de unidades que
            # analizar_todos.py -- ver num_o_none_escalado): OverallWidth/
            # OverallHeight son atributos de LONGITUD, siempre en la unidad
            # cruda del archivo, nunca en el AREAUNIT propio que sí puede
            # tener el area de un recinto (ver escala_a mas abajo).
            ancho = a.num_o_none_escalado(v.OverallWidth, escala_m)
            alto = a.num_o_none_escalado(v.OverallHeight, escala_m)
            ventanas_geo_nivel.append({
                "id": v.GlobalId,
                "area_m2": (ancho * alto) if (ancho is not None and alto is not None) else None,
            })
        ventanas_por_id = {vv["id"]: vv for vv in ventanas_geo_nivel}

        recintos_semantico = []
        mediciones_geometricas = []
        for sp in espacios_nivel:
            qtos = elutil.get_psets(sp, qtos_only=True)
            area, _ = a.buscar_area(qtos)
            area = area * escala_a if area is not None else None
            nombre = (sp.LongName or sp.Name or "").strip() or f"Recinto {sp.GlobalId[:6]}"
            area_ventanas = 0.0
            for b in sp.BoundedBy:
                el = b.RelatedBuildingElement
                if el is not None and el.is_a("IfcWindow"):
                    vg = ventanas_por_id.get(el.GlobalId)
                    if vg and vg["area_m2"] is not None:
                        area_ventanas += vg["area_m2"]
            # ventilacion_aplicable (resguardo a nivel edificio, ver arriba) +
            # "area is not None and area > 0" explicito -- fix 2026-09-19,
            # hallazgo real de la revision cruzada (Codex+DeepSeek): el
            # cortocircuito "if area and area > 0" trataba area=0.0 igual que
            # area=None (mismo patron "dato ausente vs no cumple" ya corregido
            # varias veces en el proyecto) -- inofensivo en la practica porque
            # ambos casos ya daban pct=None, pero es el idiom equivocado.
            pct = (area_ventanas / area * 100) if (ventilacion_aplicable and area is not None and area > 0) else None
            # CORREGIDO 2026-09-21 (curacion OGUC completa, ver reglas_normativas.py
            # OGUC_REGLAS['ventilacion_iluminacion_pct']): el 10% NO es una cita OGUC
            # real (verificado contra el texto integro de los articulos que se
            # citaban antes) -- se mantiene el valor pero el texto que ve el
            # arquitecto ya no afirma una fuente OGUC que no existe.
            cumple = (pct >= a._VENTILACION_MIN_PCT) if pct is not None else None
            obs = None
            if pct is not None:
                obs = (f"Ventilación natural medida desde IFC: {pct:.1f}% de la superficie "
                       f"(mínimo de referencia {a._VENTILACION_MIN_PCT:.0f}%, sin cita OGUC verificada -- ver Convenciones_BIM.md).")
            elif not ventilacion_aplicable:
                obs = ("Ventilación no evaluable: sin IfcWindow reales en el edificio, o sin ningún "
                       "vínculo recinto-ventana (IfcRelSpaceBoundary) con área calculable en todo el modelo "
                       "-- ver resumen_global.ventilacion_nota.")
            recintos_semantico.append({
                "nombre": nombre, "tipo": "recinto",
                "area_estimada_m2": round(area, 2) if area is not None else None,
                "cumple_oguc": cumple, "observacion": obs,
            })
            mediciones_geometricas.append({
                # id COMPLETO -- fix 2026-09-19, bug real reportado por el usuario:
                # truncar a 8 caracteres (sp.GlobalId[:8]) colapsaba 16 de los 21
                # IfcSpace de DuplexHouse.ifc bajo el MISMO id "0BTBFw6f..."
                # (Revit exporta GUIDs que comparten prefijo dentro del mismo
                # proyecto/sesion) -- el portal usa este id para aplicar
                # correcciones/dudas por recinto, con el id truncado una
                # correccion sobre "Foyer" tambien pegaba en "Bathroom 1".
                "nombre": nombre, "id": sp.GlobalId, "tipo": "recinto",
                "area_m2": round(area, 2) if area is not None else None,
                "cumple_geo": cumple,
            })

        incumplimientos_geo = []
        for d in puertas:
            # BUG REAL CORREGIDO 2026-09-21 (auditoria Fase 1, ACH-BIM-001): esta
            # linea no existia. `ancho` nunca se calculaba desde la puerta `d` --
            # como en Python las variables de `for` no tienen scope de bloque,
            # el chequeo de abajo comparaba contra el valor residual de `ancho`
            # del loop de VENTANAS (linea ~488) o del resguardo de ventilacion,
            # es decir el ancho de una ventana cualquiera, no el de la puerta
            # evaluada. Efecto: todas las puertas de un nivel compartian el mismo
            # "medido" (el de la ultima ventana) -> falsos positivos en masa si
            # esa ventana era angosta, o falsos negativos si era ancha. Peor: en
            # un IFC con puertas reales y CERO IfcWindow (caso documentado:
            # "Administrativo (ES)", 100% muro cortina) `ancho` quedaba sin
            # asignar y el script moria con UnboundLocalError.
            ancho = a.num_o_none_escalado(d.OverallWidth, escala_m)
            # escala_m aplicada (fix 2026-09-19) -- mismo bug de unidades que
            # analizar_todos.py: comparar el OverallWidth crudo contra 0.80
            # nunca podia fallar en archivos con LENGTHUNIT en milimetros.
            # Umbral/cita 2026-09-21 (curacion OGUC completa, ver
            # reglas_normativas.py) -- este bloque seguia con 0.80/N°6
            # hardcodeado a mano pese a que analizar_todos.py ya se corrigio
            # a 0.90/N°4 (N°6 letra b) es el caso de bano accesible, no el
            # general) -- hallazgo real de Revision Ing SW Paso 2 (Codex,
            # 2026-09-21): un adapter mas de generar_json_colab.py habia
            # quedado desincronizado de la fuente unica, mismo patron que
            # motivo la extension del chequeo de hardcodeo a normativa/.
            if ancho is not None and ancho < a._ANCHO_MIN_PUERTA_M:
                incumplimientos_geo.append({
                    "tipo": "ancho", "recinto": d.Name or "Puerta",
                    "medido": round(ancho, 2), "minimo": a._ANCHO_MIN_PUERTA_M,
                    "ref": a.OGUC_REGLAS['puerta_ancho_libre'][2],
                })

        total_puertas += len(puertas)
        total_ventanas += len(ventanas)
        total_escaleras += len(escaleras)
        total_rampas += len(rampas)
        total_salidas_emergencia += salidas_nivel

        paginas.append({
            "pagina": idx + 1,
            "entry_idx": idx,
            # Fix 2026-09-19 (Codex): nivel.Name puede venir None en un IFC
            # valido (mismo caso ya blindado para nombre_nivel_seguro arriba)
            # -- sin fallback, el JSON llevaba null en vez de string, y el
            # portal probablemente espera string para tags/filtros.
            "fname_tag": nivel.Name or "SinNombre",
            "escala": "1:50 (nominal -- dibujo generado a escala real en metros desde IFC, no impreso a escala de papel)",
            "imagen_w_px": w_px, "imagen_h_px": h_px, "mpp": None,
            "analisis_semantico": {
                "tipo_plano": "planta", "nivel": nivel.Name,
                "recintos": recintos_semantico,
                "incumplimientos_oguc": [],  # ver nota de cabecera -- no se fabrican candidatas
                # Posicion real de escaleras (fix 2026-09-19, ver CATEGORIA_POR_CLASE
                # en render_nivel_png) -- bounding box real proyectado a pixeles,
                # no una estimacion; antes esta lista simplemente no existia.
                "escaleras_detalle": geo_pixeles["escalera"],
                # Rampas (2026-09-20) -- mismo patron que escaleras_detalle,
                # leido por App.jsx via CATEGORIAS_ELEMENTO (id="rampa",
                # campo="rampas_detalle") -- confirmado en el propio codigo
                # del portal, no asumido.
                "rampas_detalle": geo_pixeles["rampa"],
                "elementos_detectados": {
                    # "muros" agregado (fix 2026-09-19, bug real reportado por el
                    # usuario en el portal: mostraba "(21/0)" en vez de "(21/21)")
                    # -- faltaba esta clave, PLURAL_ELEMENTOS.muro="muros" en
                    # App.jsx la lee de aca; sin ella el "total" siempre daba 0
                    # aunque las 21 posiciones reales (muros_geo) si existieran.
                    "muros": len(muros),
                    "puertas": len(puertas), "ventanas": len(ventanas),
                    "escaleras": len(escaleras), "rampas": len(rampas),
                    # salidas_emergencia (2026-09-20): antes hardcodeado a 0
                    # sin calcular nada -- ver g.mapa_salida_emergencia() y
                    # resumen_global.salidas_emergencia_nota para el alcance
                    # real (solo cuenta puertas con dato IFC declarado, NO
                    # calcula carga de ocupacion ni traza rutas de evacuacion).
                    "salidas_emergencia": salidas_nivel,
                },
            },
            "mediciones_geometricas": mediciones_geometricas,
            "incumplimientos_geo": incumplimientos_geo,
            # Geometria real proyectada a pixeles del PNG (ver render_nivel_png) --
            # antes iban vacios, ver nota de cabecera del archivo (fix 2026-09-19).
            "muros_geo": geo_pixeles["muro"],
            "puertas_geo": geo_pixeles["puerta"],
            "ventanas_simples_por_linea_central": geo_pixeles["ventana"],
        })
        print(f"Página {idx + 1} ({nivel.Name}): {len(muros)} muros, {len(puertas)} puertas, "
              f"{len(ventanas)} ventanas, {len(escaleras)} escaleras, {len(rampas)} rampas, "
              f"{len(espacios_nivel)} recintos, {salidas_nivel} salida(s) de emergencia con dato -> {ruta_png.name}")

    resultado = {
        "proyecto": f"{nombre_corto} (IFC de ejemplo, piloto BIM ArchiCheck)",
        "dpi": 150,
        "generado_desde": "IFC via ifcopenshell (no PDF/Colab-OpenCV) -- ver Proyecto/bim_exploracion_mercado_y_viabilidad.md",
        "paginas": paginas,
        "resumen_global": {
            "incumplimientos_geo_total": sum(len(p["incumplimientos_geo"]) for p in paginas),
            "puertas_detectadas": total_puertas,
            "ventanas_detectadas": total_ventanas,
            "escaleras_detectadas": total_escaleras,
            # Antes hardcodeado a 0 (nunca calculado) -- 2026-09-20, ver
            # g.ESTILOS/CLASES_SUSTANTIVAS_NIVEL en generar_plano_pdf.py.
            # NINGUN archivo de ejemplo de esta sesion tiene una IfcRamp real
            # (0/8) -- el mecanismo de deteccion/dibujo/conteo esta
            # implementado y sigue el mismo patron ya probado de escalera,
            # pero no hay caso real todavia para confirmarlo con evidencia.
            "rampas_detectadas": total_rampas,
            # Antes hardcodeado a 0 (fix 2026-09-20) -- ahora cuenta puertas
            # con Pset_DoorCommon.FireExit (o IsFireExit de Revit) declarado
            # como True. NO es una evaluacion completa de salidas de
            # emergencia (eso requiere carga de ocupacion + trazado de rutas,
            # 0% construido, ver Fase 2/Convenciones_BIM.md) -- es solo el
            # dato de etiquetado que SI existe como campo IFC real.
            "salidas_emergencia_detectadas": total_salidas_emergencia,
            "salidas_emergencia_puertas_con_dato": puertas_con_dato_salida,
            "salidas_emergencia_nota": (
                "Ninguna puerta del edificio declara Pset_DoorCommon.FireExit/IsFireExit "
                "como valor booleano -- este conteo no es evaluable en este archivo, "
                "0 no significa 'sin salidas de emergencia reales', significa 'sin dato'."
                if puertas_con_dato_salida == 0 else
                f"{puertas_con_dato_salida} puerta(s) del edificio declaran este campo -- "
                "el resto no tiene dato (no es lo mismo que 'no son salida'). Este conteo "
                "NO reemplaza un calculo real de carga de ocupacion/rutas de evacuacion "
                "(OGUC 4.2.x), que no está implementado."
            ),
            # Mismo campo que analizar_todos.py (fix 2026-09-19) -- deja
            # trazable POR QUE ningun recinto tiene cumple_oguc/cumple_geo
            # cuando el resguardo de ventilacion desactiva el chequeo.
            "ventilacion_aplicable_al_edificio": ventilacion_aplicable,
        },
    }

    ruta_json = carpeta_png / f"{nombre_corto}_colab_{timestamp}.json"
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    print(f"\nJSON listo: {ruta_json}")


if __name__ == "__main__":
    main()
