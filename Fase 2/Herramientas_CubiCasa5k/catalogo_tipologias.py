# -*- coding: utf-8 -*-
"""
Catalogo estructurado de tipologias -- vinculo real entre Convenciones_CAD.md
(catalogo NARRATIVO, seccion D, mantenido por la sesion paralela del
arquitecto) y el codigo del pipeline (que hoy solo lo citaba en comentarios,
sin ningun vinculo verificable).

Que es esto: por cada tipologia/variante nombrada en Convenciones_CAD.md
seccion D (D.1 Muros .. D.10 Superficies), UNA entrada aca con: la seccion
de origen, el criterio resumido, los parametros/tolerancias con su valor
REAL (el mismo que usa el codigo -- no una copia que se puede desincronizar
en silencio), el estado de implementacion, y en que funcion(es) vive.

Que NO es: no reemplaza a Convenciones_CAD.md como fuente narrativa (ese
archivo sigue siendo el que se discute/corrige con el arquitecto). Este
archivo es la fuente PARAMETRICA -- el codigo debe leer tolerancias de aca
via `parametro()`, nunca repetirlas como constante suelta en otro modulo.

Disciplina de mantenimiento (Principio 2, project_archicheck_objetivo_etapa_
aprendizaje.md -- ver tambien Convenciones_CAD D.9): cuando Convenciones_CAD.md
gana o corrige una fila de la seccion D, esta tabla se actualiza en la MISMA
pasada -- nombre, criterio y valor deben poder rastrearse uno a uno contra el
.md. No se inventan tipologias aca que no existan ya en el .md (ese archivo
manda); si un valor parametrico cambia primero en el codigo (ajuste fino
durante debugging), se refleja aca Y se avisa para que se refleje tambien en
el .md -- nunca se deja el codigo con un numero que el catalogo no conoce.

`estado`: 'implementado' (codigo real que aplica el criterio),
'parcial' (algo de logica existe pero no cubre todas las variantes de la
fila), 'pendiente' (fila documentada en Convenciones_CAD, sin codigo
todavia -- placeholder deliberado, no un olvido).

`usa_en` / `exporta_a_schema` (opcionales, 🆕 2026-08-31): 'estado' responde
"¿existe el codigo del criterio?", no "¿su resultado llega al export final?"
-- una entrada puede estar 'implementado' y aun asi quedar enchufada solo a
canales laterales (fusion, diagnostico visual) sin tocar el JSON exportado
(ver GAP-GEO-VENT-001 en Diseno_Funcional_ArchiCheck.md §2.9). Cuando eso
pase, se agregan estos 2 campos en vez de degradar 'estado' -- el criterio en
si no es parcial, es el wiring al pipeline el que falta.
"""

