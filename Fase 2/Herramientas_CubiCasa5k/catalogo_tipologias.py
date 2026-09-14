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
        "fuente": "2026-08-20 (13 constantes auditadas y convertidas a metros reales). "
                  "INTENTADO Y REVERTIDO 🆕 05-sep (bug real, plano PdV Nivel 1, caso MU30/MU31): se probo un chequeo "
                  "de plausibilidad adicional -- `d > largo_s` descarta un candidato cuya distancia perpendicular "
                  "supera el largo PROPIO del segmento evaluado, aunque caiga dentro del rango abstracto tol_min_m/"
                  "tol_max_m (mismo criterio que ya usa _relleno_solido para decidir si pinta, pero aplicado antes, "
                  "en la clasificacion). Revisado y aparentemente confirmado por consulta externa (DeepSeek + Codex, "
                  "ver Fase 2/Herramientas_CubiCasa5k/_consultas/) -- pero la validacion real con los 3 proyectos, "
                  "aislando el cambio con git stash (sin el resto de intentos del mismo dia, ver D1-encuentro-de-"
                  "brazos para el detalle completo), mostro que EMPEORA los 3, no solo Beauchef: PdV 126->59 sin el "
                  "fix vs 126->61/62 con el fix; Campo Lindo pag.3 109->36 vs 109->37; Beauchef 791->250 vs "
                  "791->416/425 (catastrofico). La consulta externa valido el RAZONAMIENTO del fix (evita aceptar un "
                  "candidato geometricamente inverosimil) pero eso no predijo el efecto real: bloquear esos "
                  "candidatos tambien saca del camino directo a otros pares que SI eran correctos como coincidencia "
                  "simple, empujandolos al fallback de conector heredado, que les asigna un ancho distinto (a veces "
                  "peor) y termina bloqueando mas fusiones por 'cuerpo cerrado' de las que arregla. Revertido "
                  "completamente (cuerpo_cerrado.py vuelto a la version del commit b63963b via git stash drop). "
                  "Leccion para la proxima vez: una consulta externa que valida la LOGICA de un fix no reemplaza "
                  "medir el resultado real, aislado con git stash, en los 3 proyectos reales antes de darlo por "
                  "bueno -- no alcanza con ver que el numero final mejora en 2 de 3 proyectos.",
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
        "usa_en": ["cuerpo_cerrado_fusiona (gate de fusion)", "diag_completo_*.png (diagnostico visual)",
                   "Celda 4 (bloque de export, adelantado antes del loop de muros_geo, 🆕 2026-09-05)"],
        # 🆕 2026-09-05: FIX APLICADO -- clasificar_no_muro() ahora corre antes
        # de armar muros_geo (no despues, solo para diagnostico), convertido
        # a indices estables de segmentos_l para poder desviar del export las
        # cadenas 100% ventana. Exporta a campo propio 'ventanas_simples_por_
        # linea_central' (NO a 'muros_geo', NO al 'ventanas_geo' general que
        # sigue sin decidirse). Sin verificar contra una corrida real de Colab
        # todavia -- solo verificado por lectura de codigo, ver Roadmap.
        "exporta_a_schema": True,
        "fuente": "2026-08-20, advertencia de no-generalizacion 🆕 24-ago, campo usa_en/exporta_a_schema 🆕 31-ago, "
                  "fix aplicado 🆕 2026-09-05",
    },
    "D3-ventana-reconstruccion-por-jamba": {
        "seccion": "D.3", "elemento": "Ventanas",
        "nombre": "Reconstruccion de ventana por par de jambas (desde lineas excluidas por referencia periodica)",
        "criterio": "Misma firma D1-D3 (2 bordes paralelos + 1 linea central), aplicada a lineas que "
                    "_detectar_lineas_referencia_periodicas saco a muros_excluidos_por_referencia por "
                    "coincidir en el mismo patron geometrico de deslinde/rasante (colineales, gap acotado, "
                    "span largo) sin serlo -- una fila de ventanas repetidas cae en ese mismo patron. Se "
                    "agrupan las lineas horizontales excluidas por su par de jamba (x0,x1) casi identico; "
                    "un grupo de exactamente 3 lineas con ese mismo par de jamba es una ventana. NO agrupa "
                    "por cercania de fragmentos (ese metodo si dio una agrupacion asimetrica incorrecta, "
                    "ver Roadmap 2026-08-31/09-04, caso MU03-13 Beauchef).",
        "parametros": {"tol_jamba_m": 0.03, "ancho_min_m": 0.15, "ancho_max_m": 3.0, "max_spread_vertical_m": 2.0},
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:reconstruir_ventanas_por_jamba"],
        "usa_en": ["Celda 4 (post _detectar_lineas_referencia_periodicas)"],
        # Campo de export propio y acotado -- 'ventanas_reconstruidas_por_jamba', distinto de
        # 'ventanas_geo' (esa decision de arquitectura general sigue sin tomarse, ver Diseno_
        # Funcional_ArchiCheck.md §2.9/§4.1: doble fuente de verdad contra analisis_semantico
        # sin regla de precedencia todavia).
        "exporta_a_schema": True,
        "fuente": "Validado a mano 2026-08-31 (_reconstruir_ventanas.py, coordenadas hardcodeadas), "
                  "generalizado 2026-09-04 (sin coordenadas, agrupando por jamba real)",
    },
    "D3-ventana-corta-muro": {
        "seccion": "D.3", "elemento": "Ventanas / Muros",
        "nombre": "La ventana rompe la geometria del muro (no solo se marca encima)",
        "criterio": "Regla dura del usuario (2026-09-05): una ventana confirmada (simple o reconstruida por "
                    "jamba) debe RECORTAR las lineas de cara del muro en su propio rango -- el muro no debe "
                    "correr continuo por debajo de una ventana, igual que ya no corre continuo a traves de una "
                    "puerta. Corre como post-proceso sobre muros_geo ya fusionado: para cada segmento de cada "
                    "muro que comparte eje y cae dentro de una banda de cruce angosta con una ventana "
                    "confirmada, se recorta la porcion superpuesta; si el corte deja el muro en 2+ pedazos "
                    "desconectados, se re-evalua con la MISMA logica de corte en cruces reales que ya usa "
                    "_dividir_en_muros_por_union (nunca se asume que un corte separa el muro entero -- una red "
                    "con mas de un camino, como la entrada tipo 'MU01' que agrupa un piso completo, puede "
                    "seguir conectada por otro lado).",
        "parametros": {"tol_cross_m": 0.15},
        # tol_cross_m=0.15 (no el 0.9 generico de espesor de muro plausible):
        # calibrado a mano contra el caso real de Beauchef -- 0.9 agarraba
        # por error lineas de otras habitaciones a alturas parecidas dentro
        # de la red fusionada grande, produciendo cortes espurios (probado,
        # descartado). 0.15 replica el alto real de la banda top/centro/
        # bottom de una ventana en este proyecto -- puede necesitar
        # recalibrarse con mas proyectos reales.
        "estado": "implementado",
        "implementado_en": ["cuerpo_cerrado.py:cortar_muros_por_ventanas", "cuerpo_cerrado.py:_normalizar_ventana_para_corte",
                             "cuerpo_cerrado.py:reasociar_puertas_tras_corte", "cuerpo_cerrado.py:_sufijo_letras"],
        "usa_en": ["Celda 4 (post fusion, ultimo paso antes de retornar muros_geo)"],
        "exporta_a_schema": True,  # modifica muros_geo directamente, no es un campo aparte
        # Limitacion conocida (2026-09-05), RESUELTA 2026-09-13: si un muro
        # que una puerta ya referencia por muro_asociado_id se corta en 2+
        # pedazos, esa referencia quedaba apuntando a un id que ya no existe.
        # reasociar_puertas_tras_corte() la repara por proximidad geometrica
        # real contra los puntos_union de la puerta (nunca por un umbral
        # arbitrario) -- validado con el caso real que motivo esto (Campo
        # Lindo, PG01 -> MU03 cortado en 49 pedazos, dist=0.0m tras reasociar).
        # De paso se encontro y corrigio un bug de datos mas serio: el sufijo
        # de pedazos (a, b, ..., z) ciclaba con modulo mas alla de 26 pedazos,
        # dejando ids DUPLICADOS en muros_geo -- confirmado en produccion en
        # los 3 proyectos con un MU01 sobre-fusionado (Beauchef 121 pedazos,
        # Campo Lindo 113, ver _sufijo_letras, esquema tipo columna de
        # planilla que nunca repite).
        "fuente": "2026-09-05, corregido a pedido explicito del usuario tras revisar el overlay: "
                  "'el muro no debe correr sobre la ventana, la ventana rompe el muro'; "
                  "re-mapeo y fix de ids duplicados agregados 2026-09-13",
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
        "fuente": "2026-08-20/23 (implementacion), unificacion 🆕 24-ago. NOTA 🆕 27-ago: tol_conector_esquina_m coincide en valor (0.03) con tol_vertice_m de D2-hoja-vano-firma-relativa -- son tolerancias de vertice para conceptos distintos (conector de esquina en fusion de muros vs coincidencia de vertice de hoja de puerta), NO unificadas a proposito por falta de evidencia de que deban moverse siempre juntas; si se recalibra una, revisar si la otra tambien corresponde. "
                  "INTENTADO Y REVERTIDO 🆕 05-sep, investigacion completa (caso real PdV Nivel 1, reportado por el usuario: MU30/MU31 -- una muesca real de muro con 2 tramos de retorno cortos que NO se estaba re-fusionando pese a tocarse en 0px con el muro principal). Se probaron 3 cambios relacionados, todos revertidos tras medir el resultado real en los 3 proyectos AISLANDO cada uno con git stash (no solo mirando si el numero final mejoraba sobre la corrida inmediatamente anterior, que resulto ser una comparacion confundida por cambios acumulados sin aislar):\n"
                  "BASELINE REAL (commit b63963b, sin ningun cambio de hoy, tol_conector_esquina_m=0.03): PdV 126->59/108->40, Campo Lindo 271->64/109->36, Beauchef 791->250.\n"
                  "(1) tol_conector_esquina_m 0.03->0.06: pensado para cubrir el caso real (el conector toca a su vecino con ancho real a 8px=0.047m, por encima de 0.03m). Combinado con el intento (3) de abajo daba numeros que en su momento parecieron una mejora, pero medido AISLADO (solo este cambio, sin (3)) contra el baseline real no se llego a confirmar limpio para Beauchef -- ver intento (3), la contaminacion entre cambios hizo perder la trazabilidad exacta de cual causaba que. Revertido a 0.03.\n"
                  "(2) tope_saltos_conector / herencia en cadena (BFS de 2+ saltos en _ancho_heredado_de_conector/_ancho_heredado_de_segmento, para resolver conectores en fila donde ni siquiera el vecino inmediato tiene ancho propio): 2 variantes de dominio probadas (contexto local completo, y el propio grupo pre-fusion) -- la primera mejoraba PdV/Campo Lindo pero rompia Beauchef (791->374, bloqueos por cuerpo cerrado 484->1008) saltando a traves de OTROS muros candidatos sin relacion estructural real; la segunda no arreglaba Beauchef (416, peor aun) y ademas empeoraba PdV y Campo Lindo. Revertido completamente, cuerpo_cerrado.py vuelto a la version del commit b63963b (via git stash drop).\n"
                  "(3) EL HALLAZGO MAS IMPORTANTE DEL DIA: el fix relacionado en D1-ancho-emparejamiento (`d > largo_s` en ancho_por_emparejamiento, ver esa entrada), que parecia validado por consulta externa DeepSeek+Codex y que se penso que arreglaba Beauchef (791->221 en una corrida temprana), en realidad -- medido despues con mas cuidado, aislando SOLO ese cambio con git stash, sin (1) ni (2) -- rompe Beauchef (791->416/425 segun tol) y tambien empeora PdV (59->61/62) y Campo Lindo pag.3 (36->37). La corrida que en su momento mostro 221 para Beauchef no se pudo reproducir de forma aislada y probablemente reflejaba un estado intermedio distinto del codigo que no quedo registrado con precision -- LECCION: medir SIEMPRE el resultado aislado (git stash push de un solo archivo/cambio + re-correr) antes de dar un fix por bueno, no alcanza con comparar contra la corrida inmediatamente anterior cuando hay varios cambios acumulados en la misma sesion.\n"
                  "ESTADO FINAL 🆕 05-sep: tol_conector_esquina_m vuelto a 0.03, sin herencia en cadena, y el fix de D1-ancho-emparejamiento tambien revertido (ver esa entrada) -- cuerpo_cerrado.py queda identico al commit b63963b. El caso MU30/MU31 (y los demas ejemplos reales dados por el usuario: MU18-21, MU01, MU09, MU03+MU16+MU17) siguen sin resolverse. Pendiente: nueva consulta a DeepSeek/Codex con esta evidencia completa (ver Fase 2/Herramientas_CubiCasa5k/consultar_bug_cadena_conectores.mjs) antes de un cuarto intento -- ningun cambio probado hoy en esta zona del codigo fue seguro en los 3 proyectos reales a la vez.",
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