TIPOLOGIAS = {

    # ── D.1 Muros ────────────────────────────────────────────────────────
    "D1-muro-simple": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Muro simple",
        "criterio": "2 trazos paralelos formando contorno cerrado; distancia entre trazos = espesor",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:ancho_por_emparejamiento", "cuerpo_cerrado.py:_relleno_solido"],
        "fuente": "2026-07-31/08-02",
    },
    "D1-ancho-emparejamiento": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Tolerancia de espesor de muro plausible (ancho por emparejamiento)",
        "criterio": "Rango de separacion perpendicular entre 2 caras candidatas para considerarse espesor real de muro",
        "parametros": {"tol_min_m": 0.08, "tol_max_m": 0.9},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:ancho_por_emparejamiento"],
        "fuente": "2026-08-20 (13 constantes auditadas y convertidas a metros reales)",
    },
    "D1-linea-unica-sin-par": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Linea unica (sin borde paralelo consistente)",
        "criterio": "Una sola linea, sin trazo paralelo enfrentado -- SIEMPRE se ignora, sin excepcion (incluye deslinde sin par)",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:cuerpo_cerrado_fusiona (rechazo 'linea suelta')"],
        "fuente": "🆕 2026-08-24",
    },
    "D1-muro-corto-aislado": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Muro corto aislado",
        "criterio": "Tramo corto sin conexion larga -- caso real valido, pero igual debe pasar el test de cuerpo cerrado",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:cuerpo_cerrado_fusiona"],
        "fuente": "2026-08-02, precisado 🆕 24-ago",
    },
    "D1-muro-atravesado-por-eje": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Muro atravesado por eje",
        "criterio": "Un eje (linea de referencia) pasa por encima del muro -- sigue siendo muro real pese a la superposicion",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-02",
    },
    "D1-D3-ventana-lineas-centrales": {
        "seccion": "D.1 / D.3", "elemento": "Muros / Ventanas",
        "nombre": "Filtro ventana como falso candidato a muro/pilar (firma ABSOLUTA, especifica de ventana)",
        "criterio": "Par de bordes paralelos + 1 linea central simetrica entre ambos, separacion en rango de espesor de muro -- NUNCA se generaliza a otros elementos no-estructurales (firma especifica, no la misma regla estirada)",
        "parametros": {"tol_simetria_m": 0.05},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:identificar_lineas_centrales"],
        # 🆕 2026-08-31 (GAP-GEO-VENT-001, ver Diseno_Funcional_ArchiCheck.md §2.9):
        # 'estado':'implementado' es correcto para el CRITERIO (la funcion existe y
        # clasifica bien), pero no dice si el resultado llega al export -- no lo dice.
        # Campo separado a proposito (no se sube 'estado' a 'parcial': el criterio en
        # si mismo no es parcial, es el wiring al pipeline el que falta).
        "usa_en": ["cuerpo_cerrado_fusiona (gate de fusion)", "diag_completo_*.png (diagnostico visual)"],
        "exporta_a_schema": False,  # no existe 'ventanas_geo'; NO llega a muros_geo -- ver gap
        "fuente": "2026-08-20, advertencia de no-generalizacion 🆕 24-ago, campo usa_en/exporta_a_schema 🆕 31-ago",
    },
    "D1-encuentro-de-brazos": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Encuentro de brazos (esquina, empalme y cruce -- misma tipologia)",
        "criterio": "Red conectada de brazos con bordes paralelos que en conjunto cierra como cuerpo solido, sin importar cuantos brazos, angulo (no necesariamente recto), ni anchos distintos entre si",
        "parametros": {"margen_contexto_m": 0.6, "piso_min_px": 2, "tol_conector_esquina_m": 0.03, "tol_fusion_pct": 0.10},
        "estado": "implementado",
        "implementado_en": [
            "cuerpo_cerrado.py:cuerpo_cerrado_fusiona",
            "cuerpo_cerrado.py:_relleno_solido (remate de esquinas generalizado)",
            "cuerpo_cerrado.py:_extender_y_rellenar_esquina",
            "cuerpo_cerrado.py:_extender_conector_sin_par",
            "cuerpo_cerrado.py:_ancho_heredado_de_segmento",
        ],
        "fuente": "2026-08-20/23 (implementacion), unificacion 🆕 24-ago. NOTA 🆕 27-ago: tol_conector_esquina_m coincide en valor (0.03) con tol_vertice_m de D2-hoja-vano-firma-relativa -- son tolerancias de vertice para conceptos distintos (conector de esquina en fusion de muros vs coincidencia de vertice de hoja de puerta), NO unificadas a proposito por falta de evidencia de que deban moverse siempre juntas; si se recalibra una, revisar si la otra tambien corresponde.",
    },
    "D1-corte-rasante-exclusion": {
        "seccion": "D.1 / D.6", "elemento": "Muros",
        "nombre": "\"CORTE A\" / cualquier corte / rasante",
        "criterio": "Linea guion-punto o guion-guion, simbolo circulo+triangulo en extremos -- SIEMPRE se excluye",
        "parametros": {},
        "estado": "parcial",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales (Paso 1.5, dash-gap grouping)"],
        "fuente": "2026-08-20, generalizado 🆕 24-ago",
    },
    "D1-fusion-bloqueada-por-puerta": {
        "seccion": "D.1", "elemento": "Muros",
        "nombre": "Fusion bloqueada por puerta",
        "criterio": "Punto de contacto entre 2 candidatos a muro cae cerca de una puerta identificada CON certeza (una deteccion incierta no bloquea)",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:_punto_cerca_de_puerta", "ArchiCheck_Base ...ipynb Celda 4:_fusionar_muros_por_proximidad"],
        "fuente": "2026-08-20, simplificado 🆕 24-ago",
    },

    # ── D.2 Puertas ──────────────────────────────────────────────────────
    "D2-hoja-vano-firma-relativa": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Vano/hoja de puerta (Tipologia B -- firma RELATIVA)",
        "criterio": "Par de bordes opuestos mas finos y mas cercanos que el muro/pilar real en sus propios extremos -- puede ser 1 sola linea, nunca mas de 2. A cada lado del vano puede haber muro corto, muro largo, o un pilar. LIMITACION CONOCIDA (26-ago, sin resolver): los vertices de una hoja de puerta no necesariamente coinciden con un vertice del muro/pilar adyacente -- la deteccion actual por coincidencia de vertice (tol_vertice_m) puede fallar en ambas direcciones por esto, pendiente de revision futura.",
        "parametros": {"tol_vertice_m": 0.03, "ancho_max_hoja_confirmada_m": 0.10},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:identificar_hojas_de_puerta", "cuerpo_cerrado.py:_firma_hoja_vano_puerta_duda"],
        "fuente": "2026-08-02, precisado y confirmado 🆕 24-ago (revision visual N2), umbral de duda 🆕 26-ago (caso real MU54/MU55 PdV N2 -- muro de 0.20m junto a muro de 0.30m se excluia mal como hoja; candidatos >10cm ya no se excluyen, quedan como hoja_dudosa_ids para confirmar, no se asume ninguna de las 2 en silencio). NOTA 🆕 27-ago: tol_vertice_m coincide en valor (0.03) con tol_conector_esquina_m de D1-encuentro-de-brazos -- ver nota cruzada ahi, no unificadas a proposito.",
    },
    "D2-vano-sin-hoja-solo-arco": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Vano sin hoja dibujada, solo arco",
        "criterio": "El arco define posicion y direccion -- el gozne se ubica opuesto al arco. Nunca aceptar una puerta sin gozne confirmado sobre geometria real",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-19, precisado 🆕 24-ago",
    },
    "D2-puerta-sin-gozne-ni-arco": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Puerta sin gozne ni arco (ninguno de los dos existe)",
        "criterio": "Se marca igual como puerta, sin gozne ni arco -- ninguno de los 2 campos se fabrica",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "🆕 2026-08-24",
    },
    "D2-puerta-doble": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Puerta doble",
        "criterio": "Vano unico, 2 hojas independientes con su propio arco -- gozne al centro SOLO si los arcos estan efectivamente marcados/dibujados, si no cada hoja va con gozne en su extremo exterior",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-02, corregido 🆕 24-ago",
    },
    "D2-arco-discontinuo": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Arco discontinuo",
        "criterio": "Excepcion a 'discontinuo = ignorar': sigue siendo arco valido, se pinta de extremo a extremo considerando todos los segmentos, sin cambio de radio en todo el angulo del vano",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-02, precisado 🆕 24-ago",
    },
    "D2-gozne-opuesto-arco": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Gozne (bisagra) -- regla definitiva",
        "criterio": "El gozne va opuesto al arco -- centro del circulo cuyo segmento dibuja el arco (ajuste de circulo por minimos cuadrados)",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "19-ago (hallazgo visual), regla general 🆕 24-ago",
    },
    "D2-radio-arco-vano-tolerancia": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Radio del arco <-> ancho de vano",
        "criterio": "El radio del arco debe calzar con la cota impresa del vano",
        "parametros": {"tolerancia_pct": 0.10},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "🆕 2026-08-24, valor ajustado tras revision",
    },
    "D2-constancia-radio-arco": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Constancia del radio a lo largo del arco",
        "criterio": "El trazo debe ser efectivamente circular (ajuste de circulo con residuo bajo)",
        "parametros": {"tolerancia_pct": 0.10},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "🆕 2026-08-24, valor ajustado tras revision",
    },
    "D2-verificacion-arco-referencia": {
        "seccion": "D.2", "elemento": "Puertas",
        "nombre": "Verificacion obligatoria contra arco de referencia",
        "criterio": "Todo arco debe calzar visualmente exacto contra el arco ya impreso en el plano",
        "parametros": {"rms_max_px": 1, "min_puntos": 50},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-19 (regla permanente, tras 3 cierres prematuros el mismo dia)",
    },

    # ── D.3 Ventanas ─────────────────────────────────────────────────────
    "D3-independencia-entre-ventanas": {
        "seccion": "D.3", "elemento": "Ventanas",
        "nombre": "Independencia entre ventanas (regla definitiva)",
        "criterio": "Dos ventanas cualesquiera se tratan siempre de forma independiente, sin validar dimension/tolerancia entre ellas, con o sin separador",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:identificar_lineas_centrales (evalua cada linea por su cuenta, sin comparar contra otras ventanas)"],
        "fuente": "🆕 2026-08-24",
    },

    # ── D.4 Escaleras ────────────────────────────────────────────────────
    "D4-peldanos-rectos-paralelos": {
        "seccion": "D.4", "elemento": "Escaleras",
        "nombre": "Peldanos rectos paralelos",
        "criterio": "Lineas o rectangulos angostos en paralelo, a veces numerados",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-02, fusionado 🆕 24-ago",
    },
    "D4-caracol": {
        "seccion": "D.4", "elemento": "Escaleras",
        "nombre": "Caracol",
        "criterio": "Escalones triangulares proyectados como un circulo, un extremo de cada escalon se encuentra con los demas en un punto comun",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "🆕 2026-08-24",
    },
    "D4-mixta": {
        "seccion": "D.4", "elemento": "Escaleras",
        "nombre": "Mixta",
        "criterio": "Peldanos rectos que se conectan a un tramo circular tipo Caracol, sin formar un circulo completo",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "🆕 2026-08-24",
    },

    # ── D.5 Rampas ───────────────────────────────────────────────────────
    "D5-simbolo-pendiente": {
        "seccion": "D.5", "elemento": "Rampas",
        "nombre": "Simbolo de pendiente",
        "criterio": "Rectangulo con lineas diagonales convergiendo a un punto central + texto aparte (% pendiente, formula)",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-02",
    },

    # ── D.6 Ruido a excluir (mismo estatus de tipologia que un elemento real) ─
    "D6-eje-linea-referencia": {
        "seccion": "D.6", "elemento": "Ruido a excluir",
        "nombre": "Eje / linea de referencia",
        "criterio": "Discontinua, minimo 2 huecos consistentes entre si (3 segmentos), incluye variante guion-punto-guion",
        "parametros": {"tol_dash_gap_m": 0.24, "tol_dash_angulo_deg": 5, "umbral_dash_m": 1.0},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales (es_eje_pre, Paso 1.5)"],
        "fuente": "2026-08-09 (v2), ampliado 🆕 24-ago",
    },
    "D6-cota": {
        "seccion": "D.6", "elemento": "Ruido a excluir",
        "nombre": "Cota",
        "criterio": "Geometria de cruz real: marca perpendicular + diagonal que se tocan casi en el mismo punto, o 2 diagonales en forma de X",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales (es_cota_pre)"],
        "fuente": "2026-08-09 (v2), ampliado 🆕 24-ago",
    },
    "D6-rasante": {
        "seccion": "D.6", "elemento": "Ruido a excluir",
        "nombre": "Rasante",
        "criterio": "Texto/cota de nivel de terreno o pendiente + linea discontinua asociada (guion-guion y guion-punto-guion)",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:_detectar_lineas_referencia_periodicas"],
        "fuente": "2026-07-31, ampliado 🆕 24-ago",
    },
    "D6-artefactos-mobiliario": {
        "seccion": "D.6", "elemento": "Ruido a excluir",
        "nombre": "Artefactos y mobiliario",
        "criterio": "Cualquier icono sanitario/mueble/equipo/paisajismo dentro de un recinto -- todos excluidos de superficie sin excepcion",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales (es_mobiliario_por_capa, MAPEO_CAPAS)"],
        "fuente": "2026-07-31, ampliado 2026-08-02",
    },
    "D6-nombres-de-recinto": {
        "seccion": "D.6", "elemento": "Ruido a excluir",
        "nombre": "Nombres de recinto",
        "criterio": "Texto que no es cota ni rasante -- excluido del raster, usado para emparejamiento nombre<->forma",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales"],
        "fuente": "2026-07-23",
    },

    # ── D.7 Estado de obra ───────────────────────────────────────────────
    "D7-estado-eliminado-demolido": {
        "seccion": "D.7", "elemento": "Estado de obra (cualquier elemento)",
        "nombre": "Eliminado / demolido (\"se retira\" y sinonimos)",
        "criterio": "Elemento que SI estaba antes y ya no aparece en la planta nueva -- se trata como AUSENTE en el estado final, no solo se etiqueta y se sigue extrayendo como geometria activa",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": [
            "ArchiCheck_Base ...ipynb Celda 4:_clasificar_estado_por_texto_leyenda",
            "ArchiCheck_Base ...ipynb Celda 4:_estado_por_leyenda",
            "ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales (muros_excluidos_por_demolicion)",
        ],
        "fuente": "🆕 2026-08-24 (regla operacional, revision visual N2)",
    },
    "D7-leyenda-swatch-sin-relleno": {
        "seccion": "D.7", "elemento": "Estado de obra (deteccion de leyenda)",
        "nombre": "Swatch de leyenda dibujado como contorno + achurado, sin relleno solido",
        "criterio": "El detector de leyenda no puede exigir 'fill' -- hay que aceptar tambien un contorno cerrado de segmentos 'l' usando el color de stroke",
        "parametros": {"limite_swatch_pt": 40},
        "estado": "implementado",
        "implementado_en": [
            "ArchiCheck_Base ...ipynb Celda 4:_es_contorno_cerrado_de_lineas",
            "ArchiCheck_Base ...ipynb Celda 4:_detectar_leyenda_simbologia",
        ],
        "fuente": "🆕 2026-08-24 (Tipologia C, revision visual N2)",
    },

    # ── D.8 Capas nativas OCG (MAPEO_CAPAS) ─────────────────────────────
    "D8-mapeo-capas": {
        "seccion": "D.8", "elemento": "Capas nativas OCG del PDF",
        "nombre": "MAPEO_CAPAS -- la capa manda como señal primaria cuando existe",
        "criterio": "Cuando el PDF trae capas OCG nativas, la capa es la señal primaria; la heuristica geometrica es fallback solo cuando no hay capa mapeada para esa categoria. Nombres de capa no estandar entre oficinas, se confirma por proyecto",
        "parametros": {},
        "estado": "implementado",
        "implementado_en": ["ArchiCheck_Base ...ipynb Celda 4:extraer_datos_vectoriales (mapeo_capas, es_categoria_por_capa)"],
        "fuente": "2026-08-04, generalizado 2026-08-10",
    },

    # ── D.9 Duda de tipologia <-> TablaDudas ─────────────────────────────
    "D9-duda-tipologia-tabladudas": {
        "seccion": "D.9", "elemento": "Meta (cualquier elemento)",
        "nombre": "Conexion formal: duda de tipologia -> interfaz de dudas del portal",
        "criterio": "Cuando el pipeline no logra decidir con confianza a que tipologia pertenece un trazo, o 2 tipologias compiten por el mismo trazo, se levanta como pregunta puntual (TablaDudas/calcularDudas), nunca se resuelve en silencio ni se pregunta 'en general'",
        "parametros": {},
        "estado": "parcial",
        "implementado_en": [
            "cuerpo_cerrado.py:clasificar_no_muro (deteccion de conflicto -- todavia no conectado a TablaDudas real en la webapp)",
            "cuerpo_cerrado.py:identificar_hojas_de_puerta (hoja_dudosa_ids -- 26-ago, primer caso real concreto: candidato a hoja/vano mas ancho que 10cm no se resuelve en silencio ni como hoja ni como muro, se separa para confirmar)",
        ],
        "fuente": "2026-08-24, primer caso concreto 🆕 26-ago (D.2 hoja/vano)",
    },

    # ── D.10 Superficies ─────────────────────────────────────────────────
    "D10-superficies-separadores": {
        "seccion": "D.10", "elemento": "Superficies",
        "nombre": "Que cuenta como separador y que cuenta como area",
        "criterio": "Muros/ventanas/puertas/vanos = unicos separadores de recinto. Escaleras NO cuentan como superficie. Rampas SI cuentan como espacio",
        "parametros": {},
        "estado": "pendiente",
        "implementado_en": [],
        "fuente": "2026-08-24",
    },
}


def parametro(tipologia_id, nombre_parametro, default=None):
    """Unico punto de lectura de un valor parametrico del catalogo -- el
    codigo (cuerpo_cerrado.py, Celda 4) debe usar esto en vez de repetir
    el numero como constante local, para que un cambio de tolerancia
    quede en UN solo lugar rastreable contra Convenciones_CAD.md."""
    entrada = TIPOLOGIAS.get(tipologia_id, {})
    return entrada.get('parametros', {}).get(nombre_parametro, default)


def resumen_estado():
    """Conteo por estado -- util para ver de un vistazo cuanto del
    catalogo narrativo (Convenciones_CAD seccion D) ya tiene codigo
    real detras, sin tener que releer el .md entero."""
    conteo = {}
    for entrada in TIPOLOGIAS.values():
        conteo[entrada['estado']] = conteo.get(entrada['estado'], 0) + 1
    return conteo
